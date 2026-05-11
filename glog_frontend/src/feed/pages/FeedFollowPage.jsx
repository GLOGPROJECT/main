import { useState } from 'react';
import FeedTabs from '../components/FeedTabs';
import SortToggle from '../components/SortToggle';
import FeedList from '../components/FeedList';

export default function FeedFollowPage() {
  const [sortOrder, setSortOrder] = useState('latest');

  return (
    <>
      <div className="feed-tabs">
        <FeedTabs />
        <SortToggle value={sortOrder} onChange={setSortOrder} />
      </div>
      <FeedList feedType="following" sortOrder={sortOrder} />
    </>
  );
}
