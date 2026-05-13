import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import api from '../../api/axios';
import { useFeedTheme } from '../theme/ThemeContext';
import ComposeModal from '../components/ComposeModal';
import PopularHashtagsSidebar from '../components/PopularHashtagsSidebar';
import FeedSidebarSearch from '../components/FeedSidebarSearch';
import GuestModal from '../components/GuestModal';
import FeedNavEffects from './FeedNavEffects';
import GlobalTopNav from '../../components/GlobalTopNav';
import { LoginModalProvider, useLoginModal } from '../auth/LoginModalContext';
import { getTagPillColors, getTagPillLabelCapitalized } from '../utils/tagPillColors';
import WeeklyActivityCard from '../components/WeeklyActivityCard';
import { streakBadgeEmoji } from '../../utils/streakBadgeEmoji';

const TAG_SUBS_LS_KEY = 'glog:hashtag-subscribe-v1';

function readSubscribedTagSlugsFromStorage() {
  try {
    const raw = localStorage.getItem(TAG_SUBS_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map((s) => String(s)) : [];
  } catch {
    return [];
  }
}

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
  const profileHandle = user?.nickname || user?.username || user?.handle || user?.name || '게스트';
  const profileSubtitle = user?.bio || (isLoggedIn ? 'GitHub 연동 사용자' : '로그인 후 프로필 정보가 표시됩니다.');
  const profileMeta = isLoggedIn ? '내 계정 정보' : '비로그인 상태';
  const [myProfile, setMyProfile] = useState(null);
  const statusRaw = String(isLoggedIn ? (myProfile?.status || user?.status || 'online') : 'offline').toLowerCase();
  const statusText = statusRaw === 'online' ? '온라인' : statusRaw === 'away' ? '자리비움' : '오프라인';
  const statusColor = statusRaw === 'online' ? '#22c55e' : statusRaw === 'away' ? '#eab308' : '#ef4444';
  const sidebarStreakBadge = streakBadgeEmoji(myProfile?.current_streak ?? user?.current_streak ?? 0);

  const [subscribedTags, setSubscribedTags] = useState(() => readSubscribedTagSlugsFromStorage());

  useEffect(() => {
    const sync = () => setSubscribedTags(readSubscribedTagSlugsFromStorage());
    window.addEventListener('glog:tag-subs-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('glog:tag-subs-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn) {
      setMyProfile(null);
      return () => {
        alive = false;
      };
    }
    api
      .get('/users/me/profile')
      .then(({ data }) => {
        if (!alive) return;
        setMyProfile(data);
      })
      .catch(() => {
        if (!alive) return;
        setMyProfile(null);
      });
    return () => {
      alive = false;
    };
  }, [isLoggedIn, user?.user_id]);

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

  return (
    <div className="feed-app">
      <FeedNavEffects />
      <GlobalTopNav />

      <div className="feed-layout-grid">
        <aside className="feed-sidebar-left" aria-label="내 정보">
          <div className="feed-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: 0.7 }}>
                <span title="DM">✉️</span>
                <span title="알림">🔔</span>
              </div>
              {isLoggedIn ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: statusColor }} />
                  <span className="feed-post-meta">{statusText}</span>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.6rem' }}>
              {isLoggedIn && user?.avatar_url ? (
                <div className="feed-avatar feed-avatar-img" aria-hidden style={{ width: 64, height: 64 }}>
                  <img src={user.avatar_url} alt="" width={64} height={64} decoding="async" />
                </div>
              ) : (
                <div className="feed-avatar" aria-hidden style={{ width: 64, height: 64 }} />
              )}
            </div>

            <div style={{ textAlign: 'center' }}>
              {isLoggedIn && user?.user_id ? (
                <Link
                  to={`/feed/user/${user.user_id}`}
                  state={{ nickname: profileHandle }}
                  className="feed-post-author"
                  style={{ textDecoration: 'none', color: 'inherit', fontSize: '1.03rem' }}
                >
                  {profileHandle}
                  {sidebarStreakBadge ? ` ${sidebarStreakBadge}` : ''}
                </Link>
              ) : (
                <div className="feed-post-author" style={{ fontSize: '1.03rem' }}>{profileHandle}</div>
              )}
              <div className="feed-post-meta" style={{ marginTop: '0.2rem', fontSize: '0.78rem' }}>{profileSubtitle}</div>
            </div>

            <p className="feed-post-meta" style={{ marginTop: '0.55rem', textAlign: 'center' }}>
              {profileMeta}
            </p>
            <p className="feed-post-author" style={{ marginTop: '0.4rem', fontSize: '0.88rem', textAlign: 'center' }}>
              {isLoggedIn ? '내 활동 대시보드' : '로그인 후 작성/댓글이 활성화됩니다.'}
            </p>
            {isLoggedIn ? (
              <div
                style={{
                  marginTop: '0.55rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '0.25rem',
                  borderTop: '1px solid var(--feed-border)',
                  paddingTop: '0.55rem',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div className="feed-post-author" style={{ fontSize: '0.95rem' }}>
                    {Number(myProfile?.current_streak ?? user?.current_streak ?? 0)}
                  </div>
                  <div className="feed-post-meta" style={{ fontSize: '0.72rem' }}>스트릭</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="feed-post-author" style={{ fontSize: '0.95rem' }}>
                    {Number(myProfile?.following_count ?? 0)}
                  </div>
                  <div className="feed-post-meta" style={{ fontSize: '0.72rem' }}>팔로잉</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="feed-post-author" style={{ fontSize: '0.95rem' }}>
                    {Number(myProfile?.coins ?? user?.coins ?? 0)}
                  </div>
                  <div className="feed-post-meta" style={{ fontSize: '0.72rem' }}>코인</div>
                </div>
              </div>
            ) : null}
            {isLoggedIn && user?.user_id ? (
              <button
                type="button"
                className="feed-btn-primary"
                style={{ width: '100%', marginTop: '0.6rem' }}
                onClick={() => navigate('/globe', { state: { openMyProfile: true } })}
              >
                프로필 보기
              </button>
            ) : null}
          </div>
          <div className="feed-ad">광고 영역 AD</div>
          <WeeklyActivityCard isLoggedIn={isLoggedIn} />
          <button type="button" className="feed-btn-primary" style={{ width: '100%' }} onClick={openComposeNew}>
            + 새 게시글
          </button>
          <button type="button" className="feed-btn-outline" style={{ width: '100%' }} onClick={openModal} title="이용 약관">
            이용 약관
          </button>
        </aside>

        <main className="feed-main">
          <Outlet context={outletCtx} />
        </main>

        <aside className="feed-sidebar-right" aria-label="탐색">
          <div className="feed-card">
            <FeedSidebarSearch />
          </div>
          <div className="feed-card">
            <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>구독 피드</h3>
            <p className="feed-post-meta" style={{ margin: '0 0 0.65rem', fontSize: '0.8rem' }}>
              구독한 해시태그가 순서대로 표시됩니다.
            </p>
            {subscribedTags.length === 0 ? (
              <p className="feed-post-meta" style={{ margin: 0, fontSize: '0.8rem' }}>
                아직 구독한 태그가 없어요.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {subscribedTags.map((name) => {
                  const pill = getTagPillColors(name);
                  return (
                    <li key={name}>
                      <Link
                        to={`/tag/${encodeURIComponent(name)}?view=latest`}
                        aria-label={`해시태그 ${name} 피드`}
                        style={{
                          display: 'inline-block',
                          padding: '0.3rem 0.75rem',
                          borderRadius: '999px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          textDecoration: 'none',
                          lineHeight: 1.35,
                          background: pill.background,
                          color: pill.color,
                        }}
                      >
                        {getTagPillLabelCapitalized(name)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              to="/feed/tag?view=feed"
              className="feed-post-meta"
              style={{ display: 'inline-block', marginTop: '0.65rem', fontSize: '0.82rem', textDecoration: 'none' }}
            >
              + 피드 더 보기
            </Link>
          </div>
          <PopularHashtagsSidebar />
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
      <GuestModal
        open={open}
        onClose={closeGuest}
        onBrowseLater={closeGuest}
        browseEnabled={browseEnabled || isLoggedIn}
        isLoggedIn={isLoggedIn}
      />
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
