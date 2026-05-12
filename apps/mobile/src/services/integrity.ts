/**
 * DominoClub — Device Integrity Service (Mobile)
 *
 * Abstracts Play Integrity (Android) and App Attest / DeviceCheck (iOS) into a
 * single call that returns a payload ready to include in queue:join.
 *
 * ── Flow ────────────────────────────────────────────────────────────────────
 * 1. Call fetchServerNonce() → receives a server-issued single-use nonce.
 * 2. Pass nonce to the platform SDK (Play Integrity or App Attest).
 * 3. Include { token/attestationObject, platform, nonce, attestationType, keyId }
 *    in the queue:join socket payload.
 * 4. The backend validates nonce freshness (replay protection) and verifies the token.
 *
 * ── Development / Expo Go ───────────────────────────────────────────────────
 * Set EXPO_PUBLIC_INTEGRITY_MOCK_TOKEN to the same value as the backend's
 * INTEGRITY_MOCK_TOKEN env var. Mock token is accepted when backend runs with
 * INTEGRITY_MOCK_MODE=true (default in non-production). Nonce fetch is skipped.
 *
 * ── Production Android ──────────────────────────────────────────────────────
 * Install: @react-native-google-play-integrity/react-native-google-play-integrity
 * Set: EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER
 * Uncomment the Android native block below.
 *
 * ── Production iOS — App Attest (primary, iOS 14+) ──────────────────────────
 * Requires a custom Expo module or react-native-device-check with DCAppAttestService support.
 * App Attest two-phase flow:
 *   Phase 1 (Attestation, first launch):
 *     - Generate a new key:  DCAppAttestService.shared.generateKey()
 *     - Attest it:           DCAppAttestService.shared.attestKey(keyId, SHA-256(nonce))
 *     - Send attestation object + keyId to server
 *     - Server validates via Apple API, stores keyId in DeviceBind
 *   Phase 2 (Assertion, subsequent sessions): TODO Milestone 5
 *     - DCAppAttestService.shared.generateAssertion(keyId, SHA-256(payload))
 * Uncomment the App Attest native block below.
 *
 * ── Production iOS — DeviceCheck (legacy fallback, iOS < 14) ────────────────
 * Install: react-native-device-check or a custom Expo module.
 * Uncomment the DeviceCheck native block below.
 */

import { Platform, NativeModules } from 'react-native';
import { api } from './api';

export interface IntegrityPayload {
  platform: 'android' | 'ios';
  token?: string;               // Play Integrity token (Android) or DeviceCheck token (iOS legacy)
  attestationObject?: string;   // base64, iOS App Attest only
  keyId?: string;               // iOS App Attest key ID
  nonce?: string;               // Server-issued nonce (included for backend verification)
  attestationType?: 'app_attest' | 'device_check'; // iOS only
}

const MOCK_TOKEN = process.env.EXPO_PUBLIC_INTEGRITY_MOCK_TOKEN || 'dev-integrity-token';
const IS_MOCK    = process.env.EXPO_PUBLIC_INTEGRITY_MOCK_MODE === 'true' ||
                   (process.env.EXPO_PUBLIC_INTEGRITY_MOCK_MODE !== 'false' &&
                    process.env.EXPO_PUBLIC_MOCK_MODE === 'true');

const CLOUD_PROJECT_NUMBER = process.env.EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER || '';

/**
 * Obtain an attestation payload for the current device and app.
 *
 * Returns null if the platform is unsupported or if native modules are
 * unavailable (e.g. Expo Go). The caller treats null as "integrity unavailable"
 * and omits the payload — the backend enforces the gate only for paid games in production.
 */
export async function getIntegrityToken(): Promise<IntegrityPayload | null> {
  // ── Mock / development bypass ──────────────────────────────────────────────
  if (IS_MOCK) {
    return {
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      token: MOCK_TOKEN,
      attestationType: Platform.OS === 'ios' ? 'device_check' : undefined,
    };
  }

  if (Platform.OS === 'android') return getAndroidToken();
  if (Platform.OS === 'ios')     return getIosToken();

  return null;
}

// ─── Server nonce fetch ───────────────────────────────────────────────────────

/**
 * Request a single-use nonce from the backend.
 * Must be called before requesting the integrity token from the platform SDK.
 * Returns null on failure — callers should bail out and omit the integrity payload.
 */
