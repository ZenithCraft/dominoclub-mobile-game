import { prisma } from './prisma.service';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendOtp, verifyOtp } from './otp.service';
import { logger } from '../utils/logger';

async function ensureDevWalletBalance(userId: string, minBalance: number) {
  if (process.env.NODE_ENV === 'production') return;

  const wallet = await prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const total = (wallet.real_balance ?? 0) + (wallet.bonus_balance ?? 0);
  if (total >= minBalance) return;

  const topUp = minBalance - total;
  await prisma.$transaction([
    prisma.wallet.update({
      where: { id: wallet.id },
      data: { real_balance: { increment: topUp } },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'BONUS',
        amount: topUp,
        status: 'COMPLETED',
        balance_after: (wallet.real_balance ?? 0) + topUp,
        description: 'Dev test balance top-up',
      },
    }),
  ]);
}

export async function requestOtp(phone: string) {
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        wallet: { create: {} },
      },
      include: { wallet: true },
    });
    logger.info('New user registered', { userId: user.id, phone });
  }

  if (user.is_banned) throw new Error('Account suspended');

  await sendOtp(phone);  // throws if resend cooldown active
  return { message: 'OTP enviado', isNewUser: !user.name };
}

export async function loginWithOtp(phone: string, otp: string, deviceId?: string, ip?: string) {
  const ok = verifyOtp(phone, otp);
  if (!ok) throw new Error('Código inválido ou expirado');

  await prisma.user.update({
    where: { phone },
    data: {
      phone_verified: true,
      device_id: deviceId || undefined,
      ip_address: ip || undefined,
    },
  });

  const fresh = await prisma.user.findUnique({ where: { phone }, include: { wallet: true } });
  if (!fresh) throw new Error('User not found');

  await ensureDevWalletBalance(fresh.id, 1000);

  const user = await prisma.user.findUnique({ where: { id: fresh.id }, include: { wallet: true } });
  if (!user) throw new Error('User not found');

  const payload = { userId: user.id, phone: user.phone };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.user.update({
    where: { id: user.id },
    data: { refresh_token: refreshToken },
  });

  return { accessToken, refreshToken, user: sanitizeUser(user) };
}

export async function devLogin(phone: string, name: string, deviceId?: string, ip?: string) {
  let user = await prisma.user.findUnique({ where: { phone }, include: { wallet: true } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        name,
        cpf_verified: true,
        phone_verified: true,
        wallet: { create: { real_balance: 1000 } },
      },
      include: { wallet: true },
    });
    logger.info('Dev login created user', { userId: user.id, phone });
  }

  if (user.is_banned) throw new Error('Account suspended');

  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: user.name || name,
      cpf_verified: true,
      phone_verified: true,
      device_id: deviceId || undefined,
      ip_address: ip || undefined,
      wallet: {
        connectOrCreate: {
          where: { userId: user.id },
          create: {},
        },
      },
    },
    include: { wallet: true },
  });

  await ensureDevWalletBalance(user.id, 1000);
  user = await prisma.user.findUnique({ where: { id: user.id }, include: { wallet: true } });
  if (!user) throw new Error('User not found');

  const payload = { userId: user.id, phone: user.phone };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.user.update({
    where: { id: user.id },
    data: { refresh_token: refreshToken },
  });

  return { accessToken, refreshToken, user: sanitizeUser(user) };
}

export async function refreshTokens(token: string) {
  const payload = verifyRefreshToken(token);
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, phone: true, refresh_token: true, is_banned: true },
  });

  if (!user || user.refresh_token !== token) throw new Error('Invalid refresh token');
  if (user.is_banned) throw new Error('Account suspended');

  const newPayload = { userId: user.id, phone: user.phone };
  const accessToken = signAccessToken(newPayload);
  const newRefreshToken = signRefreshToken(newPayload);

  await prisma.user.update({ where: { id: user.id }, data: { refresh_token: newRefreshToken } });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { refresh_token: null } });
}

function sanitizeUser(user: any) {
  const { otp_code, otp_expires_at, refresh_token, ...safe } = user;
  return safe;
}
