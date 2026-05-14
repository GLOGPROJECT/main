import { HeartIcon } from './PostCard';
import { getTagPillColors } from '../utils/tagPillColors';

/** GLOG 링크 프리뷰 HTML 주석 제거 */
export function stripGlogLinkComments(raw) {
  return String(raw ?? '').replace(/<!--\s*GLOG_LINK:[\s\S]*?-->/gi, '');
}

/**
 * 긴 URL을 자동완성 캡슐용 짧은 문자열로 (예: https://m.sports.naver.com/... → https://m.sports./)
 * 호스트 앞 두 레이블 + 슬래시
 */
export function shortenUrlForSearchCapsule(href) {
  const s = String(href ?? '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    const parts = u.hostname.split('.').filter(Boolean);
    const hostShort = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : u.hostname;
    return `${u.protocol}//${hostShort}/`;
  } catch {
    return s.length > 32 ? `${s.slice(0, 28)}…` : s;
  }
}

const URL_IN_TEXT = /(https?:\/\/[^\s<]+)/gi;

/** 본문을 URL / 일반 텍스트 조각으로 분리 */
export function splitTextWithUrls(text) {
  const t = String(text ?? '');
  const parts = [];
  let last = 0;
  let m;
  const re = new RegExp(URL_IN_TEXT.source, 'gi');
  while ((m = re.exec(t)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', value: t.slice(last, m.index) });
    parts.push({ kind: 'url', value: m[1] });
    last = m.index + m[1].length;
  }
  if (last < t.length) parts.push({ kind: 'text', value: t.slice(last) });
  if (!parts.length) parts.push({ kind: 'text', value: t });
  return parts;
}

function oneLineBody(raw) {
  return stripGlogLinkComments(raw)
    .replace(/\s+/g, ' ')
    .trim();
}

/** 트로피 프로젝트 자동완성 한 줄 (왼쪽 등급 트로피 아이콘만, 오른쪽 텍스트) */
export function SearchAutocompleteProjectRow({ row, gradeImgMap, onPick, extraButtonClassName = '' }) {
  const pid = row.project_id ?? row.id;
  const gRaw = row.trophy_grade ?? row.grade;
  const g = gRaw && gradeImgMap?.[gRaw] ? gRaw : null;
  const desc = oneLineBody(row.description ?? row.desc ?? '').slice(0, 140);
  const likes = Number(row.trophy_like_count ?? row.likes ?? 0);
  const comments = Number(row.comment_count ?? row.comments ?? 0);
  const title = String(row.title ?? '').trim() || '제목 없음';

  return (
    <button
      type="button"
      className={`feed-hashtag-suggest-btn feed-search-autocomplete-project-row ${extraButtonClassName}`.trim()}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '0.5rem 0.65rem',
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        color: 'inherit',
        fontSize: '0.78rem',
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(pid)}
    >
      <div
        className="feed-search-autocomplete-trophy-wrap"
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-hidden
      >
        {g ? (
          <img
            src={gradeImgMap[g]}
            alt=""
            width={40}
            height={40}
            style={{ objectFit: 'contain', display: 'block', maxWidth: '100%', maxHeight: '100%' }}
            decoding="async"
          />
        ) : (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--feed-border)',
            }}
          />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="feed-post-author" style={{ fontSize: '0.92rem', fontWeight: 700, lineHeight: 1.35 }}>
          {title}
        </div>
        {desc ? (
          <p className="feed-post-meta" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', lineHeight: 1.45, wordBreak: 'break-word' }}>
            {desc}
            {String(row.description ?? row.desc ?? '').replace(/\s+/g, ' ').trim().length > 140 ? '…' : ''}
          </p>
        ) : null}
        <div className="feed-post-meta" style={{ marginTop: 6, fontSize: '0.75rem' }}>
          좋아요 {likes} · 댓글 {comments}
        </div>
      </div>
    </button>
  );
}

/** 피드 게시글 자동완성 (작성자 없음, 해시태그 3개 이상이면 2개 + '+', URL 캡슐) */
export function SearchAutocompletePostRow({ dto, onPick, extraButtonClassName = '' }) {
  const pid = dto.post_id ?? dto.id;
  const rawTags = Array.isArray(dto.hashtags)
    ? dto.hashtags
        .map((h) => (typeof h === 'string' ? String(h).trim() : String(h?.name ?? '').trim()))
        .filter(Boolean)
    : [];
  const showPlus = rawTags.length >= 3;
  const tagSlice = showPlus ? rawTags.slice(0, 2) : rawTags;
  const likes = Number(dto.like_count ?? dto.likes ?? 0);
  const comments = Number(dto.comment_count ?? dto.comments ?? 0);
  const bodyLine = oneLineBody(dto.content ?? dto.snippet ?? '');
  const parts = splitTextWithUrls(bodyLine);

  return (
    <button
      type="button"
      className={`feed-hashtag-suggest-btn feed-search-autocomplete-post-row ${extraButtonClassName}`.trim()}
      style={{
        display: 'block',
        width: '100%',
        padding: '0.45rem 0.65rem',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        color: 'inherit',
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(pid)}
    >
      <div style={{ fontSize: '0.84rem', lineHeight: 1.45, wordBreak: 'break-word' }}>
        {parts.map((p, i) =>
          p.kind === 'url' ? (
            <span key={`u-${i}`} className="feed-search-autocomplete-url-pill" title={p.value}>
              {shortenUrlForSearchCapsule(p.value)}
            </span>
          ) : (
            <span key={`t-${i}`}>{p.value}</span>
          ),
        )}
      </div>
      {tagSlice.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
          {tagSlice.map((name, ti) => {
            const pill = getTagPillColors(name);
            return (
              <span
                key={`${name}-${ti}`}
                style={{
                  ...pill,
                  borderRadius: 999,
                  padding: '0.12rem 0.45rem',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                }}
              >
                {name}
              </span>
            );
          })}
          {showPlus ? (
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--feed-text-primary)' }}>+</span>
          ) : null}
        </div>
      ) : null}
      <div
        className="feed-post-meta"
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: '0.72rem',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <HeartIcon filled={false} />
          <span>{likes}</span>
        </span>
        <span>댓글 {comments}</span>
      </div>
    </button>
  );
}
