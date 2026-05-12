import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import HashtagSearchBar from '../components/HashtagSearchBar';
import RegisteredHashtagDirectory from '../components/RegisteredHashtagDirectory';

const VIEW_FEED = 'feed';
const VIEW_POPULAR = 'popular';
const VIEW_LATEST = 'latest';

function normalizeView(v) {
  const x = String(v || '').toLowerCase();
  if (x === VIEW_POPULAR || x === VIEW_LATEST || x === VIEW_FEED) return x;
  return VIEW_LATEST;
}

export default function FeedTagHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = normalizeView(searchParams.get('view'));

  const setView = useCallback(
    (next) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('view', next);
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const tabClass = (id) => `feed-tab ${view === id ? 'feed-tab-active' : ''}`;

  return (
    <>
      <div className="feed-tabs">
        <FeedTabs />
        <FeedSortAndTheme showSort={false} />
      </div>

      <div className="feed-tabs-row feed-search-page-subtabs" role="tablist" aria-label="해시태그 허브 구분">
        <button type="button" role="tab" className={tabClass(VIEW_POPULAR)} onClick={() => setView(VIEW_POPULAR)}>
          인기
        </button>
        <button type="button" role="tab" className={tabClass(VIEW_LATEST)} onClick={() => setView(VIEW_LATEST)}>
          최신
        </button>
        <button type="button" role="tab" className={tabClass(VIEW_FEED)} onClick={() => setView(VIEW_FEED)}>
          피드
        </button>
      </div>

      {view === VIEW_FEED ? (
        <div className="feed-tag-search-sticky">
          <RegisteredHashtagDirectory />
        </div>
      ) : (
        <>
          <div className="feed-tag-search-sticky">
            <div className="feed-card feed-tag-search-card feed-card-surface">
              <HashtagSearchBar inputId={`tag-hub-search-${view}`} resultView={view} />
            </div>
          </div>
          <p className="feed-post-meta" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
            해시태그를 검색한 뒤 <strong>이동</strong>하면 해당 태그가 달린 게시글을 볼 수 있어요.
          </p>
        </>
      )}
    </>
  );
}
