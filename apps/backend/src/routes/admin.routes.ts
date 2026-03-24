import { Router } from 'express';
import { adminMiddleware } from '../middleware/admin.middleware';
import {
  adminLoginHandler,
  getStatsHandler,
  getUsersHandler,
  banUserHandler,
  getGamesHandler,
  getTransactionsHandler,
  approveWithdrawalHandler,
  rejectWithdrawalHandler,
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

router.get('/transactions', getTransactionsHandler);
router.patch('/transactions/:id/approve', approveWithdrawalHandler);
router.patch('/transactions/:id/reject', rejectWithdrawalHandler);

export default router;
