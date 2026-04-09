/**
 * DominoClub — Device Integrity Service
 *
 * Verifies that requests originate from a legitimate, unmodified instance
 * of the app running on a genuine device.
 *
 * Android — Google Play Integrity API
 *   Flow: app calls PlayIntegrity.requestIntegrityToken(nonce)
 *         → sends token in queue:join payload
 *         → backend decodes via Google API and checks verdicts
 *
 * iOS — Apple DeviceCheck API
 *   Flow: app calls DCDevice.current.generateToken()
 *         → sends token in queue:join payload
 *         → backend validates via Apple API (confirms device identity)
 *
 * Development: INTEGRITY_MOCK_MODE=true accepts any token matching INTEGRITY_MOCK_TOKEN.
 */

import axios from 'axios';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface IntegrityResult {
  valid: boolean;
  platform: 'android' | 'ios' | 'mock';
  verdict?: string;
  reason?: string;
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Verify an integrity token produced by the mobile app.
 *
 * @param token    Raw token string from the device
 * @param platform 'android' | 'ios'
 */
export async function verifyIntegrityToken(
  token: string,
  platform: 'android' | 'ios'
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
    if (platform === 'android') return verifyPlayIntegrity(token);
    if (platform === 'ios')     return verifyDeviceCheck(token);
    return { valid: false, platform, reason: 'Plataforma desconhecida' };
  } catch (err: any) {
    logger.error('[Integrity] Verification error', { platform, message: err.message });
    return { valid: false, platform, reason: 'Falha na verificação de integridade' };
  }
}

// ─── Android — Google Play Integrity ─────────────────────────────────────────

/**
 * Accepted Play Integrity device verdicts (from weakest to strongest).
 * We require at least MEETS_DEVICE_INTEGRITY so emulators are blocked.
 */
const ACCEPTED_DEVICE_VERDICTS = new Set([
  'MEETS_STRONG_INTEGRITY',
  'MEETS_DEVICE_INTEGRITY',
]);

async function verifyPlayIntegrity(token: string): Promise<IntegrityResult> {
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
  const appVerdict    = payload?.appIntegrity?.appRecognitionVerdict as string | undefined;
  const deviceVerdicts: string[] = payload?.deviceIntegrity?.deviceRecognitionVerdict ?? [];

  const appOk    = appVerdict === 'PLAY_RECOGNIZED';
  const deviceOk = deviceVerdicts.some((v) => ACCEPTED_DEVICE_VERDICTS.has(v));

  const verdictStr = `app:${appVerdict ?? 'none'} device:${deviceVerdicts.join(',') || 'none'}`;

  if (!appOk || !deviceOk) {
    logger.warn('[Integrity] Android verdict failed', { verdictStr });
    return { valid: false, platform, verdict: verdictStr, reason: 'Dispositivo ou app não reconhecido' };
  }

  return { valid: true, platform, verdict: verdictStr };
}

/** Obtain a short-lived OAuth2 access token using the Google service account. */
async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

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

  return res.data.access_token as string;
}

// ─── iOS — Apple DeviceCheck ──────────────────────────────────────────────────

async function verifyDeviceCheck(token: string): Promise<IntegrityResult> {
  const platform = 'ios' as const;

  if (!config.integrity.appleTeamId || !config.integrity.appleKeyId || !config.integrity.applePrivateKey) {
    logger.warn('[Integrity] Apple DeviceCheck keys not configured — skipping iOS check');
    return { valid: true, platform, verdict: 'skipped_no_key' };
  }

  const developerJwt = buildAppleJwt();

  // Apple DeviceCheck validation endpoint
  const url = 'https://api.devicecheck.apple.com/v1/validate_device_token';

  try {
    // 200 = token valid; 200 + specific body content = device bits readable
    // Apple returns 200 on success and 400/401 on failure
    await axios.post(
      url,
      {
        device_token:     token,
        transaction_id:   generateTransactionId(),
        timestamp:        Date.now(),
      },
      {
        headers: {
          Authorization: `Bearer ${developerJwt}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    return { valid: true, platform, verdict: 'device_check_pass' };
  } catch (err: any) {
    const status = err.response?.status;
    const body   = err.response?.data;
    logger.warn('[Integrity] Apple DeviceCheck failed', { status, body });
    return { valid: false, platform, verdict: `device_check_fail:${status}`, reason: 'Dispositivo iOS inválido' };
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
