import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function normalizeTagInput(raw) {
  return raw.replace(/^#+/, '').trim();
}

/** 해시태그 허브·태그 피드 공통: 입력 후 /tag/:name 이동 */
export default function HashtagSearchBar({ inputId = 'hashtag-search' }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const go = () => {
    const name = normalizeTagInput(q);
    if (!name) return;
    navigate(`/tag/${encodeURIComponent(name)}`);
  };

  return (
    <>
      <label className="feed-post-meta" htmlFor={inputId} style={{ display: 'block', marginBottom: '0.35rem' }}>
        해시태그 검색
      </label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          id={inputId}
          className="feed-search"
          type="search"
          placeholder="# 또는 태그명 입력 후 이동"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go();
            }
          }}
          style={{ flex: '1 1 200px' }}
          aria-label="해시태그 검색"
        />
        <button type="button" className="feed-btn-primary" onClick={go}>
          이동
        </button>
      </div>
    </>
  );
}
