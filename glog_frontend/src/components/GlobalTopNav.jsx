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
