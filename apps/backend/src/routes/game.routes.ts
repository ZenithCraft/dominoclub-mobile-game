import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getGameHistoryHandler,
  getGameReplayHandler,
  getActiveGameHandler,
  getTournamentsHandler,
  joinTournamentHandler,
} from '../controllers/game.controller';

const router = Router();

router.get('/history', authMiddleware, getGameHistoryHandler);
router.get('/active', authMiddleware, getActiveGameHandler);
router.get('/tournaments', authMiddleware, getTournamentsHandler);
router.post('/tournaments/:id/join', authMiddleware, joinTournamentHandler);
router.get('/:id/replay', authMiddleware, getGameReplayHandler);

export default router;
