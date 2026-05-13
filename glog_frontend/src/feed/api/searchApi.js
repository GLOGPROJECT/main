import api from '../../api/axios';
import { serverPostToCardPost } from './feedApi';

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

/** GET /search/autocomplete — 유저 + 해시태그·글 힌트 */
export async function fetchSearchAutocomplete(q) {
  const trimmed = String(q ?? '').trim().slice(0, 100);
  if (!trimmed) return { users: [], suggestions: [] };
  const { data } = await api.get('/search/autocomplete', { params: { q: trimmed } });
  return {
    users: Array.isArray(data?.users) ? data.users : [],
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
  };
}
