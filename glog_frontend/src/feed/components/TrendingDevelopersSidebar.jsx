import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { streakBadgeEmoji } from '../../utils/streakBadgeEmoji';
import { useLoginModal } from '../auth/LoginModalContext';
import { fetchFollowingMembers, fetchTrendingDevelopers, followUserById, unfollowUserById } from '../api/feedApi';
import followIcon from '../assets/follow/follow.png';
import followingIcon from '../assets/follow/following.png';
import unfollowIcon from '../assets/follow/unfollow.png';

/** 피드 우측: 유저 검색과 구독 피드 사이 — GitHub 연동 유저 기준 트렌딩 */
export default function TrendingDevelopersSidebar() {
  const { user, loading } = useAuth();
  const { requestLogin } = useLoginModal();
  const qc = useQueryClient();
  const [hoverUnfollowUserId, setHoverUnfollowUserId] = useState(null);

  const iconImg = { width: 36, height: 36, display: 'block', objectFit: 'contain' };

  const { data: followingMembers = [] } = useQuery({
    queryKey: ['feed', 'following-members'],
    queryFn: fetchFollowingMembers,
    enabled: Boolean(user) && !loading,
    staleTime: 60_000,
  });

  const followingIdSet = useMemo(
    () => new Set(followingMembers.map((m) => Number(m.user_id))),
    [followingMembers],
  );

  const { data: developers = [], isPending, isError, error } = useQuery({
    queryKey: ['feed', 'trending-developers', user?.user_id ?? 'anon'],
    queryFn: fetchTrendingDevelopers,
    staleTime: 90_000,
    // 인증 전에는 Bearer 없이 요청되어 is_following 이 전부 false로 캐시되는 것을 방지
    enabled: !loading,
  });

  const followMut = useMutation({
    mutationFn: async ({ userId, doFollow }) => {
      if (doFollow) await followUserById(userId);
      else await unfollowUserById(userId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['feed', 'trending-developers'] });
      void qc.invalidateQueries({ queryKey: ['feed', 'following'] });
      void qc.invalidateQueries({ queryKey: ['feed', 'following-members'] });
    },
  });

  const errMsg = isError ? (error?.response?.data?.error || error?.message || '불러오지 못했습니다.') : '';

  return (
    <div className="feed-card feed-popular-tags">
      <div className="feed-popular-tags__head">
        <h3 className="feed-popular-tags__title">🔥 트렌딩 개발자</h3>
      </div>
      {isPending ? (
        <p className="feed-post-meta" style={{ margin: 0 }}>
          불러오는 중…
        </p>
      ) : null}
      {errMsg ? (
        <p className="feed-compose-error" style={{ margin: 0, fontSize: '0.82rem' }}>
          {errMsg}
        </p>
      ) : null}
      {!isPending && !errMsg && developers.length === 0 ? (
        <p className="feed-post-meta" style={{ margin: 0 }}>
          표시할 개발자가 없습니다.
        </p>
      ) : null}
      {!isPending && !errMsg && developers.length > 0 ? (
        <ul className="feed-popular-tags__list" style={{ gap: '0.55rem' }}>
          {developers.map((d) => {
            const self = Boolean(user && Number(user.user_id) === Number(d.user_id));
            const following = Boolean(d.is_following) || followingIdSet.has(Number(d.user_id));
            const busy =
              followMut.isPending &&
              Number(followMut.variables?.userId) === Number(d.user_id);
            const showUnfollowPreview = following && hoverUnfollowUserId === d.user_id;
            let followSrc = followIcon;
            let followLabel = '팔로우';
            if (!self) {
              if (busy) {
                if (followMut.variables?.doFollow) {
                  followSrc = followingIcon;
                  followLabel = '처리 중…';
                } else {
                  followSrc = unfollowIcon;
                  followLabel = '처리 중…';
                }
              } else if (following) {
                followSrc = showUnfollowPreview ? unfollowIcon : followingIcon;
                followLabel = showUnfollowPreview ? '언팔로우' : '팔로잉';
              }
            }
            return (
              <li key={d.user_id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '0.25rem 0',
                    borderBottom: '1px solid var(--feed-border)',
                  }}
                >
                  <Link
                    to={`/feed/user/${d.user_id}`}
                    state={{ nickname: d.nickname || '' }}
                    style={{ flexShrink: 0, lineHeight: 0 }}
                    aria-label={`${d.nickname} 프로필`}
                  >
                    {d.avatar_url ? (
                      <img src={d.avatar_url} alt="" width={40} height={40} style={{ borderRadius: 10, objectFit: 'cover', display: 'block' }} decoding="async" />
                    ) : (
                      <div className="feed-avatar feed-avatar-sm" style={{ width: 40, height: 40 }} aria-hidden />
                    )}
                  </Link>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Link
                        to={`/feed/user/${d.user_id}`}
                        state={{ nickname: d.nickname || '' }}
                        className="feed-post-author"
                        style={{ fontSize: '0.88rem', textDecoration: 'none', color: 'inherit' }}
                      >
                        {d.nickname}
                      </Link>
                      <span style={{ fontSize: '0.85rem', lineHeight: 1 }} aria-hidden title="커밋 스트릭 칭호">
                        {streakBadgeEmoji(d.current_streak ?? 0)}
                      </span>
                    </div>
                    <p
                      className="feed-post-meta"
                      style={{
                        margin: '0.2rem 0 0',
                        fontSize: '0.72rem',
                        lineHeight: 1.35,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={d.highlight}
                    >
                      {d.highlight}
                    </p>
                  </div>
                  {self ? null : (
                    <button
                      type="button"
                      className="feed-follow-icon-btn"
                      style={{
                        flexShrink: 0,
                        borderRadius: '50%',
                        minWidth: 44,
                        minHeight: 44,
                        padding: 0,
                        cursor: busy ? 'wait' : 'pointer',
                        opacity: busy ? 0.55 : 1,
                      }}
                      aria-label={followLabel}
                      title={followLabel}
                      disabled={busy}
                      onClick={() => {
                        if (!user) {
                          requestLogin();
                          return;
                        }
                        followMut.mutate({ userId: d.user_id, doFollow: !following });
                      }}
                      onMouseEnter={() => following && setHoverUnfollowUserId(d.user_id)}
                      onMouseLeave={() =>
                        setHoverUnfollowUserId((cur) =>
                          Number(cur) === Number(d.user_id) ? null : cur,
                        )
                      }
                    >
                      <img src={followSrc} alt="" width={36} height={36} style={iconImg} decoding="async" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
