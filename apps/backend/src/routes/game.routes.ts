import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getGameHistoryHandler,
  getGameReplayHandler,
  getActiveGameHandler,
  getTournamentsHandler,
  joinTournamentHandler,
  leaveTournamentHandler,
  getTournamentBracketHandler,
  getMyActiveTournamentHandler,
} from '../controllers/game.controller';

const router = Router();

router.get('/history', authMiddleware, getGameHistoryHandler);
router.get('/active', authMiddleware, getActiveGameHandler);
router.get('/tournaments', authMiddleware, getTournamentsHandler);
router.get('/tournaments/my-active', authMiddleware, getMyActiveTournamentHandler);
router.post('/tournaments/:id/join', authMiddleware, joinTournamentHandler);
router.post('/tournaments/:id/leave', authMiddleware, leaveTournamentHandler);
router.get('/tournaments/:id/bracket', authMiddleware, getTournamentBracketHandler);
router.get('/:id/replay', authMiddleware, getGameReplayHandler);

export default router;
