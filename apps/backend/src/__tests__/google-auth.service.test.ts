import { prisma } from '../services/prisma.service';

jest.mock('../services/otp.service', () => ({
  sendOtp: jest.fn().mockResolvedValue(undefined),
  verifyOtp: jest.fn(),
}));

const verifyIdTokenMock = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
}));

import { loginWithGoogle, completeGoogleSignup } from '../services/auth.service';
import { verifyOtp } from '../services/otp.service';

function mockPayload(overrides: Record<string, any> = {}) {
  return {
    sub: 'google-sub-123',
    email: 'player@example.com',
    email_verified: true,
    name: 'Player One',
    picture: 'https://example.com/pic.jpg',
    ...overrides,
  };
}

describe('loginWithGoogle', () => {
  it('logs in directly when a user is already linked to this google_id', async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => mockPayload() });
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user-1', phone: '+5511900000001', is_banned: false,
    });
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user-1', phone: '+5511900000001', wallet: {},
    });

    const result: any = await loginWithGoogle('fake-id-token');

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.id).toBe('user-1');
  });

  it('links google_id to an existing user matched by verified email', async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => mockPayload() });
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null) // by google_id — not found
      .mockResolvedValueOnce({ id: 'user-2', phone: '+5511900000002', email: 'player@example.com' }); // by email
    (prisma.user.update as jest.Mock)
      .mockResolvedValueOnce({ id: 'user-2', is_banned: false }) // link google_id
      .mockResolvedValueOnce({}); // device/ip update
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'user-2', phone: '+5511900000002', wallet: {} });

    const result: any = await loginWithGoogle('fake-id-token');

    expect(result.accessToken).toBeDefined();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-2' }, data: expect.objectContaining({ google_id: 'google-sub-123' }) }),
    );
  });

  it('returns requiresPhone + pendingToken for a brand-new Google identity', async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => mockPayload({ email_verified: false }) });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const result: any = await loginWithGoogle('fake-id-token');

    expect(result.requiresPhone).toBe(true);
    expect(typeof result.pendingToken).toBe('string');
    expect(result.profile.name).toBe('Player One');
  });

  it('throws when the Google token has no subject claim', async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => null });
    await expect(loginWithGoogle('bad-token')).rejects.toThrow('Token do Google inválido');
  });
});

describe('completeGoogleSignup', () => {
  it('rejects an invalid/expired OTP', async () => {
    const { pendingToken } = await (async () => {
      verifyIdTokenMock.mockResolvedValue({ getPayload: () => mockPayload({ email_verified: false }) });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      return loginWithGoogle('fake-id-token') as any;
    })();

    (verifyOtp as jest.Mock).mockReturnValue(false);

    await expect(completeGoogleSignup(pendingToken, '+5511900000003', '000000')).rejects.toThrow('Código inválido ou expirado');
  });

  it('creates a new user and links google_id after OTP passes', async () => {
    const { pendingToken } = await (async () => {
      verifyIdTokenMock.mockResolvedValue({ getPayload: () => mockPayload({ email_verified: false }) });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      return loginWithGoogle('fake-id-token') as any;
    })();

    (verifyOtp as jest.Mock).mockReturnValue(true);
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null) // conflict check by google_id
      .mockResolvedValueOnce(null); // find by phone — not found yet
    (prisma.user.create as jest.Mock).mockResolvedValueOnce({
      id: 'user-new', phone: '+5511900000003', name: null, avatar: null, email: null, is_banned: false,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null); // email-taken check (pending.email undefined here, skipped anyway)
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ id: 'user-new', is_banned: false });
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'user-new', phone: '+5511900000003', wallet: {} });

    const result: any = await completeGoogleSignup(pendingToken, '+5511900000003', '123456');

    expect(result.accessToken).toBeDefined();
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+5511900000003' }) }),
    );
  });

  it('rejects a pending token that was not issued for a google_pending purpose', async () => {
    (verifyOtp as jest.Mock).mockReturnValue(true);
    await expect(completeGoogleSignup('not-a-valid-token', '+5511900000004', '123456')).rejects.toThrow();
  });
});
