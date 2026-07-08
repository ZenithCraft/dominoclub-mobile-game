import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from '../store/toast.store';
import { Platform } from 'react-native';

const envBaseUrl = process.env.EXPO_PUBLIC_API_URL;

const isLocalhostWeb =
  typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

// Para mobile (React Native), não usar localhost
const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

let BASE_URL: string;
if (envBaseUrl) {
  // Explicit config always wins — e.g. .env pointing a local browser session
  // at a staging/VPS backend for testing. The target server's CORS_ORIGINS
  // must allow this page's origin (see apps/backend/.env's CORS_ORIGINS).
  BASE_URL = envBaseUrl;
} else if (isLocalhostWeb) {
  // No explicit URL and running in a browser on localhost → assume a
  // local backend (with DEV_AUTH_BYPASS, disabled in production) is running
  // alongside this dev server.
  BASE_URL = 'http://localhost:3001/api/v1';
} else if (typeof location !== 'undefined') {
  BASE_URL = `${location.origin}/api/v1`;
} else {
  if (__DEV__) {
    console.warn('EXPO_PUBLIC_API_URL not set — using localhost fallback. Set it in .env or app.json.');
  }
  BASE_URL = 'http://localhost:3001/api/v1';
}

const IS_MOCK  = process.env.EXPO_PUBLIC_MOCK_MODE === 'true';

// Errors from these URLs are surfaced directly to the caller — don't double-toast
const SILENT_PATHS = ['/auth/otp', '/auth/cpf/verify', '/auth/profile', '/auth/logout'];

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Mock mode: interceptors must be installed BEFORE the real ones so the response
//    interceptor runs first (FIFO) and the request interceptor runs last (LIFO).
if (IS_MOCK) {
  const { installMockInterceptors } = require('../mocks/interceptors');
  installMockInterceptors(api);
}

// Attach auth token
api.interceptors.request.use(async (config) => {
  const storageToken = await AsyncStorage.getItem('access_token');
  const webToken =
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem('access_token')
      : null;
  const token = webToken || storageToken;
  if (typeof window !== 'undefined' && window.localStorage) {
    if (!webToken && storageToken) window.localStorage.setItem('access_token', storageToken);
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Token refresh — deduplicated + cooldown ────────────────────────────────
// Prevents multiple concurrent 401s from hammering POST /auth/token/refresh
// and exhausting the 20 req/15-min rate limit.
let _refreshInFlight: Promise<string> | null = null;
let _refreshFailedAt = 0;
const REFRESH_COOLDOWN_MS = 15_000; // 15 s cooldown after any failure

// Registered by the auth store on startup to trigger navigation→Login when
// all refresh attempts are exhausted.
let _onAuthFailure: (() => void) | null = null;
export function setAuthFailureCallback(cb: () => void) {
  _onAuthFailure = cb;
}

export async function refreshAccessToken(): Promise<string> {
  if (_refreshInFlight) return _refreshInFlight;

  // During cooldown: fail fast instead of hitting the rate limiter again.
  if (Date.now() - _refreshFailedAt < REFRESH_COOLDOWN_MS) {
    throw new Error('Refresh cooldown active');
  }

  _refreshInFlight = (async () => {
    const storageRefresh = await AsyncStorage.getItem('refresh_token');
    const webRefresh =
      typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem('refresh_token')
        : null;
    const refreshToken = webRefresh || storageRefresh;
    if (!refreshToken) throw new Error('No refresh token');

    const { data } = await api.post('/auth/token/refresh', { refreshToken });

    await AsyncStorage.setItem('access_token', data.accessToken);
    await AsyncStorage.setItem('refresh_token', data.refreshToken);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('access_token', data.accessToken);
      window.localStorage.setItem('refresh_token', data.refreshToken);
    }
    // Reset cooldown on success
    _refreshFailedAt = 0;
    return data.accessToken as string;
  })().catch((err) => {
    _refreshFailedAt = Date.now();
    throw err;
  }).finally(() => {
    _refreshInFlight = null;
  });

  return _refreshInFlight;
}

// Auto-refresh on 401 + global error toast
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // 401 — attempt token refresh (shared, deduplicated, rate-limit-safe)
    // Skip retry for auth-management endpoints to prevent infinite loops
    const reqUrl = original?.url ?? '';
    if (error.response?.status === 401 && !original?._retry && !reqUrl.includes('/token/refresh') && !reqUrl.includes('/auth/logout')) {
      original._retry = true;
      try {
        const newToken = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        // Clear stored tokens so the next app start begins fresh
        await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem('access_token');
          window.localStorage.removeItem('refresh_token');
        }
        // Signal app to redirect to Login (set via setAuthFailureCallback)
        _onAuthFailure?.();
        return Promise.reject(error);
      }
    }

    // Show global toast for unexpected server/network errors,
    // unless the calling screen handles this error inline (SILENT_PATHS).
    const url: string = original?.url || '';
    const isSilent = SILENT_PATHS.some((p) => url.includes(p));

    if (!isSilent) {
      if (!error.response) {
        toast.error('Sem conexão com o servidor. Verifique sua internet.');
      } else if (error.response.status >= 500) {
        toast.error('Erro interno do servidor. Tente novamente em instantes.');
      } else if (error.response.status === 403) {
        toast.error(error.response.data?.error || 'Acesso não autorizado.');
      } else if (error.response.status === 429) {
        toast.warning('Muitas requisições. Aguarde um momento.');
      } else if (error.response.status >= 400 && error.response.data?.error) {
        toast.error(error.response.data.error);
      }
    }

    return Promise.reject(error);
  },
);
