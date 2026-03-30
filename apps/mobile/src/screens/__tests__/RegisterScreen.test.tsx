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
const mockPut = jest.fn();

jest.mock('../../services/api', () => ({
  api: { post: mockPost, put: mockPut, defaults: { baseURL: '' } },
}));

const mockRefreshUser = jest.fn();

jest.mock('../../store/auth.store', () => ({
  useAuthStore: () => ({ refreshUser: mockRefreshUser }),
}));

jest.mock('../../components/Icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props: any) => <View accessibilityLabel={props.accessibilityLabel} />;
  return {
    IconUser: Stub,
    IconCheck: Stub,
    IconGoogle: Stub,
    IconAppleLogo: Stub,
    IconEye: Stub,
    IconEyeOff: Stub,
  };
});

function findTouchableByText(tree: any, text: string) {
  const { TouchableOpacity, Text } = require('react-native');
  const touchables = tree.root.findAllByType(TouchableOpacity);
  for (const t of touchables) {
    const texts = t.findAllByType(Text).map((n: any) => n.props.children).flat();
    if (texts.join(' ').includes(text)) return t;
  }
  throw new Error(`TouchableOpacity com texto "${text}" não encontrado`);
}

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPost.mockReset();
    mockPut.mockReset();
    mockRefreshUser.mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('valida nome mínimo antes de enviar', async () => {
    const { RegisterScreen } = require('../RegisterScreen');
    const { Button } = require('../../components/Button');

    const navigation: any = { navigate: jest.fn(), replace: jest.fn() };
    const route: any = { params: {} };
    const tree = renderer.create(<RegisterScreen navigation={navigation} route={route} />);

    const nameInput = tree.root.findByProps({ placeholder: 'Nome completo' });
    act(() => nameInput.props.onChangeText('Jo'));

    const submitBtn = tree.root.findAllByType(Button).find((b: any) => b.props.title === 'Criar Conta');
    await act(async () => {
      await submitBtn.props.onPress();
    });

    const texts = tree.root.findAllByType(require('react-native').Text).map((n: any) => n.props.children).flat();
    expect(texts.join(' ')).toContain('Nome deve ter ao menos 3 caracteres');
    expect(mockPut).not.toHaveBeenCalled();
    tree.unmount();
  });

  it('verifica CPF válido e mostra status verificado', async () => {
    mockPost.mockResolvedValueOnce({});

    const { RegisterScreen } = require('../RegisterScreen');
    const navigation: any = { navigate: jest.fn(), replace: jest.fn() };
    const route: any = { params: {} };
    const tree = renderer.create(<RegisterScreen navigation={navigation} route={route} />);

    const cpfInput = tree.root.findByProps({ placeholder: 'CPF' });
    act(() => cpfInput.props.onChangeText('52998224725'));

    const verifyBtn = findTouchableByText(tree, 'Verificar');
    await act(async () => {
      await verifyBtn.props.onPress();
    });

    expect(mockPost).toHaveBeenCalledWith('/auth/cpf/verify', { cpf: '52998224725' });
    expect(tree.root.findByProps({ accessibilityLabel: 'CPF Verificado' })).toBeTruthy();
    tree.unmount();
  });

  it('salva perfil e entra no app', async () => {
    mockPut.mockResolvedValueOnce({});
    mockRefreshUser.mockResolvedValueOnce(undefined);

    const { RegisterScreen } = require('../RegisterScreen');
    const { Button } = require('../../components/Button');

    const navigation: any = { navigate: jest.fn(), replace: jest.fn() };
    const route: any = { params: {} };
    const tree = renderer.create(<RegisterScreen navigation={navigation} route={route} />);

    const nameInput = tree.root.findByProps({ placeholder: 'Nome completo' });
    act(() => nameInput.props.onChangeText('João da Silva'));

    const submitBtn = tree.root.findAllByType(Button).find((b: any) => b.props.title === 'Criar Conta');
    await act(async () => {
      await submitBtn.props.onPress();
    });

    expect(mockPut).toHaveBeenCalledWith('/auth/profile', { name: 'João da Silva' });
    expect(mockRefreshUser).toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('Main');
    tree.unmount();
  });
});
