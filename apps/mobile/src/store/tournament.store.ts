import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ActiveTournament = {
  tournamentId: string;
  tournamentName: string;
  startsAt: string;
  entryFee: number;
  notificationsEnabled?: boolean;
};

interface TournamentState {
  activeTournament: ActiveTournament | null;
  setActiveTournament: (t: ActiveTournament) => Promise<void>;
  clearActiveTournament: () => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

let loadFromStorageInFlight: Promise<void> | null = null;

export const useTournamentStore = create<TournamentState>((set, get) => ({
  activeTournament: null,

  setActiveTournament: async (t) => {
    set({ activeTournament: t });
    try {
      await AsyncStorage.setItem('active_tournament', JSON.stringify(t));
    } catch {}
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('active_tournament', JSON.stringify(t));
      } catch {}
    }
  },

  clearActiveTournament: async () => {
    set({ activeTournament: null });
    try {
      await AsyncStorage.removeItem('active_tournament');
    } catch {}
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem('active_tournament');
      } catch {}
    }
  },

  setNotificationsEnabled: async (enabled) => {
    const cur = get().activeTournament;
    if (!cur) return;
    const next = { ...cur, notificationsEnabled: enabled };
    await get().setActiveTournament(next);
  },

  loadFromStorage: async () => {
    if (loadFromStorageInFlight) return loadFromStorageInFlight;
    loadFromStorageInFlight = (async () => {
      try {
        const fromWeb =
          typeof window !== 'undefined' && window.localStorage
            ? window.localStorage.getItem('active_tournament')
            : null;
        const fromNative = await AsyncStorage.getItem('active_tournament');
        const raw = fromWeb || fromNative;
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed?.tournamentId || !parsed?.startsAt) return;
        set({ activeTournament: parsed });
      } catch {}
    })().finally(() => {
      loadFromStorageInFlight = null;
    });
    return loadFromStorageInFlight;
  },
}));

