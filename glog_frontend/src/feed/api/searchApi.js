import api from '../../api/axios';
import { serverPostToCardPost } from './feedApi';

/** 복붙 시 섞이는 zero-width 문자 제거 후 trim (검색어 정규화) */
export function normalizeFeedSearchQ(raw) {
  return String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .slice(0, 100);
}

export async function fetchSearchPostsPage({ q, cursor, sort }) {
  const { data } = await api.get('/search', {
    params: {
      type: 'post',
      q,
      limit: 20,
      cursor: cursor ?? undefined,
      ...(sort === 'latest' ? { sort: 'latest' } : {}),
    },
  });
  const posts = Array.isArray(data?.posts) ? data.posts : [];
  return {
    items: posts.map(serverPostToCardPost).filter(Boolean),
    nextCursor: data?.nextCursor != null ? data.nextCursor : null,
  };
}

export async function fetchSearchUsersPage({ q, cursor }) {
  const { data } = await api.get('/search', {
    params: {
      type: 'user',
      q,
      limit: 20,
      cursor: cursor ?? undefined,
    },
  });
  return {
    items: Array.isArray(data?.users) ? data.users : [],
    nextCursor: data?.nextCursor != null ? data.nextCursor : null,
  };
}

export async function fetchHashtagAutocomplete(q) {
  const { data } = await api.get('/hashtags/autocomplete', { params: { q } });
  return Array.isArray(data) ? data : [];
}

/** GET /hashtags/popular — 인기순 */
export async function fetchPopularHashtags(limit = 200) {
  const { data } = await api.get('/hashtags/popular', { params: { limit } });
  return Array.isArray(data) ? data : [];
}

/** GET /search/autocomplete — 유저·해시태그·게시글·트로피 프로젝트 */
export async function fetchSearchAutocomplete(q) {
  const trimmed = normalizeFeedSearchQ(q);
  if (!trimmed) {
    return { users: [], hashtags: [], posts: [], projects: [], suggestions: [] };
  }
  const { data } = await api.get('/search/autocomplete', { params: { q: trimmed } });
  const base = data && typeof data === 'object' ? data : {};
  return {
    users: Array.isArray(base.users) ? base.users : [],
    hashtags: Array.isArray(base.hashtags) ? base.hashtags : [],
    posts: Array.isArray(base.posts) ? base.posts : [],
    projects: Array.isArray(base.projects) ? base.projects : [],
    suggestions: Array.isArray(base.suggestions) ? base.suggestions : [],
  };
}
