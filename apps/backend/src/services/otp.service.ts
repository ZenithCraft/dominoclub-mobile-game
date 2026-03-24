import { config } from '../config';
import { logger } from '../utils/logger';

// In-memory OTP store for development; in production use Redis
const otpStore = new Map<string, { code: string; expiresAt: Date }>();

export function generateOtp(): string {
  return Math.floor(Math.pow(10, config.otp.length - 1) + Math.random() * 9 * Math.pow(10, config.otp.length - 1))
    .toString()
    .slice(0, config.otp.length);
}

export async function sendOtp(phone: string): Promise<string> {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + config.otp.expirySeconds * 1000);

  otpStore.set(phone, { code, expiresAt });

  // SMS provider integration
  if (process.env.SMS_PROVIDER === 'mock' || config.env !== 'production') {
    logger.info(`[OTP MOCK] Phone: ${phone} — Code: ${code}`);
  } else {
    // TODO: Integrate real SMS provider (Zenvia, Twilio, etc.)
    logger.info(`OTP sent to ${phone}`);
  }

  return code;
}

export function verifyOtp(phone: string, code: string): boolean {
  const entry = otpStore.get(phone);
  if (!entry) return false;
  if (new Date() > entry.expiresAt) {
    otpStore.delete(phone);
    return false;
  }
  if (entry.code !== code) return false;
  otpStore.delete(phone);
  return true;
}
