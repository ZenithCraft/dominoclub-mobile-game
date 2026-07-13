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

// ── Google pending signup token ──────────────────────────────────────────────
// Short-lived token carrying a verified Google identity while the user is
// asked for a phone number (phone is required/unique for OTP + anti-fraud).
// Never used as an access token: verifyGooglePendingToken checks `purpose`.
export interface GooglePendingPayload {
  purpose: 'google_pending';
  googleId: string;
  email?: string;
  name?: string;
  avatar?: string;
}

export function signGooglePendingToken(payload: Omit<GooglePendingPayload, 'purpose'>): string {
  return jwt.sign(
    { ...payload, purpose: 'google_pending' } as GooglePendingPayload,
    config.jwt.accessSecret,
    { expiresIn: '10m' },
  );
}

export function verifyGooglePendingToken(token: string): GooglePendingPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret) as GooglePendingPayload;
  if (payload.purpose !== 'google_pending') throw new Error('Invalid token');
  return payload;
}
