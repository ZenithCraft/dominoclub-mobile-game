import axios, { AxiosInstance } from 'axios';
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

  const response = await axios.post<InterTokenResponse>(
    `${config.inter.baseUrl}/oauth/v2/token`,
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

function createInterClient(): AxiosInstance {
  return axios.create({
    baseURL: config.inter.baseUrl,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function createPixCharge(userId: string, amountBRL: number): Promise<{
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
  const token = await getAccessToken();
  const client = createInterClient();

  let qrCode: string;
  let pixResponse: PixChargeResponse | null = null;

  if (config.env === 'production' || config.inter.baseUrl.includes('bancointer')) {
    const { data } = await client.put<PixChargeResponse>(
      `/pix/v2/cob/${txid}`,
      {
        calendario: { expiracao: 3600 },
        devedor: { cpf: user.cpf || '00000000000', nome: user.name || 'DominoClub User' },
        valor: { original: amountBRL.toFixed(2) },
        chave: config.inter.pixKey,
        solicitacaoPagador: `Depósito DominoClub`,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    pixResponse = data;
    qrCode = data.pixCopiaECola;
  } else {
    // Mock for sandbox/development
    qrCode = `00020126580014BR.GOV.BCB.PIX0136${config.inter.pixKey}5204000053039865406${amountBRL.toFixed(2)}5802BR5913DominoClub6008Brasilia62070503***6304ABCD`;
    logger.info('[PIX MOCK] Created charge', { txid, amount: amountBRL });
  }

  const transaction = await prisma.transaction.create({
    data: {
      walletId: user.wallet.id,
      type: 'DEPOSIT',
      amount: amountBRL,
      pix_id: txid,
      pix_qr_code: qrCode,
      status: 'PENDING',
      metadata: pixResponse as any,
    },
  });

  return { txid, qrCode, transactionId: transaction.id };
}

export async function confirmPixDeposit(txid: string): Promise<void> {
  const transaction = await prisma.transaction.findFirst({
    where: { pix_id: txid, status: 'PENDING', type: 'DEPOSIT' },
    include: { wallet: true },
  });

  if (!transaction) {
    logger.warn('PIX deposit not found or already processed', { txid });
    return;
  }

  await prisma.$transaction([
    prisma.wallet.update({
      where: { id: transaction.walletId },
      data: { real_balance: { increment: transaction.amount } },
    }),
    prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'COMPLETED',
        balance_after: transaction.wallet.real_balance + transaction.amount,
      },
    }),
  ]);

  logger.info('PIX deposit confirmed', { txid, amount: transaction.amount, walletId: transaction.walletId });
}

export async function processWithdrawal(userId: string, amountBRL: number, pixKey: string): Promise<string> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error('Wallet not found');
  if (wallet.real_balance < amountBRL) throw new Error('Insufficient balance');
  if (wallet.rollover_remaining > 0) throw new Error('Rollover requirement not met yet');

  const txid = uuidv4().replace(/-/g, '').slice(0, 26);
  const token = await getAccessToken();

  if (config.env === 'production') {
    const client = createInterClient();
    await client.post(
      '/pix/v2/pagamentos',
      {
        valor: amountBRL.toFixed(2),
        chave: pixKey,
        descricao: 'Saque DominoClub',
        saque: { agente: 'AGTEC', modalidadeAlteracao: 0 },
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } else {
    logger.info('[PIX MOCK] Withdrawal', { userId, amount: amountBRL, pixKey });
  }

  const transaction = await prisma.$transaction(async (tx) => {
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
        status: config.env === 'production' ? 'PENDING' : 'COMPLETED',
        balance_after: wallet.real_balance - amountBRL,
      },
    });
  });

  return transaction.id;
}
