import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useFeedTheme } from '../theme/ThemeContext';
import ComposeModal from '../components/ComposeModal';
import GuestModal from '../components/GuestModal';
import FeedNavEffects from './FeedNavEffects';
import GlobalTopNav from '../../components/GlobalTopNav';
import { LoginModalProvider, useLoginModal } from '../auth/LoginModalContext';

function FeedLayoutInner() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useFeedTheme();
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeEditPost, setComposeEditPost] = useState(null);
  const [composeInitialAction, setComposeInitialAction] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { open, browseEnabled, requestLogin, closeModal, openModal } = useLoginModal();
  const isLoggedIn = Boolean(user);
  const profileHandle = user?.username || user?.handle || user?.name || '게스트';
  const profileSubtitle = user?.bio || (isLoggedIn ? 'GitHub 연동 사용자' : '로그인 후 프로필 정보가 표시됩니다.');
  const profileMeta = isLoggedIn ? '내 계정 정보' : '비로그인 상태';

  const openComposeNew = useCallback((opts = {}) => {
    if (requestLogin()) return;
    setComposeEditPost(null);
    setComposeInitialAction(opts.initialAction ?? null);
    setComposeOpen(true);
  }, [requestLogin]);

  useEffect(() => {
    const onEdit = (e) => {
      const post = e.detail?.post;
      if (!post) return;
      setComposeEditPost(post);
      setComposeInitialAction(null);
      setComposeOpen(true);
    };
    window.addEventListener('glog:compose-edit', onEdit);
    return () => window.removeEventListener('glog:compose-edit', onEdit);
  }, []);

  useEffect(() => {
    if (searchParams.get('guest') === '1') openModal();
  }, [searchParams, openModal]);

  const closeGuest = useCallback(() => {
    closeModal();
    if (searchParams.get('guest') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('guest');
      setSearchParams(next, { replace: true });
    }
  }, [closeModal, searchParams, setSearchParams]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/feed', { replace: true });
  }, [logout, navigate]);

  const outletCtx = useMemo(() => ({ setComposeOpen: openComposeNew }), [openComposeNew]);

  const chartHeights = [40, 55, 35, 70, 45, 60, 50];

  return (
    <div className="feed-app">
      <FeedNavEffects />
      <GlobalTopNav />

      <div className="feed-layout-grid">
        <aside className="feed-sidebar-left" aria-label="내 정보">
          <div className="feed-card">
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div className="feed-avatar" aria-hidden />
              <div>
                <div className="feed-post-author">{profileHandle}</div>
                <div className="feed-post-meta">{profileSubtitle}</div>
              </div>
            </div>
            <p className="feed-post-meta" style={{ marginTop: '0.65rem' }}>
              {profileMeta}
            </p>
            <p className="feed-post-author" style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              {isLoggedIn ? '내 활동 대시보드' : '로그인 후 작성/댓글이 활성화됩니다.'}
            </p>
          </div>
          <div className="feed-card feed-post-meta" style={{ padding: '0.75rem' }}>
            코인
          </div>
          <div className="feed-ad">광고 영역 AD</div>
          <div className="feed-card">
            <div className="feed-post-author" style={{ fontSize: '0.9rem' }}>
              이번 주 활동
            </div>
            <div className="feed-chart" aria-hidden>
              {chartHeights.map((h, i) => (
                <div key={i} className="feed-chart-bar" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <button type="button" className="feed-btn-primary" style={{ width: '100%' }} onClick={openComposeNew}>
            + 새 게시글
          </button>
          <button type="button" className="feed-btn-outline" style={{ width: '100%' }} onClick={openModal} title="비로그인 모달 시연">
            게스트 모달
          </button>
        </aside>

        <main className="feed-main">
          <Outlet context={outletCtx} />
        </main>

        <aside className="feed-sidebar-right" aria-label="탐색">
          <div className="feed-card">
            <div className="feed-search-wrap">
              <input className="feed-search" type="search" placeholder="검색..." aria-label="검색" readOnly />
            </div>
          </div>
          <div className="feed-card">
            <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>익명 피드</h3>
            <p className="feed-post-meta" style={{ margin: '0 0 0.65rem', fontSize: '0.8rem' }}>
              익명으로 올라온 글만 모아서 봅니다.
            </p>
            <Link to="/feed/anonymous" className="feed-btn-primary" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center', width: '100%' }}>
              익명 게시글만 보기
            </Link>
          </div>
          <div className="feed-ad">광고 영역 AD</div>
        </aside>
      </div>

      <ComposeModal
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false);
          setComposeEditPost(null);
          setComposeInitialAction(null);
        }}
        editPost={composeEditPost}
        initialAction={composeInitialAction}
      />
      <GuestModal open={open} onClose={closeGuest} onBrowseLater={closeGuest} browseEnabled={browseEnabled || isLoggedIn} />
    </div>
  );
}

export default function FeedLayout() {
  const { user } = useAuth();
  return (
    <LoginModalProvider isLoggedIn={Boolean(user)}>
      <FeedLayoutInner />
    </LoginModalProvider>
  );
}
