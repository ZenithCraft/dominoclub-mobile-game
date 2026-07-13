import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATIONS_KEY = 'notifications_enabled';
const SOUND_KEY = 'sound_enabled';

interface SettingsState {
  notificationsEnabled: boolean;
  soundOn: boolean;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  setSoundOn: (enabled: boolean) => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

async function persist(key: string, enabled: boolean) {
  try {
    await AsyncStorage.setItem(key, enabled ? '1' : '0');
  } catch {}
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, enabled ? '1' : '0');
    } catch {}
  }
}

async function readPersisted(key: string): Promise<string | null> {
  const fromWeb =
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem(key)
      : null;
  const fromNative = await AsyncStorage.getItem(key);
  return fromWeb ?? fromNative;
}

let loadFromStorageInFlight: Promise<void> | null = null;

export const useSettingsStore = create<SettingsState>((set) => ({
  notificationsEnabled: false,
  soundOn: true,

  setNotificationsEnabled: async (enabled) => {
    set({ notificationsEnabled: enabled });
    await persist(NOTIFICATIONS_KEY, enabled);
  },

  setSoundOn: async (enabled) => {
    set({ soundOn: enabled });
    await persist(SOUND_KEY, enabled);
  },

  loadFromStorage: async () => {
    if (loadFromStorageInFlight) return loadFromStorageInFlight;
    loadFromStorageInFlight = (async () => {
      try {
        const [notifRaw, soundRaw] = await Promise.all([
          readPersisted(NOTIFICATIONS_KEY),
          readPersisted(SOUND_KEY),
        ]);
        const next: Partial<SettingsState> = {};
        if (notifRaw != null) next.notificationsEnabled = notifRaw === '1';
        if (soundRaw != null) next.soundOn = soundRaw === '1';
        if (Object.keys(next).length > 0) set(next);
      } catch {}
    })().finally(() => {
      loadFromStorageInFlight = null;
    });
    return loadFromStorageInFlight;
  },
}));
