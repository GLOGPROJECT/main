import { useCallback, useState } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { useLoginModal } from '../auth/LoginModalContext';
import followIcon from '../assets/follow/follow.png';
import followingIcon from '../assets/follow/following.png';
import unfollowIcon from '../assets/follow/unfollow.png';

/** 백엔드 연동 전: 추천 목록만 로컬 상태로 토글 (새로고침 시 초기화) */
export default function RecommendedUsers({ users, title = '추천 사용자' }) {
  const { user } = useAuth();
  const { requestLogin } = useLoginModal();
  const [followingIds, setFollowingIds] = useState(() => new Set());
  const [hoverUnfollowId, setHoverUnfollowId] = useState(null);

  const toggleFollow = useCallback((userId) => {
    if (!user && requestLogin()) return;
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, [requestLogin, user]);

  const iconBtn = {
    flexShrink: 0,
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    borderRadius: '50%',
    lineHeight: 0,
  };

  const iconImg = { width: 36, height: 36, display: 'block' };

  return (
    <div className="feed-card">
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>{title}</h3>
      {users.map((u) => {
        const isFollowing = followingIds.has(u.id);
        const showUnfollowPreview = isFollowing && hoverUnfollowId === u.id;
        const src = !isFollowing ? followIcon : showUnfollowPreview ? unfollowIcon : followingIcon;
        const label = !isFollowing ? '팔로우' : showUnfollowPreview ? '언팔로우' : '팔로잉';

        return (
          <div key={u.id} className="feed-user-row">
            <div className="feed-avatar feed-avatar-sm" aria-hidden />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="feed-post-author" style={{ fontSize: '0.85rem' }}>
                {u.handle}
              </div>
              <div className="feed-post-meta" style={{ fontSize: '0.75rem' }}>
                {u.blurb}
              </div>
            </div>
            <button
              type="button"
              style={iconBtn}
              aria-label={label}
              title={label}
              onClick={() => toggleFollow(u.id)}
              onMouseEnter={() => isFollowing && setHoverUnfollowId(u.id)}
              onMouseLeave={() => setHoverUnfollowId((cur) => (cur === u.id ? null : cur))}
            >
              <img src={src} alt="" width={36} height={36} style={iconImg} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
