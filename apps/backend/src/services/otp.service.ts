import axios from 'axios';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getRedisClient, isRedisAvailable } from './redis.service';

// ─── OTP Store ────────────────────────────────────────────────────────────────
// Redis when available (required for multi-instance deployments — an OTP sent
// by instance A must be verifiable on instance B behind a load balancer).
// Falls back to an in-memory Map when REDIS_URL isn't set (single-server only,
// and OTPs don't survive a restart in that mode).
// OTP codes are stored as SHA-256 hashes — plaintext is never kept.

const OTP_PREFIX = 'otp:';

interface OtpEntry {
  codeHash: string;   // SHA-256 hex of the plaintext OTP
  expiresAt: number;  // epoch ms
  sentAt: number;     // epoch ms — enforces resend cooldown
  attempts: number;   // counts failed verifications
}

const inMemoryStore = new Map<string, OtpEntry>();

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

async function getEntry(phone: string): Promise<OtpEntry | null> {
  if (isRedisAvailable()) {
    try {
      const raw = await getRedisClient().get(`${OTP_PREFIX}${phone}`);
      return raw ? (JSON.parse(raw) as OtpEntry) : null;
    } catch (err: any) {
      logger.warn('[OTP] Redis get failed — falling back to in-memory', { message: err.message });
    }
  }
  return inMemoryStore.get(phone) ?? null;
}

async function setEntry(phone: string, entry: OtpEntry): Promise<void> {
  const ttlMs = Math.max(1000, entry.expiresAt - Date.now());
  if (isRedisAvailable()) {
    try {
      await getRedisClient().set(`${OTP_PREFIX}${phone}`, JSON.stringify(entry), 'PX', ttlMs);
      return;
    } catch (err: any) {
      logger.warn('[OTP] Redis set failed — falling back to in-memory', { message: err.message });
    }
  }
  inMemoryStore.set(phone, entry);
}

async function deleteEntry(phone: string): Promise<void> {
  if (isRedisAvailable()) {
    try {
      await getRedisClient().del(`${OTP_PREFIX}${phone}`);
    } catch (err: any) {
      logger.warn('[OTP] Redis del failed', { message: err.message });
    }
  }
  inMemoryStore.delete(phone);
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
  const existing = await getEntry(phone);
  if (existing) {
    const secondsSinceSent = (Date.now() - existing.sentAt) / 1000;
    if (secondsSinceSent < config.otp.resendCooldownSeconds) {
      const remaining = Math.ceil(config.otp.resendCooldownSeconds - secondsSinceSent);
      throw new Error(`Aguarde ${remaining}s antes de solicitar um novo código`);
    }
  }

  const code = generateOtp();
  const now = Date.now();
  const expiresAt = now + config.otp.expirySeconds * 1000;

  await setEntry(phone, { codeHash: hashOtp(code), expiresAt, sentAt: now, attempts: 0 });

  await dispatchSms(phone, code);
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const entry = await getEntry(phone);

  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    await deleteEntry(phone);
    return false;
  }

  if (entry.attempts >= config.otp.maxAttempts) {
    await deleteEntry(phone);
    throw new Error('Código bloqueado por excesso de tentativas. Solicite um novo código.');
  }

  const inputHash = Buffer.from(hashOtp(code), 'hex');
  const storedHash = Buffer.from(entry.codeHash, 'hex');
  const match = inputHash.length === storedHash.length && timingSafeEqual(inputHash, storedHash);

  if (!match) {
    entry.attempts++;
    const remaining = config.otp.maxAttempts - entry.attempts;
    if (remaining === 0) {
      await deleteEntry(phone);
      throw new Error('Código inválido. Limite de tentativas atingido. Solicite um novo código.');
    }
    await setEntry(phone, entry);
    throw new Error(`Código inválido. ${remaining} tentativa${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`);
  }

  await deleteEntry(phone);
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
