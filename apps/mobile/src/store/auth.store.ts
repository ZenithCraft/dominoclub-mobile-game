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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,

  setTokens: (accessToken, refreshToken) => {
    set({ accessToken, refreshToken });
    AsyncStorage.setItem('access_token', accessToken);
    AsyncStorage.setItem('refresh_token', refreshToken);
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
    set({ user: null, accessToken: null, refreshToken: null });
  },

  loadFromStorage: async () => {
    try {
      const [accessToken, refreshToken] = await AsyncStorage.multiGet(['access_token', 'refresh_token']);
      const access = accessToken[1];
      const refresh = refreshToken[1];

      if (access && refresh) {
        set({ accessToken: access, refreshToken: refresh });
        // Verify token and load user
        try {
          const { data } = await api.get('/auth/me');
          const avatarUri = await AsyncStorage.getItem('profile_avatar_uri');
          set({ user: avatarUri ? { ...data, avatar: avatarUri } : data });
        } catch {
          // Token expired — try refresh
          try {
            const { data } = await api.post('/auth/token/refresh', { refreshToken: refresh });
            set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
            await AsyncStorage.setItem('access_token', data.accessToken);
            await AsyncStorage.setItem('refresh_token', data.refreshToken);
            const me = await api.get('/auth/me');
            const avatarUri = await AsyncStorage.getItem('profile_avatar_uri');
            set({ user: avatarUri ? { ...me.data, avatar: avatarUri } : me.data });
          } catch {
            set({ user: null, accessToken: null, refreshToken: null });
          }
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  refreshUser: async () => {
    try {
      const { data } = await api.get('/auth/me');
      const avatarUri = await AsyncStorage.getItem('profile_avatar_uri');
      set({ user: avatarUri ? { ...data, avatar: avatarUri } : data });
    } catch {}
  },
}));
