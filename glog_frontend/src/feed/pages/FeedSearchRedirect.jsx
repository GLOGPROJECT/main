import { Navigate, useSearchParams } from 'react-router-dom';

/** 예전 /feed/search?q= 주소 → 해시태그 허브 키워드 검색으로 연결 */
export default function FeedSearchRedirect() {
  const [sp] = useSearchParams();
  const q = sp.get('q');
  if (q != null && String(q).trim() !== '') {
    const enc = encodeURIComponent(String(q).trim().slice(0, 100));
    return <Navigate to={`/feed/tag?view=popular&q=${enc}`} replace />;
  }
  return <Navigate to="/feed/tag?view=popular" replace />;
}
