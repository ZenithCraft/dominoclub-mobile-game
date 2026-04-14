import { prisma } from './prisma.service';

export async function redeemCoupon(userId: string, code: string) {
  const parsedCode = String(code ?? '').trim().toUpperCase();
  if (!parsedCode) throw new Error('Invalid coupon code');

  return prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.findUnique({ where: { code: parsedCode } });
    if (!coupon || !coupon.is_active) throw new Error('Cupom inválido ou inativo');

    if (coupon.max_players !== null) {
      const used = await tx.couponRedemption.count({ where: { couponId: coupon.id } });
      if (used >= coupon.max_players) throw new Error('Limite de uso do cupom atingido');
    }

    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Wallet not found');

    const rolloverAdded = coupon.bonus_amount * coupon.rollover_times;

    try {
      await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId,
          bonus_amount: coupon.bonus_amount,
          rollover_added: rolloverAdded,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new Error('Cupom já utilizado');
      throw err;
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        bonus_balance: { increment: coupon.bonus_amount },
        rollover_remaining: { increment: rolloverAdded },
      },
    });

    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'BONUS',
        amount: coupon.bonus_amount,
        status: 'COMPLETED',
        balance_after: updatedWallet.real_balance,
        description: `Cupom ${coupon.code}`,
      },
    });

    return {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        bonus_amount: coupon.bonus_amount,
        rollover_times: coupon.rollover_times,
        max_players: coupon.max_players,
      },
      wallet: {
        real_balance: updatedWallet.real_balance,
        bonus_balance: updatedWallet.bonus_balance,
        rollover_remaining: updatedWallet.rollover_remaining,
      },
    };
  });
}

