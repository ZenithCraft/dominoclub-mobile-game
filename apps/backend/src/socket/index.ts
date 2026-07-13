import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { config } from '../config';
import { verifyAccessToken } from '../utils/jwt';
import { isTokenBlacklisted } from '../services/token-blacklist.service';
import { prisma } from '../services/prisma.service';
import { logger } from '../utils/logger';
import { setupGameSocket, activeGames, initTournamentScheduler } from './gameSocket';
import {
  enqueue,
  dequeue,
  getQueueStats,
  getQueuePosition,
  startQueueCleanup,
  matchmakingEvents,
  startBotInjectionTimer,
  QueueEntry,
  MatchmakingVariant,
} from '../services/matchmaking.service';
import { getRedisClient, getRedisSubscriber, isRedisAvailable } from '../services/redis.service';
import { verifyIntegrityToken, issueDeviceSessionToken, verifyDeviceSessionToken } from '../services/integrity.service';
import { consumeNonce } from '../services/nonce.service';
import { validateGpsBounds, updateUserGps, GpsCoords, checkUserVelocity, checkIPVelocity } from '../middleware/antifraud.middleware';
import { applyTrustSignal, getUserTrustLevel } from '../services/trust.service';
import { getRuntimeConfig } from '../services/runtime-config.service';

