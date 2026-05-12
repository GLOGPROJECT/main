import { useCallback, useEffect, useState } from 'react';
import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import FeedList from '../components/FeedList';

export default function FeedAnonymousPage() {
  const [sortOrder, setSortOrder] = useState('latest');
  const [draft, setDraft] = useState('');
  const [applied, setApplied] = useState('');
  const [prependPosts, setPrependPosts] = useState([]);

  useEffect(() => {
    const onNew = (e) => {
      const post = e.detail;
      if (!post?.id || post.type !== 'anonymous') return;
      setPrependPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
    };
    window.addEventListener('glog:new-post', onNew);
    return () => window.removeEventListener('glog:new-post', onNew);
  }, []);

  const runSearch = useCallback(() => {
    setApplied(draft.trim().slice(0, 100));
  }, [draft]);

  return (
    <>
      <div className="feed-tabs">
        <FeedTabs />
        <FeedSortAndTheme sortValue={sortOrder} onSortChange={setSortOrder} />
      </div>
      <div className="feed-card feed-card-surface" style={{ marginBottom: '1rem', padding: '0.85rem 1rem' }}>
        <p className="feed-post-meta" style={{ margin: '0 0 0.5rem', fontSize: '0.8rem' }}>
          익명으로 올린 글만 표시됩니다. 아래에서 본문에 포함된 단어·문장을 검색할 수 있어요. (태그 검색 아님)
        </p>
        <div className="feed-search-page-bar">
          <div className="feed-search-page-input-wrap">
            <div className="feed-search-wrap">
              <input
                className="feed-search"
                type="search"
                placeholder="익명 글 본문 검색…"
                aria-label="익명 게시글 본문 검색"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    runSearch();
                  }
                }}
              />
            </div>
          </div>
          <button type="button" className="feed-btn-primary" onClick={runSearch}>
            검색
          </button>
          {applied ? (
            <button
              type="button"
              className="feed-btn-outline"
              onClick={() => {
                setDraft('');
                setApplied('');
              }}
            >
              초기화
            </button>
          ) : null}
        </div>
      </div>
      <FeedList feedType="anonymous" sortOrder={sortOrder} anonymousSearch={applied} prependPosts={prependPosts} />
    </>
  );
}
