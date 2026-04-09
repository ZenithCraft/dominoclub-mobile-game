/**
 * DominoClub — Device Integrity Service (Mobile)
 *
 * Abstracts Play Integrity (Android) and DeviceCheck (iOS) into a single call
 * that returns { platform, token } ready to include in queue:join.
 *
 * Development / Expo Go:
 *   Set EXPO_PUBLIC_INTEGRITY_MOCK_TOKEN to the same value as the backend's
 *   INTEGRITY_MOCK_TOKEN env var. The mock token is accepted when the backend
 *   runs with INTEGRITY_MOCK_MODE=true (default in non-production).
 *
 * Production Android:
 *   Install @react-native-google-play-integrity/react-native-google-play-integrity
 *   and uncomment the Android block below.
 *   Requires EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER.
 *
 * Production iOS:
 *   Install @invertase/react-native-apple-authentication or a DeviceCheck bridge.
 *   Uncomment the iOS block below.
 *   Requires Apple Developer entitlements and a provisioning profile with DeviceCheck.
 */

import { Platform, NativeModules } from 'react-native';

export interface IntegrityPayload {
  platform: 'android' | 'ios';
  token: string;
}

const MOCK_TOKEN = process.env.EXPO_PUBLIC_INTEGRITY_MOCK_TOKEN || 'dev-integrity-token';
const IS_MOCK    = process.env.EXPO_PUBLIC_INTEGRITY_MOCK_MODE !== 'false' &&
                   process.env.EXPO_PUBLIC_MOCK_MODE === 'true';

// Cloud project number registered in Google Play Console (Android only)
const CLOUD_PROJECT_NUMBER = process.env.EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER || '';

/**
 * Obtain an attestation token for the current device and app.
 *
 * Returns null if the platform is unsupported or if the native module is
 * unavailable (e.g. running in Expo Go). The caller should treat null as
 * "integrity unavailable" and omit the token — the backend will enforce
 * the gate only for paid games in production.
 */
export async function getIntegrityToken(): Promise<IntegrityPayload | null> {
  // ── Mock / development bypass ──────────────────────────────────────────────
  if (IS_MOCK || __DEV__) {
    return { platform: Platform.OS === 'ios' ? 'ios' : 'android', token: MOCK_TOKEN };
  }

  if (Platform.OS === 'android') return getAndroidToken();
  if (Platform.OS === 'ios')     return getIosToken();

  return null; // web / other platforms — not supported
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
   *   const nonce = generateNonce(); // base64-encoded, 16–500 bytes
   *   const { token } = await PlayIntegrity.requestIntegrityToken({
   *     cloudProjectNumber: CLOUD_PROJECT_NUMBER,
   *     nonce,
   *   });
   *   return { platform: 'android', token };
   */

  // Check for a manually bridged native module (alternative integration path)
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
    return { platform: 'android', token };
  } catch (err: any) {
    console.error('[Integrity] Play Integrity failed:', err?.message ?? err);
    return null;
  }
}

// ─── iOS — Apple DeviceCheck ──────────────────────────────────────────────────

async function getIosToken(): Promise<IntegrityPayload | null> {
  /**
   * Production implementation requires a DeviceCheck bridge.
   * Options:
   *   1. react-native-device-check (community package)
   *   2. A custom Expo module using DCDevice.current.generateToken()
   *
   * Then uncomment:
   *
   *   import DCDevice from 'react-native-device-check';
   *
   *   if (!await DCDevice.isSupported()) return null;
   *   const token = await DCDevice.generateToken();
   *   return { platform: 'ios', token };
   */

  // Check for a manually bridged native module
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
    return { platform: 'ios', token };
  } catch (err: any) {
    console.error('[Integrity] DeviceCheck failed:', err?.message ?? err);
    return null;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Generate a random nonce (base64, 32 bytes). */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return btoa(String.fromCharCode(...bytes));
}
