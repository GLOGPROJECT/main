import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { fetchSuggestedUsersForFollow, followUserById } from '../api/feedApi';
import followImg from '../assets/follow/follow.png';
import followingImg from '../assets/follow/following.png';

/** 팔로우 탭 하단: 아직 팔로우하지 않은 유저 추천 */
export default function SuggestedUsersPanel({ className = '' }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: suggested = [], status, error } = useQuery({
    queryKey: ['feed', 'suggested-users'],
    queryFn: () => fetchSuggestedUsersForFollow(15),
    enabled: Boolean(user),
  });

  const followMutation = useMutation({
    mutationFn: followUserById,
    onMutate: async (userId) => {
      await qc.cancelQueries({ queryKey: ['feed', 'suggested-users'] });
      await qc.cancelQueries({ queryKey: ['feed', 'following-members'] });
      const prev = qc.getQueryData(['feed', 'suggested-users']);
      const prevMembers = qc.getQueryData(['feed', 'following-members']);
      const list = Array.isArray(prev) ? prev : [];
      const row = list.find((u) => u.user_id === userId);

      qc.setQueryData(
        ['feed', 'suggested-users'],
        list.filter((u) => u.user_id !== userId)
      );

      if (row) {
        qc.setQueryData(['feed', 'following-members'], (old) => {
          const m = Array.isArray(old) ? old : [];
          if (m.some((u) => u.user_id === userId)) return m;
          const next = [
            ...m,
            { user_id: row.user_id, nickname: row.nickname, avatar_url: row.avatar_url ?? null },
          ];
          next.sort((a, b) => String(a.nickname).localeCompare(String(b.nickname), 'ko'));
          return next;
        });
      }

      return { prev, prevMembers, row: row || null };
    },
    onError: (_err, _userId, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(['feed', 'suggested-users'], ctx.prev);
      }
      if (ctx?.row) {
        qc.setQueryData(['feed', 'following-members'], ctx.prevMembers);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed', 'following'] });
      window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['feed', 'following-members'] });
      }, 700);
    },
  });

  const pendingFollowUid = followMutation.isPending ? followMutation.variables : null;

  const renderFollowActions = useCallback(
    (uid) => {
      const followPending = pendingFollowUid === uid;
      return (
        <button
          type="button"
          className="feed-follow-icon-btn"
          aria-label="팔로우"
          title="팔로우"
          disabled={followMutation.isPending}
          onClick={() => followMutation.mutate(uid)}
        >
          {followPending ? (
            <img src={followingImg} alt="" className="feed-follow-asset-img feed-follow-asset-img--list" decoding="async" />
          ) : (
            <img src={followImg} alt="" className="feed-follow-asset-img feed-follow-asset-img--list" decoding="async" />
          )}
        </button>
      );
    },
    [followMutation, pendingFollowUid]
  );

  if (!user) return null;

  const showList = status === 'success' && suggested.length > 0;
  const showEmptyMsg = status === 'success' && suggested.length === 0;

  return (
    <div className={`feed-empty-follow-suggest feed-suggested-panel ${className}`.trim()}>
      {showList ? (
        <p className="feed-post-author feed-empty-follow-suggest-title">함께할 개발자 (최근 가입 순)</p>
      ) : null}
      {status === 'pending' ? (
        <p className="feed-post-meta feed-empty-follow-meta">추천 개발자 불러오는 중…</p>
      ) : null}
      {status === 'error' ? (
        <p className="feed-compose-error feed-empty-follow-meta">
          추천 목록을 불러오지 못했습니다: {error?.response?.data?.error || error?.message}
        </p>
      ) : null}
      {followMutation.isError ? (
        <p className="feed-compose-error feed-empty-follow-meta">
          {followMutation.error?.response?.data?.error || followMutation.error?.message || '팔로우 실패'}
        </p>
      ) : null}
      {showList ? (
        <ul className="feed-empty-follow-user-list">
          {suggested.map((u) => (
            <li key={u.user_id} className="feed-empty-follow-user-row">
              <div className="feed-empty-follow-user-main">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" width={36} height={36} style={{ borderRadius: 8, flexShrink: 0 }} decoding="async" />
                ) : (
                  <div className="feed-avatar feed-avatar-sm" aria-hidden style={{ flexShrink: 0 }} />
                )}
                <Link
                  className="feed-empty-follow-nick"
                  to={`/feed/user/${u.user_id}`}
                  state={{ nickname: u.nickname || '' }}
                >
                  {u.nickname}
                </Link>
                {u.is_private ? (
                  <span className="feed-post-meta feed-empty-follow-pill">비공개</span>
                ) : null}
              </div>
              {renderFollowActions(u.user_id)}
            </li>
          ))}
        </ul>
      ) : null}
      {showEmptyMsg ? (
        <p className="feed-post-author feed-empty-follow-suggest-title" style={{ margin: 0 }}>
          추천할 다른 개발자가 없습니다.
        </p>
      ) : null}
    </div>
  );
}
