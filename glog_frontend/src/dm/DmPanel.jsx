import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../auth/hooks/useAuth';

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return h >= 12 ? `오후 ${h === 12 ? 12 : h - 12}:${m}` : `오전 ${h}:${m}`;
}

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

export default function DmPanel({ isOpen, onClose, initialPartnerId, sendMessage, markRead, registerReceive, registerSent, registerReadAck }) {
  const directMode = !!initialPartnerId;
  const { user: me } = useAuth();
  const myUserId = me?.user_id;

  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [search, setSearch] = useState('');
  const [minimized, setMinimized] = useState(false);
  // 최소화 상태에서 방 목록 드롭다운 열림 여부
  const [miniDropdown, setMiniDropdown] = useState(false);
  // 드래그 위치 (null이면 기본 중앙)
  const [pos, setPos] = useState(null);
  // 최소화 창 드래그 위치 (null이면 기본 왼쪽 하단)
  const [miniPos, setMiniPos] = useState(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);
  const miniPanelRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const miniInputRef = useRef(null);
  const fileInputRef = useRef(null); // 파일 선택 input
  const activeRoomRef = useRef(null);
  const [uploading, setUploading] = useState(false); // 파일 업로드 중 여부

  // ── 소켓 핸들러 ──
  const handleSocketReceive = useCallback((msg) => {
    const currentRoom = activeRoomRef.current;
    if (currentRoom?.id === msg.room_id) {
      setMessages((prev) => [...prev, msg]);
    } else {
      api.get('/dm/rooms').then(({ data }) => setRooms(data)).catch(() => {});
    }
  }, []);

  const handleSocketSent = useCallback((msg) => {
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
  }, []);

  const handleReadAck = useCallback((room_id) => {
    setMessages((prev) => prev.map((m) =>
      m.room_id === room_id ? { ...m, status: 'read' } : m
    ));
  }, []);

  // isOpen이 false가 되면 핸들러 즉시 해제 → hasNewDm 빨간 점 동작
  useEffect(() => {
    if (isOpen) {
      registerReceive?.(handleSocketReceive);
      registerSent?.(handleSocketSent);
      registerReadAck?.(handleReadAck);
    } else {
      registerReceive?.(null);
      registerSent?.(null);
      registerReadAck?.(null);
    }
  }, [isOpen, handleSocketReceive, handleSocketSent, handleReadAck]);

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

  useEffect(() => {
    if (!isOpen || !initialPartnerId) return;
    setDirectLoading(true);
    setActiveRoom(null);
    activeRoomRef.current = null;
    setMessages([]);
    (async () => {
      try {
        const { data: room } = await api.post('/dm/rooms', { partner_id: initialPartnerId });
        const partner = room.user1_id === myUserId ? room.user2 : room.user1;
        const roomWithPartner = { ...room, partner };
        setActiveRoom(roomWithPartner);
        activeRoomRef.current = roomWithPartner;
        const { data: msgs } = await api.get(`/dm/rooms/${room.id}/messages`);
        setMessages(msgs);
        markRead(room.id);
      } catch (err) {
        console.error('[DmPanel] initialPartner 실패:', err.response?.data ?? err.message);
      } finally {
        setDirectLoading(false);
      }
    })();
  }, [isOpen, initialPartnerId]);

  const openRoom = useCallback(async (room) => {
    setActiveRoom(room);
    activeRoomRef.current = room;
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !activeRoom) return;
    const pending = {
      _pending: true,
      id: `p_${Date.now()}`,
      room_id: activeRoom.id,
      sender_id: myUserId,
      content: input.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, pending]);
    sendMessage(activeRoom.id, input.trim());
    setInput('');
    // 최소화 상태면 miniInputRef, 아니면 일반 inputRef에 포커스
    (minimized ? miniInputRef : inputRef).current?.focus();
  };

  // 파일 선택 후 업로드 → 소켓으로 전송
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeRoom) return;
    e.target.value = ''; // 같은 파일 재선택 허용

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/dm/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // 낙관적 UI — 서버 확인 전 먼저 표시
      const pending = {
        _pending: true,
        id: `p_${Date.now()}`,
        room_id: activeRoom.id,
        sender_id: myUserId,
        content: null,
        file_url: data.file_url,
        file_type: data.file_type,
        original_name: data.original_name,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, pending]);

      // 소켓으로 파일 메시지 전송 (sendMessage 확장 — file_url, file_type 포함)
      sendMessage(activeRoom.id, '', data.file_url, data.file_type);
    } catch {
      alert('파일 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
    }
  };

  const handleKeyUp = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      handleSend();
    }
  };

  // ── 드래그 ──
  // 최소화 여부에 따라 큰 창 pos 또는 미니 창 miniPos를 업데이트
  const miniDragging = useRef(false);

  const onMouseDown = (e) => {
    if (minimized) return;
    dragging.current = true;
    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  };

  const onMiniMouseDown = (e) => {
    miniDragging.current = true;
    const rect = miniPanelRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (dragging.current) {
        setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
      }
      if (miniDragging.current) {
        setMiniPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
      }
    };
    const onMouseUp = () => {
      dragging.current = false;
      miniDragging.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

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

  const filteredRooms = rooms.filter((r) =>
    r.partner.nickname.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  // 패널 위치 스타일
  const posStyle = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, transform: 'none' }
    : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -44%)' };

  // 최소화 창 위치 스타일 — miniPos가 있으면 드래그 위치, 없으면 기본 왼쪽 하단
  const miniPosStyle = miniPos
    ? { position: 'fixed', left: miniPos.x, top: miniPos.y, bottom: 'auto' }
    : { position: 'fixed', bottom: 24, left: 24 };

  // ── 최소화 상태 — 왼쪽 하단 작은 채팅창 ──
  if (minimized) {
    return (
      <div ref={miniPanelRef} style={{ ...s.miniPanel, ...miniPosStyle }}>
        {/* 헤더 — 드래그 가능, 닉네임 클릭 시 방 목록 드롭다운 */}
        <div style={{ ...s.miniHeader, cursor: 'grab' }} onMouseDown={onMiniMouseDown}>
          {activeRoom && <img src={activeRoom.partner.avatar_url || '/default-avatar.png'} alt="" style={s.miniAvatar} />}
          <button
            style={s.miniTitleBtn}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setMiniDropdown((v) => !v)}
            title="대화 상대 변경"
          >
            {activeRoom ? activeRoom.partner.nickname : '메시지'} {miniDropdown ? '▲' : '▼'}
          </button>
          <button style={s.miniBtn} onMouseDown={(e) => e.stopPropagation()} onClick={() => setMinimized(false)} title="원래 크기로">⤢</button>
          <button style={s.miniBtn} onMouseDown={(e) => e.stopPropagation()} onClick={onClose} title="닫기">✕</button>
        </div>

        {/* 드롭다운 방 목록 */}
        {miniDropdown && (
          <div style={s.miniDropdown}>
            {rooms.length === 0 && <p style={s.miniDropdownEmpty}>대화가 없습니다</p>}
            {rooms.map((room) => (
              <div
                key={room.id}
                style={{ ...s.miniDropdownItem, background: activeRoom?.id === room.id ? '#eff6ff' : '#fff' }}
                onClick={() => { openRoom(room); setMiniDropdown(false); }}
              >
                <img src={room.partner.avatar_url || '/default-avatar.png'} alt="" style={s.miniDropdownAvatar} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.miniDropdownName}>{room.partner.nickname}</div>
                  <div style={s.miniDropdownMsg}>{room.last_message?.content ?? ''}</div>
                </div>
                {room.unread_count > 0 && <span style={s.badge}>{room.unread_count}</span>}
              </div>
            ))}
          </div>
        )}

        {/* 메시지 목록 (작게) */}
        <div style={s.miniMsgList}>
          {!activeRoom ? (
            <p style={{ color: '#9ca3af', fontSize: '0.78rem', textAlign: 'center', marginTop: 16 }}>
              대화를 선택해주세요
            </p>
          ) : messages.slice(-20).map((item) => {
            if (item._divider) return null;
            const isMine = item.sender_id === myUserId;
            return (
              <div key={item.id} style={{ ...s.miniMsgRow, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                  <div style={isMine ? s.miniBubbleMine : s.miniBubbleOther}>
                    {item.file_url && item.file_type === 'image' && (
                      <img
                        src={`${item.file_url}`}
                        alt="첨부 이미지"
                        style={{ maxWidth: 160, maxHeight: 160, borderRadius: 6, display: 'block', cursor: 'pointer' }}
                        onClick={() => window.open(`${item.file_url}`, '_blank')}
                      />
                    )}
                    {item.file_url && item.file_type === 'file' && (
                      <a
                        href={`${item.file_url}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: isMine ? '#fff' : '#2563eb', fontSize: '0.72rem', wordBreak: 'break-all' }}
                      >
                        📄 {item.original_name || '첨부파일'}
                      </a>
                    )}
                    {item.content}
                  </div>
                  {/* 내가 보낸 메시지에만 읽음 표시 */}
                  {isMine && (
                    <span style={{ fontSize: '0.62rem', color: item.status === 'read' ? '#3b82f6' : '#9ca3af', marginTop: 1 }}>
                      {item.status === 'read' ? '읽음' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* 입력창 — activeRoom 없으면 비활성화 */}
        <div style={s.miniInputRow}>
          <input
            ref={miniInputRef}
            style={{ ...s.miniInput, opacity: activeRoom ? 1 : 0.4 }}
            placeholder={activeRoom ? `${activeRoom.partner.nickname}에게 메시지...` : '대화를 먼저 선택하세요'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            disabled={!activeRoom}
          />
          <button
            style={{ ...s.sendBtn, width: 30, height: 30, fontSize: '0.8rem', opacity: input.trim() && activeRoom ? 1 : 0.4 }}
            onClick={handleSend}
            disabled={!input.trim() || !activeRoom}
          ><img src="/paperplane-svgrepo-com.svg" alt="전송" style={{ width: 24, height: 24, filter: 'brightness(0) invert(1)' }} /></button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...posStyle, zIndex: 1200 }} onClick={(e) => e.stopPropagation()}>
      <div ref={panelRef} style={{ ...s.container, width: directMode ? 520 : 780 }}>

        {/* ── 왼쪽: 방 목록 ── */}
        <div style={{ ...s.sidebar, display: directMode ? 'none' : 'flex' }}>
          <div style={{ ...s.sidebarHeader, cursor: 'grab' }} onMouseDown={onMouseDown}>
            <span style={s.sidebarTitle}>채팅</span>
            <button style={s.iconBtn} onClick={() => setMinimized(true)} title="최소화">−</button>
            <button style={s.iconBtn} onClick={onClose} title="닫기">✕</button>
          </div>

          <div style={s.searchWrap}>
            <span style={s.searchIcon}>🔍</span>
            <input
              style={s.searchInput}
              placeholder="사용자 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

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
          {/* 채팅창 헤더 — 드래그 가능 */}
          <div style={{ ...s.chatHeader, cursor: 'grab' }} onMouseDown={onMouseDown}>
            {activeRoom && (
              <>
                <img src={activeRoom.partner.avatar_url || '/default-avatar.png'} alt="" style={s.chatHeaderAvatar} />
                <div style={s.chatHeaderName}>{activeRoom.partner.nickname}</div>
              </>
            )}
            {!activeRoom && <div style={s.chatHeaderName}>메시지</div>}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button style={s.iconBtn} onClick={() => setMinimized(true)} title="최소화">−</button>
              <button style={s.iconBtn} onClick={onClose} title="닫기">✕</button>
            </div>
          </div>

          {directLoading ? (
            <div style={s.emptyChat}><p style={s.emptyChatText}>불러오는 중...</p></div>
          ) : !activeRoom ? (
            <div style={s.emptyChat}><p style={s.emptyChatText}>대화를 선택해주세요</p></div>
          ) : (
            <>
              <div style={s.msgList}>
                {loadingMsgs && <p style={s.hint}>불러오는 중...</p>}
                {messagesWithDividers.map((item) => {
                  if (item._divider) {
                    return (
                      <div key={item.key} style={s.dateDivider}>
                        <span style={s.dateDividerLine} />
                        <span style={s.dateDividerLabel}>{item.label}</span>
                        <span style={s.dateDividerLine} />
                      </div>
                    );
                  }
                  const isMine = item.sender_id === myUserId;
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
                          {/* 이미지 파일 */}
                          {item.file_url && item.file_type === 'image' && (
                            <img
                              src={`${item.file_url}`}
                              alt="첨부 이미지"
                              style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, display: 'block', cursor: 'pointer' }}
                              onClick={() => window.open(`${item.file_url}`, '_blank')}
                            />
                          )}
                          {/* 일반 파일 */}
                          {item.file_url && item.file_type === 'file' && (
                            <a
                              href={`${item.file_url}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: isMine ? '#fff' : '#2563eb', fontSize: '0.82rem', wordBreak: 'break-all' }}
                            >
                              📄 {item.original_name || '첨부파일'}
                            </a>
                          )}
                          {item.content}
                        </div>
                        <span style={{ ...s.msgTime, textAlign: isMine ? 'right' : 'left' }}>
                          {formatTime(item.created_at)}
                          {isMine && !item._pending && (
                            item.status === 'read'
                              ? <span style={{ color: '#3b82f6', marginLeft: 3 }}>읽음</span>
                              : <span style={{ marginLeft: 3 }}>✓</span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div style={s.inputRow}>
                {/* 숨겨진 파일 input — 클립 버튼 클릭 시 트리거 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  accept="image/*,.pdf,.zip,.doc,.docx,.txt"
                  onChange={handleFileChange}
                />
                <button
                  style={{ ...s.attachBtn, opacity: uploading ? 0.4 : 1 }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || !activeRoom}
                  title="파일 첨부"
                >📎</button>
                <input
                  ref={inputRef}
                  style={s.input}
                  placeholder="메시지를 입력하세요..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                />
<button
                  style={{ ...s.sendBtn, opacity: input.trim() ? 1 : 0.4 }}
                  onClick={handleSend}
                  disabled={!input.trim()}
                >
                  <img src="/paperplane-svgrepo-com.svg" alt="전송" style={{ width: 24, height: 24, filter: 'brightness(0) invert(1)' }} />
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
  container: {
    height: '78vh',
    background: '#ffffff',
    borderRadius: 16,
    display: 'flex',
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
    userSelect: 'none',
  },
  miniPanel: {
    width: 280,
    height: 360,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
    zIndex: 1200,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  miniHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px',
    background: '#1e3a5f',
    flexShrink: 0,
  },
  miniAvatar: { width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  miniTitleBtn: {
    flex: 1, background: 'none', border: 'none',
    color: 'white', fontWeight: 600, fontSize: '0.82rem',
    textAlign: 'left', cursor: 'pointer',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    padding: 0,
  },
  miniBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.85rem', padding: '0 2px' },
  miniDropdown: {
    position: 'absolute',
    top: 40, left: 0, right: 0,
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    zIndex: 10,
    maxHeight: 200,
    overflowY: 'auto',
  },
  miniDropdownEmpty: { color: '#9ca3af', fontSize: '0.78rem', textAlign: 'center', padding: '12px 0' },
  miniDropdownItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
  },
  miniDropdownAvatar: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  miniDropdownName: { fontSize: '0.8rem', fontWeight: 600, color: '#111827' },
  miniDropdownMsg: { fontSize: '0.72rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  miniMsgList: {
    flex: 1, overflowY: 'auto',
    padding: '8px 10px',
    display: 'flex', flexDirection: 'column', gap: 4,
    background: '#f9fafb',
  },
  miniMsgRow: { display: 'flex' },
  miniBubbleMine: {
    background: '#3b82f6', color: '#fff',
    padding: '5px 9px', borderRadius: '12px 12px 2px 12px',
    fontSize: '0.78rem', lineHeight: 1.4, wordBreak: 'break-word', maxWidth: '80%',
  },
  miniBubbleOther: {
    background: '#fff', color: '#111827',
    border: '1px solid #e5e7eb',
    padding: '5px 9px', borderRadius: '12px 12px 12px 2px',
    fontSize: '0.78rem', lineHeight: 1.4, wordBreak: 'break-word', maxWidth: '80%',
  },
  miniInputRow: {
    display: 'flex', gap: 6,
    padding: '6px 8px',
    borderTop: '1px solid #e5e7eb',
    background: '#fff',
    flexShrink: 0,
  },
  miniInput: {
    flex: 1, border: '1px solid #e5e7eb', borderRadius: 8,
    padding: '5px 9px', fontSize: '0.78rem', outline: 'none',
    background: '#f9fafb', color: '#111827',
  },

  sidebar: {
    width: 260,
    borderRight: '1px solid #e5e7eb',
    flexDirection: 'column',
    background: '#fff',
    flexShrink: 0,
  },
  sidebarHeader: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '14px 14px 10px',
    borderBottom: '1px solid #f0f0f0',
  },
  sidebarTitle: { flex: 1, fontSize: '1rem', fontWeight: 700, color: '#111827' },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#9ca3af', fontSize: '1rem', padding: '2px 4px',
  },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
    margin: '8px 12px',
    background: '#f3f4f6', borderRadius: 8,
    padding: '6px 10px',
  },
  searchIcon: { fontSize: '0.8rem', color: '#9ca3af' },
  searchInput: { flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem', color: '#374151' },
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
  roomLastMsg: { fontSize: '0.78rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 },
  badge: {
    background: '#3b82f6', color: '#fff', borderRadius: '50%',
    minWidth: 18, height: 18, fontSize: '0.68rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '0 3px',
  },

  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', background: '#f9fafb' },
  chatHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px',
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
    flexShrink: 0,
  },
  chatHeaderAvatar: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' },
  chatHeaderName: { fontWeight: 700, fontSize: '0.95rem', color: '#111827' },
  emptyChat: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  emptyChatText: { color: '#9ca3af', fontSize: '0.9rem' },
  msgList: {
    flex: 1, overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  dateDivider: { display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' },
  dateDividerLine: { flex: 1, height: 1, background: '#e5e7eb' },
  dateDividerLabel: { fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap' },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 2 },
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
  msgTime: { fontSize: '0.7rem', color: '#9ca3af', marginTop: 3 },
  hint: { color: '#9ca3af', textAlign: 'center', fontSize: '0.85rem', marginTop: 32 },
  inputRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 16px',
    background: '#fff',
    borderTop: '1px solid #e5e7eb',
    flexShrink: 0,
  },
  attachBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0 2px', color: '#9ca3af' },
  input: {
    flex: 1, border: '1px solid #e5e7eb', borderRadius: 10,
    padding: '9px 13px', fontSize: '0.88rem', outline: 'none',
    background: '#f9fafb', color: '#111827',
  },
  emojiBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0 2px', color: '#9ca3af' },
  sendBtn: {
    width: 38, height: 38,
    background: '#3b82f6', color: '#fff', border: 'none',
    borderRadius: '50%', fontSize: '1rem',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
};
