import api from '../../api/axios';
import { getStableAnonIndexFromPostId } from '../utils/anonAvatar';

function decodeHtmlEntities(text) {
  const s = String(text ?? '');
  if (!s || s.indexOf('&') === -1) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * 본문에 포함된 ```lang\n...\n``` 펜스를 제거하고 본문·코드로 분리 (ComposeModal 저장 형식과 대응)
 * @returns {{ body: string, code: { lang: string, snippet: string } | null, extraCodeBlocks: { lang: string, snippet: string }[] }}
 */
export function splitContentAndFencedCode(content) {
  const raw = String(content ?? '');
  const blocks = [];
  const body = raw.replace(/```([^\n`]*)\r?\n([\s\S]*?)```/g, (_, lang, snippet) => {
    blocks.push({
      lang: String(lang || 'text').trim() || 'text',
      snippet: String(snippet || '').replace(/\r\n/g, '\n').replace(/\s+$/, ''),
    });
    return '\n';
  });
  const trimmedBody = body.replace(/\n{3,}/g, '\n\n').trim();
  const code = blocks[0] ? { lang: blocks[0].lang, snippet: blocks[0].snippet } : null;
  const extraCodeBlocks = blocks.slice(1);
  return { body: trimmedBody, code, extraCodeBlocks };
}

/** 서버 게시글 DTO → PostCard용 */
export function serverPostToCardPost(dto) {
  if (!dto || dto.post_id == null) return null;
  const anon = dto.type === 'anonymous';
  const nick = dto.user?.nickname || '알 수 없음';
  const { body, code, extraCodeBlocks } = splitContentAndFencedCode(dto.content ?? '');
  return {
    id: dto.post_id,
    type: dto.type,
    is_edited: Boolean(dto.is_edited),
    likes: dto.like_count ?? 0,
    commentsCount: dto.comment_count ?? 0,
    body,
    tags: (dto.hashtags || []).map((h) => h.name).filter(Boolean),
    images: (dto.images || []).map((im) => im.image_url).filter(Boolean),
    linkPreview: (() => {
      const lp = dto.link_preview ?? dto.linkPreview;
      if (!lp || !lp.url) return null;
      return {
        url: lp.url,
        title: decodeHtmlEntities(lp.title || lp.url),
        description: decodeHtmlEntities(lp.description || ''),
        image: lp.image || '',
      };
    })(),
    code,
    extraCodeBlocks,
    author: {
      handle: anon ? '익명' : nick,
      userId:
        anon || dto.user?.user_id == null || Number(dto.user.user_id) < 1
          ? null
          : Number(dto.user.user_id),
      title: anon ? '익명' : (dto.user?.bio && String(dto.user.bio).trim()) || '',
      streak: '',
      avatarUrl: anon ? undefined : dto.user?.avatar_url || undefined,
    },
    isLiked: Boolean(dto.isLiked),
    isOwner: Boolean(dto.isOwner ?? dto.is_owner),
    anonymousAvatarIndex: anon
      ? (() => {
          const raw = dto.anonymousAvatarIndex ?? dto.anonymous_avatar_index;
          if (raw != null && raw !== '') {
            const n = Number(raw);
            if (Number.isFinite(n) && n >= 0 && n < 10) return n;
          }
          return getStableAnonIndexFromPostId(dto.post_id);
        })()
      : undefined,
  };
}

/**
 * @param {'all'|'following'|'tag'|'user'|'user_likes'|'anonymous'} feedType
 * @param {number|null|undefined} cursor last_post_id
 * @param {string} [tagSlug]
 * @param {number} [userId] — feedType === 'user' 일 때
 * @param {string} [anonymousSearch] — feedType === 'anonymous' 일 때 본문 부분일치(태그 아님)
 */
export async function fetchFeedFromApi({
  feedType,
  cursor,
  limit = 20,
  tagSlug,
  sortOrder,
  userId,
  anonymousSearch,
}) {
  let path = '/feed';
  if (feedType === 'following') path = '/feed/following';
  else if (feedType === 'tag') path = `/tag/${encodeURIComponent(tagSlug || '')}`;
  else if (feedType === 'user') path = `/feed/user/${encodeURIComponent(String(userId ?? ''))}`;
  else if (feedType === 'user_likes') path = `/feed/user/${encodeURIComponent(String(userId ?? ''))}/likes`;

  const params = { limit };
  if (cursor != null) params.last_post_id = cursor;
  if (feedType === 'anonymous') params.type = 'anonymous';
  if (feedType === 'anonymous' && anonymousSearch && String(anonymousSearch).trim()) {
    params.q = String(anonymousSearch).trim().slice(0, 100);
  }
  if (sortOrder === 'popular') params.sort = 'popular';

  const { data } = await api.get(path, { params });
  const raw = data?.posts || [];
  const items = raw.map(serverPostToCardPost).filter(Boolean);
  return {
    items,
    nextCursor: data?.nextCursor ?? null,
    hashtag: feedType === 'tag' ? data?.hashtag ?? null : null,
    following_count: feedType === 'following' ? Number(data?.following_count ?? 0) : undefined,
    following_users: feedType === 'following' && Array.isArray(data?.following_users) ? data.following_users : undefined,
  };
}

export async function fetchPostById(postId) {
  const { data } = await api.get(`/feed/${postId}`);
  const card = serverPostToCardPost(data?.post);
  return card;
}

/** GET /feed/embed/preview?url= — OG 메타 */
export async function fetchLinkPreview(url) {
  const { data } = await api.get('/feed/embed/preview', { params: { url } });
  return data;
}

/** POST /feed/:postId/like — 로그인 필수 */
export async function togglePostLike(postId) {
  const { data } = await api.post(`/feed/${postId}/like`);
  return {
    liked: Boolean(data?.liked),
    likeCount: Number(data?.likeCount ?? 0),
  };
}

/** POST /api/projects/trophies/:trophyId/like — 트로피 좋아요 토글(피드 게시글과 동일하게 본인 프로젝트 허용) */
export async function toggleTrophyLike(trophyId) {
  const tid = Number(trophyId);
  const { data } = await api.post(`/projects/trophies/${tid}/like`);
  return {
    liked: Boolean(data?.liked),
    likeCount: Number(data?.like_count ?? 0),
  };
}

/** GET /feed/suggested-users — 로그인 시 팀원 등 추천 */
export async function fetchSuggestedUsersForFollow(limit = 15) {
  const { data } = await api.get('/feed/suggested-users', { params: { limit } });
  return Array.isArray(data?.users) ? data.users : [];
}

export async function fetchFollowingMembers() {
  const { data } = await api.get('/feed/following/members');
  return Array.isArray(data?.users) ? data.users : [];
}

/** GET /feed/trending-developers — GitHub 연동 공개 유저 트렌딩(선택 인증: 팔로우 여부) */
export async function fetchTrendingDevelopers() {
  const { data } = await api.get('/feed/trending-developers');
  return Array.isArray(data?.developers) ? data.developers : [];
}

/** GET /feed/weekly-activity (JWT) — 서울 기준 주간 일별 게시 수 */
export async function fetchWeeklyActivity() {
  const { data } = await api.get('/feed/weekly-activity');
  return {
    weekKey: String(data?.weekKey ?? ''),
    maxCount: Math.max(1, Number(data?.maxCount) || 1),
    days: Array.isArray(data?.days) ? data.days : [],
  };
}

export async function followUserById(userId) {
  await api.post(`/feed/follow/${userId}`);
}

export async function unfollowUserById(userId) {
  await api.delete(`/feed/follow/${userId}`);
}
