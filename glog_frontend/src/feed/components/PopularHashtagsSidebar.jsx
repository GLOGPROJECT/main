import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPopularHashtags } from '../api/searchApi';
import { getTagPillColors } from '../utils/tagPillColors';

const SIDEBAR_LIMIT = 8;

function formatCompactCount(n) {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (x >= 1_000) return `${(x / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(x);
}

export default function PopularHashtagsSidebar() {
  const queryClient = useQueryClient();
  const { data: rows = [], isError } = useQuery({
    queryKey: ['hashtags', 'popularSidebar', SIDEBAR_LIMIT],
    queryFn: () => fetchPopularHashtags(SIDEBAR_LIMIT),
    staleTime: 30_000,
  });

  useEffect(() => {
    const bump = () => {
      void queryClient.invalidateQueries({ queryKey: ['hashtags', 'popularSidebar'] });
    };
    window.addEventListener('glog:new-post', bump);
    window.addEventListener('glog:post-updated', bump);
    return () => {
      window.removeEventListener('glog:new-post', bump);
      window.removeEventListener('glog:post-updated', bump);
    };
  }, [queryClient]);

  const err = isError ? '인기 태그를 불러오지 못했습니다.' : '';

  return (
    <div className="feed-card feed-popular-tags">
      <div className="feed-popular-tags__head">
        <h3 className="feed-popular-tags__title">🔥 인기 태그</h3>
        <Link to="/feed/tag?view=feed" className="feed-popular-tags__more">
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
