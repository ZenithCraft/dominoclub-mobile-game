import React from 'react';
import renderer, { act } from 'react-test-renderer';

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

jest.mock('../../components/Icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props: any) => <View accessibilityLabel={props.accessibilityLabel} />;
  return {
    IconLock: Stub,
  };
});

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    mockPost.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('mostra erro se o e-mail estiver vazio', async () => {
    const { ForgotPasswordScreen } = require('../ForgotPasswordScreen');
    const { Button } = require('../../components/Button');

    const navigation: any = { navigate: jest.fn() };
    const tree = renderer.create(<ForgotPasswordScreen navigation={navigation} />);

    const sendBtn = tree.root.findAllByType(Button).find((b: any) => b.props.title === 'Enviar')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    const texts = tree.root.findAllByType(require('react-native').Text).map((n: any) => n.props.children).flat();
    expect(texts.join(' ')).toContain('Digite seu e-mail');
    expect(mockPost).not.toHaveBeenCalled();
    tree.unmount();
  });

  it('envia solicitação e mostra confirmação', async () => {
    mockPost.mockResolvedValueOnce({});

    const { ForgotPasswordScreen } = require('../ForgotPasswordScreen');
    const { Button } = require('../../components/Button');

    const navigation: any = { navigate: jest.fn() };
    const tree = renderer.create(<ForgotPasswordScreen navigation={navigation} />);

    const emailInput = tree.root.findByProps({ placeholder: 'Insira seu e-mail' });
    act(() => emailInput.props.onChangeText('teste@dominio.com'));

    const sendBtn = tree.root.findAllByType(Button).find((b: any) => b.props.title === 'Enviar')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    expect(mockPost).toHaveBeenCalledWith('/auth/forgot-password', { email: 'teste@dominio.com' });
    const texts = tree.root.findAllByType(require('react-native').Text).map((n: any) => n.props.children).flat();
    const normalized = texts.join(' ').replace(/\s+/g, ' ').trim();
    expect(normalized).toContain('Enviamos um link de redefinição para teste@dominio.com');
    tree.unmount();
  });
});
