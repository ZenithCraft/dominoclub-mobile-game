import { Request, Response } from 'express';
import { getWallet, deposit, withdraw, getTransaction } from '../services/wallet.service';
import { redeemCoupon } from '../services/coupon.service';
import { confirmPixDeposit, verifyPixWebhookSignature } from '../services/pix.service';
import { depositSchema, redeemCouponSchema, withdrawSchema } from '../utils/validators';
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
    const { amount } = depositSchema.parse(req.body);
    const result = await deposit(userId, amount);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function withdrawHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
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

// POST /wallet/pix/webhook — called by Banco Inter when a PIX payment is received.
// Banco Inter sends an array of PIX events in req.body.pix.
// The raw body (captured before JSON parsing) is used to verify the HMAC signature.
export async function pixWebhookHandler(req: Request, res: Response) {
  try {
    // Signature verification — header sent by Banco Inter
    const signature = req.headers['x-inter-ae-in-ativa'] as string || '';
    const rawBody = (req as any).rawBody as string || JSON.stringify(req.body);

    if (!verifyPixWebhookSignature(rawBody, signature)) {
      logger.warn('[PIX Webhook] Invalid signature — request rejected', {
        ip: req.ip,
        signature,
      });
      return res.sendStatus(401);
    }

    const { pix } = req.body;
    if (!pix || !Array.isArray(pix)) {
      logger.warn('[PIX Webhook] Unexpected payload shape', { body: req.body });
      return res.sendStatus(400);
    }

    for (const pixEvent of pix) {
      const { txid } = pixEvent;
      if (txid) {
        await confirmPixDeposit(txid);
      } else {
        logger.warn('[PIX Webhook] Event missing txid', { pixEvent });
      }
    }

    res.sendStatus(200);
  } catch (err: any) {
    logger.error('[PIX Webhook] Processing error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
}
