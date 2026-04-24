/**
 * DominoClub — Device Integrity Service
 *
 * Verifies that requests originate from a legitimate, unmodified instance
 * of the app running on a genuine device.
 *
 * Android — Google Play Integrity API
 *   Flow: server issues nonce via GET /api/v1/game/integrity-nonce
 *         → app calls PlayIntegrity.requestIntegrityToken({ cloudProjectNumber, nonce })
 *         → sends { token, platform: 'android', nonce } in queue:join
 *         → backend decodes via Google API, checks verdicts, verifies nonce binding
 *
 * iOS — Apple App Attest (primary, iOS 14+)
 *   Flow: server issues challenge (nonce)
 *         → app calls DCAppAttestService.shared.attestKey(keyId, SHA-256(nonce))
 *         → sends { attestationObject, keyId, nonce, platform: 'ios', attestationType: 'app_attest' }
 *         → backend validates with Apple App Attest API
 *   Fallback: Apple DeviceCheck (iOS < 14) — sends { token, platform: 'ios', attestationType: 'device_check' }
 *
 * Development: INTEGRITY_MOCK_MODE=true accepts any token matching INTEGRITY_MOCK_TOKEN.
 * Nonce binding is also skipped in mock mode.
 */

import axios from 'axios';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { prisma } from './prisma.service';

export interface IntegrityResult {
  valid: boolean;
  platform: 'android' | 'ios' | 'mock';
  attestationType?: string;
  verdict?: string;
  reason?: string;
}

// ─── Google OAuth2 token cache ────────────────────────────────────────────────
// The token is valid for 3600s. We cache it and refresh 60s before expiry.
let _googleToken: { token: string; expiresAt: number } | null = null;

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Verify an integrity token produced by the mobile app.
 *
 * @param token          Raw token string from the device (or base64 attestation object)
 * @param platform       'android' | 'ios'
 * @param nonce          Server-issued nonce that was bound to this token request
 * @param attestationType For iOS: 'app_attest' | 'device_check' (default: 'device_check')
 * @param keyId          iOS App Attest key ID (only for attestationType='app_attest')
 */
export async function verifyIntegrityToken(
  token: string,
  platform: 'android' | 'ios',
  nonce?: string,
  attestationType?: string,
  keyId?: string,
): Promise<IntegrityResult> {
  if (!token) {
    return { valid: false, platform, reason: 'Token ausente' };
  }

  // ── Development / test bypass ──────────────────────────────────────────────
  if (config.integrity.mockMode) {
    const valid = token === config.integrity.mockToken;
    return {
      valid,
      platform: 'mock',
      verdict: valid ? 'mock_pass' : 'mock_fail',
      reason: valid ? undefined : 'Mock token inválido',
    };
  }

  try {
    if (platform === 'android') return verifyPlayIntegrity(token, nonce);
    if (platform === 'ios') {
      if (attestationType === 'app_attest') return verifyAppAttest(token, keyId ?? '', nonce ?? '');
      return verifyDeviceCheck(token);
    }
    return { valid: false, platform, reason: 'Plataforma desconhecida' };
  } catch (err: any) {
    logger.error('[Integrity] Verification error', { platform, message: err.message });
    return { valid: false, platform, reason: 'Falha na verificação de integridade' };
  }
}

// ─── Android — Google Play Integrity ─────────────────────────────────────────

const ACCEPTED_DEVICE_VERDICTS = new Set([
  'MEETS_STRONG_INTEGRITY',
  'MEETS_DEVICE_INTEGRITY',
]);

