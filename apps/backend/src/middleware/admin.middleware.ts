import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AdminRequest extends Request {
  adminUser?: { username: string };
}

export function adminMiddleware(req: AdminRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin token required' });
  }

  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, config.admin.secret) as { role: string; username: string };
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.adminUser = { username: payload.username ?? 'admin' };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}
