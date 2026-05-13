import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { streakBadgeEmoji } from '../../utils/streakBadgeEmoji';
import { useLoginModal } from '../auth/LoginModalContext';
import { fetchTrendingDevelopers, followUserById, unfollowUserById } from '../api/feedApi';

/** 피드 우측: 유저 검색과 구독 피드 사이 — GitHub 연동 유저 기준 트렌딩 */
export default function TrendingDevelopersSidebar() {
  const { user } = useAuth();
  const { requestLogin } = useLoginModal();
  const qc = useQueryClient();

  const { data: developers = [], isPending, isError, error } = useQuery({
    queryKey: ['feed', 'trending-developers'],
    queryFn: fetchTrendingDevelopers,
    staleTime: 90_000,
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
            const following = Boolean(d.is_following);
            const busy = followMut.isPending && followMut.variables?.userId === d.user_id;
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
                      className={following ? 'feed-btn-outline' : 'feed-btn-primary'}
                      style={{
                        flexShrink: 0,
                        padding: '0.28rem 0.5rem',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        minWidth: '3.2rem',
                      }}
                      disabled={busy}
                      onClick={() => {
                        if (!user) {
                          requestLogin();
                          return;
                        }
                        followMut.mutate({ userId: d.user_id, doFollow: !following });
                      }}
                    >
                      {busy ? '…' : following ? '팔로잉' : '팔로우'}
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
