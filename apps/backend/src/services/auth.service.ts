import { prisma } from './prisma.service';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendOtp, verifyOtp } from './otp.service';
import { logger } from '../utils/logger';

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

  await sendOtp(phone);
  return { message: 'OTP sent', isNewUser: !user.name };
}

export async function loginWithOtp(phone: string, otp: string, deviceId?: string, ip?: string) {
  const valid = verifyOtp(phone, otp);
  if (!valid) throw new Error('Invalid or expired OTP');

  const user = await prisma.user.update({
    where: { phone },
    data: {
      phone_verified: true,
      device_id: deviceId || undefined,
      ip_address: ip || undefined,
    },
  });

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