async function verifyPlayIntegrity(token: string, nonce?: string): Promise<IntegrityResult> {
  const platform = 'android' as const;

  if (!config.integrity.googleServiceAccountJson) {
    logger.warn('[Integrity] GOOGLE_SERVICE_ACCOUNT_JSON not set — skipping Android check');
    return { valid: true, platform, verdict: 'skipped_no_key' };
  }

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(config.integrity.googleServiceAccountJson);
  } catch {
    logger.error('[Integrity] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    return { valid: false, platform, reason: 'Configuração interna inválida' };
  }

  const accessToken = await getGoogleAccessToken(serviceAccount);

  const url =
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(config.integrity.androidPackageName)}:decodeIntegrityToken`;

  const res = await axios.post(
    url,
    { integrity_token: token },
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 5000 }
  );

  const payload = res.data?.tokenPayloadExternal;
  const appVerdict     = payload?.appIntegrity?.appRecognitionVerdict as string | undefined;
  const deviceVerdicts: string[] = payload?.deviceIntegrity?.deviceRecognitionVerdict ?? [];

  // Verify nonce binding — the nonce embedded in the token must match what we issued
  if (nonce) {
    const tokenNonce = payload?.requestDetails?.nonce as string | undefined;
    if (!tokenNonce || tokenNonce !== nonce) {
      logger.warn('[Integrity] Nonce mismatch on Android token', { expected: nonce, got: tokenNonce });
      return { valid: false, platform, verdict: 'nonce_mismatch', reason: 'Nonce inválido no token' };
    }
  }

  const appOk    = appVerdict === 'PLAY_RECOGNIZED';
  const deviceOk = deviceVerdicts.some((v) => ACCEPTED_DEVICE_VERDICTS.has(v));
  const verdictStr = `app:${appVerdict ?? 'none'} device:${deviceVerdicts.join(',') || 'none'}`;

  if (!appOk || !deviceOk) {
    logger.warn('[Integrity] Android verdict failed', { verdictStr });
    return { valid: false, platform, verdict: verdictStr, reason: 'Dispositivo ou app não reconhecido' };
  }

  return { valid: true, platform, verdict: verdictStr };
}

/** Obtain a short-lived Google OAuth2 access token. Cached until 60s before expiry. */
async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (_googleToken && now < _googleToken.expiresAt - 60) {
    return _googleToken.token;
  }

  const assertion = jwt.sign(
    {
      iss:   serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/playintegrity',
      aud:   'https://oauth2.googleapis.com/token',
      iat:   now,
      exp:   now + 3600,
    },
    serviceAccount.private_key,
    { algorithm: 'RS256' }
  );

  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 }
  );

  const token = res.data.access_token as string;
  _googleToken = { token, expiresAt: now + 3600 };
  return token;
}

// ─── iOS — Apple App Attest (primary, iOS 14+) ───────────────────────────────

/**
 * Verify an App Attest attestation object against Apple's API.
 *
 * Apple App Attest provides cryptographic proof of:
 *   - Device genuineness (Secure Enclave key)
 *   - App identity (App ID binding)
 *   - Challenge freshness (server-issued nonce bound into the attestation)
 *
 * The attestation object is a CBOR-encoded structure signed by Apple.
 * Apple validates it server-side at: https://data.appattest.apple.com/v1/attestationData
 *
 * NOTE: App Attest has two phases:
 *   1. Attestation (first launch): calls DCAppAttestService.attestKey()
 *      → validated here, keyId stored in DeviceBind
 *   2. Assertion (subsequent sessions): calls DCAppAttestService.generateAssertion()
 *      → TODO: implement assertion validation in Milestone 5
 */
async function verifyAppAttest(
  attestationObject: string,
  keyId: string,
  nonce: string,
): Promise<IntegrityResult> {
  const platform = 'ios' as const;
  const attestationType = 'app_attest';

  if (!config.integrity.appleTeamId || !config.integrity.appleKeyId || !config.integrity.applePrivateKey) {
    logger.warn('[Integrity] Apple keys not configured — skipping App Attest check');
    return { valid: true, platform, attestationType, verdict: 'skipped_no_key' };
  }

  if (!keyId || !nonce) {
    return { valid: false, platform, attestationType, reason: 'keyId ou nonce ausente para App Attest' };
  }

  const env = config.integrity.appleAppAttestEnv;
  const baseUrl = env === 'production'
    ? 'https://data.appattest.apple.com'
    : 'https://data.appattest.apple.com'; // Apple has no separate sandbox; use mock in dev

  const developerJwt = buildAppleJwt();

  try {
    await axios.post(
      `${baseUrl}/v1/attestationData`,
      {
        attestationObject,
        keyId,
        challenge: nonce,
      },
      {
        headers: {
          Authorization: `Bearer ${developerJwt}`,
          'Content-Type': 'application/json',
        },
        timeout: 6000,
      }
    );

    return { valid: true, platform, attestationType, verdict: 'app_attest_pass' };
  } catch (err: any) {
    const status = err.response?.status;
    const body   = err.response?.data;
    logger.warn('[Integrity] App Attest failed', { status, body, keyId });
    return {
      valid: false,
      platform,
      attestationType,
      verdict: `app_attest_fail:${status}`,
      reason: 'Dispositivo iOS não verificado (App Attest)',
    };
  }
}

// ─── iOS — Apple DeviceCheck (legacy fallback, iOS < 14) ─────────────────────

async function verifyDeviceCheck(token: string): Promise<IntegrityResult> {
  const platform = 'ios' as const;
  const attestationType = 'device_check';

  if (!config.integrity.appleTeamId || !config.integrity.appleKeyId || !config.integrity.applePrivateKey) {
    logger.warn('[Integrity] Apple DeviceCheck keys not configured — skipping iOS check');
    return { valid: true, platform, attestationType, verdict: 'skipped_no_key' };
  }

  const developerJwt = buildAppleJwt();

  try {
    await axios.post(
      'https://api.devicecheck.apple.com/v1/validate_device_token',
      {
        device_token:   token,
        transaction_id: generateTransactionId(),
        timestamp:      Date.now(),
      },
      {
        headers: {
          Authorization: `Bearer ${developerJwt}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    return { valid: true, platform, attestationType, verdict: 'device_check_pass' };
  } catch (err: any) {
    const status = err.response?.status;
    const body   = err.response?.data;
    logger.warn('[Integrity] Apple DeviceCheck failed', { status, body });
    return {
      valid: false,
      platform,
      attestationType,
      verdict: `device_check_fail:${status}`,
      reason: 'Dispositivo iOS inválido',
    };
  }
}

function buildAppleJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: config.integrity.appleTeamId, iat: now },
    config.integrity.applePrivateKey,
    { algorithm: 'ES256', keyid: config.integrity.appleKeyId, expiresIn: '1h' }
  );
}

function generateTransactionId(): string {
  return `dc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── App Attest Phase 2 — Device Session Tokens ───────────────────────────────
//
// After a successful Phase 1 attestation Apple rate-limits re-attestation, so
// subsequent sessions present a server-signed "device session token" instead of
// going back to Apple. The token binds userId + keyId, is revocable (via the
// DeviceBind.is_active flag), and expires after DEVICE_SESSION_TTL_MS (default 48 h).

const DEVICE_SESSION_SIGNING_SUFFIX = ':device-session-v1';

export interface DeviceSessionPayload {
  sub: string; // userId
  kid: string; // App Attest keyId stored in DeviceBind
  plt: string; // platform
}

/**
 * Issue a short-lived signed device session token after a successful attestation.
 * Call this once per successful app_attest verification and emit it to the client
 * so it can persist it in secure storage for future sessions.
 */
export function issueDeviceSessionToken(userId: string, keyId: string, platform: string): string {
  const secret = config.jwt.accessSecret + DEVICE_SESSION_SIGNING_SUFFIX;
  const ttlSec = Math.floor(config.integrity.deviceSessionTtlMs / 1000);
  return jwt.sign({ sub: userId, kid: keyId, plt: platform }, secret, { expiresIn: ttlSec });
}

/**
 * Validate a device session token for App Attest Phase 2.
 * Checks signature, expiry, userId binding, and that the keyId is still
 * active in DeviceBind (revocation check).
 */
export async function verifyDeviceSessionToken(
  token: string,
  userId: string,
): Promise<IntegrityResult> {
  const platform = 'ios' as const;
  const attestationType = 'app_attest_session';

  if (config.integrity.mockMode) {
    const valid = token === config.integrity.mockToken;
    return {
      valid,
      platform: 'mock',
      attestationType,
      verdict: valid ? 'mock_pass' : 'mock_fail',
      reason: valid ? undefined : 'Mock token inválido',
    };
  }

  const secret = config.jwt.accessSecret + DEVICE_SESSION_SIGNING_SUFFIX;

  let payload: DeviceSessionPayload;
  try {
    payload = jwt.verify(token, secret) as DeviceSessionPayload;
  } catch (err: any) {
    const expired = err.name === 'TokenExpiredError';
    logger.warn('[Integrity] Device session token rejected', { userId, reason: err.name });
    return {
      valid: false,
      platform,
      attestationType,
      verdict: expired ? 'session_expired' : 'session_invalid',
      reason: expired ? 'Sessão expirada — faça a verificação novamente' : 'Token de sessão inválido',
    };
  }

  if (payload.sub !== userId) {
    logger.warn('[Integrity] Device session userId mismatch', { expected: userId, got: payload.sub });
    return { valid: false, platform, attestationType, verdict: 'session_user_mismatch', reason: 'Token não pertence a este usuário' };
  }

  // Revocation check — device must still be active in DeviceBind
  try {
    const bind = await prisma.deviceBind.findFirst({
      where: { userId, attest_key_id: payload.kid, is_active: true },
      select: { id: true },
    });
    if (!bind) {
      logger.warn('[Integrity] Device session revoked or missing DeviceBind', { userId, keyId: payload.kid });
      return { valid: false, platform, attestationType, verdict: 'session_revoked', reason: 'Dispositivo revogado — faça a verificação novamente' };
    }
  } catch (err: any) {
    logger.error('[Integrity] DeviceBind lookup failed during session verify', { userId, message: err.message });
    return { valid: false, platform, attestationType, verdict: 'session_db_error', reason: 'Erro interno de verificação' };
  }

  return { valid: true, platform, attestationType, verdict: 'app_attest_session_pass' };
}
