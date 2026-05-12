import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useLoginModal } from '../auth/LoginModalContext';
import { togglePostLike } from '../api/feedApi';
import { ANON_AVATAR_SRCS, getAnonAvatarIndex, isAnonymousPost } from '../utils/anonAvatar';
import { getTagPillColors } from '../utils/tagPillColors';

export function HeartIcon({ filled }) {
  const d =
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
  const svgStyle = { pointerEvents: 'none' };
  if (filled) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="feed-post-heart-svg" style={svgStyle}>
        <path fill="currentColor" d={d} />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="feed-post-heart-svg" style={svgStyle}>
      <path fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/**
 * @param {'link'|'static'} [variant] — static: 상세 페이지용(전체 카드 링크 없음)
 * @param {(post: object) => void} [onSelect] — 있으면 상세 링크 대신 클릭 시 호출(프로필 내 글 팝업 등)
 * @param {(detail: { postId: number; liked: boolean; likeCount: number }) => void} [onLikeChange] — 좋아요 토글 성공 후(다른 목록 동기화용)
 */
export default function PostCard({ post, variant = 'link', onSelect, onLikeChange }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openModal } = useLoginModal();
  const { id, author, tags, body, linkPreview, likes, commentsCount, code, extraCodeBlocks, images, is_edited: isEdited } = post;
  const [likeCount, setLikeCount] = useState(likes ?? 0);
  const [liked, setLiked] = useState(Boolean(post.isLiked));
  const [likeBusy, setLikeBusy] = useState(false);
  const likeBusyRef = useRef(false);

  useEffect(() => {
    setLikeCount(likes ?? 0);
    setLiked(Boolean(post.isLiked));
  }, [post.id, likes, post.isLiked]);
  const moreCode = Array.isArray(extraCodeBlocks) ? extraCodeBlocks : [];
  const anonymous = isAnonymousPost(post);
  const anonIdx = getAnonAvatarIndex(post);
  const isStatic = variant === 'static';
  const profileUserId = author?.userId;
  const profileLink =
    !anonymous && typeof profileUserId === 'number' && profileUserId > 0
      ? { to: `/feed/user/${profileUserId}`, state: { nickname: author.handle || '' } }
      : null;

  const onLikeClick = useCallback(
    async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!user) {
        openModal();
        return;
      }
      if (likeBusyRef.current) return;
      likeBusyRef.current = true;
      setLikeBusy(true);
      try {
        const { liked: nextLiked, likeCount: nextCount } = await togglePostLike(id);
        setLiked(nextLiked);
        setLikeCount(nextCount);
        onLikeChange?.({ postId: id, liked: nextLiked, likeCount: nextCount });
      } catch {
        /* 요청 실패 시 UI 유지 */
      } finally {
        likeBusyRef.current = false;
        setLikeBusy(false);
      }
    },
    [user, id, openModal, navigate, onLikeChange]
  );

  const inner = (
    <>
      <div className={`feed-post-header${anonymous ? ' feed-post-header-anon' : ''}`}>
        {anonymous ? (
          <div className="feed-avatar feed-avatar-sm feed-avatar-anon-lg feed-avatar-anon-img" aria-hidden>
            <img src={ANON_AVATAR_SRCS[anonIdx]} alt="" width={70} height={70} decoding="async" />
          </div>
        ) : author?.avatarUrl ? (
          <div className="feed-avatar feed-avatar-sm feed-avatar-img" aria-hidden>
            <img src={author.avatarUrl} alt="" width={36} height={36} decoding="async" />
          </div>
        ) : (
          <div className="feed-avatar feed-avatar-sm" aria-hidden />
        )}
        <div>
          {profileLink ? (
            isStatic ? (
              <Link className="feed-post-author feed-post-author-link" to={profileLink.to} state={profileLink.state}>
                {author.handle}
              </Link>
            ) : (
              <button
                type="button"
                className="feed-post-author feed-post-author-link feed-post-author-link-btn"
                aria-label={`${author.handle} 프로필로 이동`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(profileLink.to, { state: profileLink.state });
                }}
              >
                {author.handle}
              </button>
            )
          ) : (
            <div className="feed-post-author">{author.handle}</div>
          )}
          {!anonymous && (author.title || author.streak) ? (
            <div className="feed-post-meta">
              {author.title}
              {author.streak ? ` · ${author.streak}` : ''}
            </div>
          ) : null}
        </div>
      </div>
      <div className="feed-tags">
        {tags.map((t) => {
          const pill = getTagPillColors(t);
          const pillStyle = {
            ...pill,
            borderRadius: '999px',
            padding: '0.2rem 0.55rem',
            fontWeight: 600,
            fontSize: '0.75rem',
            textDecoration: 'none',
            display: 'inline-block',
            lineHeight: 1.35,
          };
          return isStatic ? (
            <Link key={t} to={`/tag/${encodeURIComponent(t)}`} className="feed-tag-pill" style={pillStyle} onClick={(e) => e.stopPropagation()}>
              {t}
            </Link>
          ) : (
            <span
              key={t}
              className="feed-tag-pill"
              role="link"
              tabIndex={0}
              style={{ ...pillStyle, cursor: 'pointer' }}
              title={`${t} 태그 피드`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/tag/${encodeURIComponent(t)}`);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(`/tag/${encodeURIComponent(t)}`);
                }
              }}
            >
              {t}
            </span>
          );
        })}
      </div>
      <div className="feed-post-body" style={{ whiteSpace: 'pre-wrap' }}>
        {body}
        {isEdited ? <span className="feed-edited-inline"> — 수정됨</span> : null}
      </div>
      {images && images.length > 0 ? (
        <div className="feed-post-image-grid">
          {images.map((src, idx) => (
            <img key={idx} src={src} alt="" loading="lazy" decoding="async" />
          ))}
        </div>
      ) : null}
      {linkPreview && linkPreview.url ? (
        <a
          href={linkPreview.url}
          target="_blank"
          rel="noopener noreferrer"
          className="feed-link-preview-card"
          onClick={(e) => e.stopPropagation()}
        >
          {linkPreview.image ? (
            <div className="feed-link-preview-thumb">
              <img src={linkPreview.image} alt="" loading="lazy" decoding="async" />
            </div>
          ) : null}
          <div className="feed-link-preview-text">
            <strong className="feed-link-preview-title">{linkPreview.title}</strong>
            {linkPreview.description ? <p className="feed-link-preview-desc">{linkPreview.description}</p> : null}
            <span className="feed-link-preview-url-line">
              {(() => {
                try {
                  return new URL(linkPreview.url).hostname;
                } catch {
                  return linkPreview.url;
                }
              })()}
              <span className="feed-link-preview-ext" aria-hidden>
                {' '}
                ↗
              </span>
            </span>
          </div>
        </a>
      ) : null}
      {code ? (
        <pre className="feed-code-block">
          <code>{code.snippet}</code>
        </pre>
      ) : null}
      {moreCode.map((c, idx) => (
        <pre key={`code-${idx}`} className="feed-code-block">
          <code>{c.snippet}</code>
        </pre>
      ))}
      <div className="feed-post-actions">
        <button
          type="button"
          className="feed-post-like-btn"
          data-liked={liked ? 'true' : 'false'}
          disabled={likeBusy}
          aria-pressed={liked}
          aria-label={liked ? '좋아요 취소' : '좋아요'}
          onClick={onLikeClick}
        >
          <HeartIcon filled={liked} />
          <span>{likeCount}</span>
        </button>
        <span>댓글 {commentsCount}</span>
        <span>저장</span>
        <span>공유</span>
      </div>
    </>
  );

  if (isStatic) {
    return (
      <article className="feed-card feed-post" aria-label={`${author.handle} 게시글`}>
        {inner}
      </article>
    );
  }

  if (typeof onSelect === 'function') {
    return (
      <article
        className="feed-card feed-post"
        role="button"
        tabIndex={0}
        aria-label={`${author.handle} 게시글 열기`}
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(post)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(post);
          }
        }}
      >
        {inner}
      </article>
    );
  }

  return (
    <Link
      to={`/feed/post/${id}`}
      className="feed-card feed-post"
      aria-label={`${author.handle} 게시글 상세`}
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      {inner}
    </Link>
  );
}
