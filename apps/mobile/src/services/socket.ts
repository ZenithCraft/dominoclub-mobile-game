import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3001';
const IS_MOCK    = process.env.EXPO_PUBLIC_MOCK_MODE === 'true';

let socket: Socket | null = null;

export async function connectSocket(): Promise<Socket> {
  if (IS_MOCK) {
    const { fakeSocket } = require('../mocks/fakeSocket');
    return fakeSocket as unknown as Socket;
  }

  if (socket?.connected) return socket;

  const token = await AsyncStorage.getItem('access_token');

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect',       () => console.log('Socket connected:', socket?.id));
  socket.on('disconnect',    (reason) => console.log('Socket disconnected:', reason));
  socket.on('connect_error', (err) => console.error('Socket error:', err.message));

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
