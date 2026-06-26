jest.mock('../services/email.service', () => ({
  emailService: { send: jest.fn().mockResolvedValue(undefined) },
}));

import { prisma } from '../services/prisma.service';
import { emailService } from '../services/email.service';

// The prisma mock's beforeEach resets prisma fns but not other mocks.
// Clear emailService.send between each test to avoid call-count bleed.
beforeEach(() => {
  (emailService.send as jest.Mock).mockClear();
});

import {
  submitKycDocuments,
  getKycStatus,
  hasCompletedWithdrawal,
  approveKyc,
  rejectKyc,
} from '../services/kyc.service';

// ─── submitKycDocuments ───────────────────────────────────────────────────────

describe('submitKycDocuments', () => {
  it('updates the user with PENDING status and document URLs', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      id: 'u1',
      kyc_document_type: 'RG',
      kyc_document_status: 'PENDING',
    });

    const result = await submitKycDocuments(
      'u1',
      'RG',
      'https://cdn/front.jpg',
      'https://cdn/back.jpg',
      'https://cdn/selfie.jpg',
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        kyc_document_type: 'RG',
        kyc_document_status: 'PENDING',
        kyc_document_front_url: 'https://cdn/front.jpg',
        kyc_document_back_url: 'https://cdn/back.jpg',
        kyc_selfie_url: 'https://cdn/selfie.jpg',
        kyc_submitted_at: expect.any(Date),
        kyc_reviewed_at: null,
        kyc_review_notes: null,
      }),
    });
    expect(result).toMatchObject({ id: 'u1', kyc_document_status: 'PENDING' });
  });

  it('accepts null back URL (CNH and PASSPORT may have no back)', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ id: 'u1' });

    await submitKycDocuments('u1', 'CNH', 'https://cdn/front.jpg', null, 'https://cdn/selfie.jpg');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kyc_document_back_url: null }),
      }),
    );
  });

  it('accepts CNH and PASSPORT as valid document types', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({ id: 'u1' });

    await submitKycDocuments('u1', 'CNH', 'f', null, 's');
    await submitKycDocuments('u1', 'PASSPORT', 'f', null, 's');

    expect(prisma.user.update).toHaveBeenCalledTimes(2);
  });
});

// ─── getKycStatus ─────────────────────────────────────────────────────────────

describe('getKycStatus', () => {
  it('returns KYC fields for an existing user', async () => {
    const kycData = {
      kyc_document_type: 'RG',
      kyc_document_status: 'APPROVED',
      kyc_submitted_at: new Date(),
      kyc_reviewed_at: new Date(),
      kyc_review_notes: null,
    };
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(kycData);

    const result = await getKycStatus('u1');

    expect(result).toEqual(kycData);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: expect.objectContaining({ kyc_document_status: true }),
    });
  });

  it('returns null when user is not found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const result = await getKycStatus('u-missing');
    expect(result).toBeNull();
  });
});

// ─── hasCompletedWithdrawal ───────────────────────────────────────────────────

describe('hasCompletedWithdrawal', () => {
  it('returns false when wallet does not exist', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const result = await hasCompletedWithdrawal('u1');
    expect(result).toBe(false);
    expect(prisma.transaction.count).not.toHaveBeenCalled();
  });

  it('returns false when no completed withdrawals exist', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'w1' });
    (prisma.transaction.count as jest.Mock).mockResolvedValueOnce(0);

    const result = await hasCompletedWithdrawal('u1');
    expect(result).toBe(false);
  });

  it('returns true when at least one completed withdrawal exists', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'w1' });
    (prisma.transaction.count as jest.Mock).mockResolvedValueOnce(2);

    const result = await hasCompletedWithdrawal('u1');
    expect(result).toBe(true);
    expect(prisma.transaction.count).toHaveBeenCalledWith({
      where: { walletId: 'w1', type: 'WITHDRAWAL', status: 'COMPLETED' },
    });
  });
});

// ─── approveKyc ───────────────────────────────────────────────────────────────

describe('approveKyc', () => {
  it('updates kyc_document_status to APPROVED', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ email: null, name: 'Alice' });

    await approveKyc('u1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        kyc_document_status: 'APPROVED',
        kyc_reviewed_at: expect.any(Date),
        kyc_review_notes: null,
      }),
      select: { email: true, name: true },
    });
  });

  it('sends an approval email when the user has an email address', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      email: 'alice@example.com',
      name: 'Alice',
    });

    await approveKyc('u1');

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        subject: expect.stringContaining('verificada'),
      }),
    );
  });

  it('does NOT send email when user has no email address', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ email: null, name: 'Alice' });

    await approveKyc('u1');

    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('does not throw even if email sending fails', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      email: 'alice@example.com',
      name: 'Alice',
    });
    (emailService.send as jest.Mock).mockRejectedValueOnce(new Error('SMTP timeout'));

    await expect(approveKyc('u1')).resolves.toBeUndefined();
  });
});

// ─── rejectKyc ────────────────────────────────────────────────────────────────

describe('rejectKyc', () => {
  it('updates kyc_document_status to REJECTED with review notes', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ email: null, name: 'Bob' });

    await rejectKyc('u2', 'Documento com glare — foto ilegível');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: expect.objectContaining({
        kyc_document_status: 'REJECTED',
        kyc_reviewed_at: expect.any(Date),
        kyc_review_notes: 'Documento com glare — foto ilegível',
      }),
      select: { email: true, name: true },
    });
  });

  it('sends a rejection email including the review notes', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      email: 'bob@example.com',
      name: 'Bob',
    });

    await rejectKyc('u2', 'Foto do rosto não coincide com o documento');

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bob@example.com',
        text: expect.stringContaining('Foto do rosto não coincide com o documento'),
      }),
    );
  });

  it('does NOT send email when user has no email address', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ email: null, name: 'Bob' });

    await rejectKyc('u2', 'some reason');

    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('does not throw even if email sending fails', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      email: 'bob@example.com',
      name: 'Bob',
    });
    (emailService.send as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

    await expect(rejectKyc('u2', 'reason')).resolves.toBeUndefined();
  });
});
