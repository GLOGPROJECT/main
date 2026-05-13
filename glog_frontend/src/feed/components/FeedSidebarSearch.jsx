import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { fetchHashtagAutocomplete, fetchSearchAutocomplete } from '../api/searchApi';
import { getTagPillColors } from '../utils/tagPillColors';

const DEBOUNCE_MS = 280;

function clampQ(raw) {
  const s = String(raw ?? '').trim();
  return s.length > 100 ? s.slice(0, 100) : s;
}

function normalizeTag(raw) {
  let s = String(raw ?? '')
    .replace(/^#+/, '')
    .trim()
    .toLowerCase();
  if (s.length > 100) s = s.slice(0, 100);
  return s;
}

async function tagHasRegisteredPosts(name) {
  const key = normalizeTag(name);
  if (!key) return false;
  try {
    const { data } = await api.get(`/tag/${encodeURIComponent(key)}`, { params: { limit: 1 } });
    const tag = data?.hashtag;
    return Boolean(tag && Number(tag.use_count ?? 0) > 0);
  } catch {
    return false;
  }
}

/** 우측 사이드바: 유저 + 해시태그 자동완성 */
export default function FeedSidebarSearch() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [posts, setPosts] = useState([]);
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();
  const wrapRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setMsg('');
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const prefix = clampQ(debounced);
    if (!prefix) {
      setUsers([]);
      setTags([]);
      setPosts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [auto, extraTags] = await Promise.all([
          fetchSearchAutocomplete(prefix),
          fetchHashtagAutocomplete(prefix).catch(() => []),
        ]);
        if (cancelled) return;
        setUsers(auto.users || []);
        const tagMap = new Map();
        for (const s of auto.suggestions || []) {
          if (s && s.type === 'hashtag' && s.name) {
            tagMap.set(String(s.name).toLowerCase(), {
              hashtag_id: s.hashtag_id,
              name: s.name,
              use_count: Number(s.use_count ?? 0),
            });
          }
        }
        for (const t of extraTags) {
          if (!t?.name) continue;
          const k = String(t.name).toLowerCase();
          if (!tagMap.has(k)) {
            tagMap.set(k, {
              hashtag_id: t.hashtag_id,
              name: t.name,
              use_count: Number(t.use_count ?? 0),
            });
          }
        }
        setTags([...tagMap.values()].sort((a, b) => Number(b.use_count) - Number(a.use_count)));
        const postHints = (auto.suggestions || [])
          .filter((s) => s && s.type === 'post' && s.post_id != null)
          .slice(0, 3);
        setPosts(postHints);
      } catch {
        if (!cancelled) {
          setUsers([]);
          setTags([]);
          setPosts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const goUser = useCallback(
    (u) => {
      if (!u?.user_id) return;
      setOpen(false);
      setMsg('');
      navigate(`/feed/user/${u.user_id}`, { state: { nickname: u.nickname || '' } });
    },
    [navigate]
  );

  const goTag = useCallback(
    async (name) => {
      const key = normalizeTag(name);
      if (!key) return;
      setMsg('');
      setOpen(false);
      if (!(await tagHasRegisteredPosts(key))) {
        setMsg('태그 관련 게시글이 없습니다.');
        return;
      }
      navigate(`/tag/${encodeURIComponent(key)}?view=latest`);
    },
    [navigate]
  );

  const goPost = useCallback(
    (postId) => {
      setOpen(false);
      setMsg('');
      navigate(`/feed/post/${postId}`);
    },
    [navigate]
  );

  const submitEnter = useCallback(async () => {
    const raw = clampQ(q);
    if (!raw) return;
    setMsg('');
    const asTag = normalizeTag(raw);
    if (await tagHasRegisteredPosts(asTag)) {
      setOpen(false);
      navigate(`/tag/${encodeURIComponent(asTag)}?view=latest`);
      return;
    }
    try {
      const auto = await fetchSearchAutocomplete(raw);
      const firstUser = auto.users?.[0];
      if (firstUser && auto.users.length === 1) {
        setOpen(false);
        navigate(`/feed/user/${firstUser.user_id}`, { state: { nickname: firstUser.nickname || '' } });
        return;
      }
    } catch {
      /* ignore */
    }
    setMsg('태그 관련 게시글이 없습니다. 목록에서 유저 또는 태그를 선택해 주세요.');
  }, [q, navigate]);

  const hasDropdown = users.length > 0 || tags.length > 0 || posts.length > 0;

  return (
    <div ref={wrapRef} className="feed-sidebar-search-wrap" style={{ position: 'relative' }}>
      <div className="feed-search-wrap">
        <input
          className="feed-search"
          type="search"
          placeholder="유저·태그 검색…"
          aria-label="유저 및 해시태그 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submitEnter();
            }
          }}
        />
      </div>
      {msg ? (
        <p className="feed-compose-error" style={{ margin: '0.4rem 0 0', fontSize: '0.82rem' }}>
          {msg}
        </p>
      ) : null}
      {open && debounced.trim() && hasDropdown ? (
        <div
          className="feed-card feed-sidebar-search-dropdown"
          style={{
            position: 'absolute',
            zIndex: 50,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 6,
            padding: '0.4rem 0',
            maxHeight: 280,
            overflowY: 'auto',
          }}
          role="listbox"
        >
          {users.length > 0 ? (
            <div className="feed-sidebar-search-section" role="group" aria-label="유저">
              <div className="feed-sidebar-search-section-label">유저</div>
              {users.map((u) => (
                <button
                  key={u.user_id}
                  type="button"
                  className="feed-hashtag-suggest-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => goUser(u)}
                >
                  <span className="feed-sidebar-search-user-nick">{u.nickname}</span>
                </button>
              ))}
            </div>
          ) : null}
          {tags.length > 0 ? (
            <div className="feed-sidebar-search-section" role="group" aria-label="해시태그">
              <div className="feed-sidebar-search-section-label">해시태그</div>
              {tags.map((row) => (
                <button
                  key={`${row.hashtag_id}-${row.name}`}
                  type="button"
                  className="feed-hashtag-suggest-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void goTag(row.name)}
                >
                  <span
                    style={{
                      ...getTagPillColors(row.name),
                      borderRadius: '999px',
                      padding: '0.12rem 0.45rem',
                      fontWeight: 600,
                      display: 'inline-block',
                    }}
                  >
                    {row.name}
                  </span>
                  <span className="feed-post-meta" style={{ marginLeft: 6, fontWeight: 400 }}>
                    · {row.use_count}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {posts.length > 0 ? (
            <div className="feed-sidebar-search-section" role="group" aria-label="게시글">
              <div className="feed-sidebar-search-section-label">게시글</div>
              {posts.map((p) => (
                <button
                  key={p.post_id}
                  type="button"
                  className="feed-hashtag-suggest-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => goPost(p.post_id)}
                >
                  <span className="feed-post-meta" style={{ textAlign: 'left' }}>
                    {p.author_nickname ? `${p.author_nickname} · ` : ''}
                    {String(p.snippet || '').slice(0, 72)}
                    {String(p.snippet || '').length > 72 ? '…' : ''}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
