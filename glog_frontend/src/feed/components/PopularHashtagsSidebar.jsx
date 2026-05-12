import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { getTagPillColors } from '../utils/tagPillColors';

function formatCompactCount(n) {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (x >= 1_000) return `${(x / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(x);
}

export default function PopularHashtagsSidebar() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/hashtags/popular')
      .then(({ data }) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setErr('인기 태그를 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="feed-card feed-popular-tags">
      <div className="feed-popular-tags__head">
        <h3 className="feed-popular-tags__title">🔥 인기 태그</h3>
        <Link to="/feed/tag" className="feed-popular-tags__more">
          더보기 &gt;
        </Link>
      </div>
      {err ? (
        <p className="feed-post-meta" style={{ margin: 0 }}>
          {err}
        </p>
      ) : rows.length === 0 ? (
        <p className="feed-post-meta" style={{ margin: 0 }}>
          아직 등록된 태그가 없습니다.
        </p>
      ) : (
        <ul className="feed-popular-tags__list">
          {rows.map((r) => (
            <li key={r.hashtag_id}>
              <Link to={`/tag/${encodeURIComponent(r.name)}`} className="feed-popular-tags__row">
                <span className="feed-popular-tags__label">
                  <span
                    style={{
                      ...getTagPillColors(r.name),
                      borderRadius: '999px',
                      padding: '0.18rem 0.55rem',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      display: 'inline-block',
                    }}
                  >
                    {r.name}
                  </span>
                </span>
                <span className="feed-popular-tags__count">
                  {formatCompactCount(r.use_count)} posts
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
