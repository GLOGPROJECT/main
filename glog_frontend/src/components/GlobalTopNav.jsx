import { useState, useRef, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/hooks/useAuth';
import DmPanel from '../dm/DmPanel';
import { useDmSocket } from '../dm/useDmSocket';
import { useTrophyModal } from '../feed/trophy/TrophyModalContext';
import './GlobalTopNav.css';

const BACKEND_URL = 'http://localhost:4000';

/** `/`, `/globe`, `/feed` 등에서 동일한 상단 메뉴 */
export default function GlobalTopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isLoggedIn = Boolean(user);
  const [dmOpen, setDmOpen] = useState(false);
  // 패널이 닫혀있을 때 새 DM 수신 여부 → DM 버튼 빨간 점 표시
  const [hasNewDm, setHasNewDm] = useState(false);

  // DmPanel 내부 핸들러 ref — 패널이 열릴 때 등록됨
  const dmReceiveHandlerRef = useRef(null);
  const dmSentHandlerRef = useRef(null);
  const dmReadAckHandlerRef = useRef(null);

  // GlobalTopNav 전용 소켓 — /globe 외의 페이지에서 DM 실시간 수신 담당
  // /globe 에서는 EarthCommunity.jsx가 독립 소켓으로 담당하므로 중복이지만 이벤트 충돌 없음
  const { sendMessage, markRead } = useDmSocket({
    onReceive: useCallback((msg) => {
      // DmPanel이 열려있으면 패널 핸들러로 포워딩, 닫혀있으면 빨간 점만 표시
      if (dmReceiveHandlerRef.current) {
        dmReceiveHandlerRef.current(msg);
      } else {
        setHasNewDm(true);
      }
    }, []),
    onSent: useCallback((msg) => { dmSentHandlerRef.current?.(msg); }, []),
    onReadAck: useCallback((room_id) => { dmReadAckHandlerRef.current?.(room_id); }, []),
  });

  // DmPanel에서 내부 핸들러를 등록/해제하는 함수
  const registerReceive = useCallback((fn) => { dmReceiveHandlerRef.current = fn; }, []);
  const registerSent = useCallback((fn) => { dmSentHandlerRef.current = fn; }, []);
  const registerReadAck = useCallback((fn) => { dmReadAckHandlerRef.current = fn; }, []);

  // 소켓에서 내 userId를 구분하기 위해 전역에 설정
  if (user) window.__myUserId = user.user_id;
  const homeTo = isLoggedIn ? '/globe' : '/';

  const githubLogin = () => {
    window.location.href = `${BACKEND_URL}/api/auth/github`;
  };

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const handleOpenDm = () => {
    setDmOpen(true);
    setHasNewDm(false); // 패널 열면 빨간 점 제거
  };

  return (
    <header className="gtn-bar">
      <div className="gtn-brand">
        <NavLink to={homeTo} className="gtn-logo-link">
          GLog 🌍
        </NavLink>
      </div>
      <nav className="gtn-nav" aria-label="주 메뉴">
        <NavLink
          to={isLoggedIn ? '/globe' : '/'}
          state={isLoggedIn ? { openMyProfile: true } : undefined}
          className="gtn-link"
        >
          프로필
        </NavLink>
        <NavLink
          to="/feed"
          state={{ feedRouteEnter: true }}
          className={({ isActive }) =>
            `gtn-link${isActive || pathname.startsWith('/tag/') ? ' gtn-active' : ''}`
          }
        >
          피드
        </NavLink>
        <NavLink to="/globe" state={{ openTrophy: true }} className="gtn-link">
          트로피
        </NavLink>
        <NavLink to="/globe" state={{ openShop: true }} className="gtn-link">
          상점
        </NavLink>
        {isLoggedIn && (
          <button
            type="button"
            className="gtn-link gtn-dm-btn"
            onClick={handleOpenDm}
            title="메시지"
            style={{ position: 'relative' }}
          >
            <img src="/dm_icon.svg" alt="DM" style={{ width: 20, height: 20, verticalAlign: 'middle' }} />
            {/* 새 DM 수신 시 빨간 점 */}
            {hasNewDm && (
              <span style={{
                position: 'absolute', top: 2, right: 2,
                width: 8, height: 8,
                background: '#ef4444', borderRadius: '50%',
                pointerEvents: 'none',
              }} />
            )}
          </button>
        )}
        {isLoggedIn ? (
          <button type="button" className="gtn-link" onClick={handleLogout}>
            로그아웃
          </button>
        ) : (
          <button type="button" className="gtn-link" onClick={githubLogin}>
            로그인
          </button>
        )}
      </nav>

      {/* DM 패널 — 로그인 시에만 마운트, 소켓 props 전달 */}
      {isLoggedIn && (
        <DmPanel
          isOpen={dmOpen}
          onClose={() => setDmOpen(false)}
          sendMessage={sendMessage}
          markRead={markRead}
          registerReceive={registerReceive}
          registerSent={registerSent}
          registerReadAck={registerReadAck}
        />
      )}
    </header>
  );
}
