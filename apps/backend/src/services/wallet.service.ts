import { prisma } from './prisma.service';
import { createPixCharge, processWithdrawal } from './pix.service';

export async function getWallet(userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { created_at: 'desc' },
        take: 20,
        select: {
          id: true,
          type: true,
          amount: true,
          balance_after: true,
          status: true,
          pix_qr_code: true,
          pix_key: true,
          created_at: true,
        },
      },
    },
  });
  if (!wallet) throw new Error('Wallet not found');
  return wallet;
}

export async function deposit(userId: string, amount: number) {
  if (amount < 10) throw new Error('Minimum deposit is R$10');
  return createPixCharge(userId, amount);
}

export async function withdraw(userId: string, amount: number, pixKey: string) {
  if (amount < 20) throw new Error('Minimum withdrawal is R$20');
  return processWithdrawal(userId, amount, pixKey);
}

export async function deductBet(walletId: string, amount: number) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) throw new Error('Wallet not found');

  const useBonus = wallet.bonus_balance >= amount;
  const realDeduction = useBonus ? 0 : amount - Math.min(wallet.bonus_balance, amount);
  const bonusDeduction = useBonus ? amount : wallet.bonus_balance;
  const rolloverDeduction = wallet.rollover_remaining > 0 ? Math.min(wallet.rollover_remaining, amount) : 0;

  if (wallet.real_balance < realDeduction) throw new Error('Insufficient balance');

  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      real_balance: { decrement: realDeduction },
      bonus_balance: { decrement: bonusDeduction },
      ...(rolloverDeduction > 0 ? { rollover_remaining: { decrement: rolloverDeduction } } : {}),
    },
  });

  await prisma.transaction.create({
    data: {
      walletId,
      type: 'BET',
      amount: -amount,
      status: 'COMPLETED',
      balance_after: wallet.real_balance - realDeduction,
    },
  });
}

export async function getTransaction(userId: string, transactionId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error('Wallet not found');

  return prisma.transaction.findFirst({
    where: { id: transactionId, walletId: wallet.id },
    select: {
      id: true,
      type: true,
      amount: true,
      balance_after: true,
      status: true,
      pix_id: true,
      pix_qr_code: true,
      pix_key: true,
      created_at: true,
    },
  });
}

export async function creditWin(walletId: string, amount: number) {
  const wallet = await prisma.wallet.update({
    where: { id: walletId },
    data: { real_balance: { increment: amount } },
  });

  await prisma.transaction.create({
    data: {
      walletId,
      type: 'WIN',
      amount,
      status: 'COMPLETED',
      balance_after: wallet.real_balance,
    },
  });
}
