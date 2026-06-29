import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { createGameSchema } from '../utils/validators';
import { activeGames } from '../socket/gameSocket';
import { startTournament, withdrawFromTournament } from '../services/tournament.service';
import { issueNonce } from '../services/nonce.service';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { emailService } from '../services/email.service';
import { getLeaderboard, pointsToRank } from '../services/league.service';

/**
 * GET /api/v1/game/integrity-nonce
 * Issues a single-use server nonce for Play Integrity / App Attest token requests.
 * The client must use this nonce when requesting the integrity token from the platform SDK,
 * then include it alongside the token in queue:join for replay-attack protection.
 */
/**
 * GET /api/v1/game/eligibility?betAmount=10
 * Dev/demo endpoint — returns trust level and whether the user can join a paid game.
 */
export async function getEligibilityHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const betAmount = Number(req.query.betAmount ?? 0);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { trust_score: true, is_banned: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const score = user.trust_score ?? 1;
    const level = score >= 0.75 ? 'HIGH' : score >= 0.45 ? 'MEDIUM' : 'LOW';
    const canJoinPaid = level !== 'LOW';

    if (betAmount > 0 && !canJoinPaid) {
      return res.status(403).json({
        allowed: false,
        trust_score: score,
        trust_level: level,
        code: 'ACCOUNT_UNDER_REVIEW',
        message: 'Conta em análise de segurança. Jogos pagos temporariamente indisponíveis.',
      });
    }

    res.json({ allowed: true, trust_score: score, trust_level: level });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getIntegrityNonceHandler(req: Request, res: Response) {
  try {
    const { nonce, expiresAt } = await issueNonce();
    res.json({ nonce, expiresAt });
  } catch (err: any) {
    res.status(500).json({ error: 'Falha ao gerar nonce de integridade' });
  }
}

export async function getGameHistoryHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = 10;

    const games = await prisma.game.findMany({
      where: {
        players: { some: { userId } },
        status: 'FINISHED',
      },
      include: {
        players: {
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
      orderBy: { finished_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.json({ games, page });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getGameReplayHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const game = await prisma.game.findUnique({
      where: { id },
      include: { players: true },
    });

    if (!game) return res.status(404).json({ error: 'Game not found' });

    const isPlayer = game.players.some((p: { userId: string }) => p.userId === userId);
    if (!isPlayer) return res.status(403).json({ error: 'Access denied' });

    res.json({ replay: game.replay_data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getActiveGameHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;

    const activeGame = await prisma.game.findFirst({
      where: {
        players: { some: { userId } },
        status: { in: ['WAITING', 'PLAYING'] },
      },
      include: {
        players: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
      },
    });

    res.json({ game: activeGame });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

function serializeTournament(t: any) {
  return {
    ...t,
    entry_fee: Number(t.entry_fee),
    prize_pool: Number(t.prize_pool),
  };
}

export async function getTournamentsHandler(req: Request, res: Response) {
  try {
    const tournaments = await prisma.tournament.findMany({
      where: { status: { in: ['OPEN', 'FULL'] } },
      orderBy: { starts_at: 'asc' },
      take: 20,
    });
    res.json({ tournaments: tournaments.map(serializeTournament) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function joinTournamentHandler(req: Request, res: Response) {
  const userId = (req as any).user?.userId;
  const { id } = req.params;
  // In-person ticket fields
  const { participantName, participantCpf } = req.body ?? {};

  try {
    let isFull = false;
    let startsAt: Date = new Date();
    let isInPerson = false;
    let tournamentName = '';

    // All checks and mutations run inside a SERIALIZABLE transaction so concurrent
    // join requests cannot both pass the player-count or balance check (double-enroll / overdraft).
    await prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({ where: { id } });
      if (!tournament) throw Object.assign(new Error('Tournament not found'), { status: 404 });
      if (tournament.status !== 'OPEN') throw Object.assign(new Error('Tournament not open'), { status: 400 });
      if (tournament.current_players >= tournament.max_players) throw Object.assign(new Error('Tournament is full'), { status: 400 });
      startsAt = tournament.starts_at;
      isInPerson = tournament.is_in_person;
      tournamentName = tournament.name;

      if (isInPerson && (!participantName || !participantCpf)) {
        throw Object.assign(new Error('Nome e CPF do participante são obrigatórios para eventos presenciais'), { status: 400 });
      }

      const existing = await tx.tournamentPlayer.findFirst({ where: { tournamentId: id, userId } });
      if (existing) throw Object.assign(new Error('Already enrolled'), { status: 200 });

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      // Bonus balance CANNOT be used for tournament entries — only real_balance counts
      if (!wallet || Number(wallet.real_balance) < Number(tournament.entry_fee)) {
        throw Object.assign(new Error('Saldo insuficiente. O saldo bônus não pode ser usado para torneios.'), { status: 400 });
      }

      const newPlayerCount = tournament.current_players + 1;
      isFull = newPlayerCount >= tournament.max_players;

      await tx.wallet.update({ where: { userId }, data: { real_balance: { decrement: tournament.entry_fee } } });
      await tx.tournamentPlayer.create({
        data: {
          tournamentId: id,
          userId,
          participant_name: isInPerson ? participantName : null,
          participant_cpf: isInPerson ? participantCpf : null,
        },
      });
      await tx.tournament.update({
        where: { id },
        data: {
          current_players: { increment: 1 },
          prize_pool: { increment: isInPerson ? 0 : Number(tournament.entry_fee) * 0.9 },
          status: isFull ? 'FULL' : 'OPEN',
        },
      });
    }, { isolationLevel: 'Serializable' } as any);

    // Auto-start immediately only if the scheduled start time has already passed (online only)
    if (isFull && !isInPerson && startsAt.getTime() <= Date.now()) {
      startTournament(id).catch((err) => {
        logger.error('[Tournament] Auto-start failed', { message: err.message });
      });
    }

    // Send confirmation email for in-person tournament ticket
    if (isInPerson) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      if (user?.email) {
        const tournament = await prisma.tournament.findUnique({
          where: { id },
          select: { name: true, starts_at: true, address: true, checkin_time: true, entry_fee: true },
        });
        if (tournament) {
          emailService.send({
            to: user.email,
            subject: `Ingresso confirmado — ${tournament.name}`,
            html: `
              <h2>Ingresso Confirmado!</h2>
              <p>Olá ${user.name ?? participantName},</p>
              <p>Seu ingresso para o torneio presencial <strong>${tournament.name}</strong> foi confirmado.</p>
              <table style="border-collapse:collapse;width:100%;max-width:500px">
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Participante</strong></td><td style="padding:8px;border:1px solid #ddd">${participantName}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>CPF</strong></td><td style="padding:8px;border:1px solid #ddd">${participantCpf}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Data</strong></td><td style="padding:8px;border:1px solid #ddd">${tournament.starts_at.toLocaleDateString('pt-BR')}</td></tr>
                ${tournament.checkin_time ? `<tr><td style="padding:8px;border:1px solid #ddd"><strong>Check-in</strong></td><td style="padding:8px;border:1px solid #ddd">${tournament.checkin_time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td></tr>` : ''}
                ${tournament.address ? `<tr><td style="padding:8px;border:1px solid #ddd"><strong>Local</strong></td><td style="padding:8px;border:1px solid #ddd">${tournament.address}</td></tr>` : ''}
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Taxa</strong></td><td style="padding:8px;border:1px solid #ddd">R$${Number(tournament.entry_fee).toFixed(2)}</td></tr>
              </table>
              <p style="margin-top:16px">Apresente este e-mail na entrada do evento.</p>
              <p>Equipe DominoClub</p>
            `,
          }).catch(() => {});
        }
      }
    }

    // Return updated wallet balance + tournament info for the waiting screen
    const [updatedWallet, updatedTournament] = await Promise.all([
      prisma.wallet.findUnique({ where: { userId } }),
      prisma.tournament.findUnique({ where: { id } }),
    ]);

    res.json({
      message: 'Joined tournament successfully',
      starting: isFull,
      balance: updatedWallet?.real_balance ?? 0,
      tournament: updatedTournament ? serializeTournament(updatedTournament) : null,
    });
  } catch (err: any) {
    const status = err?.status;
    if (status === 200) {
      const [wallet, tournament] = await Promise.all([
        prisma.wallet.findUnique({ where: { userId } }).catch(() => null),
        prisma.tournament.findUnique({ where: { id } }).catch(() => null),
      ]);
      return res.json({ message: 'Already enrolled', starting: false, balance: wallet?.real_balance ?? 0, tournament: tournament ? serializeTournament(tournament) : null });
    }
    if (status === 404) return res.status(404).json({ error: err.message });
    if (status === 400) return res.status(400).json({ error: err.message });
    // P2002 = unique constraint → already enrolled (concurrent race that slipped through)
    if (err?.code === 'P2002') {
      const [wallet, tournament] = await Promise.all([
        prisma.wallet.findUnique({ where: { userId } }).catch(() => null),
        prisma.tournament.findUnique({ where: { id } }).catch(() => null),
      ]);
      return res.json({ message: 'Already enrolled', starting: false, balance: wallet?.real_balance ?? 0, tournament: tournament ? serializeTournament(tournament) : null });
    }
    res.status(500).json({ error: err.message });
  }
}

export async function leaveTournamentHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (!['OPEN', 'FULL'].includes(tournament.status)) {
      return res.status(400).json({ error: 'Tournament cannot be left' });
    }

    const existing = await prisma.tournamentPlayer.findFirst({ where: { tournamentId: id, userId } });
    if (!existing) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      return res.json({ message: 'Not enrolled', balance: wallet?.real_balance ?? 0, tournament });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return res.status(400).json({ error: 'Wallet not found' });

    const poolDelta = Number(tournament.entry_fee) * 0.9;

    await prisma.$transaction([
      prisma.tournamentPlayer.deleteMany({ where: { tournamentId: id, userId } }),
      prisma.tournament.update({
        where: { id },
        data: {
          current_players: { decrement: 1 },
          prize_pool: { decrement: poolDelta },
          status: 'OPEN',
        },
      }),
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { real_balance: { increment: tournament.entry_fee } },
      }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFUND',
          amount: tournament.entry_fee,
          status: 'COMPLETED',
          description: `Reembolso — saída do torneio "${tournament.name}"`,
        },
      }),
    ]);

    const updatedWallet = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    const updatedTournament = await prisma.tournament.findUnique({ where: { id } });

    res.json({
      message: 'Left tournament successfully',
      balance: updatedWallet?.real_balance ?? 0,
      tournament: updatedTournament,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getMyActiveTournamentHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const enrollment = await prisma.tournamentPlayer.findFirst({
      where: {
        userId,
        eliminated_at: null,
        tournament: { status: { in: ['OPEN', 'FULL'] } },
      },
      include: { tournament: true },
    });
    res.json({
      enrollment: enrollment
        ? {
            tournamentId: enrollment.tournament.id,
            tournamentName: enrollment.tournament.name,
            startsAt: enrollment.tournament.starts_at,
            entryFee: Number(enrollment.tournament.entry_fee),
          }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getTournamentBracketHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        players: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { joined_at: 'asc' },
        },
        games: {
          orderBy: [{ tournament_round: 'asc' }, { created_at: 'asc' }],
          include: {
            players: {
              include: { user: { select: { id: true, name: true, avatar: true } } },
            },
          },
        },
      },
    });

    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const myPlayer = tournament.players.find((p) => p.userId === userId);

    res.json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        current_round: tournament.current_round,
        max_players: tournament.max_players,
        current_players: tournament.current_players,
        entry_fee: tournament.entry_fee,
        prize_pool: tournament.prize_pool,
        starts_at: tournament.starts_at,
        finished_at: tournament.finished_at,
      },
      players: tournament.players,
      games: tournament.games,
      myStatus: {
        eliminated: !!myPlayer?.eliminated_at,
        finalPosition: myPlayer?.final_position ?? null,
        prizeWon: myPlayer?.prize_won ?? 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/v1/game/leaderboard?period=week|month
export async function getLeaderboardHandler(req: Request, res: Response) {
  try {
    const period = (req.query.period as 'week' | 'month') || 'month';
    const data = await getLeaderboard(period);
    res.json({ period, leaderboard: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/v1/game/me/league — current user's league info
export async function getMyLeagueHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { league_points: true, previous_rank: true, previous_rank_month: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      points: user.league_points,
      rank: pointsToRank(user.league_points),
      previous_rank: user.previous_rank,
      previous_rank_month: user.previous_rank_month,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/v1/game/announcements — active announcements for the current user
export async function getAnnouncementsHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { league_points: true },
    });
    const userRank = user ? pointsToRank(user.league_points) : 'BRONZE';

    const announcements = await prisma.announcement.findMany({
      where: {
        is_active: true,
        OR: [
          { target_rank: null },
          { target_rank: userRank as any },
        ],
      },
      orderBy: { created_at: 'desc' },
    });

    // Filter by per-user view count
    const views = await prisma.userAnnouncementView.findMany({
      where: { userId, announcementId: { in: announcements.map((a) => a.id) } },
    });
    const viewMap = new Map(views.map((v) => [v.announcementId, v.view_count]));

    const visible = announcements.filter((a) => {
      if (!a.max_shows) return true;
      return (viewMap.get(a.id) ?? 0) < a.max_shows;
    });

    res.json({ announcements: visible });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/v1/game/tournaments/:id/withdraw  (mid-tournament, between rounds)
export async function withdrawTournamentHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    await withdrawFromTournament(id, userId);
    res.json({ message: 'Withdrawn from tournament successfully' });
  } catch (err: any) {
    const msg = err?.message ?? 'Internal error';
    if (msg === 'Tournament is not in progress') return res.status(400).json({ error: msg });
    if (msg === 'Player is not active in this tournament') return res.status(400).json({ error: msg });
    res.status(500).json({ error: msg });
  }
}

// POST /api/v1/game/announcements/:id/seen
export async function markAnnouncementSeenHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    await prisma.userAnnouncementView.upsert({
      where: { userId_announcementId: { userId, announcementId: id } },
      update: { view_count: { increment: 1 }, last_seen_at: new Date() },
      create: { userId, announcementId: id, view_count: 1 },
    });
    res.json({ message: 'ok' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

