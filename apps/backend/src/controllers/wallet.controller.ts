import { Request, Response } from 'express';
import { getWallet, deposit, withdraw, getTransaction } from '../services/wallet.service';
import { redeemCoupon, validateCoupon } from '../services/coupon.service';
import { confirmPixDeposit, verifyPixWebhookSignature } from '../services/pix.service';
import { depositSchema, redeemCouponSchema, withdrawSchema } from '../utils/validators';
import { checkUserVelocity } from '../middleware/antifraud.middleware';
import { applyTrustSignal } from '../services/trust.service';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function getWalletHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const wallet = await getWallet(userId);
    res.json(wallet);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function depositHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { amount, couponCode } = depositSchema.parse(req.body);
    const result = await deposit(userId, amount, couponCode);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function withdrawHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;

    const velocity = await checkUserVelocity(
      userId, 'wallet_withdraw',
      config.antifraud.velocityWithdrawWindowMs,
      config.antifraud.velocityWithdrawMax,
    );
    if (velocity.blocked) {
      logger.warn('[Wallet] Withdraw velocity exceeded', { userId, count: velocity.count });
      await applyTrustSignal(userId, 'velocity_abuse');
      return res.status(429).json({
        error: 'Limite de saques atingido. Tente novamente mais tarde.',
        code: 'VELOCITY_EXCEEDED',
      });
    }

    const { amount, pixKey } = withdrawSchema.parse(req.body);
    const transactionId = await withdraw(userId, amount, pixKey);
    res.status(201).json({ transactionId, message: 'Withdrawal requested' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function redeemCouponHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { code } = redeemCouponSchema.parse(req.body);
    const result = await redeemCoupon(userId, code);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function validateCouponHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const status = await validateCoupon(userId, code);
    res.json({ status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// GET /wallet/transaction/:id — lets the mobile app poll deposit status
export async function getTransactionHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const transaction = await getTransaction(userId, id);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    res.json(transaction);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function pixWebhookHandler(req: Request, res: Response) {
  try {
    const signature = req.headers['x-openpix-signature'] as string || '';
    const rawBody = (req as any).rawBody as string;

    if (!rawBody) {
      logger.warn('[PIX Webhook] Missing rawBody — cannot verify signature', { ip: req.ip });
      return res.sendStatus(400);
    }

    if (!verifyPixWebhookSignature(rawBody, signature)) {
      logger.warn('[PIX Webhook] Invalid signature — request rejected', {
        ip: req.ip,
        signature,
      });
      return res.sendStatus(401);
    }

    const { event, charge } = req.body;

    if (!charge && !event) {
      logger.info('[PIX Webhook] Test ping received');
      return res.sendStatus(200);
    }

    if (event === 'OPENPIX:CHARGE_COMPLETED' && charge?.correlationID) {
      await confirmPixDeposit(charge.correlationID);
    } else {
      logger.info('[PIX Webhook] Ignored event', { event });
    }

    res.sendStatus(200);
  } catch (err: any) {
    logger.error('[PIX Webhook] Processing error', { error: err.message });
    res.sendStatus(500);
  }
}
