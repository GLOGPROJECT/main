import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../auth/hooks/useAuth';
import { useLoginModal } from '../auth/LoginModalContext';
import { followUserById, unfollowUserById } from '../api/feedApi';
import followIcon from '../assets/follow/follow.png';
import followingIcon from '../assets/follow/following.png';
import unfollowIcon from '../assets/follow/unfollow.png';
import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import FeedList from '../components/FeedList';
import { FeedUserStreakPanel, FeedUserProjectsPanel, FeedUserFollowPanel } from './FeedUserTabPanels';

const LIST_TABS = new Set(['posts', 'likes', 'streak', 'projects', 'following', 'followers']);

export default function FeedUserPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const { requestLogin } = useLoginModal();
  const qc = useQueryClient();
  const { userId: userIdParam } = useParams();
  const location = useLocation();
  const nickname = location.state?.nickname;
  const uid = parseInt(String(userIdParam), 10);
  const invalidId = !Number.isFinite(uid) || uid < 1;

  const [hoverUnfollowUserId, setHoverUnfollowUserId] = useState(null);

  const profileQuery = useQuery({
    queryKey: ['users', 'profile', uid, user?.user_id ?? 'anon'],
    queryFn: () => api.get(`/users/${uid}`).then((r) => r.data),
    enabled: !invalidId && !loading,
  });

  const followMut = useMutation({
    mutationFn: async ({ userId: targetId, doFollow }) => {
      if (doFollow) await followUserById(targetId);
      else await unfollowUserById(targetId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users', 'profile', uid] });
      void qc.invalidateQueries({ queryKey: ['feed', 'trending-developers'] });
      void qc.invalidateQueries({ queryKey: ['feed', 'following-members'] });
      void qc.invalidateQueries({ queryKey: ['feed', 'following'] });
    },
  });

  const isOwnProfile = user != null && Number(user.user_id) === uid;
  const goAllFeed = () => navigate('/feed');

  const postsTabLabel = isOwnProfile ? '공개·익명 게시글' : '공개 게시글';

  const [prependPosts, setPrependPosts] = useState([]);

  const tabParam = searchParams.get('tab');
  const listTab = LIST_TABS.has(tabParam) ? tabParam : 'posts';

  const setListTab = (id) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (id === 'posts') n.delete('tab');
        else n.set('tab', id);
        return n;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (!isOwnProfile) return;
    const onNew = (e) => {
      const post = e.detail?.post;
      if (!post?.id) return;
      setPrependPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
    };
    window.addEventListener('glog:new-post', onNew);
    return () => window.removeEventListener('glog:new-post', onNew);
  }, [isOwnProfile]);

  if (invalidId) {
    return (
      <>
        <div className="feed-tabs">
          <FeedTabs />
          <FeedSortAndTheme />
        </div>
        <div className="feed-card feed-empty feed-card-surface feed-user-page-header">
          <div className="feed-user-page-header-row">
            <button type="button" className="feed-user-back-btn" aria-label="전체 탭으로 이동" onClick={goAllFeed}>
              ←
            </button>
            <p style={{ margin: 0 }}>잘못된 사용자입니다.</p>
          </div>
        </div>
      </>
    );
  }

  const profile = profileQuery.data;
  const headerTitle =
    (nickname && String(nickname).trim()) ||
    (profile?.nickname && String(profile.nickname).trim()) ||
    `유저 #${userIdParam}`;

  const iFollow = Boolean(profile?.is_following);
  const busy = followMut.isPending && Number(followMut.variables?.userId) === uid;
  const showUnfollowPreview = iFollow && hoverUnfollowUserId === uid;
  let followSrc = followIcon;
  let followLabel = '팔로우';
  if (!isOwnProfile) {
    if (busy) {
      if (followMut.variables?.doFollow) {
        followSrc = followingIcon;
        followLabel = '처리 중…';
      } else {
        followSrc = unfollowIcon;
        followLabel = '처리 중…';
      }
    } else if (iFollow) {
      followSrc = showUnfollowPreview ? unfollowIcon : followingIcon;
      followLabel = showUnfollowPreview ? '언팔로우' : '팔로잉';
    }
  }

  const followBtnPx = 52;

  return (
    <>
      <div className="feed-tabs">
        <FeedTabs />
        <FeedSortAndTheme />
      </div>
      <div className="feed-card feed-card-surface feed-user-page-header" style={{ marginBottom: '1rem' }}>
        <div className="feed-user-page-header-row">
          <button type="button" className="feed-user-back-btn" aria-label="전체 탭으로 이동" onClick={goAllFeed}>
            ←
          </button>
          <div className="feed-user-page-header-text">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'nowrap',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minWidth: 0,
                  flex: 1,
                }}
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    width={48}
                    height={48}
                    style={{ borderRadius: 12, objectFit: 'cover', flexShrink: 0, display: 'block' }}
                    decoding="async"
                  />
                ) : (
                  <div
                    className="feed-avatar feed-avatar-sm"
                    style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0 }}
                    aria-hidden
                  />
                )}
                <div
                  className="feed-post-author"
                  style={{
                    fontSize: '1.05rem',
                    margin: 0,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {headerTitle}
                </div>
              </div>
              {!isOwnProfile ? (
                <button
                  type="button"
                  className="feed-follow-icon-btn"
                  style={{
                    flexShrink: 0,
                    borderRadius: '50%',
                    width: followBtnPx,
                    height: followBtnPx,
                    minWidth: followBtnPx,
                    minHeight: followBtnPx,
                    padding: 0,
                    boxSizing: 'border-box',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 0,
                    cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.55 : 1,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                  }}
                  aria-label={followLabel}
                  title={followLabel}
                  disabled={busy}
                  onClick={() => {
                    if (!user) {
                      requestLogin();
                      return;
                    }
                    followMut.mutate({ userId: uid, doFollow: !iFollow });
                  }}
                  onMouseEnter={() => iFollow && setHoverUnfollowUserId(uid)}
                  onMouseLeave={() =>
                    setHoverUnfollowUserId((cur) => (Number(cur) === uid ? null : cur))
                  }
                >
                  <img
                    src={followSrc}
                    alt=""
                    width={followBtnPx}
                    height={followBtnPx}
                    style={{
                      width: followBtnPx,
                      height: followBtnPx,
                      display: 'block',
                      objectFit: 'contain',
                    }}
                    decoding="async"
                  />
                </button>
              ) : null}
            </div>
            <div className="feed-user-page-tabs" role="tablist" aria-label="프로필 구분">
              <button
                type="button"
                role="tab"
                aria-selected={listTab === 'posts'}
                className={`feed-user-page-tab${listTab === 'posts' ? ' feed-user-page-tab--active' : ''}`}
                onClick={() => setListTab('posts')}
              >
                {postsTabLabel}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listTab === 'likes'}
                className={`feed-user-page-tab${listTab === 'likes' ? ' feed-user-page-tab--active' : ''}`}
                onClick={() => setListTab('likes')}
              >
                좋아요
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listTab === 'streak'}
                className={`feed-user-page-tab${listTab === 'streak' ? ' feed-user-page-tab--active' : ''}`}
                onClick={() => setListTab('streak')}
              >
                커밋 스트릭 내역
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listTab === 'projects'}
                className={`feed-user-page-tab${listTab === 'projects' ? ' feed-user-page-tab--active' : ''}`}
                onClick={() => setListTab('projects')}
              >
                프로젝트
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listTab === 'following'}
                className={`feed-user-page-tab${listTab === 'following' ? ' feed-user-page-tab--active' : ''}`}
                onClick={() => setListTab('following')}
              >
                팔로우 중
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listTab === 'followers'}
                className={`feed-user-page-tab${listTab === 'followers' ? ' feed-user-page-tab--active' : ''}`}
                onClick={() => setListTab('followers')}
              >
                팔로워
              </button>
            </div>
          </div>
        </div>
      </div>
      {listTab === 'posts' && (
        <FeedList
          key={`user-${uid}-posts`}
          feedType="user"
          sortOrder="latest"
          userId={uid}
          tagSlug=""
          prependPosts={isOwnProfile ? prependPosts : []}
        />
      )}
      {listTab === 'likes' && (
        <FeedList
          key={`user-${uid}-likes`}
          feedType="user_likes"
          sortOrder="latest"
          userId={uid}
          tagSlug=""
          prependPosts={[]}
        />
      )}
      {listTab === 'streak' && <FeedUserStreakPanel userId={uid} />}
      {listTab === 'projects' && <FeedUserProjectsPanel userId={uid} />}
      {listTab === 'following' && <FeedUserFollowPanel userId={uid} mode="following" />}
      {listTab === 'followers' && <FeedUserFollowPanel userId={uid} mode="followers" />}
    </>
  );
}
