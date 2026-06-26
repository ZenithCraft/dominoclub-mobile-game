import { Router } from 'express';
import { adminMiddleware } from '../middleware/admin.middleware';
import {
  adminLoginHandler,
  getStatsHandler,
  getUsersHandler,
  getUserDetailsAdminHandler,
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
  getLowTrustUsersHandler,
  restoreTrustHandler,
  getFraudLogsHandler,
  resolveFraudLogHandler,
  getGameRoomsAdminHandler,
  createGameRoomAdminHandler,
  updateGameRoomAdminHandler,
  deleteGameRoomAdminHandler,
  getGameLogsHandler,
  // KYC
  getPendingKycHandler,
  approveKycHandler,
  rejectKycHandler,
  // Announcements
  getAnnouncementsAdminHandler,
  createAnnouncementAdminHandler,
  updateAnnouncementAdminHandler,
  deleteAnnouncementAdminHandler,
  // League
  getLeaderboardAdminHandler,
  triggerMonthlyResetAdminHandler,
  adminForfeitPlayerHandler,
} from '../controllers/admin.controller';

const router = Router();

// Public — login only
router.post('/login', adminLoginHandler);

// All routes below require admin JWT
router.use(adminMiddleware);

router.get('/stats', getStatsHandler);

router.get('/users', getUsersHandler);
router.get('/users/low-trust', getLowTrustUsersHandler);
router.get('/users/:id/details', getUserDetailsAdminHandler);
router.patch('/users/:id/ban', banUserHandler);
router.patch('/users/:id/restore-trust', restoreTrustHandler);

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

// KYC
router.get('/kyc', getPendingKycHandler);
router.patch('/kyc/:id/approve', approveKycHandler);
router.patch('/kyc/:id/reject', rejectKycHandler);

// Announcements
router.get('/announcements', getAnnouncementsAdminHandler);
router.post('/announcements', createAnnouncementAdminHandler);
router.patch('/announcements/:id', updateAnnouncementAdminHandler);
router.delete('/announcements/:id', deleteAnnouncementAdminHandler);

// League
router.get('/league/leaderboard', getLeaderboardAdminHandler);
router.post('/league/monthly-reset', triggerMonthlyResetAdminHandler);

// Dev/testing helpers
router.post('/games/:gameId/forfeit-player', adminForfeitPlayerHandler);

export default router;
