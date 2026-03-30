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

describe('PIX Webhook — idempotência', () => {
  it('processa cada txid apenas uma vez', async () => {
    (prisma.transaction.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: 't1',
        walletId: 'w1',
        type: 'DEPOSIT',
        amount: 20,
        status: 'PENDING',
        wallet: { real_balance: 100 },
      })
      .mockResolvedValueOnce(null);

    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.update as jest.Mock).mockResolvedValue({});

    const res = await request
      .post('/api/v1/wallet/pix/webhook')
      .send({ pix: [{ txid: 'abc123' }, { txid: 'abc123' }] });

    expect(res.status).toBe(200);
    expect(prisma.wallet.update).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.update).toHaveBeenCalledTimes(1);
    expect((prisma.transaction.update as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { id: 't1' },
      data: { status: 'COMPLETED', balance_after: 120 },
    });
  });
});
