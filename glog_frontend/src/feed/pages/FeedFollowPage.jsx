import { useCallback, useState } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import FeedList from '../components/FeedList';

export default function FeedFollowPage() {
  const { user } = useAuth();
  const [followListOpen, setFollowListOpen] = useState(false);

  const openFollowList = useCallback(() => setFollowListOpen(true), []);

  return (
    <>
      <div className="feed-tabs">
        <FeedTabs />
        <FeedSortAndTheme
          showSort={false}
          toolbarStart={
            user ? (
              <button type="button" className="feed-follow-list-btn" onClick={openFollowList}>
                팔로우 목록
              </button>
            ) : null
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
