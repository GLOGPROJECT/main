import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import FeedList from '../components/FeedList';

export default function FeedUserPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { userId: userIdParam } = useParams();
  const location = useLocation();
  const nickname = location.state?.nickname;
  const uid = parseInt(String(userIdParam), 10);
  const invalidId = !Number.isFinite(uid) || uid < 1;

  const goAllFeed = () => navigate('/feed');

  const isOwnProfile = user != null && Number(user.user_id) === uid;
  const [prependPosts, setPrependPosts] = useState([]);

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
              {nickname && String(nickname).trim() ? nickname : `유저 #${userIdParam}`}
            </div>
            <p className="feed-post-meta" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
              {isOwnProfile ? '공개·익명 게시글' : '공개 게시글'}
            </p>
          </div>
        </div>
      </div>
      <FeedList feedType="user" sortOrder="latest" userId={uid} tagSlug="" prependPosts={isOwnProfile ? prependPosts : []} />
    </>
  );
}
