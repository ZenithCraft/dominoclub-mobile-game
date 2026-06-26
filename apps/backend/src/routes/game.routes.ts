import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getEligibilityHandler,
  getIntegrityNonceHandler,
  getGameHistoryHandler,
  getGameReplayHandler,
  getActiveGameHandler,
  getTournamentsHandler,
  joinTournamentHandler,
  leaveTournamentHandler,
  withdrawTournamentHandler,
  getTournamentBracketHandler,
  getMyActiveTournamentHandler,
  getLeaderboardHandler,
  getMyLeagueHandler,
  getAnnouncementsHandler,
  markAnnouncementSeenHandler,
} from '../controllers/game.controller';

const router = Router();

router.get('/eligibility', authMiddleware, getEligibilityHandler);
router.get('/integrity-nonce', authMiddleware, getIntegrityNonceHandler);
router.get('/history', authMiddleware, getGameHistoryHandler);
router.get('/active', authMiddleware, getActiveGameHandler);
router.get('/tournaments', authMiddleware, getTournamentsHandler);
router.get('/tournaments/my-active', authMiddleware, getMyActiveTournamentHandler);
router.post('/tournaments/:id/join', authMiddleware, joinTournamentHandler);
router.post('/tournaments/:id/leave', authMiddleware, leaveTournamentHandler);
router.post('/tournaments/:id/withdraw', authMiddleware, withdrawTournamentHandler);
router.get('/tournaments/:id/bracket', authMiddleware, getTournamentBracketHandler);
router.get('/:id/replay', authMiddleware, getGameReplayHandler);

// League
router.get('/leaderboard', authMiddleware, getLeaderboardHandler);
router.get('/me/league', authMiddleware, getMyLeagueHandler);

// Announcements
router.get('/announcements', authMiddleware, getAnnouncementsHandler);
router.post('/announcements/:id/seen', authMiddleware, markAnnouncementSeenHandler);

export default router;
