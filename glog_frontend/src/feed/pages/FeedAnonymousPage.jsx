import { useState } from 'react';
import FeedTabs from '../components/FeedTabs';
import SortToggle from '../components/SortToggle';
import FeedList from '../components/FeedList';

export default function FeedAnonymousPage() {
  const [sortOrder, setSortOrder] = useState('latest');

  return (
    <>
      <div className="feed-tabs">
        <FeedTabs />
        <SortToggle value={sortOrder} onChange={setSortOrder} />
      </div>
      <div className="feed-card feed-post-meta" style={{ marginBottom: '1rem', padding: '0.85rem' }}>
        익명 유저 게시글만 · 목 데이터 (연동 시 GET /feed?type=anonymous&cursor=)
      </div>
      <FeedList feedType="anonymous" sortOrder={sortOrder} />
    </>
  );
}
