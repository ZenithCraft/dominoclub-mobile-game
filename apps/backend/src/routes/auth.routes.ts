import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  sendOtpHandler,
  verifyOtpHandler,
  devLoginHandler,
  refreshHandler,
  logoutHandler,
  updateProfileHandler,
  getMeHandler,
  verifyCpfHandler,
  deleteAccountHandler,
  requestDataExportHandler,
  selfExclusionHandler,
} from '../controllers/auth.controller';

const router = Router();

router.post('/otp/send', sendOtpHandler);
router.post('/otp/verify', verifyOtpHandler);
router.post('/dev/login', devLoginHandler);
router.post('/token/refresh', refreshHandler);
router.post('/logout', authMiddleware, logoutHandler);
router.get('/me', authMiddleware, getMeHandler);
router.put('/profile', authMiddleware, updateProfileHandler);
router.post('/cpf/verify', authMiddleware, verifyCpfHandler);

// LGPD / Jogo Responsável
router.delete('/account', authMiddleware, deleteAccountHandler);
router.post('/data-export', authMiddleware, requestDataExportHandler);
router.post('/self-exclusion', authMiddleware, selfExclusionHandler);

export default router;
