import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/hooks/useAuth';
import './GlobalTopNav.css';

const BACKEND_URL = 'http://localhost:4000';

/** `/`, `/globe`, `/feed` 등에서 동일한 상단 메뉴 */
export default function GlobalTopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isLoggedIn = Boolean(user);

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
    </header>
  );
}
