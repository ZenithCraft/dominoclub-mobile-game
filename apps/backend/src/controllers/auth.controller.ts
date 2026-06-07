import { Request, Response } from 'express';
import { requestOtp, loginWithOtp, refreshTokens, logout, devLogin } from '../services/auth.service';
import { verifyAndSaveCpf } from '../services/cpf.service';
import { loginSchema, verifyOtpSchema, cpfSchema } from '../utils/validators';
import { checkMultiAccount } from '../middleware/antifraud.middleware';
import { prisma } from '../services/prisma.service';
import { config } from '../config';
import { getDevUserById } from '../services/dev-user.store';
import { sendOtp, verifyOtp } from '../services/otp.service';
import { logger } from '../utils/logger';

export async function sendOtpHandler(req: Request, res: Response) {
  try {
    const { phone } = loginSchema.parse(req.body);
    const result = await requestOtp(phone);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function verifyOtpHandler(req: Request, res: Response) {
  try {
    const { phone, otp } = verifyOtpSchema.parse(req.body);
    const ip = (req as any).clientIp;
    const deviceId = (req as any).deviceId;

    const result = await loginWithOtp(phone, otp, deviceId, ip);

    // Anti-fraud check async (don't block login)
    checkMultiAccount(result.user.id, ip, deviceId).catch(() => {});

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function devLoginHandler(req: Request, res: Response) {
  try {
    const ip = (req as any).clientIp;
    const deviceId = (req as any).deviceId;
    const isLocalIp =
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip === '::ffff:127.0.0.1' ||
      (typeof ip === 'string' && ip.startsWith('127.')) ||
      (typeof ip === 'string' && ip.startsWith('::ffff:127.'));
    // Block only if: not local IP AND bypass not explicitly enabled
    if (!isLocalIp && !config.devAuthBypass) {
      return res.status(404).json({ error: 'Not found' });
    }
    const phone = String(req.body?.phone || config.devAuthDefaultPhone);
    const name = String(req.body?.name || 'Dev User');
    const result = await devLogin(phone, name, deviceId, ip);
    checkMultiAccount(result.user.id, ip, deviceId).catch(() => {});
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function refreshHandler(req: Request, res: Response) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
    const tokens = await refreshTokens(refreshToken);
    res.json(tokens);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
}

export async function logoutHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const accessToken = req.headers.authorization?.slice(7);
    if (userId) await logout(userId, accessToken);
    res.json({ message: 'Logged out' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateProfileHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { name, cpf, avatar, gps_lat, gps_lng, date_of_birth } = req.body;

    // If CPF is being submitted, verify it via Serpro before saving
    if (cpf) {
      const rawCpf = cpf.replace(/\D/g, '');
      cpfSchema.parse(rawCpf); // throws ZodError if format/checksum invalid
      await verifyAndSaveCpf(userId, rawCpf); // throws if irregular or duplicate
    }

    // Validate age if DOB is provided
    if (date_of_birth) {
      const dob = new Date(date_of_birth);
      if (isNaN(dob.getTime())) throw new Error('Data de nascimento inválida');
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 18) throw new Error('Você precisa ter ao menos 18 anos para se cadastrar');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || undefined,
        avatar: avatar || undefined,
        gps_lat: gps_lat || undefined,
        gps_lng: gps_lng || undefined,
        date_of_birth: date_of_birth ? new Date(date_of_birth) : undefined,
        // CPF is persisted inside verifyAndSaveCpf — don't overwrite here
      },
      select: {
        id: true, phone: true, name: true, email: true, avatar: true,
        cpf_verified: true, phone_verified: true, created_at: true,
        date_of_birth: true,
        kyc_document_status: true,
        league_points: true, previous_rank: true,
      },
    });

    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

// POST /auth/cpf/verify — explicit CPF verification endpoint
// Used when the user wants to verify CPF after initial registration
export async function verifyCpfHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const rawCpf = (req.body.cpf || '').replace(/\D/g, '');

    cpfSchema.parse(rawCpf); // throws if format invalid

    const result = await verifyAndSaveCpf(userId, rawCpf);

    res.json({
      cpf_verified: result.verified,
      situacao: result.situacao,
      message: result.verified
        ? 'CPF verificado com sucesso'
        : `CPF não verificado: ${result.situacao}`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

// DELETE /auth/account — LGPD: step 1 — sends OTP to user's phone for confirmation
export async function deleteAccountHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await sendOtp(user.phone);
    res.status(202).json({ message: 'Código de confirmação enviado. Use POST /auth/account/confirm-deletion para concluir.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

// POST /auth/account/confirm-deletion — LGPD: step 2 — verifies OTP and soft-deletes
export async function confirmDeleteAccountHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { otp } = req.body as { otp?: string };
    if (!otp) return res.status(400).json({ error: 'OTP code required' });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    verifyOtp(user.phone, otp); // throws on invalid / expired / exceeded attempts

    // Soft-delete: anonymise PII, keep financial records for 5 years (legal obligation)
    await prisma.user.update({
      where: { id: userId },
      data: {
        phone: `deleted_${userId}`,
        name: 'Conta Excluída',
        email: null,
        avatar: null,
        cpf: null,
        gps_lat: null,
        gps_lng: null,
        refresh_token: null,
        is_banned: true,
        ban_reason: 'LGPD account deletion request',
      },
    });

    logger.info('[Auth] Account deleted', { userId });
    res.json({ message: 'Conta excluída com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

// POST /auth/data-export — LGPD: request personal data export
export async function requestDataExportHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, phone: true, name: true, email: true, avatar: true,
        cpf_verified: true, created_at: true,
        wallet: {
          select: {
            real_balance: true, bonus_balance: true,
            transactions: {
              orderBy: { created_at: 'desc' },
              take: 500,
              select: { id: true, type: true, amount: true, status: true, created_at: true },
            },
          },
        },
        gamePlayers: {
          orderBy: { joined_at: 'desc' },
          take: 200,
          select: {
            game: { select: { id: true, mode: true, status: true, created_at: true } },
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // In production this would be emailed. For now return the data directly.
    // Email delivery would require an email service integration.
    res.json({
      message: 'Seus dados foram preparados. Em produção, serão enviados ao e-mail cadastrado em até 48h.',
      data: user,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// POST /auth/self-exclusion — Responsible gambling: self-exclusion
export async function selfExclusionHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { type } = req.body; // 'temporary' | 'permanent'

    if (!['temporary', 'permanent'].includes(type)) {
      return res.status(400).json({ error: 'Invalid exclusion type' });
    }

    const reason = type === 'temporary'
      ? 'SELF_EXCLUSION_30_DAYS'
      : 'SELF_EXCLUSION_PERMANENT';

    await prisma.user.update({
      where: { id: userId },
      data: { is_banned: true, ban_reason: reason, refresh_token: null },
    });

    res.json({ message: reason });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getMeHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          avatar: true,
          cpf_verified: true,
          phone_verified: true,
          created_at: true,
          trust_score: true,
          is_banned: true,
          wallet: { select: { real_balance: true, bonus_balance: true, rollover_remaining: true } },
        },
      });
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch {
      if (!config.devAuthBypass && config.env === 'production') {
        return res.status(500).json({ error: 'Server error' });
      }
      const dev = userId ? getDevUserById(userId) : null;
      if (!dev) return res.status(404).json({ error: 'User not found' });
      res.json({
        id: dev.id,
        phone: dev.phone,
        name: dev.name,
        email: null,
        avatar: dev.avatar,
        cpf_verified: dev.cpf_verified,
        phone_verified: dev.phone_verified,
        created_at: new Date().toISOString(),
        wallet: {
          real_balance: dev.wallet.real_balance,
          bonus_balance: dev.wallet.bonus_balance,
          rollover_remaining: 0,
        },
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
