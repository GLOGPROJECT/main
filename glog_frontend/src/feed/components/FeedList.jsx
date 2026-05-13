import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useInfiniteQuery } from '@tanstack/react-query';
import PostCard from './PostCard';
import PostCardSkeleton from './PostCardSkeleton';
import EmptyFollowState from './EmptyFollowState';
import FollowingNoPostsState from './FollowingNoPostsState';
import SuggestedUsersPanel from './SuggestedUsersPanel';
import FollowListModal from './FollowListModal';
import { fetchFeedFromApi } from '../api/feedApi';
import { useAuth } from '../../auth/hooks/useAuth';
import { API_ORIGIN } from '../../api/axios';

/**
 * @param {'all'|'following'|'tag'|'user'|'user_likes'|'anonymous'} feedType
 * @param {'latest'|'popular'} sortOrder
 * @param {string} [tagSlug]
 * @param {number} [userId]
 * @param {object[]} [prependPosts] — 새 글 즉시 반영: 전체(all)·익명(anonymous)·유저 본인(user) 목록
 * @param {boolean} [followListOpen] — 팔로우 탭: 모달 열림(부모 제어 시)
 * @param {(open: boolean) => void} [onFollowListOpenChange]
 * @param {boolean} [hideFollowListToolbar] — 팔로우 탭: 본문 위 툴바의 팔로우 목록 버튼 숨김
 * @param {string} [anonymousSearch] — 익명 탭: 본문 검색어(GET /feed?type=anonymous&q=)
 * @param {(post: object) => void} [onPostSelect] — 지정 시 카드 클릭이 /feed/post 로 이동하지 않고 콜백만 호출
 */
