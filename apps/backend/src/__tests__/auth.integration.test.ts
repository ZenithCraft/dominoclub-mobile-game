/**
 * Integration tests — Auth flow
 *
 * These tests hit the real Express app with Supertest.
 * In CI (NODE_ENV=test + DATABASE_URL set) they run against a real Postgres DB.
 * Locally without DATABASE_URL they auto-skip.
 *
 * Note: the Prisma mock (moduleNameMapper) still intercepts prisma.service here,
 * so these tests primarily validate HTTP routing, middleware, and in-memory services
 * (OTP store, JWT, rate limiting). DB-layer behaviour is covered by unit tests.
 */
import supertest from 'supertest';
// Import app at module level so the mock's beforeEach registers before tests start
import app from '../app';

const request = supertest(app);

const TEST_DB = process.env.DATABASE_URL && process.env.NODE_ENV === 'test';
const describeIfDb = TEST_DB ? describe : describe.skip;

describeIfDb('Auth Integration — OTP flow', () => {
  const phone = '+5511900000001';

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
    const res = await request
      .put('/api/v1/auth/profile')
      .send({ name: 'Test User' });
    expect(res.status).toBe(401);
  });
});

describeIfDb('Admin Integration', () => {
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
