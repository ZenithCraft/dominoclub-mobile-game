import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock('react-native/Libraries/Animated/Animated', () => {
  const View = require('react-native/Libraries/Components/View/View');
  class Value {
    private _value: number;
    constructor(v: number) { this._value = v; }
    setValue(v: number) { this._value = v; }
    stopAnimation() {}
    interpolate() { return 0; }
  }
  const startable = { start: (cb?: any) => cb?.({ finished: true }) };
  return {
    __esModule: true,
    default: {
      Value,
      timing: () => startable,
      spring: () => startable,
      sequence: () => startable,
      loop: () => startable,
      delay: () => startable,
      View,
    },
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: any) => <View {...props}>{children}</View>,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
  };
});

const mockPost = jest.fn();

jest.mock('../../services/api', () => ({
  api: { post: mockPost, defaults: { baseURL: '' } },
}));

const mockSetTokens = jest.fn();
const mockSetUser = jest.fn();

jest.mock('../../store/auth.store', () => ({
  useAuthStore: () => ({ setTokens: mockSetTokens, setUser: mockSetUser }),
}));

jest.mock('../../components/Icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props: any) => <View accessibilityLabel={props.accessibilityLabel} />;
  return {
    IconSmartphone: Stub,
  };
});

describe('OTPVerificationScreen', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockSetTokens.mockReset();
    mockSetUser.mockReset();
  });

  afterEach(() => {
  });

  it('verifica OTP e entra no app para usuário existente', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        accessToken: 'a1',
        refreshToken: 'r1',
        user: { id: 'u1', name: 'Tester', isNewUser: false },
      },
    });

    const { OTPVerificationScreen } = require('../OTPVerificationScreen');
    const { Button } = require('../../components/Button');

    const navigation: any = { navigate: jest.fn(), replace: jest.fn() };
    const route: any = { params: { phone: '+5511999999999' } };
    const tree = renderer.create(<OTPVerificationScreen navigation={navigation} route={route} />);

    try {
      const inputs = tree.root.findAllByType(TextInput);
      await act(async () => {
        inputs[0].props.onChangeText('1');
        inputs[1].props.onChangeText('2');
        inputs[2].props.onChangeText('3');
        inputs[3].props.onChangeText('4');
        inputs[4].props.onChangeText('5');
        inputs[5].props.onChangeText('6');
      });

      const verifyBtn = tree.root.findAllByType(Button).find((b: any) => b.props.title === 'Verificar')!;
      await act(async () => {
        await verifyBtn.props.onPress();
      });

      expect(mockPost).toHaveBeenCalledWith('/auth/otp/verify', { phone: '+5511999999999', otp: '123456' });
      expect(mockSetTokens).toHaveBeenCalledWith('a1', 'r1');
      expect(mockSetUser).toHaveBeenCalledWith({ id: 'u1', name: 'Tester', isNewUser: false });
      expect(navigation.replace).toHaveBeenCalledWith('Main');
    } finally {
      tree.unmount();
    }
  });

  it('redireciona para cadastro quando é novo usuário', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        accessToken: 'a2',
        refreshToken: 'r2',
        user: { id: 'u2', isNewUser: true },
      },
    });

    const { OTPVerificationScreen } = require('../OTPVerificationScreen');
    const { Button } = require('../../components/Button');

    const navigation: any = { navigate: jest.fn(), replace: jest.fn() };
    const route: any = { params: { phone: '+5511888888888' } };
    const tree = renderer.create(<OTPVerificationScreen navigation={navigation} route={route} />);
    try {
      const inputs = tree.root.findAllByType(TextInput);
      await act(async () => {
        inputs[0].props.onChangeText('0');
        inputs[1].props.onChangeText('0');
        inputs[2].props.onChangeText('0');
        inputs[3].props.onChangeText('0');
        inputs[4].props.onChangeText('0');
        inputs[5].props.onChangeText('0');
      });

      const verifyBtn = tree.root.findAllByType(Button).find((b: any) => b.props.title === 'Verificar')!;
      await act(async () => {
        await verifyBtn.props.onPress();
      });

      expect(navigation.replace).toHaveBeenCalledWith('Register', { phone: '+5511888888888' });
    } finally {
      tree.unmount();
    }
  });
});
