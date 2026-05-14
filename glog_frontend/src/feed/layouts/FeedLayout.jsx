import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/hooks/useAuth';
import api from '../../api/axios';
import { getAppSocket } from '../../realtime/appSocket';
import ComposeModal from '../components/ComposeModal';
import PopularHashtagsSidebar from '../components/PopularHashtagsSidebar';
import TrendingDevelopersSidebar from '../components/TrendingDevelopersSidebar';
import FeedSidebarSearch from '../components/FeedSidebarSearch';
import GuestModal from '../components/GuestModal';
import FeedNavEffects from './FeedNavEffects';
import GlobalTopNav from '../../components/GlobalTopNav';
import DmPanel from '../../dm/DmPanel';
import { useDmSocket } from '../../dm/useDmSocket';
import { LoginModalProvider, useLoginModal } from '../auth/LoginModalContext';
import { getTagPillColors, getTagPillLabelCapitalized } from '../utils/tagPillColors';
import WeeklyActivityCard from '../components/WeeklyActivityCard';
import { streakBadgeEmoji } from '../../utils/streakBadgeEmoji';
import { countTrophiesByGrade } from '../../utils/trophyGradeCounts';
import { readSubscribedTagSlugs } from '../utils/tagSubscribeStorage';

const FEED_SIDEBAR_TECH_CHIP = {
  background: 'rgba(59, 130, 246, 0.1)',
  border: '1px solid rgba(59, 130, 246, 0.28)',
  color: '#3b82f6',
  padding: '1px 5px',
  borderRadius: 10,
  fontSize: '0.62rem',
  fontWeight: 500,
};

const TROPHY_GRADE_ROW = {
  gold: { src: '/goldtrophy.svg' },
  silver: { src: '/silvertrophy.svg' },
  bronze: { src: '/bronzetrophy.svg' },
};

