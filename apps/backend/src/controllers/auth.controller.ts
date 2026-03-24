import { Request, Response } from 'express';
import { requestOtp, loginWithOtp, refreshTokens, logout } from '../services/auth.service';
import { verifyAndSaveCpf } from '../services/cpf.service';
import { loginSchema, verifyOtpSchema, cpfSchema } from '../utils/validators';
import { checkMultiAccount } from '../middleware/antifraud.middleware';
import { prisma } from '../services/prisma.service';

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
    if (userId) await logout(userId);
    res.json({ message: 'Logged out' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateProfileHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { name, cpf, avatar, gps_lat, gps_lng } = req.body;

    // If CPF is being submitted, verify it via Serpro before saving
    if (cpf) {
      const rawCpf = cpf.replace(/\D/g, '');
      cpfSchema.parse(rawCpf); // throws ZodError if format/checksum invalid
      await verifyAndSaveCpf(userId, rawCpf); // throws if irregular or duplicate
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || undefined,
        avatar: avatar || undefined,
        gps_lat: gps_lat || undefined,
        gps_lng: gps_lng || undefined,
        // CPF is persisted inside verifyAndSaveCpf — don't overwrite here
      },
      select: {
        id: true, phone: true, name: true, email: true, avatar: true,
        cpf_verified: true, phone_verified: true, created_at: true,
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

export async function getMeHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
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
        wallet: { select: { real_balance: true, bonus_balance: true, rollover_remaining: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
