import { Server as SocketServer } from 'socket.io';

// Holds the live Socket.IO server instance so plain Express route handlers
// (which never see `io` directly) can broadcast events — e.g. admin actions
// that should reach connected clients immediately.
let ioInstance: SocketServer | null = null;

export function setSocketServer(io: SocketServer) {
  ioInstance = io;
}

export function getSocketServer(): SocketServer | null {
  return ioInstance;
}
