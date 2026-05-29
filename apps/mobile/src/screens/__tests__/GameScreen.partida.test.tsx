import React from 'react';
import renderer from 'react-test-renderer';

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: any) => <View {...props}>{children}</View>,
  };
});

let mockAuthState: any = { user: { id: 'u1', name: 'Tester' } };
let mockGameState: any = {
  currentGame: null,
  selectedTile: null,
  setGame: jest.fn(),
  setSelectedTile: jest.fn(),
  setGameResult: jest.fn(),
  clearGame: jest.fn(),
};

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('../../components/Icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = () => <View />;
  return {
    IconTrophy: Stub,
    IconDices: Stub,
    IconSettings: Stub,
    IconAlert: Stub,
    IconX: Stub,
    IconFrown: Stub,
    IconVolumeUp: Stub,
    IconMusic: Stub,
  };
});

jest.mock('../../services/socket', () => ({
  connectSocket: async () => ({
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

jest.mock('../../store/auth.store', () => ({
  useAuthStore: () => mockAuthState,
}));

jest.mock('../../store/game.store', () => ({
  useGameStore: Object.assign(
    () => mockGameState,
    { getState: () => mockGameState }
  ),
}));

describe('GameScreen (partida)', () => {
  it('mostra estado de loading quando não há currentGame', () => {
    mockAuthState = { user: { id: 'u1', name: 'Tester' } };
    mockGameState = {
      currentGame: null,
      selectedTile: null,
      setGame: jest.fn(),
      setSelectedTile: jest.fn(),
      setGameResult: jest.fn(),
      clearGame: jest.fn(),
    };

    const { GameScreen } = require('../GameScreen');
    const navigation: any = { replace: jest.fn(), navigate: jest.fn() };
    const route: any = { params: { gameId: 'g1' } };

    const tree = renderer.create(<GameScreen navigation={navigation} route={route} />);
    const texts = tree.root.findAllByType(require('react-native').Text).map((n: any) => n.props.children).flat();

    expect(texts.join(' ')).toContain('Entrando na partida');
  });

  it('renderiza elementos principais da tela quando há gameState', () => {
    mockAuthState = { user: { id: 'u1', name: 'Tester' } };
    mockGameState = {
      currentGame: {
        id: 'g1',
        mode: 'ARENA_1V1',
        variant: 'CARROCA',
        players: [
          { userId: 'u1', team: 1, seat: 0, hand: [[6, 6], [6, 5], [1, 0]], isBot: false, connected: true },
          { userId: 'u2', team: 2, seat: 1, hand: [[2, 2], [3, 4], [5, 0]], isBot: false, connected: true },
        ],
        board: [],
        leftOpen: 6,
        rightOpen: 6,
        currentPlayerIndex: 0,
        turnCount: 1,
        status: 'playing',
        boneyard: Array.from({ length: 14 }).fill(null),
        firstPlayMade: false,
      },
      selectedTile: null,
      setGame: jest.fn(),
      setSelectedTile: jest.fn(),
      setGameResult: jest.fn(),
      clearGame: jest.fn(),
    };

    const { GameScreen } = require('../GameScreen');
    const navigation: any = { replace: jest.fn(), navigate: jest.fn() };
    const route: any = { params: { gameId: 'g1' } };

    const tree = renderer.create(<GameScreen navigation={navigation} route={route} />);
    const texts = tree.root.findAllByType(require('react-native').Text).map((n: any) => n.props.children).flat();
    const joined = texts.join(' ');

    expect(joined).toContain('Tester');
  });
});
