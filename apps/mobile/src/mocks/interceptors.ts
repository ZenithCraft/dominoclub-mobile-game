import { AxiosInstance } from 'axios';
import {
  MOCK_USER, MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN,
  MOCK_TRANSACTIONS, MOCK_TOURNAMENTS,
} from './data';

const IS_MOCK = '__isMockError__';

function resolve(data: any) {
  return { data, status: 200, statusText: 'OK', headers: {}, config: {} as any };
}

function getMockData(url: string, method: string): any | undefined {
  const m = method.toLowerCase();

  if (m === 'post' && url.includes('/auth/dev/login'))   return { accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN, user: MOCK_USER };
  if (m === 'get'  && url.includes('/game/active') && !url.includes('tournaments')) return { game: null };
  if (m === 'get'  && url.includes('/game/tournaments/my-active')) return {};
  if (m === 'post' && url.includes('/auth/otp/send'))    return {};
  if (m === 'post' && url.includes('/auth/otp/verify'))  return { accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN, user: MOCK_USER };
  if (m === 'get'  && url.includes('/auth/me'))          return MOCK_USER;
  if (m === 'post' && url.includes('/auth/token/refresh')) return { accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN };
  if (m === 'post' && url.includes('/auth/logout'))      return {};
  if (m === 'put'  && url.includes('/auth/profile'))     return MOCK_USER;
  if (m === 'post' && url.includes('/auth/cpf/verify'))  return {};
  if (m === 'post' && url.includes('/auth/forgot-password')) return {};
  if (m === 'post' && url.includes('/auth/reset-password'))  return {};

  if (m === 'get'  && url.includes('/wallet/transaction/')) return { status: 'COMPLETED' };
  if (m === 'get'  && url.includes('/wallet'))          return { transactions: MOCK_TRANSACTIONS };
  if (m === 'post' && url.includes('/wallet/deposit'))  return { qrCode: 'mock-pix-key-demo', transactionId: 'mock-tx-999' };
  if (m === 'post' && url.includes('/wallet/withdraw')) return {};

  if (m === 'get'  && url.includes('/game/tournaments')) return { tournaments: MOCK_TOURNAMENTS };
  if (m === 'post' && url.includes('/game/tournaments')) return {};

  return undefined;
}

export function installMockInterceptors(instance: AxiosInstance) {
  // ── Response interceptor added FIRST (FIFO) so it runs before the real error handler
  instance.interceptors.response.use(
    (res) => res,
    (error) => {
      if (error?.[IS_MOCK]) {
        return Promise.resolve(resolve(error.mockData));
      }
      return Promise.reject(error);
    },
  );

  // ── Request interceptor added FIRST (LIFO) so it runs AFTER auth-token interceptor
  instance.interceptors.request.use((config) => {
    const mockData = getMockData(config.url ?? '', config.method ?? 'get');
    if (mockData !== undefined) {
      const err: any = new Error('mock');
      err[IS_MOCK]  = true;
      err.mockData  = mockData;
      err.config    = config;
      throw err;
    }
    return config;
  });
}
