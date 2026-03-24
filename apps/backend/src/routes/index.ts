import { Router } from 'express';
import authRoutes from './auth.routes';
import walletRoutes from './wallet.routes';
import gameRoutes from './game.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/wallet', walletRoutes);
router.use('/game', gameRoutes);

router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'DominoClub API', timestamp: new Date().toISOString() });
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
