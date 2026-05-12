import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import api from '../../api/axios';
import { useAuth } from '../../auth/hooks/useAuth';
import { useLoginModal } from '../auth/LoginModalContext';

const MAX_COMMENT_LEN = 1000;
const PAGE = 20;

function formatCommentTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function mapApiToUi(c) {
  const u = c.user;
  return {
    id: String(c.id),
    author: u?.nickname || '알 수 없음',
    avatarUrl: u?.avatar_url || undefined,
    body: c.content,
    is_deleted: Boolean(c.is_deleted),
    createdAt: formatCommentTime(c.created_at),
  };
}

export default function CommentSection({ postId, onCommentCountChange }) {
  const { user } = useAuth();
  const { requestLogin } = useLoginModal();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const currentHandle = user?.nickname || user?.username || user?.handle || user?.name || '';

  const pid = String(postId);
  const queryKey = useMemo(() => ['comments', pid], [pid]);

  const { data, status, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const params = { limit: PAGE };
      if (pageParam != null) params.last_comment_id = pageParam;
      const { data: res } = await api.get(`/feed/${pid}/comments`, { params });
      const items = (res.comments || []).map(mapApiToUi);
      return { items, nextCursor: res.nextCursor ?? null };
    },
    initialPageParam: null,
    getNextPageParam: (last) => (last?.nextCursor != null ? last.nextCursor : undefined),
  });

  const { ref: sentinelRef, inView } = useInView({ rootMargin: '120px', threshold: 0 });

  useEffect(() => {
    if (!inView || !hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const flat = useMemo(() => (data?.pages ? data.pages.flatMap((p) => p.items) : []), [data]);

  const persistAndRefresh = useCallback(() => qc.invalidateQueries({ queryKey }), [qc, queryKey]);

  const submitComment = useCallback(async () => {
    if (!user && requestLogin()) return;
    const text = draft.trim();
    if (!text || text.length > MAX_COMMENT_LEN || submitting) return;
    setSubmitting(true);
    try {
      setSubmitError('');
      await api.post(`/feed/${pid}/comments`, { content: text });
      setDraft('');
      await persistAndRefresh();
      onCommentCountChange?.(1);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || '등록에 실패했습니다.';
      setSubmitError(String(msg));
    } finally {
      setSubmitting(false);
    }
  }, [draft, onCommentCountChange, persistAndRefresh, pid, requestLogin, submitting, user]);

  const softDelete = useCallback(
    async (comment) => {
      if (comment.is_deleted || !currentHandle || comment.author !== currentHandle) return;
      try {
        await api.delete(`/comments/${comment.id}`);
        persistAndRefresh();
        onCommentCountChange?.(-1);
      } catch {
        /* ignore */
      }
    },
    [currentHandle, persistAndRefresh, onCommentCountChange]
  );

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitComment();
    }
  };

  return (
    <section className="feed-comment-section" aria-labelledby="feed-comments-heading">
      <h3 id="feed-comments-heading" className="feed-comment-section-title">
        댓글
      </h3>

      <div className="feed-comment-compose-sticky">
        <div className="feed-card feed-comment-compose-card">
          <div className="feed-comment-compose-row">
            {user?.avatar_url ? (
              <div className="feed-avatar feed-avatar-sm feed-avatar-img" aria-hidden>
                <img src={user.avatar_url} alt="" width={36} height={36} decoding="async" />
              </div>
            ) : (
              <div className="feed-avatar feed-avatar-sm" aria-hidden />
            )}
            <div className="feed-comment-compose-field-wrap">
              <textarea
                className="feed-comment-textarea feed-comment-textarea-inline"
                rows={1}
                placeholder="댓글을 입력하세요 (Shift+Enter 줄바꿈)"
                maxLength={MAX_COMMENT_LEN}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label="댓글 입력"
              />
            </div>
            <button
              type="button"
              className="feed-btn-primary feed-comment-submit-btn"
              disabled={!draft.trim() || submitting}
              onClick={submitComment}
            >
              등록
            </button>
          </div>
          <div className="feed-comment-compose-counter feed-post-meta">
            {draft.length} / {MAX_COMMENT_LEN}
          </div>
          {submitError ? <p className="feed-compose-error" style={{ marginTop: '0.35rem' }}>{submitError}</p> : null}
        </div>
      </div>

      {status === 'pending' ? (
        <p className="feed-post-meta">댓글 불러오는 중…</p>
      ) : status === 'error' ? (
        <p className="feed-compose-error">댓글 목록 실패: {error?.response?.data?.error || error?.message}</p>
      ) : (
        <ul className="feed-comment-list" style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
          {flat.map((c) => (
            <li key={c.id} className="feed-comment feed-comment-row">
              {c.is_deleted ? (
                <p className="feed-comment-deleted">삭제된 댓글입니다</p>
              ) : (
                <>
                  <div className="feed-comment-row-head">
                    {c.avatarUrl ? (
                      <div className="feed-avatar feed-avatar-sm feed-avatar-img" aria-hidden>
                        <img src={c.avatarUrl} alt="" width={36} height={36} decoding="async" />
                      </div>
                    ) : (
                      <div className="feed-avatar feed-avatar-sm" aria-hidden />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{c.author}</strong>
                      {c.createdAt ? (
                        <span className="feed-post-meta" style={{ marginLeft: 8, fontSize: '0.78rem' }}>
                          {c.createdAt}
                        </span>
                      ) : null}
                    </div>
                    {currentHandle && c.author === currentHandle ? (
                      <button type="button" className="feed-btn-outline" style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }} onClick={() => softDelete(c)}>
                        삭제
                      </button>
                    ) : null}
                  </div>
                  <p style={{ margin: '0.35rem 0 0 2.25rem', whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{c.body}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {isFetchingNextPage ? <p className="feed-post-meta">더 불러오는 중…</p> : null}
      {hasNextPage ? <div ref={sentinelRef} style={{ height: 1 }} aria-hidden /> : null}
    </section>
  );
}
