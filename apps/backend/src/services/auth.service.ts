import { OAuth2Client } from 'google-auth-library';
import { prisma } from './prisma.service';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken,
  signGooglePendingToken, verifyGooglePendingToken,
} from '../utils/jwt';
import { blacklistToken } from './token-blacklist.service';
import { sendOtp, verifyOtp } from './otp.service';
import { logger } from '../utils/logger';
import { config } from '../config';
import { getOrCreateDevUser, getDevRefreshToken, setDevRefreshToken } from './dev-user.store';

const googleClient = new OAuth2Client(config.google.webClientId);

async function ensureDevWalletBalance(userId: string, minBalance: number) {
  if (process.env.NODE_ENV === 'production') return;

  const wallet = await prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const realBal  = Number(wallet.real_balance  ?? 0);
  const bonusBal = Number(wallet.bonus_balance ?? 0);
  const total    = realBal + bonusBal;
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
        balance_after: realBal + topUp,
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

async function issueTokensForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } });
  if (!user) throw new Error('User not found');

  const payload = { userId: user.id, phone: user.phone };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.user.update({ where: { id: user.id }, data: { refresh_token: refreshToken } });

  return { accessToken, refreshToken, user: sanitizeUser(user) };
}

// POST /auth/google — verifies the Google ID token from the mobile app's
// native Sign-In SDK. If the Google account is already linked (or matches an
// existing verified email), logs the user in directly. Otherwise phone is
// required (see requestOtp/loginWithOtp) — returns a short-lived pending
// token the client must exchange via completeGoogleSignup once OTP passes.
export async function loginWithGoogle(idToken: string, deviceId?: string, ip?: string) {
  const ticket = await googleClient.verifyIdToken({ idToken, audience: config.google.webClientId });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error('Token do Google inválido');

  const googleId = payload.sub;
  const email = payload.email;
  const emailVerified = payload.email_verified;
  const name = payload.name;
  const avatar = payload.picture;

  let user = await prisma.user.findUnique({ where: { google_id: googleId } });

  if (!user && email && emailVerified) {
    user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      user = await prisma.user.update({ where: { id: user.id }, data: { google_id: googleId } });
    }
  }

  if (user) {
    if (user.is_banned) throw new Error('Account suspended');
    await prisma.user.update({
      where: { id: user.id },
      data: { device_id: deviceId || undefined, ip_address: ip || undefined },
    });
    return issueTokensForUser(user.id);
  }

  const pendingToken = signGooglePendingToken({ googleId, email: email || undefined, name: name || undefined, avatar: avatar || undefined });
  return { requiresPhone: true, pendingToken, profile: { name, email, avatar } };
}

// POST /auth/google/complete — second step for brand-new Google sign-ups:
// verifies the pending token + an OTP code for the phone the user provided,
// then links the Google identity to that phone-based account (creating it
// first via the same find-or-create path as requestOtp).
export async function completeGoogleSignup(pendingToken: string, phone: string, otp: string, deviceId?: string, ip?: string) {
  const pending = verifyGooglePendingToken(pendingToken);

  const ok = verifyOtp(phone, otp);
  if (!ok) throw new Error('Código inválido ou expirado');

  const conflict = await prisma.user.findUnique({ where: { google_id: pending.googleId } });
  if (conflict && conflict.phone !== phone) {
    throw new Error('Esta conta Google já está vinculada a outro número de telefone');
  }

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({ data: { phone, wallet: { create: {} } } });
  }

  if (user.is_banned) throw new Error('Account suspended');

  let emailUpdate: string | undefined;
  if (pending.email && !user.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email: pending.email } });
    if (!emailTaken) emailUpdate = pending.email;
  }

  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      google_id: pending.googleId,
      phone_verified: true,
      name: user.name || pending.name || undefined,
      avatar: user.avatar || pending.avatar || undefined,
      email: emailUpdate,
      device_id: deviceId || undefined,
      ip_address: ip || undefined,
    },
  });

  return issueTokensForUser(user.id);
}

export async function devLogin(phone: string, name: string, deviceId?: string, ip?: string) {
  try {
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
  } catch {
    const user = getOrCreateDevUser(phone, name);
    if (user.is_banned) throw new Error('Account suspended');

    const payload = { userId: user.id, phone: user.phone };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setDevRefreshToken(user.id, refreshToken);

    return { accessToken, refreshToken, user: sanitizeUser(user) };
  }
}

export async function refreshTokens(token: string) {
  const payload = verifyRefreshToken(token);
  try {
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
  } catch {
    const stored = getDevRefreshToken(payload.userId);
    if (!stored || stored !== token) throw new Error('Invalid refresh token');
    const newPayload = { userId: payload.userId, phone: payload.phone };
    const accessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);
    setDevRefreshToken(payload.userId, newRefreshToken);
    return { accessToken, refreshToken: newRefreshToken };
  }
}

export async function logout(userId: string, accessToken?: string) {
  // Blacklist the access token so it cannot be reused within its remaining TTL
  if (accessToken) {
    try {
      const { verifyAccessToken } = await import('../utils/jwt');
      const { blacklistToken } = await import('./token-blacklist.service');
      const payload = verifyAccessToken(accessToken);
      if (payload.jti && payload.exp) {
        await blacklistToken(payload.jti, payload.exp);
      }
    } catch {
      // Token already expired or malformed — nothing to blacklist
    }
  }

  try {
    await prisma.user.update({ where: { id: userId }, data: { refresh_token: null } });
  } catch {
    setDevRefreshToken(userId, null);
  }
}

function sanitizeUser(user: any) {
  const { otp_code, otp_expires_at, refresh_token, ...safe } = user;
  return safe;
}