const VALID_MODES = ['ARENA_1V1', 'CUP_1V1', 'TOURNAMENT_2V2', 'RECREATIONAL_2V2'] as const;
const VALID_VARIANTS = ['CARROCA', 'L_E_L', 'CRUZADA'] as const;

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: config.cors.origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Attach Redis adapter for horizontal scaling when Redis is available
  if (isRedisAvailable()) {
    import('@socket.io/redis-adapter').then(({ createAdapter }) => {
      io.adapter(createAdapter(getRedisClient(), getRedisSubscriber()));
      logger.info('[Socket.io] Redis adapter enabled — horizontal scaling active');
    }).catch((err) => {
      logger.warn('[Socket.io] Redis adapter not available — single-server mode', { message: err.message });
    });
  }

  // Tournament auto-cancel scheduler
  initTournamentScheduler(io);

  // Stale queue cleanup — notify players whose entries age out without a match
  startQueueCleanup((userId, _socketId) => {
    io.to(`user:${userId}`).emit('queue:expired', {
      message: 'Tempo de espera esgotado. Tente novamente.',
    });
  });

  // Auth middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = verifyAccessToken(token);
      if (payload.jti && await isTokenBlacklisted(payload.jti)) {
        return next(new Error('Token revoked'));
      }
      // No fallback on a DB error here on purpose — a lookup failure must
      // never let a socket connect as an unbanned "dev user" in any
      // environment (that includes DEV_AUTH_BYPASS being left on by mistake).
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, name: true, avatar: true, is_banned: true },
      });
      if (!user || user.is_banned) return next(new Error('Unauthorized'));
      (socket as any).user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    logger.info('Socket connected', { userId: user.id, socketId: socket.id });

    socket.join(`user:${user.id}`);

    const emitQueueStats = () => {
      io.emit('queue:stats', getQueueStats());
    };

    socket.emit('queue:stats', getQueueStats());

    // ── Matchmaking ──────────────────────────────────────────
    socket.on('queue:join', async (data: {
      mode: string;
      betAmount: number;
      variant?: string;
      platform?: 'android' | 'ios';
      integrityToken?: string;
      integrityNonce?: string;
      attestationType?: string; // 'app_attest' | 'device_check' (iOS only)
      keyId?: string;           // iOS App Attest keyId
      gps?: { lat: number; lng: number; accuracy?: number };
    }) => {
      // Validate mode
      if (!VALID_MODES.includes(data.mode as any)) {
        socket.emit('queue:error', { message: 'Modo de jogo inválido' });
        return;
      }

      // Validate betAmount
      const ALLOWED_BETS = [0, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
      if (typeof data.betAmount !== 'number' || !ALLOWED_BETS.includes(data.betAmount)) {
        socket.emit('queue:error', { message: 'Valor de aposta inválido' });
        return;
      }

      // Validate/default variant
      const variant: MatchmakingVariant =
        data.variant && VALID_VARIANTS.includes(data.variant as any)
          ? (data.variant as MatchmakingVariant)
          : 'CARROCA';

      const isPaidGame = data.betAmount > 0;

      // ── Per-IP velocity check (DoS / account-farm protection) ──────────────
      const socketIp = (socket.handshake.headers['x-forwarded-for'] as string)
        ?.split(',')[0].trim() || socket.handshake.address || '';
      const ipVelocity = await checkIPVelocity(
        socketIp, 'queue_join',
        config.antifraud.velocityIPQueueJoinWindowMs,
        config.antifraud.velocityIPQueueJoinMax,
      );
      if (ipVelocity.blocked) {
        logger.warn('[Socket] IP queue join velocity exceeded', { ip: socketIp, count: ipVelocity.count });
        socket.emit('queue:error', {
          message: 'Muitas tentativas neste endereço. Aguarde alguns minutos.',
          code: 'IP_VELOCITY_EXCEEDED',
        });
        return;
      }

      // ── Per-user velocity check ─────────────────────────────────────────────
      const velocity = await checkUserVelocity(
        user.id, 'queue_join',
        config.antifraud.velocityQueueJoinWindowMs,
        config.antifraud.velocityQueueJoinMax,
      );
      if (velocity.blocked) {
        logger.warn('[Socket] Queue join velocity exceeded', { userId: user.id, count: velocity.count });
        await applyTrustSignal(user.id, 'velocity_abuse');
        socket.emit('queue:error', {
          message: 'Muitas tentativas de entrar na fila. Aguarde alguns minutos.',
          code: 'VELOCITY_EXCEEDED',
        });
        return;
      }

      // ── Trust level check (paid games) ──────────────────────────────────────
      if (isPaidGame) {
        const { score, level } = await getUserTrustLevel(user.id);
        if (level === 'LOW') {
          logger.warn('[Socket] Low-trust user blocked from paid game', { userId: user.id, trust_score: score });
          socket.emit('queue:error', {
            message: 'Conta em análise de segurança. Jogos pagos temporariamente indisponíveis.',
            code: 'ACCOUNT_UNDER_REVIEW',
          });
          return;
        }
        if (level === 'MEDIUM') {
          logger.warn('[Socket] Medium-trust user in paid game — flagged', { userId: user.id, trust_score: score });
        }
      }

      // ── Device integrity check (paid games only) ────────────────────────────
      // TEMP: while DEV_AUTH_BYPASS is on (pre-launch testing) the dev/super
      // user has no Play Integrity / App Attest token, so skip the check
      // instead of blocking matches. Remove this guard before going live.
      const skipIntegrityForDev = isPaidGame && config.devAuthBypass;
      if (skipIntegrityForDev) {
        logger.warn('[Socket] Integrity check skipped — DEV_AUTH_BYPASS active', { userId: user.id });
      }
      if (isPaidGame && config.integrity.requireForPaidGames && !skipIntegrityForDev) {
        if (!data.integrityToken || !data.platform) {
          socket.emit('queue:error', { message: 'Verificação do dispositivo necessária', code: 'INTEGRITY_REQUIRED' });
          return;
        }

        let integrityResult;

        // Phase 2 — App Attest session token from a previous successful attestation.
        // Session tokens are self-contained JWTs; no nonce needed.
        if (data.platform === 'ios' && data.attestationType === 'app_attest_session') {
          integrityResult = await verifyDeviceSessionToken(data.integrityToken, user.id);

        } else {
          // Phase 1 — fresh attestation (Android Play Integrity or iOS App Attest / DeviceCheck).
          // Consume the server-issued nonce first to prevent replay attacks.
          if (data.integrityNonce) {
            const nonceValid = await consumeNonce(data.integrityNonce);
            if (!nonceValid) {
              logger.warn('[Socket] Integrity nonce invalid or already used', { userId: user.id });
              socket.emit('queue:error', { message: 'Nonce de integridade inválido. Tente novamente.', code: 'NONCE_INVALID' });
              return;
            }
          }

          integrityResult = await verifyIntegrityToken(
            data.integrityToken,
            data.platform,
            data.integrityNonce,
            data.attestationType,
            data.keyId,
          );

          // After a successful iOS App Attest Phase 1, issue a session token so the
          // client can skip re-attestation for the next DEVICE_SESSION_TTL_MS milliseconds.
          if (integrityResult.valid && data.platform === 'ios' && data.attestationType === 'app_attest' && data.keyId) {
            const sessionToken = issueDeviceSessionToken(user.id, data.keyId, 'ios');
            socket.emit('integrity:session_token', {
              token: sessionToken,
              expiresIn: config.integrity.deviceSessionTtlMs,
            });
            logger.info('[Integrity] Device session token issued', { userId: user.id, keyId: data.keyId });
          }
        }

        if (!integrityResult.valid) {
          logger.warn('[Socket] Integrity check failed', { userId: user.id, verdict: integrityResult.verdict });
          await applyTrustSignal(user.id, 'integrity_fail');
          await prisma.fraudLog.create({
            data: {
              userId: user.id,
              type: 'INTEGRITY_FAIL',
              reason_code: `INTEGRITY_FAIL:${integrityResult.verdict ?? 'unknown'}`,
              details: {
                platform: data.platform,
                attestationType: data.attestationType ?? 'unknown',
                verdict: integrityResult.verdict,
                reason: integrityResult.reason,
              },
            },
          }).catch(() => {});
          socket.emit('queue:error', {
            message: 'Falha na verificação do dispositivo. Use a versão oficial do app.',
            code: 'INTEGRITY_FAIL',
          });
          return;
        }
      }

      // ── GPS validation (paid games: required if enabled; always validated if sent) ─
      if (data.gps) {
        const gpsCheck = validateGpsBounds(data.gps);
        if (!gpsCheck.valid) {
          socket.emit('queue:error', { message: gpsCheck.reason ?? 'Localização inválida', code: 'GPS_INVALID' });
          return;
        }
        const movementCheck = await updateUserGps(user.id, data.gps);
        if (movementCheck.suspicious) {
          socket.emit('queue:error', { message: movementCheck.reason ?? 'Localização suspeita detectada.', code: 'GPS_SUSPICIOUS' });
          return;
        }
        if (gpsCheck.lowConfidence) {
          logger.warn('[Socket] Low-confidence GPS accepted', { userId: user.id, reason: gpsCheck.reason });
          await applyTrustSignal(user.id, 'low_accuracy_gps');
        }
      } else if (isPaidGame && config.antifraud.gpsRequiredForPaidGames) {
        socket.emit('queue:error', { message: 'Localização necessária para jogos pagos', code: 'GPS_REQUIRED' });
        return;
      }

      // Check wallet balance
      if (data.betAmount > 0) {
        try {
          const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
          if (!wallet || Number(wallet.real_balance) + Number(wallet.bonus_balance) < data.betAmount) {
            socket.emit('queue:error', { message: 'Saldo insuficiente' });
            return;
          }
        } catch {
          socket.emit('queue:error', { message: 'Saldo insuficiente' });
          return;
        }
      }

      const entry: QueueEntry = {
        userId: user.id,
        socketId: socket.id,
        betAmount: data.betAmount,
        variant,
        mode: data.mode as QueueEntry['mode'],
        joinedAt: Date.now(),
      };

      enqueue(entry);
      const runtimeCfg = await getRuntimeConfig();
      const botWaitSeconds = runtimeCfg.botInjectWaitSeconds;
      const botTimer = startBotInjectionTimer(entry, botWaitSeconds);
      const position = getQueuePosition(user.id, data.mode);

      socket.emit('queue:joined', {
        mode: data.mode,
        betAmount: data.betAmount,
        variant,
        position,
        botWaitSeconds,
      });
      emitQueueStats();

      socket.once('disconnect', () => {
        if (botTimer) clearTimeout(botTimer);
        dequeue(user.id);
        emitQueueStats();
      });

      socket.once('queue:leave', () => {
        if (botTimer) clearTimeout(botTimer);
        dequeue(user.id);
        socket.emit('queue:left');
        emitQueueStats();
      });
    });

    // ── Online count ─────────────────────────────────────────
    const onlineCount = io.sockets.sockets.size;
    io.emit('online:count', { count: onlineCount });

    socket.on('disconnect', () => {
      dequeue(user.id);
      logger.info('Socket disconnected', { userId: user.id });
      io.emit('online:count', { count: io.sockets.sockets.size });
      emitQueueStats();
    });

    setupGameSocket(socket, io, user);
  });

  matchmakingEvents.on('match_created', ({ gameId, players, betAmount, mode }) => {
    players.forEach((p: any) => {
      io.to(`user:${p.userId}`).emit('game:found', { gameId, betAmount, mode });
    });
  });

  matchmakingEvents.on('match_failed', ({ players }) => {
    players.forEach((p: any) => {
      if (!p.isBot) {
        io.to(`user:${p.userId}`).emit('queue:error', { message: 'Erro ao criar partida. Tente novamente.' });
      }
    });
  });

  return io;
}
