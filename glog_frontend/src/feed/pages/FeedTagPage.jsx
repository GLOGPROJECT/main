import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import FeedTabs from '../components/FeedTabs';
import SortToggle from '../components/SortToggle';
import FeedList from '../components/FeedList';
import HashtagSearchBar from '../components/HashtagSearchBar';
import { getMockTagPostCountDisplay } from '../mocks/feedMock';

const SUB_LS = 'glog:hashtag-subscribe-v1';
const MAX_TAG_SUBS = 5;

function readSubscribedSlugs() {
  try {
    const raw = localStorage.getItem(SUB_LS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map((s) => String(s)) : [];
  } catch {
    return [];
  }
}

function writeSubscribedSlugs(list) {
  try {
    localStorage.setItem(SUB_LS, JSON.stringify(list.slice(0, MAX_TAG_SUBS)));
  } catch {
    /* ignore */
  }
}

export default function FeedTagPage() {
  const { slug } = useParams();
  const decoded = slug ? decodeURIComponent(slug) : '';
  const [sortOrder, setSortOrder] = useState('latest');
  const [toast, setToast] = useState(null);
  const [subs, setSubs] = useState(() => readSubscribedSlugs());

  useEffect(() => {
    setSubs(readSubscribedSlugs());
  }, [slug]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const sharePath = `/tag/${encodeURIComponent(decoded || '')}`;
  const fullShareUrl = useMemo(() => `${window.location.origin}${sharePath}`, [sharePath]);

  const isSubscribed = useMemo(
    () => subs.some((s) => s.toLowerCase() === decoded.toLowerCase()),
    [subs, decoded]
  );

  const showToast = useCallback((msg) => setToast(msg), []);

  const copyShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      showToast('링크가 복사되었어요');
    } catch {
      showToast('클립보드 복사에 실패했어요');
    }
  }, [fullShareUrl, showToast]);

  const toggleSubscribe = useCallback(() => {
    const key = decoded.trim();
    if (!key) return;

    if (isSubscribed) {
      const next = subs.filter((s) => s.toLowerCase() !== key.toLowerCase());
      setSubs(next);
      writeSubscribedSlugs(next);
      /* 연동 시: DELETE /hashtags/:hashtagId/subscribe */
      return;
    }

    if (subs.length >= MAX_TAG_SUBS) {
      showToast('태그 구독은 최대 5개까지 가능해요');
      return;
    }

    const next = [...subs, key];
    setSubs(next);
    writeSubscribedSlugs(next);
    /* 연동 시: POST /hashtags/:hashtagId/subscribe */
  }, [decoded, isSubscribed, subs, showToast]);

  const postCountLabel = getMockTagPostCountDisplay(decoded);

  return (
    <>
      {toast ? (
        <div className="feed-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="feed-tabs">
        <FeedTabs />
        <SortToggle value={sortOrder} onChange={setSortOrder} />
      </div>

      <div className="feed-tag-search-sticky">
        <div className="feed-card feed-tag-search-card">
          <HashtagSearchBar key={slug} inputId="tag-feed-search" />
        </div>
      </div>

      <div className="feed-card" style={{ marginBottom: '1rem' }}>
        <div className="feed-tag-header" style={{ marginBottom: '0.5rem' }}>
          <h1 className="feed-tag-title">#{decoded || '태그'}</h1>
          <span className="feed-tag-count-pill">{postCountLabel}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="feed-btn-primary" onClick={toggleSubscribe}>
            {isSubscribed ? '구독 중 ✓' : '+ 구독'}
          </button>
          <button type="button" className="feed-btn-ghost" onClick={copyShare} aria-label="현재 태그 피드 URL 복사" title="링크 복사">
            링크
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
          <p className="feed-post-meta" style={{ margin: 0, fontSize: '0.78rem' }}>
            URL: <code className="feed-code-inline">{sharePath}</code> — 공유 가능
          </p>
        </div>
        <p className="feed-api-hint" style={{ marginTop: '0.35rem' }}>
          피드 목: GET /tag/:tagname?cursor=&limit=20 · 구독: POST/DELETE /hashtags/:hashtagId/subscribe (연동 시)
        </p>
      </div>

      <FeedList feedType="tag" sortOrder={sortOrder} tagSlug={decoded} />
    </>
  );
}
