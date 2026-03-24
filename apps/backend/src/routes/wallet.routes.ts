import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getWalletHandler, depositHandler, withdrawHandler, pixWebhookHandler } from '../controllers/wallet.controller';

const router = Router();

router.get('/', authMiddleware, getWalletHandler);
router.post('/deposit', authMiddleware, depositHandler);
router.post('/withdraw', authMiddleware, withdrawHandler);
router.post('/pix/webhook', pixWebhookHandler); // No auth — called by Banco Inter

export default router;
