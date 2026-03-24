import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  sendOtpHandler,
  verifyOtpHandler,
  refreshHandler,
  logoutHandler,
  updateProfileHandler,
  getMeHandler,
} from '../controllers/auth.controller';

const router = Router();

router.post('/otp/send', sendOtpHandler);
router.post('/otp/verify', verifyOtpHandler);
router.post('/token/refresh', refreshHandler);
router.post('/logout', authMiddleware, logoutHandler);
router.get('/me', authMiddleware, getMeHandler);
router.put('/profile', authMiddleware, updateProfileHandler);

export default router;
