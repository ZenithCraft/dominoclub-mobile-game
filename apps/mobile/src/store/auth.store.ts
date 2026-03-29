import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

interface User {
  id: string;
  phone: string;
  name?: string;
  avatar?: string;
  cpf_verified: boolean;
  phone_verified: boolean;
  wallet?: {
    real_balance: number;
    bonus_balance: number;
    rollover_remaining: number;
  };
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;

  setTokens: (access: string, refresh: string) => void;
  setUser: (user: User) => void;
  setAvatar: (uri: string | null) => Promise<void>;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

let loadFromStorageInFlight: Promise<void> | null = null;
let refreshUserInFlight: Promise<void> | null = null;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,

  setTokens: (accessToken, refreshToken) => {
    set({ accessToken, refreshToken });
    AsyncStorage.setItem('access_token', accessToken);
    AsyncStorage.setItem('refresh_token', refreshToken);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('access_token', accessToken);
      window.localStorage.setItem('refresh_token', refreshToken);
    }
  },

  setUser: (user) => set({ user }),

  setAvatar: async (uri) => {
    const current = get().user;
    if (!current) return;
    if (uri) await AsyncStorage.setItem('profile_avatar_uri', uri);
    else await AsyncStorage.removeItem('profile_avatar_uri');
    set({ user: { ...current, avatar: uri || undefined } });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'profile_avatar_uri']);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('access_token');
      window.localStorage.removeItem('refresh_token');
      window.localStorage.removeItem('profile_avatar_uri');
    }
    set({ user: null, accessToken: null, refreshToken: null });
  },

  loadFromStorage: async () => {
    if (loadFromStorageInFlight) return loadFromStorageInFlight;

    loadFromStorageInFlight = (async () => {
    try {
      const [accessToken, refreshToken] = await AsyncStorage.multiGet(['access_token', 'refresh_token']);
      const accessFromStorage = accessToken[1];
      const refreshFromStorage = refreshToken[1];

      const accessFromWeb =
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem('access_token')
          : null;
      const refreshFromWeb =
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem('refresh_token')
          : null;

      const access = accessFromWeb || accessFromStorage;
      const refresh = refreshFromWeb || refreshFromStorage;

      if (access && refresh) {
        set({ accessToken: access, refreshToken: refresh });
        if (typeof window !== 'undefined' && window.localStorage) {
          if (accessFromStorage && !accessFromWeb) window.localStorage.setItem('access_token', accessFromStorage);
          if (refreshFromStorage && !refreshFromWeb) window.localStorage.setItem('refresh_token', refreshFromStorage);
        }

        try {
          try {
            const { data } = await api.get('/auth/me');
            const avatarUri = await AsyncStorage.getItem('profile_avatar_uri');
            set({ user: avatarUri ? { ...data, avatar: avatarUri } : data });
          } catch (err2: any) {
            if (err2?.response?.status === 429) {
              await sleep(900);
              const { data } = await api.get('/auth/me');
              const avatarUri = await AsyncStorage.getItem('profile_avatar_uri');
              set({ user: avatarUri ? { ...data, avatar: avatarUri } : data });
            } else {
              throw err2;
            }
          }
        } catch (err: any) {
          if (err?.response?.status === 401) {
            const forceDevLogin = process.env.EXPO_PUBLIC_FORCE_DEV_LOGIN === 'true';
            const allowDevLogin = (() => {
              if (forceDevLogin) return true;
              try {
                const base = String((api.defaults.baseURL || '')).trim();
                if (!base) return false;
                const url = new URL(base);
                const host = url.hostname;
                if (host === 'localhost' || host === '127.0.0.1') return true;
                if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
                  const [a, b] = host.split('.').map((x) => Number(x));
                  if (a === 10) return true;
                  if (a === 192 && b === 168) return true;
                  if (a === 172 && b >= 16 && b <= 31) return true;
                }
                return false;
              } catch {
                return false;
              }
            })();
            if (allowDevLogin) {
              try {
                const { data } = await api.post('/auth/dev/login', {});
                get().setTokens(data.accessToken, data.refreshToken);
                const avatarUri = await AsyncStorage.getItem('profile_avatar_uri');
                set({ user: avatarUri ? { ...data.user, avatar: avatarUri } : data.user });
                return;
              } catch {}
            }
            await get().logout();
          } else {
            set({ user: null, accessToken: null, refreshToken: null });
          }
        }
      }
    } finally {
      set({ isLoading: false });
    }
    })().finally(() => {
      loadFromStorageInFlight = null;
    });

    return loadFromStorageInFlight;
  },

  refreshUser: async () => {
    if (refreshUserInFlight) return refreshUserInFlight;

    refreshUserInFlight = (async () => {
    try {
      try {
        const { data } = await api.get('/auth/me');
        const avatarUri = await AsyncStorage.getItem('profile_avatar_uri');
        set({ user: avatarUri ? { ...data, avatar: avatarUri } : data });
      } catch (err2: any) {
        if (err2?.response?.status === 429) {
          await sleep(900);
          const { data } = await api.get('/auth/me');
          const avatarUri = await AsyncStorage.getItem('profile_avatar_uri');
          set({ user: avatarUri ? { ...data, avatar: avatarUri } : data });
        } else {
          throw err2;
        }
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        await get().logout();
      }
    }
    })().finally(() => {
      refreshUserInFlight = null;
    });

    return refreshUserInFlight;
  },
}));
