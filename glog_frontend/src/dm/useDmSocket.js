import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useDmSocket({ onReceive, onSent, onReadAck }) {
  const socketRef = useRef(null);

  const onReceiveRef = useRef(onReceive);
  const onSentRef = useRef(onSent);
  const onReadAckRef = useRef(onReadAck);
  useEffect(() => { onReceiveRef.current = onReceive; }, [onReceive]);
  useEffect(() => { onSentRef.current = onSent; }, [onSent]);
  useEffect(() => { onReadAckRef.current = onReadAck; }, [onReadAck]);

  useEffect(() => {
    // accessToken이 세팅될 때까지 폴링 후 연결
    let cancelled = false;

    const connect = (token) => {
      const socket = io('http://localhost:4000', {
        auth: { token },
      });

      socket.on('connect', () => {
        console.log('[DM Socket] connected');
      });

      socket.on('dm:receive', (msg) => {
        onReceiveRef.current?.(msg);
      });

      socket.on('dm:sent', (msg) => {
        onSentRef.current?.(msg);
      });

      // 상대방이 메시지를 읽었을 때 수신
      socket.on('dm:read_ack', ({ room_id }) => {
        onReadAckRef.current?.(room_id);
      });

      socket.on('disconnect', () => {
        console.log('[DM Socket] disconnected');
      });

      socketRef.current = socket;
    };

    const tryConnect = () => {
      if (cancelled) return;
      const token = window.__accessToken;
      if (token) {
        connect(token);
      } else {
        // 토큰이 아직 없으면 200ms 후 재시도
        setTimeout(tryConnect, 200);
      }
    };

    tryConnect();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const sendMessage = useCallback((room_id, content, file_url, file_type) => {
    socketRef.current?.emit('dm:send', { room_id, content, file_url, file_type });
  }, []);

  const markRead = useCallback((room_id) => {
    socketRef.current?.emit('dm:read', { room_id });
  }, []);

  return { sendMessage, markRead };
}
