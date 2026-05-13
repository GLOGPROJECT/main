import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { getTagPillColors } from '../utils/tagPillColors';
import { MAX_TAG_SUBS, readSubscribedTagSlugs, TAG_SUBS_LS_KEY } from '../utils/tagSubscribeStorage';

const POPULAR_DIR_LIMIT = 200;

function writeSubscribedSlugs(list) {
  try {
    localStorage.setItem(TAG_SUBS_LS_KEY, JSON.stringify(list.slice(0, MAX_TAG_SUBS)));
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

/** 게시글에 등록된 해시태그 카드 목록 (검색 없음) */
export default function RegisteredHashtagDirectory() {
  const [toast, setToast] = useState(null);
  const [subs, setSubs] = useState(() => readSubscribedTagSlugs());

  const { data: registeredTags = [], isLoading: registeredTagsLoading } = useQuery({
    queryKey: ['hashtags', 'registered', POPULAR_DIR_LIMIT],
    queryFn: async () => {
      const { data } = await api.get('/hashtags/popular', { params: { limit: POPULAR_DIR_LIMIT } });
      return Array.isArray(data) ? data : [];
    },
  });

  useEffect(() => {
    setSubs(readSubscribedTagSlugs());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((msg) => setToast(msg), []);

  const toggleSubscribeTag = useCallback(
    (tagName) => {
      const key = String(tagName || '').trim();
      if (!key) return;
      const subscribed = subs.some((s) => s.toLowerCase() === key.toLowerCase());
      if (subscribed) {
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
    },
    [subs, showToast]
  );

  const copyTagUrl = useCallback(
    async (name) => {
      const path = `/tag/${encodeURIComponent(String(name || '').trim())}`;
      try {
        await navigator.clipboard.writeText(`${window.location.origin}${path}`);
        showToast('링크가 복사되었어요');
      } catch {
        showToast('클립보드 복사에 실패했어요');
      }
    },
    [showToast]
  );

  return (
    <>
      {toast ? (
        <div className="feed-toast" role="status">
          {toast}
        </div>
      ) : null}

      {registeredTagsLoading ? (
        <p className="feed-post-meta">불러오는 중…</p>
      ) : registeredTags.length === 0 ? (
        <div className="feed-card feed-card-surface">
          <p className="feed-post-meta" style={{ margin: 0 }}>
            아직 등록된 해시태그가 없습니다.
          </p>
        </div>
      ) : (
        registeredTags.map((row) => {
          const tagPath = `/tag/${encodeURIComponent(row.name)}`;
          const subbed = subs.some((s) => s.toLowerCase() === String(row.name).toLowerCase());
          const countLabel = `${formatCompactPostCount(row.use_count)} 게시글`;
          return (
            <div className="feed-card feed-card-surface feed-tag-hero-card" key={row.hashtag_id}>
              <div className="feed-tag-header feed-tag-header--hero">
                <div className="feed-tag-heading-pills">
                  <Link
                    to={{ pathname: tagPath, search: '?view=latest' }}
                    style={{ textDecoration: 'none' }}
                  >
                    <span
                      style={{
                        ...getTagPillColors(row.name),
                        borderRadius: '999px',
                        padding: '0.35rem 0.9rem',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        display: 'inline-block',
                        lineHeight: 1.25,
                      }}
                    >
                      {row.name}
                    </span>
                  </Link>
                  <span className="feed-tag-count-pill">{countLabel}</span>
                </div>
                <span className="feed-tag-header-grow" aria-hidden />
                <div className="feed-tag-header-actions">
                  <button type="button" className="feed-btn-primary" onClick={() => toggleSubscribeTag(row.name)}>
                    {subbed ? '구독 중 ✓' : '+ 구독'}
                  </button>
                  <button
                    type="button"
                    className="feed-btn-outline"
                    onClick={() => copyTagUrl(row.name)}
                    aria-label="태그 URL 복사"
                    title="링크 복사"
                  >
                    링크
                  </button>
                </div>
              </div>
              <p className="feed-post-meta" style={{ margin: 0, fontSize: '0.78rem' }}>
                URL: <code className="feed-code-inline">{tagPath}</code> — 공유 가능
              </p>
              <p className="feed-api-hint" style={{ marginTop: '0.35rem' }}>
                최신: 작성일 기준 정렬 · GET /tag/:tagname?sort=popular|latest
              </p>
            </div>
          );
        })
      )}
    </>
  );
}
