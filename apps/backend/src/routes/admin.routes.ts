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
  createDemoTournamentAdminHandler,
  startTournamentAdminHandler,
  cancelTournamentAdminHandler,
  emergencyCancelTournamentAdminHandler,
  getTournamentPlayersAdminHandler,
  getTournamentBracketAdminHandler,
  getConfigHandler,
  updateConfigHandler,
  getPairBlocksAdminHandler,
  createPairBlockAdminHandler,
  updatePairBlockAdminHandler,
  getUserPairStatsAdminHandler,
  getTeamPairStatsAdminHandler,
  getCouponsAdminHandler,
  createCouponAdminHandler,
  updateCouponAdminHandler,
  getCouponRedemptionsAdminHandler,
  getFraudLogsHandler,
  resolveFraudLogHandler,
  getGameRoomsAdminHandler,
  createGameRoomAdminHandler,
  updateGameRoomAdminHandler,
  deleteGameRoomAdminHandler,
  getGameLogsHandler,
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
router.get('/games/:id/logs', getGameLogsHandler);
router.get('/games/:id/replay', getGameReplayAdminHandler);

router.get('/transactions', getTransactionsHandler);
router.patch('/transactions/:id/approve', approveWithdrawalHandler);
router.patch('/transactions/:id/reject', rejectWithdrawalHandler);

router.get('/tournaments', getTournamentsAdminHandler);
router.post('/tournaments', createTournamentAdminHandler);
router.post('/tournaments/demo', createDemoTournamentAdminHandler);
router.post('/tournaments/:id/start', startTournamentAdminHandler);
router.post('/tournaments/:id/cancel', cancelTournamentAdminHandler);
router.post('/tournaments/:id/emergency-cancel', emergencyCancelTournamentAdminHandler);
router.get('/tournaments/:id/players', getTournamentPlayersAdminHandler);
router.get('/tournaments/:id/bracket', getTournamentBracketAdminHandler);

router.get('/config', getConfigHandler);
router.patch('/config', updateConfigHandler);

router.get('/pair-blocks', getPairBlocksAdminHandler);
router.post('/pair-blocks', createPairBlockAdminHandler);
router.patch('/pair-blocks/:id', updatePairBlockAdminHandler);
router.get('/users/:id/pair-stats', getUserPairStatsAdminHandler);
router.get('/team-pair-stats', getTeamPairStatsAdminHandler);

router.get('/coupons', getCouponsAdminHandler);
router.post('/coupons', createCouponAdminHandler);
router.patch('/coupons/:id', updateCouponAdminHandler);
router.get('/coupons/:id/redemptions', getCouponRedemptionsAdminHandler);

router.get('/fraud-logs', getFraudLogsHandler);
router.patch('/fraud-logs/:id/resolve', resolveFraudLogHandler);

router.get('/game-rooms', getGameRoomsAdminHandler);
router.post('/game-rooms', createGameRoomAdminHandler);
router.patch('/game-rooms/:id', updateGameRoomAdminHandler);
router.delete('/game-rooms/:id', deleteGameRoomAdminHandler);

export default router;
