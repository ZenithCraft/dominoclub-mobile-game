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
}

interface GameStoreState {
  currentGame: GameState | null;
  queueStatus: 'idle' | 'queuing' | 'found';
  selectedTile: Tile | null;
  gameResult: {
    winnerId?: string;
    winnerTeam?: number;
    prizePool: number;
    prizePerWinner: number;
  } | null;

  setGame: (game: GameState) => void;
  setQueueStatus: (status: 'idle' | 'queuing' | 'found') => void;
  setSelectedTile: (tile: Tile | null) => void;
  setGameResult: (result: GameStoreState['gameResult']) => void;
  clearGame: () => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  currentGame: null,
  queueStatus: 'idle',
  selectedTile: null,
  gameResult: null,

  setGame: (game) => set({ currentGame: game }),
  setQueueStatus: (status) => set({ queueStatus: status }),
  setSelectedTile: (tile) => set({ selectedTile: tile }),
  setGameResult: (result) => set({ gameResult: result }),
  clearGame: () => set({ currentGame: null, queueStatus: 'idle', selectedTile: null, gameResult: null }),
}));
