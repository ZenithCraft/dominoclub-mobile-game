import React from 'react';

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

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 390,
    height: 844,
    scale: 1,
    fontScale: 1,
  }),
}));

const renderer = require('react-test-renderer');
const { act } = renderer;

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
    IconUser: Stub,
    IconGoogle: Stub,
    IconAppleLogo: Stub,
    IconEye: Stub,
    IconEyeOff: Stub,
  };
});

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPost.mockReset();
    mockSetTokens.mockReset();
    mockSetUser.mockReset();
    if ((global as any).location) delete (global as any).location;
    delete process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('mostra erro quando tenta entrar com e-mail', async () => {
    const { LoginScreen } = require('../LoginScreen');
    const { Button } = require('../../components/Button');

    const navigation: any = { navigate: jest.fn(), replace: jest.fn() };
    const tree = renderer.create(<LoginScreen navigation={navigation} />);

    const identifier = tree.root.findByProps({ placeholder: 'Email ou número de telefone' });
    act(() => identifier.props.onChangeText('teste@dominio.com'));

    const loginBtn = tree.root.findAllByType(Button).find((b: any) => b.props.title === 'Entrar');
    await act(async () => {
      await loginBtn.props.onPress();
    });

    const texts = tree.root.findAllByType(require('react-native').Text).map((n: any) => n.props.children).flat();
    expect(texts.join(' ')).toContain('Use seu número de telefone para entrar');
    expect(mockPost).not.toHaveBeenCalled();
    tree.unmount();
  });

  it('envia OTP e navega para verificação com telefone válido', async () => {
    mockPost.mockResolvedValueOnce({});

    const { LoginScreen } = require('../LoginScreen');
    const { Button } = require('../../components/Button');

    const navigation: any = { navigate: jest.fn(), replace: jest.fn() };
    const tree = renderer.create(<LoginScreen navigation={navigation} />);

    const identifier = tree.root.findByProps({ placeholder: 'Email ou número de telefone' });
    act(() => identifier.props.onChangeText('11999999999'));

    const loginBtn = tree.root.findAllByType(Button).find((b: any) => b.props.title === 'Entrar');
    await act(async () => {
      await loginBtn.props.onPress();
    });

    expect(mockPost).toHaveBeenCalledWith('/auth/otp/send', { phone: '+5511999999999' });
    expect(navigation.navigate).toHaveBeenCalledWith('OTPVerification', { phone: '+5511999999999' });
    tree.unmount();
  });
});
