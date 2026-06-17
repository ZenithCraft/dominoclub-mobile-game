jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../services/pix.service', () => {
  const actual = jest.requireActual('../services/pix.service');
  return {
    ...actual,
    verifyPixWebhookSignature: jest.fn(() => true),
  };
});

import supertest from 'supertest';
import app from '../app';
import { prisma } from '../services/prisma.service';

const request = supertest(app);

describe('PIX Webhook — Woovi/OpenPix', () => {
  it('processes OPENPIX:CHARGE_COMPLETED and confirms deposit', async () => {
    (prisma.transaction.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: 't1',
        walletId: 'w1',
        type: 'DEPOSIT',
        amount: 20,
        status: 'PENDING',
        wallet: { real_balance: 100 },
      });

    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.update as jest.Mock).mockResolvedValue({});

    const res = await request
      .post('/api/v1/wallet/pix/webhook')
      .send({
        event: 'OPENPIX:CHARGE_COMPLETED',
        charge: { correlationID: 'abc123', status: 'COMPLETED', value: 2000 },
      });

    expect(res.status).toBe(200);
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pix_id: 'abc123', status: 'PENDING', type: 'DEPOSIT' },
      }),
    );
  });

  it('returns 200 for test ping (no event/charge)', async () => {
    const res = await request
      .post('/api/v1/wallet/pix/webhook')
      .send({});

    expect(res.status).toBe(200);
  });

  it('ignores non-completion events', async () => {
    const res = await request
      .post('/api/v1/wallet/pix/webhook')
      .send({ event: 'OPENPIX:CHARGE_CREATED', charge: { correlationID: 'xyz' } });

    expect(res.status).toBe(200);
    expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
  });

  it('processes each correlationID only once (idempotent)', async () => {
    (prisma.transaction.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: 't1',
        walletId: 'w1',
        type: 'DEPOSIT',
        amount: 20,
        status: 'PENDING',
        wallet: { real_balance: 100 },
      });

    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.update as jest.Mock).mockResolvedValue({});

    await request
      .post('/api/v1/wallet/pix/webhook')
      .send({
        event: 'OPENPIX:CHARGE_COMPLETED',
        charge: { correlationID: 'abc123', status: 'COMPLETED', value: 2000 },
      });

    (prisma.transaction.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const res2 = await request
      .post('/api/v1/wallet/pix/webhook')
      .send({
        event: 'OPENPIX:CHARGE_COMPLETED',
        charge: { correlationID: 'abc123', status: 'COMPLETED', value: 2000 },
      });

    expect(res2.status).toBe(200);
  });
});
