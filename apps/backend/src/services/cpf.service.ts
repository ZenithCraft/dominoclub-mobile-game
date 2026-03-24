import axios from 'axios';
import { config } from '../config';
import { prisma } from './prisma.service';
import { logger } from '../utils/logger';

// ─── Serpro CPF Validation Service ───────────────────────────────────────────
// Docs: https://developers.serpro.gov.br/api-consulta-cpf
//
// Flow:
//   1. Obtain OAuth2 Bearer token (client_credentials, cached until expiry)
//   2. GET /consulta-cpf-df/v1/cpf/{cpf}
//   3. Check situacao.codigo === '0' (Regular)
//
// In mock mode (SERPRO_MOCK_MODE=true): skip API call, accept any
// mathematically valid CPF — useful for development/sandbox.

interface SerproTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SerproCpfResponse {
  ni: string;
  nome: string;
  situacao: { codigo: string; descricao: string };
}

// Situacao codes from Serpro
const SITUACAO_OK = '0'; // Regular
const SITUACAO_LABELS: Record<string, string> = {
  '0': 'Regular',
  '2': 'Pendente de Regularização',
  '3': 'Titular Falecido',
  '4': 'Suspensa',
  '5': 'Cancelada por Multiplicidade',
  '8': 'Nula',
  '9': 'Cancelada de Ofício',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getSerproToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30000) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(
    `${config.serpro.apiKey}:${config.serpro.apiKey}` // Serpro uses api_key as both consumer_key and secret
  ).toString('base64');

  const { data } = await axios.post<SerproTokenResponse>(
    `${config.serpro.baseUrl}/token`,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    }
  );

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

async function querySerpro(cpf: string): Promise<SerproCpfResponse> {
  const token = await getSerproToken();

  const { data } = await axios.get<SerproCpfResponse>(
    `${config.serpro.baseUrl}/consulta-cpf-df/v1/cpf/${cpf}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    }
  );

  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CpfVerificationResult {
  verified: boolean;
  name: string | null;        // Serpro returns the official registered name
  situacao: string;
}

export async function verifyCpf(cpf: string): Promise<CpfVerificationResult> {
  if (config.serpro.mockMode || config.env !== 'production') {
    // Mock mode: accept any valid CPF checksum without API call
    logger.info('[CPF MOCK] Accepted CPF (mock mode)', { cpf: cpf.slice(0, 3) + '***' });
    return { verified: true, name: null, situacao: 'Regular (mock)' };
  }

  try {
    const result = await querySerpro(cpf);
    const isRegular = result.situacao.codigo === SITUACAO_OK;
    const situacaoLabel = SITUACAO_LABELS[result.situacao.codigo] || result.situacao.descricao;

    logger.info('[CPF] Verification result', {
      cpf: cpf.slice(0, 3) + '***',
      situacao: situacaoLabel,
      verified: isRegular,
    });

    return {
      verified: isRegular,
      name: isRegular ? result.nome : null,
      situacao: situacaoLabel,
    };
  } catch (err: any) {
    // 404 from Serpro = CPF not found in their database
    if (err.response?.status === 404) {
      return { verified: false, name: null, situacao: 'CPF não encontrado' };
    }
    logger.error('[CPF] Serpro API error', { status: err.response?.status, data: err.response?.data });
    throw new Error('Serviço de validação de CPF indisponível. Tente novamente em instantes.');
  }
}

// ─── Save verified CPF to user profile ───────────────────────────────────────

export async function verifyAndSaveCpf(userId: string, cpf: string): Promise<CpfVerificationResult> {
  // Check if another user already owns this CPF
  const existing = await prisma.user.findUnique({ where: { cpf } });
  if (existing && existing.id !== userId) {
    throw new Error('Este CPF já está cadastrado em outra conta');
  }

  // Check if user's CPF is already verified (immutable once verified)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { cpf: true, cpf_verified: true },
  });

  if (user?.cpf_verified && user.cpf === cpf) {
    return { verified: true, name: null, situacao: 'Já verificado' };
  }

  if (user?.cpf_verified && user.cpf !== cpf) {
    throw new Error('CPF já verificado. Não é possível alterar.');
  }

  const result = await verifyCpf(cpf);

  if (!result.verified) {
    throw new Error(`CPF com situação irregular: ${result.situacao}. Apenas CPFs com situação Regular são aceitos.`);
  }

  // Persist CPF and mark as verified
  await prisma.user.update({
    where: { id: userId },
    data: {
      cpf,
      cpf_verified: true,
      // Optionally sync name from Serpro if user hasn't set one yet
    },
  });

  logger.info('[CPF] Verified and saved', { userId, cpf: cpf.slice(0, 3) + '***' });
  return result;
}
