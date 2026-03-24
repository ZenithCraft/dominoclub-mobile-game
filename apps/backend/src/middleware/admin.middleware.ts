import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin token required' });
  }

  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, config.admin.secret) as { role: string };
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}
