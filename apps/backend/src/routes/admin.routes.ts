import { Router } from 'express';
import { adminMiddleware } from '../middleware/admin.middleware';
import {
  adminLoginHandler,
  getStatsHandler,
  getUsersHandler,
  banUserHandler,
  getGamesHandler,
  getGameReplayAdminHandler,
  getTransactionsHandler,
  approveWithdrawalHandler,
  rejectWithdrawalHandler,
  getTournamentsAdminHandler,
  createTournamentAdminHandler,
  startTournamentAdminHandler,
  cancelTournamentAdminHandler,
  getConfigHandler,
  updateConfigHandler,
  getFraudLogsHandler,
  resolveFraudLogHandler,
} from '../controllers/admin.controller';

const router = Router();

// Public — login only
router.post('/login', adminLoginHandler);

// All routes below require admin JWT
router.use(adminMiddleware);

router.get('/stats', getStatsHandler);

router.get('/users', getUsersHandler);
router.patch('/users/:id/ban', banUserHandler);

router.get('/games', getGamesHandler);
router.get('/games/:id/replay', getGameReplayAdminHandler);

router.get('/transactions', getTransactionsHandler);
router.patch('/transactions/:id/approve', approveWithdrawalHandler);
router.patch('/transactions/:id/reject', rejectWithdrawalHandler);

router.get('/tournaments', getTournamentsAdminHandler);
router.post('/tournaments', createTournamentAdminHandler);
router.post('/tournaments/:id/start', startTournamentAdminHandler);
router.post('/tournaments/:id/cancel', cancelTournamentAdminHandler);

router.get('/config', getConfigHandler);
router.patch('/config', updateConfigHandler);

router.get('/fraud-logs', getFraudLogsHandler);
router.patch('/fraud-logs/:id/resolve', resolveFraudLogHandler);

export default router;
