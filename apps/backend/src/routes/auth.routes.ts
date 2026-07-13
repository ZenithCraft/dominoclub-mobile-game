import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { config } from '../config';
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
  confirmDeleteAccountHandler,
  requestDataExportHandler,
  selfExclusionHandler,
  googleLoginHandler,
  googleCompleteHandler,
} from '../controllers/auth.controller';
import { registerPushTokenHandler } from '../controllers/kyc.controller';

const router = Router();

router.post('/otp/send', sendOtpHandler);
router.post('/otp/verify', verifyOtpHandler);
// Never registered in production — the IP/DEV_AUTH_BYPASS check inside
// devLoginHandler is not sufficient on its own (reverse-proxy IP spoofing,
// misconfigured trust proxy), so the route itself must not exist in prod.
if (config.env !== 'production') {
  router.post('/dev/login', devLoginHandler);
}
router.post('/google', googleLoginHandler);
router.post('/google/complete', googleCompleteHandler);
router.post('/token/refresh', refreshHandler);
router.post('/logout', authMiddleware, logoutHandler);
router.get('/me', authMiddleware, getMeHandler);
router.put('/profile', authMiddleware, updateProfileHandler);
router.post('/cpf/verify', authMiddleware, verifyCpfHandler);

router.post('/push-token', authMiddleware, registerPushTokenHandler);

// LGPD / Jogo Responsável
router.delete('/account', authMiddleware, deleteAccountHandler);
router.post('/account/confirm-deletion', authMiddleware, confirmDeleteAccountHandler);
router.post('/data-export', authMiddleware, requestDataExportHandler);
router.post('/self-exclusion', authMiddleware, selfExclusionHandler);

export default router;
