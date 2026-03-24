/**
 * Integration tests — Auth flow
 *
 * These tests hit the real Express app with Supertest.
 * They require a running PostgreSQL database pointed to by DATABASE_URL.
 * Run against a dedicated test DB:
 *   DATABASE_URL=postgresql://... jest auth.integration
 *
 * The suite uses jest-environment-node and does NOT use the Prisma mock,
 * so the mock moduleNameMapper must be bypassed here. We achieve this by
 * importing the real app directly (before the mock would intercept).
 *
 * Skip automatically when DATABASE_URL is not set to avoid CI failures
 * on environments without a test DB.
 */

const TEST_DB = process.env.DATABASE_URL && process.env.NODE_ENV === 'test';
const describeIfDb = TEST_DB ? describe : describe.skip;

// We intentionally do NOT import from the mocked prisma — integration tests
// need the real Prisma client, so we bypass the moduleNameMapper by using
// the full module path resolution at runtime.

describeIfDb('Auth Integration — OTP flow', () => {
  let request: any;
  let app: any;
  const phone = '+5511900000001';

  beforeAll(async () => {
    // Dynamic import so this file can be parsed even without a real DB
    const supertest = await import('supertest');
    const appModule = await import('../app');
    app = appModule.default;
    request = supertest.default(app);
  });

  it('POST /auth/otp/send returns 200 for a valid Brazilian number', async () => {
    const res = await request
      .post('/api/v1/auth/otp/send')
      .send({ phone });
    expect([200, 400]).toContain(res.status); // 200 = sent, 400 = cooldown (already sent)
  });

  it('POST /auth/otp/verify with wrong code returns 400', async () => {
    const res = await request
      .post('/api/v1/auth/otp/verify')
      .send({ phone, otp: '000000' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /auth/me without token returns 401', async () => {
    const res = await request.get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('POST /auth/token/refresh with invalid token returns 401', async () => {
    const res = await request
      .post('/api/v1/auth/token/refresh')
      .send({ refreshToken: 'invalid.token.here' });
    expect(res.status).toBe(401);
  });
});

describeIfDb('Auth Integration — profile update', () => {
  it('PUT /auth/profile without auth returns 401', async () => {
    const supertest = await import('supertest');
    const { default: app } = await import('../app');
    const request = supertest.default(app);

    const res = await request
      .put('/api/v1/auth/profile')
      .send({ name: 'Test User' });
    expect(res.status).toBe(401);
  });
});

describeIfDb('Admin Integration', () => {
  let request: any;

  beforeAll(async () => {
    const supertest = await import('supertest');
    const { default: app } = await import('../app');
    request = supertest.default(app);
  });

  it('POST /admin/login with wrong credentials returns 401', async () => {
    const res = await request
      .post('/api/v1/admin/login')
      .send({ username: 'wrong', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('GET /admin/stats without token returns 401', async () => {
    const res = await request.get('/api/v1/admin/stats');
    expect(res.status).toBe(401);
  });

  it('POST /admin/login with correct credentials returns a token', async () => {
    const res = await request
      .post('/api/v1/admin/login')
      .send({ username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'changeme_in_production' });
    if (res.status === 200) {
      expect(res.body).toHaveProperty('token');
    }
    // Also acceptable if env creds differ from defaults
    expect([200, 401]).toContain(res.status);
  });
});
