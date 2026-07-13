// Mock axios so no real HTTP calls are made
jest.mock('axios');
// Mock logger to suppress console noise in tests
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { generateOtp, sendOtp, verifyOtp } from '../services/otp.service';
import { config } from '../config';

// The OTP store is module-level — reset it between tests by re-requiring
// the module fresh is complex, so instead we call sendOtp to overwrite.

describe('generateOtp', () => {
  it('generates a numeric string of the configured length', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d+$/);
    expect(otp.length).toBe(config.otp.length);
  });

  it('generates different values across calls (probabilistic)', () => {
    const otps = new Set(Array.from({ length: 20 }, () => generateOtp()));
    // With 6-digit OTPs there are 900 000 possibilities; getting all same is astronomically unlikely
    expect(otps.size).toBeGreaterThan(1);
  });
});

describe('sendOtp + verifyOtp', () => {
  const phone = '+5511999990001';

  // Silence axios (mock mode is used since SMS_PROVIDER defaults to 'mock')
  beforeEach(() => {
    // Ensure mock SMS mode so no axios call is needed
    (config as any).sms = { ...config.sms, provider: 'mock' };
  });

  it('sendOtp stores an entry and verifyOtp rejects a wrong code', async () => {
    await sendOtp(phone);
    // OTP was stored — an incorrect code should throw
    await expect(verifyOtp(phone, '000000')).rejects.toThrow();
  });

  it('verifyOtp returns false when no OTP has been sent', async () => {
    const result = await verifyOtp('+5500000000000', '123456');
    expect(result).toBe(false);
  });

  it('verifyOtp throws after maxAttempts wrong codes', async () => {
    const testPhone = '+5511999990002';
    await sendOtp(testPhone);

    const max = config.otp.maxAttempts;
    for (let i = 0; i < max - 1; i++) {
      try { await verifyOtp(testPhone, 'wrong'); } catch {}
    }
    // Last attempt — should throw "limit reached"
    await expect(verifyOtp(testPhone, 'wrong')).rejects.toThrow();
  });

  it('sendOtp enforces resend cooldown', async () => {
    const testPhone = '+5511999990003';
    await sendOtp(testPhone);
    // Immediately requesting again should throw
    await expect(sendOtp(testPhone)).rejects.toThrow(/Aguarde/);
  });

  it('verifyOtp returns false for expired OTP', async () => {
    const testPhone = '+5511999990004';
    // Temporarily set expiry to 0 seconds
    const originalExpiry = config.otp.expirySeconds;
    (config as any).otp = { ...config.otp, expirySeconds: 0, resendCooldownSeconds: 0 };

    await sendOtp(testPhone);

    // Advance time
    jest.useFakeTimers();
    jest.advanceTimersByTime(1000);

    (config as any).otp = { ...config.otp, expirySeconds: originalExpiry, resendCooldownSeconds: 60 };
    const result = await verifyOtp(testPhone, '000000');
    expect(result).toBe(false);

    jest.useRealTimers();
  });
});
