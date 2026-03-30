jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

const mockSetItem = jest.fn();
const mockGetItem = jest.fn();
const mockRemoveItem = jest.fn();
const mockMultiGet = jest.fn();
const mockMultiRemove = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: mockSetItem,
  getItem: mockGetItem,
  removeItem: mockRemoveItem,
  multiGet: mockMultiGet,
  multiRemove: mockMultiRemove,
}));

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();

jest.mock('../../services/api', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
    defaults: { baseURL: 'http://localhost:3002/api/v1' },
  },
}));

describe('auth.store', () => {
  beforeEach(() => {
    mockSetItem.mockReset();
    mockGetItem.mockReset();
    mockRemoveItem.mockReset();
    mockMultiGet.mockReset();
    mockMultiRemove.mockReset();
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    delete (global as any).window;
  });

  it('setTokens persiste no AsyncStorage', () => {
    const { useAuthStore } = require('../auth.store');
    useAuthStore.getState().setTokens('access123', 'refresh123');

    expect(mockSetItem).toHaveBeenCalledWith('access_token', 'access123');
    expect(mockSetItem).toHaveBeenCalledWith('refresh_token', 'refresh123');
    expect(useAuthStore.getState().accessToken).toBe('access123');
    expect(useAuthStore.getState().refreshToken).toBe('refresh123');
  });

  it('logout limpa tokens e usuário', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('fail'));

    const { useAuthStore } = require('../auth.store');
    useAuthStore.setState({ user: { id: 'u1', phone: '+55', cpf_verified: false, phone_verified: true } });
    useAuthStore.getState().setTokens('a', 'r');

    await useAuthStore.getState().logout();

    expect(mockMultiRemove).toHaveBeenCalledWith(['access_token', 'refresh_token', 'profile_avatar_uri']);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it('loadFromStorage carrega tokens e usuário quando /auth/me retorna OK', async () => {
    mockMultiGet.mockResolvedValueOnce([
      ['access_token', 'a1'],
      ['refresh_token', 'r1'],
    ]);
    mockGetItem.mockResolvedValueOnce(null);
    mockApiGet.mockResolvedValueOnce({ data: { id: 'u1', phone: '+5511', cpf_verified: true, phone_verified: true } });

    const { useAuthStore } = require('../auth.store');
    await useAuthStore.getState().loadFromStorage();

    expect(useAuthStore.getState().accessToken).toBe('a1');
    expect(useAuthStore.getState().refreshToken).toBe('r1');
    expect(useAuthStore.getState().user).toEqual({ id: 'u1', phone: '+5511', cpf_verified: true, phone_verified: true });
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
