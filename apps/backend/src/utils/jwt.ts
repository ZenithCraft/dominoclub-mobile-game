import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

export interface TokenPayload {
  userId: string;
  phone: string;
  jti?: string; // JWT ID — used for blacklisting on logout
  exp?: number; // expiry (Unix seconds) — set by jsonwebtoken
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(
    { ...payload, jti: uuidv4() },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires as jwt.SignOptions['expiresIn'] },
  );
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpires as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
}
