import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { config } from '../config';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../services/prisma.service';
import { logger } from '../utils/logger';
import { setupGameSocket, activeGames } from './gameSocket';
import { enqueue, dequeue, getQueueStats, matchmakingEvents, startBotInjectionTimer, QueueEntry } from '../services/matchmaking.service';
import { getRedisClient, getRedisSubscriber, isRedisAvailable } from '../services/redis.service';

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

  // Auth middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = verifyAccessToken(token);
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
    socket.on('queue:join', async (data: { mode: string; betAmount: number }) => {
      const entry: QueueEntry = {
        userId: user.id,
        socketId: socket.id,
        betAmount: data.betAmount,
        mode: data.mode as QueueEntry['mode'],
        joinedAt: Date.now(),
      };

      // Check wallet balance
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      if (!wallet || wallet.real_balance + wallet.bonus_balance < data.betAmount) {
        socket.emit('queue:error', { message: 'Insufficient balance' });
        return;
      }

      enqueue(entry);
      const botTimer = startBotInjectionTimer(entry);
      socket.emit('queue:joined', { mode: data.mode, betAmount: data.betAmount, botWaitSeconds: config.game.botInjectWaitSeconds });
      emitQueueStats();

      socket.once('disconnect', () => {
        clearTimeout(botTimer);
        dequeue(user.id);
        emitQueueStats();
      });

      socket.once('queue:leave', () => {
        clearTimeout(botTimer);
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

  // When matchmaking creates a game, notify all players
  matchmakingEvents.on('match_created', ({ gameId, players, betAmount, mode }) => {
    players.forEach((p: any) => {
      io.to(`user:${p.userId}`).emit('game:found', { gameId, betAmount, mode });
    });
  });

  return io;
}
