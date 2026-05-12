import { useCallback, useState } from 'react';
import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import FeedList from '../components/FeedList';

export default function FeedFollowPage() {
  const [followListOpen, setFollowListOpen] = useState(false);

  const openFollowList = useCallback(() => setFollowListOpen(true), []);

  return (
    <>
      <div className="feed-tabs">
        <FeedTabs />
        <FeedSortAndTheme
          showSort={false}
          toolbarStart={
            <button type="button" className="feed-follow-list-btn" onClick={openFollowList}>
              팔로우 목록
            </button>
          }
        />
      </div>
      <FeedList
        feedType="following"
        sortOrder="latest"
        followListOpen={followListOpen}
        onFollowListOpenChange={setFollowListOpen}
        hideFollowListToolbar
      />
    </>
  );
}
