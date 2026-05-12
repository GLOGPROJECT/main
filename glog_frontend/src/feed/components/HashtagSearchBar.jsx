import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { getTagPillColors } from '../utils/tagPillColors';

const DEBOUNCE_MS = 280;

function normalizeTagForRequest(raw) {
  let s = String(raw ?? '')
    .replace(/^#+/, '')
    .trim()
    .toLowerCase();
  if (s.length > 100) s = s.slice(0, 100);
  return s;
}

/** 해시태그 허브·태그 피드 공통: 자동완성 후 /tag/:name 이동 (@param resultView 인기·최신 탭에서 이동 후 정렬 유지) */
export default function HashtagSearchBar({ inputId = 'hashtag-search', resultView }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const [goError, setGoError] = useState('');

  useEffect(() => {
    setGoError('');
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const prefix = normalizeTagForRequest(debounced);
        if (!prefix) {
          const { data } = await api.get('/hashtags/popular');
          if (!cancelled) setSuggestions(Array.isArray(data) ? data : []);
          return;
        }
        const { data } = await api.get('/hashtags/autocomplete', { params: { q: prefix } });
        let list = Array.isArray(data) ? data : [];
        if (list.length === 0) {
          const { data: pop } = await api.get('/hashtags/popular');
          list = Array.isArray(pop) ? pop : [];
        }
        if (!cancelled) setSuggestions(list);
      } catch {
        if (!cancelled) setSuggestions([]);
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

  const go = useCallback(
    async (nameOpt) => {
      const name =
        typeof nameOpt === 'string' && nameOpt.trim()
          ? normalizeTagForRequest(nameOpt)
          : normalizeTagForRequest(q);
      if (!name) return;
      setGoError('');
      setOpen(false);
      try {
        const { data } = await api.get(`/tag/${encodeURIComponent(name)}`, { params: { limit: 1 } });
        const tag = data?.hashtag;
        if (!tag || Number(tag.use_count ?? 0) < 1) {
          setGoError('태그 관련 게시글이 없습니다.');
          return;
        }
        const path = `/tag/${encodeURIComponent(name)}`;
        if (resultView === 'popular' || resultView === 'latest') {
          navigate(`${path}?view=${resultView}`);
        } else {
          navigate(path);
        }
      } catch {
        setGoError('태그를 확인할 수 없습니다.');
      }
    },
    [q, navigate, resultView]
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label className="feed-post-meta" htmlFor={inputId} style={{ display: 'block', marginBottom: '0.35rem' }}>
        해시태그 검색
      </label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          id={inputId}
          className="feed-search"
          type="search"
          placeholder="태그명 입력 후 이동"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void go();
            }
          }}
          style={{ flex: '1 1 200px' }}
          aria-label="해시태그 검색"
          aria-expanded={open}
          aria-controls={`${inputId}-suggest`}
          aria-autocomplete="list"
        />
        <button type="button" className="feed-btn-primary" onClick={() => void go()}>
          이동
        </button>
      </div>
      {goError ? (
        <p className="feed-compose-error" style={{ margin: '0.45rem 0 0', fontSize: '0.85rem' }}>
          {goError}
        </p>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul
          id={`${inputId}-suggest`}
          role="listbox"
          className="feed-card"
          style={{
            position: 'absolute',
            zIndex: 20,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 6,
            padding: '0.35rem 0',
            listStyle: 'none',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((row) => (
            <li key={row.hashtag_id} role="option">
              <button
                type="button"
                className="feed-hashtag-suggest-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void go(row.name)}
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
                <span className="feed-post-meta" style={{ marginLeft: 0, fontWeight: 400 }}>
                  · {row.use_count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
