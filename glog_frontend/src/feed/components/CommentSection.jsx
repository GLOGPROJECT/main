import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import api from '../../api/axios';
import { useAuth } from '../../auth/hooks/useAuth';
import { useLoginModal } from '../auth/LoginModalContext';
import { getCommentThreadPostId, mutateCommentListForPost } from '../mocks/feedMock';
import { fetchMockPostCommentsPage } from '../mocks/mockPostComments';

const MAX_COMMENT_LEN = 1000;

export default function CommentSection({ postId, onCommentCountChange }) {
  const { user } = useAuth();
  const { requestLogin } = useLoginModal();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const currentHandle = user?.username || user?.handle || user?.name || 'me';

  const threadId = useMemo(() => getCommentThreadPostId(postId), [postId]);
  const queryKey = useMemo(() => ['comments', threadId], [threadId]);

  const { data, status, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchMockPostCommentsPage({ postId, cursor: pageParam ?? null, limit: 10 }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const { ref: sentinelRef, inView } = useInView({ rootMargin: '120px', threshold: 0 });

  useEffect(() => {
    if (!inView || !hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const flat = useMemo(() => (data?.pages ? data.pages.flatMap((p) => p.items) : []), [data]);

  const persistAndRefresh = useCallback(() => {
    qc.invalidateQueries({ queryKey });
  }, [qc, queryKey]);

  const submitComment = useCallback(async () => {
    if (!user && requestLogin()) return;
    const text = draft.trim();
    if (!text || text.length > MAX_COMMENT_LEN || submitting) return;
    setSubmitting(true);
    const optimistic = {
      id: `local-c-${Date.now()}`,
      author: currentHandle,
      body: text,
      is_deleted: false,
      createdAt: '방금',
    };
    mutateCommentListForPost(postId, (list) => [optimistic, ...list]);
    setDraft('');
    persistAndRefresh();
    onCommentCountChange?.(1);
    try {
      await api.post(`/feed/${threadId}/comments`, { body: text });
    } catch {
      /* 목: 이미 로컬 반영됨 — 연동 시 POST /feed/:postId/comments */
    } finally {
      setSubmitting(false);
    }
  }, [currentHandle, draft, onCommentCountChange, persistAndRefresh, postId, requestLogin, submitting, threadId, user]);

  const softDelete = useCallback(
    async (comment) => {
      if (comment.is_deleted || comment.author !== currentHandle) return;
      mutateCommentListForPost(postId, (list) =>
        list.map((c) => (c.id === comment.id ? { ...c, is_deleted: true, body: c.body } : c))
      );
      persistAndRefresh();
      onCommentCountChange?.(-1);
      try {
        await api.delete(`/comments/${comment.id}`);
      } catch {
        /* 목: DELETE /comments/:commentId */
      }
    },
    [currentHandle, postId, persistAndRefresh, onCommentCountChange]
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
            <div className="feed-avatar feed-avatar-sm" aria-hidden />
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
          <p className="feed-api-hint" style={{ marginTop: 6 }}>
            POST /feed/:postId/comments · 목: sessionStorage + 낙관적 반영
          </p>
        </div>
      </div>

      {status === 'pending' ? (
        <p className="feed-post-meta">댓글 불러오는 중…</p>
      ) : status === 'error' ? (
        <p className="feed-compose-error">댓글 목 실패: {error?.message}</p>
      ) : (
        <ul className="feed-comment-list" style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
          {flat.map((c) => (
            <li key={c.id} className="feed-comment feed-comment-row">
              {c.is_deleted ? (
                <p className="feed-comment-deleted">삭제된 댓글입니다 (is_deleted=true)</p>
              ) : (
                <>
                  <div className="feed-comment-row-head">
                    <div className="feed-avatar feed-avatar-sm" aria-hidden />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{c.author}</strong>
                      {c.createdAt ? (
                        <span className="feed-post-meta" style={{ marginLeft: 8, fontSize: '0.78rem' }}>
                          {c.createdAt}
                        </span>
                      ) : null}
                    </div>
                    {c.author === currentHandle ? (
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
