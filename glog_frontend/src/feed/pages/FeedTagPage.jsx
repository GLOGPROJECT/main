import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import FeedList from '../components/FeedList';
import HashtagSearchBar from '../components/HashtagSearchBar';
import RegisteredHashtagDirectory from '../components/RegisteredHashtagDirectory';
import { getTagPillColors } from '../utils/tagPillColors';

const SUB_LS = 'glog:hashtag-subscribe-v1';
const MAX_TAG_SUBS = 5;

const VIEW_POPULAR = 'popular';
const VIEW_LATEST = 'latest';
const VIEW_FEED = 'feed';

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
    window.dispatchEvent(new CustomEvent('glog:tag-subs-changed'));
  } catch {
    /* ignore */
  }
}

function formatCompactPostCount(n) {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (x >= 1_000) return `${(x / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(x);
}

function normalizeTagView(v) {
  const x = String(v || '').toLowerCase();
  if (x === VIEW_POPULAR || x === VIEW_LATEST || x === VIEW_FEED) return x;
  return VIEW_LATEST;
}

export default function FeedTagPage() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const decoded = slug ? decodeURIComponent(slug) : '';
  const view = normalizeTagView(searchParams.get('view'));
  const [toast, setToast] = useState(null);
  const [subs, setSubs] = useState(() => readSubscribedSlugs());
  const [tagMeta, setTagMeta] = useState(undefined);

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

  useEffect(() => {
    setSubs(readSubscribedSlugs());
  }, [slug]);

  useLayoutEffect(() => {
    setTagMeta(undefined);
  }, [decoded]);

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
      return;
    }

    if (subs.length >= MAX_TAG_SUBS) {
      showToast('태그 구독은 최대 5개까지 가능해요');
      return;
    }

    const next = [...subs, key];
    setSubs(next);
    writeSubscribedSlugs(next);
  }, [decoded, isSubscribed, subs, showToast]);

  const onTagFeedMeta = useCallback((h) => {
    setTagMeta(h);
  }, []);

  const postCountLabel = useMemo(() => {
    if (!decoded.trim()) return '';
    if (tagMeta === undefined) return '조회 중…';
    const n = Number(tagMeta?.use_count ?? 0);
    return `${formatCompactPostCount(n)} 게시글`;
  }, [decoded, tagMeta]);

  const listSort = view === VIEW_POPULAR ? 'popular' : 'latest';
  const tabClass = (id) => `feed-tab ${view === id ? 'feed-tab-active' : ''}`;
  const searchResultView = view === VIEW_POPULAR ? VIEW_POPULAR : VIEW_LATEST;
  const tagHeroVisible =
    tagMeta !== undefined && tagMeta != null && Number(tagMeta.use_count ?? 0) > 0;

  return (
    <>
      {toast ? (
        <div className="feed-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="feed-tabs">
        <FeedTabs />
        <FeedSortAndTheme showSort={false} />
      </div>

      <div className="feed-tabs-row feed-search-page-subtabs" role="tablist" aria-label="태그 피드 구분">
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
      ) : null}

      {view !== VIEW_FEED ? (
        <>
          <div className="feed-tag-search-sticky">
            <div className="feed-card feed-tag-search-card feed-card-surface">
              <HashtagSearchBar key={slug} inputId="tag-feed-search-main" resultView={searchResultView} />
            </div>
          </div>

          {tagHeroVisible ? (
            <div className="feed-card feed-card-surface feed-tag-hero-card">
              <div className="feed-tag-header feed-tag-header--hero">
                <div className="feed-tag-heading-pills">
                  <h1 className="feed-tag-title" style={{ margin: 0 }}>
                    <span
                      style={{
                        ...getTagPillColors(decoded || 'tag'),
                        borderRadius: '999px',
                        padding: '0.35rem 1rem',
                        fontSize: '1.35rem',
                        fontWeight: 700,
                        display: 'inline-block',
                        lineHeight: 1.25,
                      }}
                    >
                      {decoded || '태그'}
                    </span>
                  </h1>
                  <span className="feed-tag-count-pill">{postCountLabel}</span>
                </div>
                <span className="feed-tag-header-grow" aria-hidden />
                <div className="feed-tag-header-actions">
                  <button type="button" className="feed-btn-primary" onClick={toggleSubscribe}>
                    {isSubscribed ? '구독 중 ✓' : '+ 구독'}
                  </button>
                  <button type="button" className="feed-btn-outline" onClick={copyShare} aria-label="현재 태그 피드 URL 복사" title="링크 복사">
                    링크
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                <p className="feed-post-meta" style={{ margin: 0, fontSize: '0.78rem' }}>
                  URL: <code className="feed-code-inline">{sharePath}</code> — 공유 가능
                </p>
              </div>
              <p className="feed-api-hint" style={{ marginTop: '0.35rem' }}>
                {view === VIEW_POPULAR ? '인기: 좋아요 수·작성일 기준 정렬' : '최신: 작성일 기준 정렬'} · GET /tag/:tagname?sort=popular|latest
              </p>
            </div>
          ) : null}

          <FeedList feedType="tag" sortOrder={listSort} tagSlug={decoded} onTagFeedMeta={onTagFeedMeta} />
        </>
      ) : null}
    </>
  );
}
