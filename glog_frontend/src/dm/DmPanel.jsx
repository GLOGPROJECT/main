import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/axios';
import { useDmSocket } from './useDmSocket';

// 날짜 구분선 포맷 (예: "2024년 3월 20일")
function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 메시지 시각 포맷 (예: "오후 2:34")
function formatTime(dateStr) {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return h >= 12 ? `오후 ${h === 12 ? 12 : h - 12}:${m}` : `오전 ${h}:${m}`;
}

// 방 목록의 마지막 메시지 시각 (오늘이면 시각, 이전이면 날짜)
function formatRoomTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return formatTime(dateStr);
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 1) return '어제';
  if (diff < 7) return `${diff}일 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// directMode: true면 방 목록 없이 채팅창만 표시 (타유저 DM 진입 시)
export default function DmPanel({ isOpen, onClose, initialPartnerId }) {
  const directMode = !!initialPartnerId;
  const [rooms, setRooms] = useState([]);
  // directMode일 때는 방 로딩 중임을 표시하기 위해 초기값을 로딩 상태로 관리
  const [activeRoom, setActiveRoom] = useState(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const { sendMessage, markRead } = useDmSocket({
    onReceive: (msg) => {
      // 현재 열린 방이면 메시지 추가, 아니면 unread 카운트 증가
      setRooms((prev) => prev.map((r) =>
        r.id === msg.room_id
          ? { ...r, last_message: msg, unread_count: activeRoom?.id === msg.room_id ? 0 : r.unread_count + 1 }
          : r
      ));
      if (activeRoom?.id === msg.room_id) {
        setMessages((prev) => [...prev, msg]);
      }
    },
    onSent: (msg) => {
      // 낙관적 UI의 임시 메시지를 서버 저장 완료 메시지로 교체
      setMessages((prev) => {
        const idx = [...prev].reverse().findIndex((m) => m._pending);
        if (idx === -1) return [...prev, msg];
        const realIdx = prev.length - 1 - idx;
        const next = [...prev];
        next[realIdx] = msg;
        return next;
      });
      setRooms((prev) => prev.map((r) =>
        r.id === msg.room_id ? { ...r, last_message: msg } : r
      ));
    },
  });

  const fetchRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const { data } = await api.get('/dm/rooms');
      setRooms(data);
    } catch (err) {
      console.error('[DmPanel] fetchRooms', err);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchRooms();
  }, [isOpen]);

  // initialPartnerId가 있으면 패널 열자마자 방 생성 후 바로 채팅창 진입
  useEffect(() => {
    if (!isOpen || !initialPartnerId) return;
    setDirectLoading(true);
    setActiveRoom(null);
    setMessages([]);
    (async () => {
      try {
        const { data: room } = await api.post('/dm/rooms', { partner_id: initialPartnerId });
        const myId = window.__myUserId;
        const partner = room.user1_id === myId ? room.user2 : room.user1;
        const roomWithPartner = { ...room, partner };
        // openRoom 내부에서 메시지 로드 + markRead 처리
        setActiveRoom(roomWithPartner);
        const { data: msgs } = await api.get(`/dm/rooms/${room.id}/messages`);
        setMessages(msgs);
        markRead(room.id);
      } catch (err) {
        console.error('[DmPanel] initialPartner', err);
      } finally {
        setDirectLoading(false);
      }
    })();
  }, [isOpen, initialPartnerId]);

  const openRoom = useCallback(async (room) => {
    setActiveRoom(room);
    setMessages([]);
    setLoadingMsgs(true);
    inputRef.current?.focus();
    try {
      const { data } = await api.get(`/dm/rooms/${room.id}/messages`);
      setMessages(data);
      markRead(room.id);
      setRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, unread_count: 0 } : r));
    } catch (err) {
      console.error('[DmPanel] openRoom', err);
    } finally {
      setLoadingMsgs(false);
    }
  }, [markRead]);

  // 새 메시지 올 때 스크롤 맨 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !activeRoom) return;
    const pending = {
      _pending: true,
      id: `p_${Date.now()}`,
      room_id: activeRoom.id,
      sender_id: window.__myUserId,
      content: input.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, pending]);
    sendMessage(activeRoom.id, input.trim());
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 날짜 구분선 삽입을 위해 메시지 사이에 날짜 레이블 추가
  const messagesWithDividers = messages.reduce((acc, msg, i) => {
    const prev = messages[i - 1];
    const currDay = new Date(msg.created_at).toDateString();
    const prevDay = prev ? new Date(prev.created_at).toDateString() : null;
    if (currDay !== prevDay) {
      acc.push({ _divider: true, label: formatDateLabel(msg.created_at), key: `div_${i}` });
    }
    acc.push(msg);
    return acc;
  }, []);

  // 검색 필터
  const filteredRooms = rooms.filter((r) =>
    r.partner.nickname.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.container, width: directMode ? 520 : 780 }} onClick={(e) => e.stopPropagation()}>

        {/* ── 왼쪽: 채팅 방 목록 — 직접 DM 진입 시 숨김 ── */}
        <div style={{ ...s.sidebar, display: directMode ? 'none' : 'flex' }}>
          <div style={s.sidebarHeader}>
            <span style={s.sidebarTitle}>채팅</span>
            <button style={s.iconBtn} title="닫기" onClick={onClose}>✕</button>
          </div>

          {/* 사용자 검색 */}
          <div style={s.searchWrap}>
            <span style={s.searchIcon}>🔍</span>
            <input
              style={s.searchInput}
              placeholder="사용자 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* 방 목록 */}
          <div style={s.roomList}>
            {loadingRooms && <p style={s.hint}>불러오는 중...</p>}
            {!loadingRooms && filteredRooms.length === 0 && (
              <p style={s.hint}>대화가 없습니다.</p>
            )}
            {filteredRooms.map((room) => {
              const isActive = activeRoom?.id === room.id;
              return (
                <div
                  key={room.id}
                  style={{ ...s.roomItem, background: isActive ? 'rgba(78,154,241,0.12)' : 'transparent' }}
                  onClick={() => openRoom(room)}
                >
                  <div style={s.avatarWrap}>
                    <img src={room.partner.avatar_url || '/default-avatar.png'} alt="" style={s.roomAvatar} />
                    {/* 온라인 여부 표시 (추후 연동) */}
                  </div>
                  <div style={s.roomInfo}>
                    <div style={s.roomTopRow}>
                      <span style={s.roomName}>{room.partner.nickname}</span>
                      <span style={s.roomTime}>{formatRoomTime(room.last_message?.created_at)}</span>
                    </div>
                    <div style={s.roomBottomRow}>
                      <span style={s.roomLastMsg}>{room.last_message?.content ?? '대화를 시작해보세요'}</span>
                      {room.unread_count > 0 && (
                        <span style={s.badge}>{room.unread_count}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 오른쪽: 채팅창 ── */}
        <div style={s.chatArea}>
          {directLoading ? (
            <div style={s.emptyChat}>
              <p style={s.emptyChatText}>불러오는 중...</p>
            </div>
          ) : !activeRoom ? (
            <div style={s.emptyChat}>
              <p style={s.emptyChatText}>대화를 선택해주세요</p>
            </div>
          ) : (
            <>
              {/* 채팅창 헤더 */}
              <div style={s.chatHeader}>
                <img src={activeRoom.partner.avatar_url || '/default-avatar.png'} alt="" style={s.chatHeaderAvatar} />
                <div>
                  <div style={s.chatHeaderName}>{activeRoom.partner.nickname}</div>
                </div>
              </div>

              {/* 메시지 목록 */}
              <div style={s.msgList}>
                {loadingMsgs && <p style={s.hint}>불러오는 중...</p>}
                {messagesWithDividers.map((item) => {
                  // 날짜 구분선
                  if (item._divider) {
                    return (
                      <div key={item.key} style={s.dateDivider}>
                        <span style={s.dateDividerLine} />
                        <span style={s.dateDividerLabel}>{item.label}</span>
                        <span style={s.dateDividerLine} />
                      </div>
                    );
                  }
                  const isMine = item.sender_id === window.__myUserId;
                  return (
                    <div key={item.id} style={{ ...s.msgRow, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                      {!isMine && (
                        <img
                          src={item.sender?.avatar_url || activeRoom.partner.avatar_url || '/default-avatar.png'}
                          alt=""
                          style={s.msgAvatar}
                        />
                      )}
                      <div style={s.msgGroup}>
                        <div style={isMine ? s.bubbleMine : s.bubbleOther}>
                          {item.content}
                        </div>
                        <span style={{ ...s.msgTime, textAlign: isMine ? 'right' : 'left' }}>
                          {formatTime(item.created_at)}
                          {/* 전송 완료 체크 표시 */}
                          {isMine && !item._pending && ' ✓'}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* 입력창 */}
              <div style={s.inputRow}>
                <button style={s.attachBtn} title="파일 첨부 (준비 중)">📎</button>
                <input
                  ref={inputRef}
                  style={s.input}
                  placeholder="메시지를 입력하세요..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button style={s.emojiBtn} title="이모지 (준비 중)">🙂</button>
                <button
                  style={{ ...s.sendBtn, opacity: input.trim() ? 1 : 0.4 }}
                  onClick={handleSend}
                  disabled={!input.trim()}
                >
                  ➤
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    zIndex: 1200,
    background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  container: {
    width: 780,
    height: '78vh',
    background: '#ffffff',
    borderRadius: 16,
    display: 'flex',
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
  },

  // ── 왼쪽 사이드바 ──
  sidebar: {
    width: 260,
    borderRight: '1px solid #e5e7eb',
    display: 'flex', flexDirection: 'column',
    background: '#fff',
    flexShrink: 0,
  },
  sidebarHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 16px 10px',
  },
  sidebarTitle: {
    fontSize: '1.1rem', fontWeight: 700, color: '#111827',
  },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#9ca3af', fontSize: '0.95rem', padding: 4,
  },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
    margin: '0 12px 10px',
    background: '#f3f4f6', borderRadius: 8,
    padding: '6px 10px',
  },
  searchIcon: { fontSize: '0.8rem', color: '#9ca3af' },
  searchInput: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    fontSize: '0.85rem', color: '#374151',
  },
  roomList: { flex: 1, overflowY: 'auto' },
  roomItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', cursor: 'pointer',
    transition: 'background 0.12s',
  },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  roomAvatar: { width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' },
  roomInfo: { flex: 1, minWidth: 0 },
  roomTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  roomName: { fontWeight: 600, fontSize: '0.88rem', color: '#111827' },
  roomTime: { fontSize: '0.73rem', color: '#9ca3af', flexShrink: 0 },
  roomBottomRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  roomLastMsg: {
    fontSize: '0.78rem', color: '#6b7280',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140,
  },
  badge: {
    background: '#3b82f6', color: '#fff', borderRadius: '50%',
    minWidth: 18, height: 18, fontSize: '0.68rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    padding: '0 3px',
  },

  // ── 오른쪽 채팅창 ──
  chatArea: {
    flex: 1, display: 'flex', flexDirection: 'column', background: '#f9fafb',
  },
  emptyChat: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  emptyChatText: { color: '#9ca3af', fontSize: '0.9rem' },
  chatHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 20px',
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
    flexShrink: 0,
  },
  chatHeaderAvatar: { width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' },
  chatHeaderName: { fontWeight: 700, fontSize: '0.95rem', color: '#111827' },
  chatHeaderStatus: { fontSize: '0.75rem', color: '#22c55e', marginTop: 1 },
  msgList: {
    flex: 1, overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  dateDivider: {
    display: 'flex', alignItems: 'center', gap: 10,
    margin: '12px 0',
  },
  dateDividerLine: {
    flex: 1, height: 1, background: '#e5e7eb',
  },
  dateDividerLabel: {
    fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap',
  },
  msgRow: {
    display: 'flex', alignItems: 'flex-end', gap: 8,
    marginBottom: 2,
  },
  msgAvatar: { width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  msgGroup: { display: 'flex', flexDirection: 'column', maxWidth: '65%' },
  bubbleMine: {
    background: '#3b82f6', color: '#fff',
    padding: '9px 13px', borderRadius: '16px 16px 4px 16px',
    fontSize: '0.88rem', lineHeight: 1.45, wordBreak: 'break-word',
  },
  bubbleOther: {
    background: '#fff', color: '#111827',
    border: '1px solid #e5e7eb',
    padding: '9px 13px', borderRadius: '16px 16px 16px 4px',
    fontSize: '0.88rem', lineHeight: 1.45, wordBreak: 'break-word',
  },
  msgTime: {
    fontSize: '0.7rem', color: '#9ca3af', marginTop: 3,
  },
  hint: { color: '#9ca3af', textAlign: 'center', fontSize: '0.85rem', marginTop: 32 },
  inputRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 16px',
    background: '#fff',
    borderTop: '1px solid #e5e7eb',
    flexShrink: 0,
  },
  attachBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '1.1rem', padding: '0 2px', color: '#9ca3af',
  },
  input: {
    flex: 1, border: '1px solid #e5e7eb', borderRadius: 10,
    padding: '9px 13px', fontSize: '0.88rem', outline: 'none',
    background: '#f9fafb', color: '#111827',
  },
  emojiBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '1.1rem', padding: '0 2px', color: '#9ca3af',
  },
  sendBtn: {
    width: 38, height: 38,
    background: '#3b82f6', color: '#fff', border: 'none',
    borderRadius: '50%', fontSize: '1rem',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
};
