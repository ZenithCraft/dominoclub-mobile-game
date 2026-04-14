import { prisma } from './prisma.service';
import { createPixCharge, processWithdrawal } from './pix.service';

// Safely convert a Prisma Decimal (or number) to a JS number
const n = (v: any): number => Number(v ?? 0);

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

export async function deposit(userId: string, amount: number, couponCode?: string) {
  if (amount < 20) throw new Error('Minimum deposit is R$20');
  return createPixCharge(userId, amount, couponCode);
}

export async function withdraw(userId: string, amount: number, pixKey: string) {
  if (amount < 20) throw new Error('Minimum withdrawal is R$20');
  return processWithdrawal(userId, amount, pixKey);
}

export async function deductBet(walletId: string, amount: number) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) throw new Error('Wallet not found');

  const bonusBal   = n(wallet.bonus_balance);
  const realBal    = n(wallet.real_balance);
  const rolloverRem = n(wallet.rollover_remaining);

  const useBonus      = bonusBal >= amount;
  const realDeduction = useBonus ? 0 : amount - Math.min(bonusBal, amount);
  const bonusDeduction = useBonus ? amount : bonusBal;
  const rolloverDeduction = rolloverRem > 0 ? Math.min(rolloverRem, amount) : 0;

  if (realBal < realDeduction) throw new Error('Insufficient balance');

  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      real_balance:  { decrement: realDeduction },
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
      balance_after: realBal - realDeduction,
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

/**
 * Credit winnings to the correct balance bucket.
 *
 * While the player has an active rollover requirement (rollover_remaining > 0),
 * winnings are credited to bonus_balance so they remain locked until the
 * wagering requirement is met. Once rollover_remaining reaches 0, winnings
 * go directly to real_balance.
 */
export async function creditWin(walletId: string, amount: number) {
  const current = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { rollover_remaining: true },
  });
  if (!current) throw new Error('Wallet not found');

  const hasRollover = n(current.rollover_remaining) > 0;

  const updated = await prisma.wallet.update({
    where: { id: walletId },
    data: hasRollover
      ? { bonus_balance: { increment: amount } }
      : { real_balance:  { increment: amount } },
  });

  await prisma.transaction.create({
    data: {
      walletId,
      type: 'WIN',
      amount,
      status: 'COMPLETED',
      balance_after: hasRollover ? n(updated.bonus_balance) : n(updated.real_balance),
    },
  });
}
