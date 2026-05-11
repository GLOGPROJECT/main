import { Navigate, useParams } from 'react-router-dom';

/** 예전 경로 /feed/tag/:slug → 공유 URL /tag/:slug */
export default function FeedTagRedirect() {
  const { slug } = useParams();
  const safe = slug != null ? encodeURIComponent(slug) : '';
  return <Navigate to={`/tag/${safe}`} replace />;
}