function FeedLayoutInner() {
  const { user, logout } = useAuth();
  const uid = user?.user_id;
  const navigate = useNavigate();
  const location = useLocation();
  const feedAppRef = useRef(null);
  const initialFeedRouteStateRef = useRef(location.state);
  const qc = useQueryClient();
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeEditPost, setComposeEditPost] = useState(null);
  const [composeInitialAction, setComposeInitialAction] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { open, browseEnabled, requestLogin, closeModal, openModal } = useLoginModal();
  const isLoggedIn = Boolean(user);
  const profileHandle = user?.nickname || user?.username || user?.handle || user?.name || '게스트';
  const profileSubtitle = user?.bio || (isLoggedIn ? 'GitHub 연동 사용자' : '로그인 후 프로필 정보가 표시됩니다.');
  const [myProfile, setMyProfile] = useState(null);
  const statusRaw = String(isLoggedIn ? (myProfile?.status || user?.status || 'online') : 'offline').toLowerCase();
  const statusText = statusRaw === 'online' ? '온라인' : statusRaw === 'away' ? '자리비움' : '오프라인';
  const statusColor = statusRaw === 'online' ? '#22c55e' : statusRaw === 'away' ? '#eab308' : '#ef4444';
  const sidebarStreakBadge = streakBadgeEmoji(myProfile?.current_streak ?? user?.current_streak ?? 0);

  const [subscribedTags, setSubscribedTags] = useState(() => readSubscribedTagSlugs(uid));

  useEffect(() => {
    setSubscribedTags(readSubscribedTagSlugs(uid));
    const sync = () => setSubscribedTags(readSubscribedTagSlugs(uid));
    window.addEventListener('glog:tag-subs-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('glog:tag-subs-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, [uid]);

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

  const [myProjectRows, setMyProjectRows] = useState([]);

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn || !user?.user_id) {
      setMyProjectRows([]);
      return () => {
        alive = false;
      };
    }
    api
      .get(`/projects/user/${user.user_id}?sort=latest`)
      .then(({ data }) => {
        if (!alive) return;
        setMyProjectRows(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (!alive) return;
        setMyProjectRows([]);
      });
    return () => {
      alive = false;
    };
  }, [isLoggedIn, user?.user_id]);

  const feedSidebarTrophyCounts = useMemo(() => countTrophiesByGrade(myProjectRows), [myProjectRows]);

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

  const [dmOpen, setDmOpen] = useState(false);
  const [dmPartnerId, setDmPartnerId] = useState(null);
  const dmReceiveHandlerRef = useRef(null);
  const dmSentHandlerRef = useRef(null);
  const dmReadAckHandlerRef = useRef(null);

  const { sendMessage, markRead } = useDmSocket({
    onReceive: (msg) => {
      dmReceiveHandlerRef.current?.(msg);
    },
    onSent: (msg) => {
      dmSentHandlerRef.current?.(msg);
    },
    onReadAck: (room_id) => {
      dmReadAckHandlerRef.current?.(room_id);
    },
  });

  if (user?.user_id) window.__myUserId = user.user_id;

  useEffect(() => {
    if (!user?.user_id) return undefined;
    const socket = getAppSocket();
    if (!socket) return undefined;

    const invalidateFeed = () => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
    };

    const onPostNew = (payload) => {
      if (!payload?.post_id) return;
      invalidateFeed();
    };
    const onPostUpdated = (payload) => {
      if (!payload?.post_id) return;
      invalidateFeed();
    };
    const onPostDeleted = (payload) => {
      if (!payload?.post_id) return;
      invalidateFeed();
    };
    const onCommentNew = (payload) => {
      const pid = payload?.post_id;
      if (!pid) return;
      invalidateFeed();
      void qc.invalidateQueries({ queryKey: ['comments', String(pid)] });
    };
    const onCommentDeleted = (payload) => {
      const pid = payload?.post_id;
      if (!pid) return;
      invalidateFeed();
      void qc.invalidateQueries({ queryKey: ['comments', String(pid)] });
    };

    socket.on('feed_post:new', onPostNew);
    socket.on('feed_post:updated', onPostUpdated);
    socket.on('feed_post:deleted', onPostDeleted);
    socket.on('feed_comment:new', onCommentNew);
    socket.on('feed_comment:deleted', onCommentDeleted);

    return () => {
      socket.off('feed_post:new', onPostNew);
      socket.off('feed_post:updated', onPostUpdated);
      socket.off('feed_post:deleted', onPostDeleted);
      socket.off('feed_comment:new', onCommentNew);
      socket.off('feed_comment:deleted', onCommentDeleted);
    };
  }, [qc, user?.user_id]);

  const outletCtx = useMemo(() => ({ setComposeOpen: openComposeNew }), [openComposeNew]);

  useLayoutEffect(() => {
    const st = initialFeedRouteStateRef.current;
    if (st?.feedRouteEnter === true) {
      feedAppRef.current?.classList.add('feed-app--route-enter');
    }
  }, []);

  useEffect(() => {
    if (location.state?.feedRouteEnter !== true) return;
    const path = `${location.pathname}${location.search || ''}`;
    navigate(path, { replace: true, state: {} });
  }, [location.state, location.pathname, location.search, navigate]);

  return (
    <div ref={feedAppRef} className="feed-app">
      <FeedNavEffects />
      <GlobalTopNav />

      <div className="feed-layout-grid">
        <aside className="feed-sidebar-left" aria-label="내 정보">
          <div className="feed-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {isLoggedIn ? (
                  <button
                    type="button"
                    title="메시지"
                    onClick={() => {
                      setDmPartnerId(null);
                      setDmOpen(true);
                    }}
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 0,
                      opacity: 0.85,
                    }}
                  >
                    <img src="/dm_icon.svg" alt="DM" width={20} height={20} />
                  </button>
                ) : null}
                {isLoggedIn ? (
                  <span style={{ lineHeight: 0, opacity: 0.85 }} title="알림">
                    <img src="/notification_bell.svg" alt="" width={20} height={20} />
                  </span>
                ) : null}
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

            {isLoggedIn && Array.isArray(myProfile?.tech_stacks) && myProfile.tech_stacks.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', marginTop: '0.45rem', marginBottom: '0.35rem' }}>
                {myProfile.tech_stacks.map((stack) => (
                  <span key={stack} style={FEED_SIDEBAR_TECH_CHIP}>{stack}</span>
                ))}
              </div>
            ) : null}

            {isLoggedIn && myProfile?.bio ? (
              <p className="feed-post-meta" style={{ margin: '0 0 0.45rem', textAlign: 'center', fontSize: '0.78rem', lineHeight: 1.42 }}>
                {myProfile.bio}
              </p>
            ) : null}

            {isLoggedIn ? (
              <p style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 700, color: '#d97706', margin: '0 0 8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  보유 코인
                  <img src="/coin_icon.svg" alt="코인" style={{ width: 15, height: 15 }} />
                  {Number(myProfile?.coins ?? user?.coins ?? 0).toLocaleString()}
                </span>
              </p>
            ) : null}

            {isLoggedIn ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '10px 16px',
                  marginBottom: 8,
                  paddingTop: 4,
                  paddingBottom: 8,
                  minHeight: 48,
                  overflow: 'visible',
                  lineHeight: 0,
                }}
              >
                {(['gold', 'silver', 'bronze']).map((key) => (
                  <span
                    key={key}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--feed-text-primary)',
                      lineHeight: 1.2,
                    }}
                  >
                    <img
                      src={TROPHY_GRADE_ROW[key].src}
                      alt=""
                      style={{
                        width: 36,
                        height: 36,
                        maxHeight: 44,
                        objectFit: 'contain',
                        display: 'block',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>: {feedSidebarTrophyCounts[key]}</span>
                  </span>
                ))}
              </div>
            ) : null}

            {isLoggedIn ? (
              <hr style={{ border: 'none', borderTop: '1px solid var(--feed-border)', margin: '0 0 8px' }} />
            ) : null}

            {isLoggedIn ? (
              <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: '0.55rem' }}>
                <button
                  type="button"
                  className="feed-profile-stat-btn"
                  style={{ flex: 1, textAlign: 'center', minWidth: 0, background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer', color: 'inherit' }}
                  onClick={() => navigate(`/feed/user/${user.user_id}?tab=streak`)}
                >
                  <div className="feed-post-author" style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f59e0b' }}>
                    {Number(myProfile?.current_streak ?? user?.current_streak ?? 0)}
                  </div>
                  <div className="feed-post-meta" style={{ fontSize: '0.58rem', marginTop: 2, lineHeight: 1.2 }}>커밋 스트릭</div>
                </button>
                <div style={{ width: 1, alignSelf: 'stretch', minHeight: 22, background: 'var(--feed-border)', flexShrink: 0 }} />
                <button
                  type="button"
                  className="feed-profile-stat-btn"
                  style={{ flex: 1, textAlign: 'center', minWidth: 0, background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer', color: 'inherit' }}
                  onClick={() => navigate(`/feed/user/${user.user_id}?tab=projects`)}
                >
                  <div className="feed-post-author" style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                    {myProjectRows.length}
                  </div>
                  <div className="feed-post-meta" style={{ fontSize: '0.58rem', marginTop: 2, lineHeight: 1.2 }}>프로젝트</div>
                </button>
                <div style={{ width: 1, alignSelf: 'stretch', minHeight: 22, background: 'var(--feed-border)', flexShrink: 0 }} />
                <button
                  type="button"
                  className="feed-profile-stat-btn"
                  style={{ flex: 1, textAlign: 'center', minWidth: 0, background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer', color: 'inherit' }}
                  onClick={() => navigate(`/feed/user/${user.user_id}?tab=following`)}
                >
                  <div className="feed-post-author" style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                    {Number(myProfile?.following_count ?? 0)}
                  </div>
                  <div className="feed-post-meta" style={{ fontSize: '0.58rem', marginTop: 2, lineHeight: 1.2 }}>팔로우 중</div>
                </button>
                <div style={{ width: 1, alignSelf: 'stretch', minHeight: 22, background: 'var(--feed-border)', flexShrink: 0 }} />
                <button
                  type="button"
                  className="feed-profile-stat-btn"
                  style={{ flex: 1, textAlign: 'center', minWidth: 0, background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer', color: 'inherit' }}
                  onClick={() => navigate(`/feed/user/${user.user_id}?tab=followers`)}
                >
                  <div className="feed-post-author" style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                    {Number(myProfile?.follower_count ?? 0)}
                  </div>
                  <div className="feed-post-meta" style={{ fontSize: '0.58rem', marginTop: 2, lineHeight: 1.2 }}>팔로워</div>
                </button>
              </div>
            ) : (
              <p className="feed-post-meta" style={{ marginTop: '0.55rem', textAlign: 'center', fontSize: '0.82rem' }}>
                로그인 후 작성/댓글이 활성화됩니다.
              </p>
            )}
            {isLoggedIn && user?.user_id ? (
              <button
                type="button"
                className="feed-btn-primary"
                style={{ width: '100%', marginTop: '0.35rem' }}
                onClick={() => navigate(`/profile/${user.user_id}`)}
              >
                프로필 수정
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
          <div className="feed-card feed-sidebar-search-card">
            <FeedSidebarSearch />
          </div>
          <TrendingDevelopersSidebar />
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
      {isLoggedIn && (
        <DmPanel
          isOpen={dmOpen}
          onClose={() => {
            setDmOpen(false);
            setDmPartnerId(null);
          }}
          initialPartnerId={dmPartnerId}
          sendMessage={sendMessage}
          markRead={markRead}
          registerReceive={(fn) => {
            dmReceiveHandlerRef.current = fn;
          }}
          registerSent={(fn) => {
            dmSentHandlerRef.current = fn;
          }}
          registerReadAck={(fn) => {
            dmReadAckHandlerRef.current = fn;
          }}
        />
      )}
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
