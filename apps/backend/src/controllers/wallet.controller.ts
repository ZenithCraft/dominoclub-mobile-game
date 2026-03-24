import { Request, Response } from 'express';
import { getWallet, deposit, withdraw } from '../services/wallet.service';
import { confirmPixDeposit } from '../services/pix.service';
import { depositSchema, withdrawSchema } from '../utils/validators';

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

// Webhook called by Banco Inter when PIX is received
export async function pixWebhookHandler(req: Request, res: Response) {
  try {
    const { pix } = req.body;
    if (!pix || !Array.isArray(pix)) return res.sendStatus(400);

    for (const pixEvent of pix) {
      const { txid, endToEndId } = pixEvent;
      if (txid) await confirmPixDeposit(txid);
    }

    res.sendStatus(200);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
