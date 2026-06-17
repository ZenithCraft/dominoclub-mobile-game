import axios from 'axios';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─── OTP Store ────────────────────────────────────────────────────────────────
// In-memory for development. In production replace with Redis
// (SET phone:otp:+5511... JSON EX 300) so it survives restarts.
// OTP codes are stored as SHA-256 hashes — plaintext is never kept in memory.

interface OtpEntry {
  codeHash: string;   // SHA-256 hex of the plaintext OTP
  expiresAt: Date;
  sentAt: Date;       // enforces resend cooldown
  attempts: number;   // counts failed verifications
}

const otpStore = new Map<string, OtpEntry>();

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// ─── Generation ───────────────────────────────────────────────────────────────

export function generateOtp(): string {
  const min = Math.pow(10, config.otp.length - 1);
  const max = Math.pow(10, config.otp.length) - 1;
  return randomInt(min, max + 1).toString();
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export async function sendOtp(phone: string): Promise<void> {
  // Resend cooldown — prevent SMS flooding
  const existing = otpStore.get(phone);
  if (existing) {
    const secondsSinceSent = (Date.now() - existing.sentAt.getTime()) / 1000;
    if (secondsSinceSent < config.otp.resendCooldownSeconds) {
      const remaining = Math.ceil(config.otp.resendCooldownSeconds - secondsSinceSent);
      throw new Error(`Aguarde ${remaining}s antes de solicitar um novo código`);
    }
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + config.otp.expirySeconds * 1000);

  otpStore.set(phone, { codeHash: hashOtp(code), expiresAt, sentAt: new Date(), attempts: 0 });

  await dispatchSms(phone, code);
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export function verifyOtp(phone: string, code: string): boolean {
  const entry = otpStore.get(phone);

  if (!entry) return false;

  if (new Date() > entry.expiresAt) {
    otpStore.delete(phone);
    return false;
  }

  if (entry.attempts >= config.otp.maxAttempts) {
    otpStore.delete(phone);
    throw new Error('Código bloqueado por excesso de tentativas. Solicite um novo código.');
  }

  const inputHash = Buffer.from(hashOtp(code), 'hex');
  const storedHash = Buffer.from(entry.codeHash, 'hex');
  const match = inputHash.length === storedHash.length && timingSafeEqual(inputHash, storedHash);

  if (!match) {
    entry.attempts++;
    const remaining = config.otp.maxAttempts - entry.attempts;
    if (remaining === 0) {
      otpStore.delete(phone);
      throw new Error('Código inválido. Limite de tentativas atingido. Solicite um novo código.');
    }
    throw new Error(`Código inválido. ${remaining} tentativa${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`);
  }

  otpStore.delete(phone);
  return true;
}

// ─── SMS Dispatch ─────────────────────────────────────────────────────────────

async function dispatchSms(phone: string, code: string): Promise<void> {
  const message = `Seu código DominoClub: *${code}*. Válido por ${Math.floor(config.otp.expirySeconds / 60)} minutos. Não compartilhe.`;

  switch (config.sms.provider) {
    case 'zenvia':
      await sendViaZenvia(phone, message);
      break;
    case 'twilio':
      await sendViaTwilio(phone, message);
      break;
    default:
      // Mock — log to console for development
      logger.info(`[OTP MOCK] ${phone} → ${code}`);
  }
}

// ─── Zenvia (Brazil-native, recommended) ─────────────────────────────────────
// Docs: https://zenvia.com/en/blog/sms-api/

async function sendViaZenvia(to: string, message: string): Promise<void> {
  if (!config.sms.apiKey) throw new Error('SMS_API_KEY not configured for Zenvia');

  await axios.post(
    'https://api.zenvia.com/v2/channels/sms/messages',
    {
      from: config.sms.sender,
      to,
      contents: [{ type: 'text', text: message }],
    },
    {
      headers: {
        'X-API-Token': config.sms.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );

  logger.info('[SMS Zenvia] Message sent', { to });
}

// ─── Twilio (international fallback) ─────────────────────────────────────────
// Docs: https://www.twilio.com/docs/sms/api

async function sendViaTwilio(to: string, message: string): Promise<void> {
  const { twilioAccountSid, twilioAuthToken, twilioFromNumber } = config.sms;

  if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
    throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER must be configured');
  }

  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
    new URLSearchParams({
      From: twilioFromNumber,
      To: to,
      Body: message,
    }),
    {
      auth: { username: twilioAccountSid, password: twilioAuthToken },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  );

  logger.info('[SMS Twilio] Message sent', { to });
}