export async function fetchServerNonce(authToken: string): Promise<string | null> {
  try {
    const res = await api.get<{ nonce: string; expiresAt: number }>('/game/integrity-nonce', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    return res.data.nonce;
  } catch (err: any) {
    console.warn('[Integrity] fetchServerNonce failed:', err?.message ?? err);
    return null;
  }
}

// ─── Android — Google Play Integrity ─────────────────────────────────────────

async function getAndroidToken(): Promise<IntegrityPayload | null> {
  /**
   * Production implementation requires:
   *   npm install @react-native-google-play-integrity/react-native-google-play-integrity
   *
   * Then uncomment:
   *
   *   import PlayIntegrity from '@react-native-google-play-integrity/react-native-google-play-integrity';
   *
   *   const nonce = await fetchServerNonce(authToken); // authToken from auth store
   *   if (!nonce) return null;
   *   const { token } = await PlayIntegrity.requestIntegrityToken({
   *     cloudProjectNumber: CLOUD_PROJECT_NUMBER,
   *     nonce, // nonce is embedded inside the token and verified server-side
   *   });
   *   return { platform: 'android', token, nonce };
   */

  // Fallback: check for a manually bridged native module
  const PlayIntegrityModule = NativeModules.PlayIntegrity as
    | { requestIntegrityToken: (opts: { cloudProjectNumber: string; nonce: string }) => Promise<{ token: string }> }
    | undefined;

  if (!PlayIntegrityModule) {
    console.warn('[Integrity] Play Integrity native module not available — skipping');
    return null;
  }

  try {
    const nonce = generateNonce();
    const { token } = await PlayIntegrityModule.requestIntegrityToken({
      cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      nonce,
    });
    return { platform: 'android', token, nonce };
  } catch (err: any) {
    console.error('[Integrity] Play Integrity failed:', err?.message ?? err);
    return null;
  }
}

// ─── iOS — App Attest (primary, iOS 14+) ─────────────────────────────────────

async function getIosToken(): Promise<IntegrityPayload | null> {
  // Try App Attest first (iOS 14+), fall back to DeviceCheck
  const payload = await getIosAppAttestToken();
  if (payload) return payload;
  return getIosDeviceCheckToken();
}

async function getIosAppAttestToken(): Promise<IntegrityPayload | null> {
  /**
   * Production App Attest implementation requires a custom Expo module or
   * react-native-app-attest (community package) with DCAppAttestService support.
   *
   * Two-phase flow:
   *
   * Phase 1 — Attestation (first launch, or when cached keyId is missing):
   *
   *   import AppAttest from 'react-native-app-attest'; // or your custom module
   *   import AsyncStorage from '@react-native-async-storage/async-storage';
   *   import { createHash } from 'react-native-sha256';
   *
   *   const supported = await AppAttest.isSupported();
   *   if (!supported) return null;
   *
   *   const nonce = await fetchServerNonce(authToken);
   *   if (!nonce) return null;
   *
   *   let keyId = await AsyncStorage.getItem('app_attest_key_id');
   *   if (!keyId) {
   *     keyId = await AppAttest.generateKey();
   *     await AsyncStorage.setItem('app_attest_key_id', keyId);
   *   }
   *
   *   const challenge = await createHash('sha256', nonce); // clientDataHash = SHA-256(nonce)
   *   const attestationObject = await AppAttest.attestKey(keyId, challenge);
   *   return {
   *     platform: 'ios',
   *     attestationObject,
   *     keyId,
   *     nonce,
   *     attestationType: 'app_attest',
   *   };
   *
   * Phase 2 — Assertion (subsequent sessions): TODO Milestone 5
   *   const assertion = await AppAttest.generateAssertion(keyId, SHA-256(payload));
   */

  const AppAttestModule = NativeModules.AppAttest as
    | {
        isSupported: () => Promise<boolean>;
        generateKey: () => Promise<string>;
        attestKey: (keyId: string, clientDataHash: string) => Promise<string>;
      }
    | undefined;

  if (!AppAttestModule) {
    console.warn('[Integrity] App Attest native module not available — falling back to DeviceCheck');
    return null;
  }

  try {
    const supported = await AppAttestModule.isSupported();
    if (!supported) return null;

    const nonce = generateNonce();
    const keyId = await AppAttestModule.generateKey();
    const attestationObject = await AppAttestModule.attestKey(keyId, nonce);
    return {
      platform: 'ios',
      attestationObject,
      keyId,
      nonce,
      attestationType: 'app_attest',
    };
  } catch (err: any) {
    console.error('[Integrity] App Attest failed:', err?.message ?? err);
    return null;
  }
}

// ─── iOS — DeviceCheck (legacy fallback) ─────────────────────────────────────

async function getIosDeviceCheckToken(): Promise<IntegrityPayload | null> {
  /**
   * Production DeviceCheck implementation:
   *   npm install react-native-device-check
   *
   * Then uncomment:
   *
   *   import DCDevice from 'react-native-device-check';
   *
   *   if (!await DCDevice.isSupported()) return null;
   *   const token = await DCDevice.generateToken();
   *   return { platform: 'ios', token, attestationType: 'device_check' };
   */

  const DeviceCheckModule = NativeModules.DeviceCheck as
    | { generateToken: () => Promise<string>; isSupported: () => Promise<boolean> }
    | undefined;

  if (!DeviceCheckModule) {
    console.warn('[Integrity] DeviceCheck native module not available — skipping');
    return null;
  }

  try {
    const supported = await DeviceCheckModule.isSupported();
    if (!supported) return null;
    const token = await DeviceCheckModule.generateToken();
    return { platform: 'ios', token, attestationType: 'device_check' };
  } catch (err: any) {
    console.error('[Integrity] DeviceCheck failed:', err?.message ?? err);
    return null;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Generate a random nonce (base64, 32 bytes). Used as fallback when no server nonce is available. */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return btoa(String.fromCharCode(...bytes));
}
