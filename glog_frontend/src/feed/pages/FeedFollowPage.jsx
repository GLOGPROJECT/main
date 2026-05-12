import { useState } from 'react';
import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import FeedList from '../components/FeedList';

export default function FeedFollowPage() {
  const [sortOrder, setSortOrder] = useState('latest');

  return (
    <>
      <div className="feed-tabs">
        <FeedTabs />
        <FeedSortAndTheme sortValue={sortOrder} onSortChange={setSortOrder} />
      </div>
      <FeedList feedType="following" sortOrder={sortOrder} />
    </>
  );
}
