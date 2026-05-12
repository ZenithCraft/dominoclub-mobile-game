import axios, { AxiosInstance } from 'axios';
import https from 'https';
import fs from 'fs';
import { createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from './prisma.service';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Banco Inter PIX integration
// Docs: https://developers.inter.co/references/pix

interface InterTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface PixChargeResponse {
  txid: string;
  status: string;
  valor: { original: string };
  calendario: { expiracao: number };
  pixCopiaECola: string; // QR code string (Pix Copia e Cola)
  loc?: { id: number; location: string; tipoCob: string };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30000) {
    return cachedToken.token;
  }

  const client = createInterClient();
  const response = await client.post<InterTokenResponse>(
    '/oauth/v2/token',
    new URLSearchParams({
      client_id: config.inter.clientId,
      client_secret: config.inter.clientSecret,
      grant_type: 'client_credentials',
      scope: 'cob.write cob.read pix.read pix.write',
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  const { access_token, expires_in } = response.data;
  cachedToken = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
}

// Build an mTLS-enabled Axios instance for Banco Inter API calls.
// In production, Banco Inter requires mutual TLS — client must present a
// certificate signed by the registered certificate in their developer portal.
function createInterClient(): AxiosInstance {
  let httpsAgent: https.Agent | undefined;

  if (config.env === 'production') {
    try {
      httpsAgent = new https.Agent({
        cert: fs.readFileSync(config.inter.certPath),
        key: fs.readFileSync(config.inter.keyPath),
        rejectUnauthorized: true,
      });
    } catch (err) {
      logger.error('[PIX] Failed to load mTLS certificates — check INTER_CERT_PATH / INTER_KEY_PATH', err);
      throw new Error('PIX mTLS certificate files not found');
    }
  }

  return axios.create({
    baseURL: config.inter.baseUrl,
    headers: { 'Content-Type': 'application/json' },
    httpsAgent,
  });
}

// Register the webhook URL with Banco Inter so they push PIX events to us.
// Call once on server startup (idempotent — Inter accepts re-registration).
export async function registerPixWebhook(): Promise<void> {
  if (!config.inter.webhookUrl) {
    logger.warn('[PIX] INTER_WEBHOOK_URL not set — skipping webhook registration');
    return;
  }

  try {
    const token = await getAccessToken();
    const client = createInterClient();

    await client.put(
      `/pix/v2/webhook/${encodeURIComponent(config.inter.pixKey)}`,
      { webhookUrl: config.inter.webhookUrl },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    logger.info('[PIX] Webhook registered successfully', { url: config.inter.webhookUrl });
  } catch (err: any) {
    // Log but don't crash — webhook registration may fail in sandbox without full certs
    logger.error('[PIX] Webhook registration failed', {
      status: err?.response?.status,
      data: err?.response?.data,
    });
  }
}

// Verify HMAC-SHA256 signature sent by Banco Inter on webhook calls.
// Inter sends the signature in the `x-inter-ae-in-ativa` header as a hex digest.
// If INTER_WEBHOOK_SECRET is not configured, verification is skipped (dev mode).
export function verifyPixWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  if (!config.inter.webhookSecret) {
    if (config.env === 'production') {
      // Never silently accept unsigned webhooks in production — an attacker could credit any account.
      throw new Error('[PIX] INTER_WEBHOOK_SECRET is not configured. Refusing to process webhook.');
    }
    logger.warn('[PIX] Webhook signature verification skipped — INTER_WEBHOOK_SECRET not set (dev only)');
    return true;
  }

  const expected = createHmac('sha256', config.inter.webhookSecret)
    .update(rawBody)
    .digest('hex');

  // Use timingSafeEqual to prevent timing attacks on the HMAC comparison
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

  const txid = uuidv4().replace(/-/g, '').slice(0, 26);
  let qrCode: string;
  let pixResponse: PixChargeResponse | null = null;

  if (config.env === 'production') {
    const token = await getAccessToken();
    const client = createInterClient();

    const { data } = await client.put<PixChargeResponse>(
      `/pix/v2/cob/${txid}`,
      {
        calendario: { expiracao: 3600 },
        devedor: { cpf: user.cpf || '00000000000', nome: user.name || 'DominoClub User' },
        valor: { original: amountBRL.toFixed(2) },
        chave: config.inter.pixKey,
        solicitacaoPagador: 'Depósito DominoClub',
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    pixResponse = data;
    qrCode = data.pixCopiaECola;
  } else {
    // Mock QR code for sandbox / development
    qrCode = `00020126580014BR.GOV.BCB.PIX0136${config.inter.pixKey}5204000053039865406${amountBRL.toFixed(2)}5802BR5913DominoClub6008Brasilia62070503***6304ABCD`;
    logger.info('[PIX MOCK] Created charge', { txid, amount: amountBRL });
  }

  const parsedCouponCode = typeof couponCode === 'string' ? couponCode.trim().toUpperCase() : undefined;
  const transaction = await prisma.transaction.create({
    data: {
      walletId: user.wallet.id,
      type: 'DEPOSIT',
      amount: amountBRL,
      pix_id: txid,
      pix_qr_code: qrCode,
      status: 'PENDING',
      metadata: parsedCouponCode
        ? ({ ...(pixResponse as any), couponCode: parsedCouponCode } as any)
        : (pixResponse as any),
    },
  });

  // Dev mode: auto-confirm after 3 seconds (simulates PIX payment).
  // Only active when PIX_MOCK_AUTO_CONFIRM=true is explicitly set.
  if (process.env.PIX_MOCK_AUTO_CONFIRM === 'true') {
    setTimeout(() => {
      confirmPixDeposit(txid).catch((err) =>
        logger.error('[PIX MOCK] Auto-confirm failed', { txid, err: err.message })
      );
    }, 3000);
  }

  return { txid, qrCode, transactionId: transaction.id };
}

export async function confirmPixDeposit(txid: string): Promise<void> {
  const transaction = await prisma.transaction.findFirst({
    where: { pix_id: txid, status: 'PENDING', type: 'DEPOSIT' },
    include: { wallet: true },
  });

  if (!transaction) {
    logger.warn('[PIX] Deposit not found or already processed', { txid });
    return;
  }

  const rawMeta: any = transaction.metadata as any;
  const parsedCouponCode =
    rawMeta && typeof rawMeta === 'object' && typeof rawMeta.couponCode === 'string'
      ? String(rawMeta.couponCode).trim().toUpperCase()
      : undefined;

  await prisma.$transaction(async (tx) => {
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
      // Serializable isolation ensures the count is accurate under concurrent deposits.
      // If two requests race, PostgreSQL will abort one — the P2002 catch below is the
      // second safety net for the unique constraint on (couponId, userId).
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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  logger.info('[PIX] Deposit confirmed', { txid, amount: transaction.amount, walletId: transaction.walletId });
}

export async function processWithdrawal(userId: string, amountBRL: number, pixKey: string): Promise<string> {
  const txid = uuidv4().replace(/-/g, '').slice(0, 26);

  // All checks and the debit happen inside a SERIALIZABLE transaction so that two
  // concurrent withdrawals cannot both pass the balance check and double-spend.
  const transaction = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
        pix_id: txid,
        pix_key: pixKey,
        status: 'PENDING',
        balance_after: Number(wallet.real_balance) - amountBRL,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  // Dispatch PIX transfer (production only); in dev/sandbox just log it.
  if (config.env === 'production') {
    try {
      const token = await getAccessToken();
      const client = createInterClient();

      await client.post(
        '/pix/v2/pagamentos',
        {
          valor: amountBRL.toFixed(2),
          chave: pixKey,
          descricao: 'Saque DominoClub',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Mark as COMPLETED once PIX is dispatched
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' },
      });
    } catch (err: any) {
      // Refund the reserved balance and mark as FAILED
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
      logger.error('[PIX] Withdrawal failed — balance refunded', { userId, txid, error: err?.response?.data });
      throw new Error('PIX withdrawal failed — please try again');
    }
  } else {
    // Sandbox / dev: auto-complete
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'COMPLETED' },
    });
    logger.info('[PIX MOCK] Withdrawal completed', { userId, amount: amountBRL, pixKey });
  }

  return transaction.id;
}
