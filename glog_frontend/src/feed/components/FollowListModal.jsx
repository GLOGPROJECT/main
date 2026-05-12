import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchFollowingMembers, unfollowUserById } from '../api/feedApi';
import followingImg from '../assets/follow/following.png';
import unfollowImg from '../assets/follow/unfollow.png';

export default function FollowListModal({ open, onClose }) {
  const qc = useQueryClient();

  const { data: members = [], status, error, refetch, isFetching } = useQuery({
    queryKey: ['feed', 'following-members'],
    queryFn: fetchFollowingMembers,
    enabled: open,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!open) return;
    const cached = qc.getQueryData(['feed', 'following-members']);
    if (cached === undefined) {
      void refetch();
    }
  }, [open, qc, refetch]);

  const unfollowMutation = useMutation({
    mutationFn: unfollowUserById,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed', 'following-members'] });
      qc.invalidateQueries({ queryKey: ['feed', 'following'] });
      qc.invalidateQueries({ queryKey: ['feed', 'suggested-users'] });
    },
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const busyUid = unfollowMutation.isPending ? unfollowMutation.variables : null;

  return (
    <div
      className="feed-follow-list-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="feed-follow-list-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feed-follow-list-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="feed-follow-list-modal-title" className="feed-follow-list-modal-title">
          (팔로우 목록)
        </h2>
        {status === 'pending' || (isFetching && members.length === 0) ? (
          <p className="feed-post-meta feed-follow-list-modal-meta">불러오는 중…</p>
        ) : null}
        {status === 'error' ? (
          <p className="feed-compose-error feed-follow-list-modal-meta">
            {error?.response?.data?.error || error?.message || '목록을 불러오지 못했습니다.'}
          </p>
        ) : null}
        {unfollowMutation.isError ? (
          <p className="feed-compose-error feed-follow-list-modal-meta">
            {unfollowMutation.error?.response?.data?.error || unfollowMutation.error?.message || '언팔로우 실패'}
          </p>
        ) : null}
        <ul className="feed-follow-list-modal-list">
          {members.map((u) => (
            <li key={u.user_id} className="feed-follow-list-modal-row">
              <div className="feed-empty-follow-user-main">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" width={36} height={36} style={{ borderRadius: 8, flexShrink: 0 }} decoding="async" />
                ) : (
                  <div className="feed-avatar feed-avatar-sm" aria-hidden style={{ flexShrink: 0 }} />
                )}
                <Link
                  className="feed-follow-list-modal-name-link"
                  to={`/feed/user/${u.user_id}`}
                  state={{ nickname: u.nickname || '' }}
                  onClick={onClose}
                >
                  {u.nickname?.trim() ? u.nickname : `유저 #${u.user_id}`}
                </Link>
              </div>
              <div className="feed-follow-actions" role="group" aria-label="팔로우 상태">
                <div
                  className={`feed-follow-following-hover-wrap${busyUid === u.user_id ? ' feed-follow-following-hover-wrap--busy' : ''}`}
                >
                  <div className="feed-follow-following-layer" aria-hidden="true">
                    <img src={followingImg} alt="" className="feed-follow-asset-img feed-follow-asset-img--list" decoding="async" />
                  </div>
                  <button
                    type="button"
                    className="feed-follow-icon-btn feed-follow-unfollow-hover-btn"
                    aria-label="언팔로우"
                    title="언팔로우"
                    disabled={busyUid === u.user_id}
                    onClick={() => unfollowMutation.mutate(u.user_id)}
                  >
                    <img src={unfollowImg} alt="" className="feed-follow-asset-img feed-follow-asset-img--list" decoding="async" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {status === 'success' && members.length === 0 ? (
          <p className="feed-post-meta feed-follow-list-modal-meta">팔로우 중인 사용자가 없습니다.</p>
        ) : null}
        <div className="feed-follow-list-modal-actions">
          <button type="button" className="feed-btn-primary feed-follow-list-modal-close" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
