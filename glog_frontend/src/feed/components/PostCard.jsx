import { Link, useNavigate } from 'react-router-dom';
import { ANON_AVATAR_SRCS, getAnonAvatarIndex, isAnonymousPost } from '../utils/anonAvatar';

/**
 * @param {'link'|'static'} [variant] — static: 상세 페이지용(전체 카드 링크 없음)
 */
export default function PostCard({ post, variant = 'link' }) {
  const navigate = useNavigate();
  const { id, author, tags, body, linkPreview, likes, commentsCount, code, images, is_edited: isEdited } = post;
  const anonymous = isAnonymousPost(post);
  const anonIdx = getAnonAvatarIndex(post);
  const isStatic = variant === 'static';

  const inner = (
    <>
      <div className="feed-post-header">
        {anonymous ? (
          <div className="feed-avatar feed-avatar-sm feed-avatar-anon-img" aria-hidden>
            <img src={ANON_AVATAR_SRCS[anonIdx]} alt="" width={36} height={36} decoding="async" />
          </div>
        ) : (
          <div className="feed-avatar feed-avatar-sm" aria-hidden />
        )}
        <div>
          <div className="feed-post-author">{author.handle}</div>
          <div className="feed-post-meta">
            {author.title}
            {author.streak ? ` · ${author.streak}` : ''}
          </div>
        </div>
      </div>
      <div className="feed-tags">
        {tags.map((t) =>
          isStatic ? (
            <Link key={t} to={`/tag/${encodeURIComponent(t)}`} className="feed-tag-pill" style={{ textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
              #{t}
            </Link>
          ) : (
            <span
              key={t}
              className="feed-tag-pill"
              role="link"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
              title={`#${t} 태그 피드`}
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
              #{t}
            </span>
          )
        )}
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
      {linkPreview && (
        <div className="feed-link-preview">
          <strong>{linkPreview.title}</strong>
          <div>{linkPreview.url}</div>
        </div>
      )}
      {code && (
        <pre className="feed-code-block">
          <code>{code.snippet}</code>
        </pre>
      )}
      <div className="feed-post-actions">
        <span>♥ {likes}</span>
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
