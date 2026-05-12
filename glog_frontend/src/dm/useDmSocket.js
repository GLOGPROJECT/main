import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// Socket.io 연결을 관리하는 훅
// onReceive: 상대방 메시지 수신 콜백 ({ room_id, ...message })
export function useDmSocket({ onReceive, onSent }) {
  const socketRef = useRef(null);

  useEffect(() => {
    const token = window.__accessToken;
    if (!token) return;

    const socket = io('http://localhost:4000', {
      auth: { token },
    });

    socket.on('connect', () => {
      console.log('[DM Socket] connected');
    });

    // 상대방이 보낸 메시지 수신
    socket.on('dm:receive', (msg) => {
      onReceive?.(msg);
    });

    // 내가 보낸 메시지 서버 저장 완료 확인
    socket.on('dm:sent', (msg) => {
      onSent?.(msg);
    });

    socket.on('disconnect', () => {
      console.log('[DM Socket] disconnected');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // 메시지 전송
  const sendMessage = useCallback((room_id, content) => {
    socketRef.current?.emit('dm:send', { room_id, content });
  }, []);

  // 읽음 처리
  const markRead = useCallback((room_id) => {
    socketRef.current?.emit('dm:read', { room_id });
  }, []);

  return { sendMessage, markRead };
}
