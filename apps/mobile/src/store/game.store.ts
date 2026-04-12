import { create } from 'zustand';

export type Tile = [number, number];

export interface PlacedTile {
  tile: Tile;
  side: 'left' | 'right' | 'top' | 'bottom';
  flipped: boolean;
}

export interface PlayerState {
  userId: string;
  name?: string;
  avatarUrl?: string;
  team: number;
  seat: number;
  hand: (Tile | null)[];
  isBot: boolean;
  connected: boolean;
}

export type WinType = 'simples' | 'carroca' | 'lelo' | 'cruzada';

export const WIN_TYPE_LABEL: Record<WinType, string> = {
  simples: 'Simples',
  carroca: 'Carroça',
  lelo:    'Lá e Lô',
  cruzada: 'Cruzada',
};

export const WIN_TYPE_POINTS: Record<WinType, number> = {
  simples: 1,
  carroca: 2,
  lelo:    3,
  cruzada: 4,
};

export interface GameState {
  id: string;
  mode: string;
  variant: string;
  players: PlayerState[];
  board: PlacedTile[];
  leftOpen: number;
  rightOpen: number;
  topOpen?: number;      // CRUZADA only
  bottomOpen?: number;   // CRUZADA only
  currentPlayerIndex: number;
  turnCount: number;
  status: 'waiting' | 'playing' | 'finished';
  turnStartedAt?: number;
  boneyard: null[];
  firstPlayMade: boolean;
  // Match scoring
  matchScores: Record<number, number>;  // { 1: pts, 2: pts }
  roundNumber: number;
  targetScore: number;                  // default 6
  matchWinnerTeam?: number;
}

export interface RoundBanner {
  roundNumber: number;
  winnerTeam: number | null;
  winType: WinType | null;
  points: number;
  matchScores: Record<number, number>;
  targetScore: number;
  matchOver: boolean;
  matchWinnerTeam: number | null;
}

interface GameStoreState {
  currentGame: GameState | null;
  queueStatus: 'idle' | 'queuing' | 'found';
  lastQueue: { mode: 'ARENA_1V1' | 'CUP_1V1' | 'TOURNAMENT_2V2' | 'RECREATIONAL_2V2'; betAmount: number } | null;
  selectedTile: { tile: Tile; handIndex: number } | null;
  roundBanner: RoundBanner | null;
  gameResult: {
    status?: 'FINISHED' | 'ABANDONED';
    mode?: string;
    betAmount?: number;
    winnerId?: string;
    winnerTeam?: number;
    matchScores?: Record<number, number>;
    prizePool: number;
    prizePerWinner: number;
  } | null;

  setGame: (game: GameState) => void;
  setQueueStatus: (status: 'idle' | 'queuing' | 'found') => void;
  setLastQueue: (q: GameStoreState['lastQueue']) => void;
  setSelectedTile: (tile: GameStoreState['selectedTile']) => void;
  setRoundBanner: (banner: RoundBanner | null) => void;
  setGameResult: (result: GameStoreState['gameResult']) => void;
  clearGame: () => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  currentGame: null,
  queueStatus: 'idle',
  lastQueue: null,
  selectedTile: null,
  roundBanner: null,
  gameResult: null,

  setGame: (game) => set({ currentGame: game }),
  setQueueStatus: (status) => set({ queueStatus: status }),
  setLastQueue: (q) => set({ lastQueue: q }),
  setSelectedTile: (tile) => set({ selectedTile: tile }),
  setRoundBanner: (banner) => set({ roundBanner: banner }),
  setGameResult: (result) => set({ gameResult: result }),
  clearGame: () => set({ currentGame: null, queueStatus: 'idle', selectedTile: null, gameResult: null, roundBanner: null }),
}));
