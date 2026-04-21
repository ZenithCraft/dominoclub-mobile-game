import { Request, Response } from 'express';
import { submitKycDocuments, getKycStatus, hasCompletedWithdrawal } from '../services/kyc.service';
import { registerPushToken } from '../services/push.service';

// POST /api/v1/kyc/documents — upload front + optional back + selfie
export async function uploadKycDocumentsHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { document_type } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!document_type || !['RG', 'CNH', 'PASSPORT'].includes(document_type)) {
      return res.status(400).json({ error: 'Tipo de documento inválido' });
    }

    const frontFile = files?.front?.[0];
    const backFile  = files?.back?.[0];
    const selfieFile = files?.selfie?.[0];

    if (!frontFile) return res.status(400).json({ error: 'Frente do documento obrigatória' });
    if (!selfieFile) return res.status(400).json({ error: 'Selfie obrigatória' });

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const frontUrl  = `${baseUrl}/uploads/kyc/${frontFile.filename}`;
    const backUrl   = backFile ? `${baseUrl}/uploads/kyc/${backFile.filename}` : null;
    const selfieUrl = `${baseUrl}/uploads/kyc/${selfieFile.filename}`;

    await submitKycDocuments(userId, document_type, frontUrl, backUrl, selfieUrl);

    res.json({ message: 'Documentos enviados com sucesso. Aguarde a análise em até 48 horas.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/v1/kyc/status
export async function getKycStatusHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const status = await getKycStatus(userId);
    const firstWithdrawalDone = await hasCompletedWithdrawal(userId);
    res.json({ ...status, first_withdrawal_done: firstWithdrawalDone });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/v1/auth/push-token
export async function registerPushTokenHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token obrigatório' });
    await registerPushToken(userId, token);
    res.json({ message: 'Token registrado' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
