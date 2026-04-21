import path from 'path';
import fs from 'fs';
import { prisma } from './prisma.service';
import { emailService } from './email.service';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'kyc');

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export async function submitKycDocuments(
  userId: string,
  documentType: 'RG' | 'CNH' | 'PASSPORT',
  frontUrl: string,
  backUrl: string | null,
  selfieUrl: string,
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      kyc_document_type: documentType,
      kyc_document_status: 'PENDING',
      kyc_document_front_url: frontUrl,
      kyc_document_back_url: backUrl || null,
      kyc_selfie_url: selfieUrl,
      kyc_submitted_at: new Date(),
      kyc_reviewed_at: null,
      kyc_review_notes: null,
    },
  });
  return user;
}

export async function getKycStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      kyc_document_type: true,
      kyc_document_status: true,
      kyc_submitted_at: true,
      kyc_reviewed_at: true,
      kyc_review_notes: true,
    },
  });
  return user;
}

export async function hasCompletedWithdrawal(userId: string): Promise<boolean> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) return false;
  const count = await prisma.transaction.count({
    where: { walletId: wallet.id, type: 'WITHDRAWAL', status: 'COMPLETED' },
  });
  return count > 0;
}

export async function approveKyc(userId: string): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      kyc_document_status: 'APPROVED',
      kyc_reviewed_at: new Date(),
      kyc_review_notes: null,
    },
    select: { email: true, name: true },
  });

  if (user.email) {
    await emailService.send({
      to: user.email,
      subject: 'Identidade verificada — DominoClub',
      text: `Olá ${user.name ?? ''},\n\nSua identidade foi verificada com sucesso. Agora você pode realizar saques normalmente.\n\nObrigado,\nEquipe DominoClub`,
    }).catch(() => {});
  }
}

export async function rejectKyc(userId: string, notes: string): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      kyc_document_status: 'REJECTED',
      kyc_reviewed_at: new Date(),
      kyc_review_notes: notes,
    },
    select: { email: true, name: true },
  });

  if (user.email) {
    await emailService.send({
      to: user.email,
      subject: 'Revisão de documentos necessária — DominoClub',
      text: `Olá ${user.name ?? ''},\n\nSua verificação de identidade foi recusada pelo seguinte motivo:\n\n${notes}\n\nPor favor, envie novamente seus documentos pelo aplicativo.\n\nObrigado,\nEquipe DominoClub`,
    }).catch(() => {});
  }
}
