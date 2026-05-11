import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import HashtagSearchBar from '../components/HashtagSearchBar';

export default function FeedTagHubPage() {
  return (
    <>
      <div className="feed-tabs">
        <FeedTabs />
        <FeedSortAndTheme showSort={false} />
      </div>
      <div className="feed-card" style={{ marginBottom: '1rem' }}>
        <HashtagSearchBar inputId="tag-hub-search" />
        <p className="feed-post-meta" style={{ margin: '0.65rem 0 0', fontSize: '0.78rem' }}>
          단일 태그 피드로 이동합니다. 공유 URL 형식: <code className="feed-code-inline">/tag/이름</code> (백엔드 연동 시 동일)
        </p>
      </div>
    </>
  );
}
