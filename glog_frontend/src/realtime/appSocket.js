import { io } from 'socket.io-client';
import { API_ORIGIN } from '../api/axios';

let socket = null;
let lastToken = null;

export function getAppSocket() {
  const token = typeof window !== 'undefined' ? window.__accessToken : null;
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    lastToken = null;
    return null;
  }

  if (socket && lastToken === token) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }
  lastToken = token;
  socket = io(API_ORIGIN, { auth: { token } });
  return socket;
}