export default function FeedList({
  feedType,
  sortOrder,
  tagSlug = '',
  userId,
  prependPosts = [],
  onTagFeedMeta,
  followListOpen: controlledFollowOpen,
  onFollowListOpenChange,
  hideFollowListToolbar = false,
  anonymousSearch = '',
  onPostSelect,
}) {
  const { user } = useAuth();
  const followControlled =
    controlledFollowOpen !== undefined && typeof onFollowListOpenChange === 'function';
  const [internalFollowOpen, setInternalFollowOpen] = useState(false);
  const followOpen = followControlled ? controlledFollowOpen : internalFollowOpen;
  const setFollowOpen = followControlled ? onFollowListOpenChange : setInternalFollowOpen;
  const blockFollowListOpenUntilRef = useRef(0);
  const prevFollowingCountRef = useRef(null);
  const prependKey = useMemo(() => prependPosts.map((p) => p.id).join('|'), [prependPosts]);

  const queryKey = useMemo(
    () => [
      'feed',
      feedType,
      sortOrder,
      tagSlug || '',
      String(userId ?? ''),
      feedType === 'anonymous' ? String(anonymousSearch || '').trim() : '',
      feedType === 'anonymous' || feedType === 'user_likes' ? '' : prependKey,
      user?.user_id ?? 'g',
    ],
    [feedType, sortOrder, tagSlug, userId, anonymousSearch, prependKey, user?.user_id]
  );

  const followingNeedsAuth = feedType === 'following' && !user;
  const userFeedDisabled =
    (feedType === 'user' || feedType === 'user_likes') &&
    (!Number.isFinite(Number(userId)) || Number(userId) < 1);
  const queryEnabled = !followingNeedsAuth && !userFeedDisabled;

  const { data, status, error, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchFeedFromApi({
        feedType,
        cursor: pageParam ?? null,
        tagSlug,
        userId,
        limit: 20,
        sortOrder,
        anonymousSearch: feedType === 'anonymous' ? anonymousSearch : undefined,
      }),
    initialPageParam: null,
    getNextPageParam: (last) => (last?.nextCursor != null ? last.nextCursor : undefined),
    enabled: queryEnabled,
  });

  useEffect(() => {
    if (feedType !== 'tag' || !onTagFeedMeta) return;
    if (status !== 'success' || !data?.pages?.length) return;
    const h = data.pages[0]?.hashtag ?? null;
    const slugNorm = String(tagSlug || '').trim().toLowerCase();
    if (slugNorm && h?.name && String(h.name).toLowerCase() !== slugNorm) return;
    onTagFeedMeta(h);
  }, [feedType, status, data, onTagFeedMeta, tagSlug]);

  const { ref: sentinelRef, inView } = useInView({ rootMargin: '140px', threshold: 0 });

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [sortOrder, feedType, anonymousSearch]);

  useEffect(() => {
    if (!queryEnabled || !inView || !hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [queryEnabled, inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const bootPrefetch = useRef(false);
  useEffect(() => {
    bootPrefetch.current = false;
  }, [queryKey]);

  useEffect(() => {
    if (!queryEnabled || bootPrefetch.current || status !== 'success') return;
    if (hasNextPage && !isFetchingNextPage) {
      bootPrefetch.current = true;
      fetchNextPage();
    }
  }, [queryEnabled, status, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const flat = useMemo(() => {
    const server = data?.pages ? data.pages.flatMap((p) => p.items) : [];
    let preList = [];
    if (feedType === 'all' && prependPosts.length) {
      preList = prependPosts;
    } else if (feedType === 'user' && prependPosts.length) {
      preList = prependPosts;
    } else if (feedType === 'anonymous' && prependPosts.length) {
      const q = String(anonymousSearch || '').trim();
      preList = prependPosts.filter((p) => {
        if (!p?.id || p.type !== 'anonymous') return false;
        if (!q) return true;
        const hay = `${p.body ?? ''}\n${p.code?.snippet ?? ''}`;
        return hay.includes(q);
      });
    }
    if (!preList.length) return server;
    const seen = new Set(server.map((p) => String(p.id)));
    const pre = preList.filter((p) => p?.id != null && !seen.has(String(p.id)));
    return [...pre, ...server];
  }, [data, feedType, prependPosts, anonymousSearch]);

  const followingEmptyMeta = useMemo(() => {
    if (feedType !== 'following' || status !== 'success' || !data?.pages?.length) {
      return { count: 0 };
    }
    const p0 = data.pages[0];
    return {
      count: Number(p0?.following_count ?? 0),
    };
  }, [feedType, status, data]);

  useEffect(() => {
    if (feedType !== 'following') {
      prevFollowingCountRef.current = null;
      return;
    }
    const prev = prevFollowingCountRef.current;
    const next = followingEmptyMeta.count;
    if (prev === 0 && next > 0 && flat.length === 0) {
      setFollowOpen(false);
      blockFollowListOpenUntilRef.current = Date.now() + 750;
    }
    prevFollowingCountRef.current = next;
  }, [feedType, followingEmptyMeta.count, flat.length]);

  const openFollowListSafe = useCallback(() => {
    if (Date.now() < blockFollowListOpenUntilRef.current) return;
    setFollowOpen(true);
  }, [setFollowOpen]);

  const followListModalEl =
    feedType === 'following' ? <FollowListModal open={followOpen} onClose={() => setFollowOpen(false)} /> : null;

  const followSuggestTopCard =
    feedType === 'following' && user ? (
      <div className="feed-card feed-follow-tab-suggest-card">
        <SuggestedUsersPanel className="feed-suggested-in-follow-tab" />
      </div>
    ) : null;

  if (followingNeedsAuth) {
    return (
      <div className="feed-card feed-empty" style={{ textAlign: 'left', padding: '1.15rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>팔로우 피드는 로그인 후 이용할 수 있어요</h2>
        <p className="feed-post-meta" style={{ marginTop: '0.4rem' }}>
          GitHub 계정으로 로그인하면 팔로우한 사용자의 글만 모아 볼 수 있습니다.
        </p>
        <button
          type="button"
          className="feed-btn-primary"
          style={{ display: 'inline-block', marginTop: '0.65rem' }}
          onClick={() => window.location.assign(`${API_ORIGIN}/api/auth/github`)}
        >
          GitHub으로 로그인
        </button>
      </div>
    );
  }

  if (userFeedDisabled) {
    return (
      <div className="feed-card feed-empty feed-card-surface">
        <p style={{ margin: 0 }}>잘못된 사용자입니다.</p>
      </div>
    );
  }

  if (status === 'pending') {
    if (feedType === 'following' && user) {
      return (
        <div className="feed-follow-tab-stack">
          {followSuggestTopCard}
          <PostCardSkeleton />
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
      );
    }
    return (
      <>
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </>
    );
  }

  if (status === 'error') {
    const code = error?.response?.data?.code;
    const detail =
      (feedType === 'user' || feedType === 'user_likes') && code === 'USER_NOT_FOUND'
        ? '사용자를 찾을 수 없습니다.'
        : error?.response?.data?.error || error?.message || 'unknown';
    return (
      <div className="feed-card feed-compose-error" style={{ padding: '1rem' }}>
        피드를 불러오지 못했습니다: {detail}
      </div>
    );
  }

  if (flat.length === 0) {
    if (feedType === 'following') {
      if (followingEmptyMeta.count > 0) {
        return (
          <>
            <div className="feed-follow-tab-stack">
              {followSuggestTopCard}
              <FollowingNoPostsState
                onOpenFollowList={hideFollowListToolbar ? undefined : openFollowListSafe}
              />
            </div>
            {followListModalEl}
          </>
        );
      }
      return (
        <div className="feed-follow-tab-stack">
          {followSuggestTopCard}
          <EmptyFollowState />
        </div>
      );
    }
    if (feedType === 'tag') {
      const h0 = data?.pages?.[0]?.hashtag ?? null;
      const uc = Number(h0?.use_count ?? 0);
      if (!h0 || uc < 1) {
        return (
          <div className="feed-card feed-empty feed-card-surface">
            <p style={{ margin: 0 }}>태그 관련 게시글이 없습니다.</p>
          </div>
        );
      }
      return (
        <div className="feed-card feed-empty">
          <p>게시글이 없어요</p>
        </div>
      );
    }
    if (feedType === 'user' || feedType === 'user_likes') {
      return (
        <div className="feed-card feed-empty">
          <p style={{ margin: 0 }}>
            {feedType === 'user_likes' ? '좋아요한 게시글이 없어요' : '게시글이 없어요'}
          </p>
        </div>
      );
    }
    return (
      <div className="feed-card feed-empty">
        <p>표시할 게시글이 없습니다.</p>
      </div>
    );
  }

  return (
    <>
      {feedType === 'following' && user ? (
        <div className="feed-follow-tab-stack">
          {followSuggestTopCard}
          <div className="feed-follow-tab-feed">
            {!hideFollowListToolbar ? (
              <div className="feed-follow-list-toolbar">
                <button type="button" className="feed-follow-list-btn" onClick={openFollowListSafe}>
                  팔로우 목록
                </button>
              </div>
            ) : null}
            {flat.map((post) => (
              <PostCard key={String(post.id)} post={post} onSelect={onPostSelect} />
            ))}
            {isFetchingNextPage && (
              <>
                <PostCardSkeleton />
                <PostCardSkeleton />
                <PostCardSkeleton />
              </>
            )}
            {hasNextPage ? <div ref={sentinelRef} style={{ height: 1 }} aria-hidden /> : null}
            {isFetching && !isFetchingNextPage && flat.length > 0 ? (
              <p className="feed-post-meta" style={{ textAlign: 'center', padding: '0.5rem' }}>
                새로고침 중…
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {flat.map((post) => (
            <PostCard key={String(post.id)} post={post} onSelect={onPostSelect} />
          ))}
          {isFetchingNextPage && (
            <>
              <PostCardSkeleton />
              <PostCardSkeleton />
              <PostCardSkeleton />
            </>
          )}
          {hasNextPage ? <div ref={sentinelRef} style={{ height: 1 }} aria-hidden /> : null}
          {isFetching && !isFetchingNextPage && flat.length > 0 ? (
            <p className="feed-post-meta" style={{ textAlign: 'center', padding: '0.5rem' }}>
              새로고침 중…
            </p>
          ) : null}
        </>
      )}
      {followListModalEl}
    </>
  );
}
