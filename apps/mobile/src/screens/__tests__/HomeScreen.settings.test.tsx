import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: any) => <View {...props}>{children}</View>,
  };
});

jest.mock('../../store/auth.store', () => ({
  useAuthStore: () => ({ user: { name: 'Md Maya', wallet: { real_balance: 1234 } } }),
}));

jest.mock('../../services/socket', () => ({
  connectSocket: async () => ({ on: jest.fn() }),
}));

jest.mock('../../components/ConsentModal', () => ({
  ConsentModal: () => null,
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => JSON.stringify({ acceptedAt: '2024-01-01', ageConfirmed: true, termsAccepted: true }), setItem: async () => {}, removeItem: async () => {} },
}));

describe('HomeScreen settings modal', () => {
  it('does not close when toggling switches', () => {
    const { HomeScreen } = require('../HomeScreen');
    const navigation: any = { navigate: jest.fn(), replace: jest.fn() };
    const tree = renderer.create(<HomeScreen navigation={navigation} />);

    const settingsBtn = tree.root.findByProps({ testID: 'topbar-settings' });
    act(() => settingsBtn.props.onPress());
    expect(tree.root.findByProps({ testID: 'settings-card' })).toBeTruthy();

    const soundToggle = tree.root.findByProps({ testID: 'settings-sound-toggle' });
    act(() => soundToggle.props.onPress());
    expect(tree.root.findByProps({ testID: 'settings-card' })).toBeTruthy();

    const musicToggle = tree.root.findByProps({ testID: 'settings-music-toggle' });
    act(() => musicToggle.props.onPress());
    expect(tree.root.findByProps({ testID: 'settings-card' })).toBeTruthy();
  });
});
