import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

function getSocketUrl(): string {
  const envSocketUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (envSocketUrl) return envSocketUrl;

  const base = String((api.defaults.baseURL ?? '')).trim();
  if (base) {
    try {
      const u = new URL(base);
      return u.origin;
    } catch {
    }
  }

  const isLocalhostWeb =
    typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  return typeof location !== 'undefined'
    ? (isLocalhostWeb ? 'http://localhost:3001' : location.origin)
    : 'http://localhost:3001';
}
function isMockMode(): boolean {
  return (
    process.env.EXPO_PUBLIC_MOCK_MODE === 'true' ||
    (typeof window !== 'undefined' && !!(window as any).__MOCK_GAME__)
  );
}

let socket: Socket | null = null;

function isAuthSocketError(err: any) {
  const msg = String(err?.message || err || '');
  return /invalid token|unauthorized|authentication required/i.test(msg);
}

async function refreshAccessToken(): Promise<string | null> {
  const storageRefresh = await AsyncStorage.getItem('refresh_token');
  const webRefresh =
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem('refresh_token')
      : null;
  const refreshToken = webRefresh || storageRefresh;
  if (!refreshToken) return null;

  const { data } = await api.post('/auth/token/refresh', { refreshToken });
  await AsyncStorage.setItem('access_token', data.accessToken);
  await AsyncStorage.setItem('refresh_token', data.refreshToken);
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('access_token', data.accessToken);
    window.localStorage.setItem('refresh_token', data.refreshToken);
  }
  return data.accessToken;
}

function waitForConnect(s: Socket): Promise<Socket> {
  if (s.connected) return Promise.resolve(s);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Socket connection timeout'));
    }, 8000);

    const onConnect = () => {
      cleanup();
      resolve(s);
    };

    const onError = (err: any) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err?.message || err)));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      s.off('connect', onConnect);
      s.off('connect_error', onError);
    };

    s.once('connect', onConnect);
    s.once('connect_error', onError);
  });
}

function createSocket(token: string | null) {
  const s = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  s.on('connect',       () => console.log('Socket connected:', s.id));
  s.on('disconnect',    (reason) => console.log('Socket disconnected:', reason));
  s.on('connect_error', (err) => console.error('Socket error:', err.message));

  return s;
}

export async function connectSocket(): Promise<Socket> {
  if (isMockMode()) {
    const { fakeSocket } = require('../mocks/fakeSocket');
    return fakeSocket as unknown as Socket;
  }

  if (socket) {
    if (socket.connected) return socket;
    // Not yet connected — wait for it to connect or fail.
    // On any failure (auth error, timeout, reconnection exhausted) disconnect and
    // fall through to create a fresh socket with a possibly-refreshed token.
    try {
      return await waitForConnect(socket);
    } catch {
      disconnectSocket();
    }
  }

  const storageToken = await AsyncStorage.getItem('access_token');
  const webToken =
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem('access_token')
      : null;
  const token = webToken || storageToken;
  if (typeof window !== 'undefined' && window.localStorage) {
    if (!webToken && storageToken) window.localStorage.setItem('access_token', storageToken);
  }

  socket = createSocket(token);

  try {
    return await waitForConnect(socket);
  } catch (err: any) {
    if (!isAuthSocketError(err)) throw err;

    try {
      const newAccessToken = await refreshAccessToken();
      if (!newAccessToken) throw err;
      disconnectSocket();
      socket = createSocket(newAccessToken);
      return await waitForConnect(socket);
    } catch {
      await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('access_token');
        window.localStorage.removeItem('refresh_token');
      }
      disconnectSocket();
      throw err;
    }
  }
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
