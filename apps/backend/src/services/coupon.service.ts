import { prisma } from './prisma.service';

export async function redeemCoupon(userId: string, code: string) {
  const parsedCode = String(code ?? '').trim().toUpperCase();
  if (!parsedCode) throw new Error('Invalid coupon code');

  const coupon = await prisma.coupon.findUnique({ where: { code: parsedCode } });
  if (!coupon || !coupon.is_active) throw new Error('Cupom inválido ou inativo');
  throw new Error('Cupom disponível somente no depósito');
}

export async function validateCoupon(userId: string, code: string): Promise<'valid' | 'not_found' | 'used'> {
  const parsedCode = String(code ?? '').trim().toUpperCase();
  if (!parsedCode) return 'not_found';

  const coupon = await prisma.coupon.findUnique({ where: { code: parsedCode } });
  if (!coupon || !coupon.is_active) return 'not_found';

  const redemption = await prisma.couponRedemption.findFirst({
    where: { couponId: coupon.id, userId },
  });
  if (redemption) return 'used';

  return 'valid';
}

