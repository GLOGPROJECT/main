import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../auth/hooks/useAuth';
import PostCard from '../components/PostCard';
import CommentSection from '../components/CommentSection';
import { addDeletedPostId } from '../mocks/feedMock';
import { isAnonymousPost } from '../utils/anonAvatar';
import { fetchPostById } from '../api/feedApi';

export default function FeedPostDetailPage() {
  const { user } = useAuth();
  const { postId } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    setPost(null);
    fetchPostById(postId)
      .then((p) => {
        if (cancelled) return;
        if (p) {
          setPost(p);
          setLoadState('ok');
        } else {
          setLoadState('error');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPost(null);
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    const onUpdated = (e) => {
      if (String(e.detail?.postId) !== String(postId)) return;
      if (e.detail?.post) setPost(e.detail.post);
    };
    window.addEventListener('glog:post-updated', onUpdated);
    return () => window.removeEventListener('glog:post-updated', onUpdated);
  }, [postId]);

  const bumpCommentCount = useCallback(
    (delta) => {
      setPost((p) => {
        if (!p) return p;
        return { ...p, commentsCount: Math.max(0, (p.commentsCount || 0) + delta) };
      });
    },
    []
  );

  const openEdit = () => {
    if (!post) return;
    window.dispatchEvent(new CustomEvent('glog:compose-edit', { detail: { post } }));
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/feed/${postId}`);
    } catch {
      /* 삭제 API 미구현 시에도 목록에서 제거 */
    }
    addDeletedPostId(postId);
    setDeleteOpen(false);
    navigate('/feed');
  };

  if (loadState === 'loading') {
    return (
      <div className="feed-card feed-empty">
        <p>불러오는 중…</p>
      </div>
    );
  }

  if (loadState === 'error' || !post) {
    return (
      <div className="feed-card feed-empty">
        <p>존재하지 않거나 삭제된 게시글입니다.</p>
        <Link to="/feed" className="feed-detail-back">
          ← 피드로
        </Link>
      </div>
    );
  }

  const anonymous = isAnonymousPost(post);
  const loggedIn = Boolean(user);
  const canEdit = loggedIn && post.isOwner && !isAnonymousPost(post);
  const canDelete = loggedIn && post.isOwner;

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.65rem' }}>
        <Link to="/feed" className="feed-detail-back" style={{ marginBottom: 0 }}>
          ← 게시글
        </Link>
        {canEdit || canDelete ? (
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {canEdit ? (
              <button type="button" className="feed-detail-action-btn" onClick={openEdit}>
                수정
              </button>
            ) : null}
            {canDelete ? (
              <button type="button" className="feed-detail-action-btn" onClick={() => setDeleteOpen(true)}>
                삭제
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <PostCard post={post} variant="static" />

      <div style={{ marginTop: '1.25rem' }}>
        <CommentSection postId={String(postId)} onCommentCountChange={bumpCommentCount} />
      </div>

      {deleteOpen ? (
        <div className="feed-modal-backdrop" role="presentation" onClick={() => setDeleteOpen(false)}>
          <div className="feed-modal feed-modal-sm" role="dialog" aria-modal="true" aria-labelledby="del-title" onClick={(e) => e.stopPropagation()}>
            <div className="feed-modal-header">
              <h2 id="del-title" className="feed-modal-title">
                게시글 삭제
              </h2>
              <button type="button" className="feed-modal-close" onClick={() => setDeleteOpen(false)} aria-label="닫기">
                ×
              </button>
            </div>
            <div className="feed-modal-body">
              <p style={{ margin: 0, fontSize: '0.9rem' }}>정말 삭제할까요?</p>
              <p className="feed-api-hint" style={{ marginTop: '0.5rem' }}>
                연동 시: DELETE /feed/:postId (soft delete)
              </p>
            </div>
            <div className="feed-modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="feed-btn-outline" onClick={() => setDeleteOpen(false)}>
                취소
              </button>
              <button type="button" className="feed-btn-primary" onClick={confirmDelete}>
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
