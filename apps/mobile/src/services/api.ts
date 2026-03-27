import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from '../store/toast.store';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (typeof location !== 'undefined' ? `${location.origin}/api/v1` : 'http://localhost:3001/api/v1');
const IS_MOCK  = process.env.EXPO_PUBLIC_MOCK_MODE === 'true';

// Errors from these URLs are surfaced directly to the caller — don't double-toast
const SILENT_PATHS = ['/auth/otp', '/auth/cpf/verify', '/auth/profile'];

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
  const token = await AsyncStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401 + global error toast
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // 401 — attempt token refresh
    if (error.response?.status === 401 && !original?._retry) {
      original._retry = true;
      try {
        const refreshToken = await AsyncStorage.getItem('refresh_token');
        const { data } = await axios.post(`${BASE_URL}/auth/token/refresh`, { refreshToken });
        await AsyncStorage.setItem('access_token', data.accessToken);
        await AsyncStorage.setItem('refresh_token', data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
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
