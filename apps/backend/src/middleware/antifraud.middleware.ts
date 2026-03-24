import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/prisma.service';
import { logger } from '../utils/logger';
import { config } from '../config';

export async function antifraudMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '';
  const deviceId = req.headers['x-device-id'] as string | undefined;

  // Block non-Brazilian IPs in production (simple GeoIP check via header from CDN)
  const country = req.headers['cf-ipcountry'] as string | undefined;
  if (config.env === 'production' && country && country !== 'BR') {
    logger.warn('Blocked non-BR request', { ip, country });
    return res.status(403).json({ error: 'Service unavailable in your region' });
  }

  // Attach request metadata for downstream use
  (req as any).clientIp = ip;
  (req as any).deviceId = deviceId;

  next();
}

export async function checkMultiAccount(userId: string, ip: string, deviceId?: string) {
  if (!deviceId && !ip) return;

  const conflicts: string[] = [];

  if (deviceId) {
    const sameDevice = await prisma.user.findMany({
      where: { device_id: deviceId, id: { not: userId } },
      select: { id: true },
    });
    if (sameDevice.length > 0) conflicts.push('MULTI_ACCOUNT_DEVICE');
  }

  if (ip) {
    const sameIp = await prisma.user.findMany({
      where: { ip_address: ip, id: { not: userId } },
      select: { id: true },
    });
    if (sameIp.length >= 3) conflicts.push('MULTI_ACCOUNT_IP');
  }

  for (const type of conflicts) {
    await prisma.fraudLog.create({
      data: {
        userId,
        type: type as any,
        details: { ip, deviceId },
        ip_address: ip,
        device_id: deviceId,
      },
    });
  }
}
