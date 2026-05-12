import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/hooks/useAuth';
import DmPanel from '../dm/DmPanel';
import './GlobalTopNav.css';

const BACKEND_URL = 'http://localhost:4000';

/** `/`, `/globe`, `/feed` 등에서 동일한 상단 메뉴 */
export default function GlobalTopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isLoggedIn = Boolean(user);
  const [dmOpen, setDmOpen] = useState(false);

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

  return (
    <header className="gtn-bar">
      <div className="gtn-brand">
        <NavLink to={homeTo} className="gtn-logo-link">
          GLog 🌍
        </NavLink>
      </div>
      <nav className="gtn-nav" aria-label="주 메뉴">
        <span className="gtn-link gtn-link-disabled" aria-disabled="true" title="준비 중">
          프로필
        </span>
        <NavLink
          to="/feed"
          className={({ isActive }) =>
            `gtn-link${isActive || pathname.startsWith('/tag/') ? ' gtn-active' : ''}`
          }
        >
          피드
        </NavLink>
        <a href="#trophy" className="gtn-link">
          트로피
        </a>
        <a href="#shop" className="gtn-link">
          상점
        </a>
        {isLoggedIn && (
          <button type="button" className="gtn-link gtn-dm-btn" onClick={() => setDmOpen(true)} title="메시지">
            <img src="/dm_icon.svg" alt="DM" style={{ width: 20, height: 20, verticalAlign: 'middle' }} />
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

      {/* DM 패널 — 로그인 시에만 마운트 */}
      {isLoggedIn && (
        <DmPanel isOpen={dmOpen} onClose={() => setDmOpen(false)} />
      )}
    </header>
  );
}
