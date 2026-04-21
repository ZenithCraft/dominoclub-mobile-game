import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { isTokenBlacklisted } from '../services/token-blacklist.service';
import { prisma } from '../services/prisma.service';
import { config } from '../config';

export interface AuthRequest extends Request {
  user?: { userId: string; phone: string };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);

    // Reject tokens that were explicitly invalidated on logout
    if (payload.jti && await isTokenBlacklisted(payload.jti)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, phone: true, is_banned: true },
      });

      if (!user) return res.status(401).json({ error: 'User not found' });
      if (user.is_banned) return res.status(403).json({ error: 'Account suspended' });

      req.user = { userId: user.id, phone: user.phone };
    } catch {
      if (!config.devAuthBypass && config.env === 'production') {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      req.user = { userId: payload.userId, phone: payload.phone };
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
