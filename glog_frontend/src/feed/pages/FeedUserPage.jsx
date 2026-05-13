import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../auth/hooks/useAuth';
import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import FeedList from '../components/FeedList';
import { FeedUserStreakPanel, FeedUserProjectsPanel, FeedUserFollowPanel } from './FeedUserTabPanels';

const LIST_TABS = new Set(['posts', 'likes', 'streak', 'projects', 'following', 'followers']);

export default function FeedUserPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { userId: userIdParam } = useParams();
  const location = useLocation();
  const nickname = location.state?.nickname;
  const uid = parseInt(String(userIdParam), 10);
  const invalidId = !Number.isFinite(uid) || uid < 1;

  const isOwnProfile = user != null && Number(user.user_id) === uid;
  const goAllFeed = () => navigate('/feed');

  const postsTabLabel = isOwnProfile ? '공개·익명 게시글' : '공개 게시글';

  const [prependPosts, setPrependPosts] = useState([]);
  const [profileNickname, setProfileNickname] = useState(null);

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
    if (!Number.isFinite(uid) || uid < 1) {
      setProfileNickname(null);
      return;
    }
    let alive = true;
    api
      .get(`/users/${uid}`)
      .then(({ data }) => {
        if (!alive) return;
        const n = data?.nickname;
        setProfileNickname(n && String(n).trim() ? String(n).trim() : null);
      })
      .catch(() => {
        if (!alive) return;
        setProfileNickname(null);
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!isOwnProfile) return;
    const onNew = (e) => {
      const post = e.detail;
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

  const headerTitle =
    (nickname && String(nickname).trim()) || profileNickname || `유저 #${userIdParam}`;

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
            <div className="feed-post-author" style={{ fontSize: '1.05rem' }}>
              {headerTitle}
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
