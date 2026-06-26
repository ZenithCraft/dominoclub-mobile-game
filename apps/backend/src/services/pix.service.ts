import axios, { AxiosInstance } from 'axios';
import { createHmac } from 'crypto';
import { config } from '../config';
import { prisma } from './prisma.service';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

function createWooviClient(): AxiosInstance {
  return axios.create({
    baseURL: config.woovi.baseUrl,
    headers: {
      'Content-Type': 'application/json',
      Authorization: config.woovi.appId,
    },
  });
}

export function verifyPixWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  if (!config.woovi.webhookSecret) {
    if (config.env === 'production') {
      throw new Error('[PIX] WOOVI_WEBHOOK_SECRET is not configured. Refusing to process webhook.');
    }
    logger.warn('[PIX] Webhook signature verification skipped — WOOVI_WEBHOOK_SECRET not set (dev only)');
    return true;
  }

  const expected = createHmac('sha1', config.woovi.webhookSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(signatureHeader || '', 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;

  return require('crypto').timingSafeEqual(expectedBuf, receivedBuf);
}

export async function createPixCharge(userId: string, amountBRL: number, couponCode?: string): Promise<{
  txid: string;
  qrCode: string;
  transactionId: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true },
  });
  if (!user?.wallet) throw new Error('Wallet not found');

  const correlationID = uuidv4();
  let qrCode: string;

  if (config.env === 'production') {
    const client = createWooviClient();
    const { data } = await client.post('/charge', {
      correlationID,
      value: Math.round(amountBRL * 100 + Number.EPSILON),
      comment: 'Depósito DominoClub',
    });

    qrCode = data.charge?.brCode || data.brCode;
    if (!qrCode) {
      logger.error('[PIX] Woovi charge created but no brCode returned', { data });
      throw new Error('Failed to generate PIX QR code');
    }
  } else {
    qrCode = `00020126580014BR.GOV.BCB.PIX0136${correlationID}5204000053039865406${amountBRL.toFixed(2)}5802BR5913DominoClub6008Brasilia62070503***6304ABCD`;
    logger.info('[PIX MOCK] Created charge', { correlationID, amount: amountBRL });
  }

  const parsedCouponCode = typeof couponCode === 'string' ? couponCode.trim().toUpperCase() : undefined;
  const transaction = await prisma.transaction.create({
    data: {
      walletId: user.wallet.id,
      type: 'DEPOSIT',
      amount: amountBRL,
      pix_id: correlationID,
      pix_qr_code: qrCode,
      status: 'PENDING',
      metadata: parsedCouponCode ? ({ couponCode: parsedCouponCode } as any) : undefined,
    },
  });

  if (process.env.PIX_MOCK_AUTO_CONFIRM === 'true') {
    setTimeout(() => {
      confirmPixDeposit(correlationID).catch((err) =>
        logger.error('[PIX MOCK] Auto-confirm failed', { correlationID, err: err.message })
      );
    }, 3000);
  }

  return { txid: correlationID, qrCode, transactionId: transaction.id };
}

export async function confirmPixDeposit(correlationID: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findFirst({
      where: { pix_id: correlationID, status: 'PENDING', type: 'DEPOSIT' },
      include: { wallet: true },
    });

    if (!transaction) {
      logger.warn('[PIX] Deposit not found or already processed', { correlationID });
      return;
    }

    const rawMeta: any = transaction.metadata as any;
    const parsedCouponCode =
      rawMeta && typeof rawMeta === 'object' && typeof rawMeta.couponCode === 'string'
        ? String(rawMeta.couponCode).trim().toUpperCase()
        : undefined;

    const updatedWallet = await tx.wallet.update({
      where: { id: transaction.walletId },
      data: { real_balance: { increment: transaction.amount } },
    });

    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'COMPLETED',
        balance_after: updatedWallet.real_balance,
      },
    });

    if (!parsedCouponCode) return;

    const coupon = await tx.coupon.findUnique({ where: { code: parsedCouponCode } });
    if (!coupon || !coupon.is_active) return;
    if (Number(transaction.amount) < Number(coupon.min_deposit_amount)) return;

    if (coupon.max_players !== null) {
      const used = await tx.couponRedemption.count({ where: { couponId: coupon.id } });
      if (used >= coupon.max_players) return;
    }

    const rolloverAdded = Number(coupon.bonus_amount) * coupon.rollover_times;

    try {
      await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId: transaction.wallet.userId,
          bonus_amount: coupon.bonus_amount,
          rollover_added: rolloverAdded,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') return;
      throw err;
    }

    const afterBonusWallet = await tx.wallet.update({
      where: { id: updatedWallet.id },
      data: {
        bonus_balance: { increment: coupon.bonus_amount },
        rollover_remaining: { increment: rolloverAdded },
      },
    });

    await tx.transaction.create({
      data: {
        walletId: afterBonusWallet.id,
        type: 'BONUS',
        amount: coupon.bonus_amount,
        status: 'COMPLETED',
        balance_after: afterBonusWallet.real_balance,
        description: `Bônus de depósito — cupom ${coupon.code}`,
        metadata: { depositTransactionId: transaction.id } as any,
      },
    });
  }, { isolationLevel: 'Serializable' as any });

  logger.info('[PIX] Deposit confirmed', { correlationID });
}

export async function processWithdrawal(userId: string, amountBRL: number, pixKey: string): Promise<string> {
  const correlationID = uuidv4();

  const transaction = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { kyc_document_status: true },
    });
    if (user?.kyc_document_status !== 'APPROVED') {
      throw new Error('Verificação de identidade (KYC) obrigatória antes do primeiro saque. Acesse Perfil → Verificação para enviar seus documentos.');
    }

    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Wallet not found');
    if (Number(wallet.real_balance) < amountBRL) throw new Error('Insufficient balance');
    if (Number(wallet.rollover_remaining) > 0) throw new Error('Rollover requirement not met yet');

    await tx.wallet.update({
      where: { userId },
      data: { real_balance: { decrement: amountBRL } },
    });
    return tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'WITHDRAWAL',
        amount: amountBRL,
        pix_id: correlationID,
        pix_key: pixKey,
        status: 'PENDING',
        balance_after: Number(wallet.real_balance) - amountBRL,
      },
    });
  }, { isolationLevel: 'Serializable' as any });

  if (config.env === 'production') {
    try {
      const client = createWooviClient();
      await client.post('/payment', {
        correlationID,
        value: Math.round(amountBRL * 100 + Number.EPSILON),
        type: 'PIX_KEY',
        pixKey,
        comment: 'Saque DominoClub',
      });

      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' },
      });
    } catch (err: any) {
      await prisma.$transaction([
        prisma.wallet.update({
          where: { userId },
          data: { real_balance: { increment: amountBRL } },
        }),
        prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED' },
        }),
      ]);
      logger.error('[PIX] Withdrawal failed — balance refunded', { userId, correlationID, error: err?.response?.data });
      throw new Error('PIX withdrawal failed — please try again');
    }
  } else {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'COMPLETED' },
    });
    logger.info('[PIX MOCK] Withdrawal completed', { userId, amount: amountBRL, pixKey });
  }

  return transaction.id;
}
