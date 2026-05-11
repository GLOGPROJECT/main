import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import { useInfiniteQuery } from '@tanstack/react-query';
import PostCard from './PostCard';
import PostCardSkeleton from './PostCardSkeleton';
import EmptyFollowState from './EmptyFollowState';
import { fetchMockFeedPage } from '../mocks/mockInfiniteFeed';

/**
 * @param {'all'|'following'|'tag'|'anonymous'} feedType
 * @param {'latest'|'popular'} sortOrder
 * @param {string} [tagSlug]
 * @param {object[]} [prependPosts] — 전체 피드 새 글 (목)
 */
export default function FeedList({ feedType, sortOrder, tagSlug = '', prependPosts = [] }) {
  const prependKey = useMemo(() => prependPosts.map((p) => p.id).join('|'), [prependPosts]);

  const queryKey = useMemo(
    () => ['feed', feedType, sortOrder, tagSlug || '', prependKey],
    [feedType, sortOrder, tagSlug, prependKey]
  );

  const enabled = feedType !== 'following';

  const { data, status, error, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchMockFeedPage({
        feedType,
        cursor: pageParam ?? null,
        sortOrder,
        tagSlug,
        prependPosts,
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });

  const { ref: sentinelRef, inView } = useInView({ rootMargin: '140px', threshold: 0 });

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [sortOrder]);

  useEffect(() => {
    if (!enabled || !inView || !hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [enabled, inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const bootPrefetch = useRef(false);
  useEffect(() => {
    bootPrefetch.current = false;
  }, [queryKey]);

  useEffect(() => {
    if (!enabled || bootPrefetch.current || status !== 'success') return;
    if (hasNextPage && !isFetchingNextPage) {
      bootPrefetch.current = true;
      fetchNextPage();
    }
  }, [enabled, status, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const flat = useMemo(() => (data?.pages ? data.pages.flatMap((p) => p.items) : []), [data]);

  if (feedType === 'following') {
    return <EmptyFollowState />;
  }

  if (status === 'pending') {
    return (
      <>
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </>
    );
  }

  if (status === 'error') {
    return (
      <div className="feed-card feed-compose-error" style={{ padding: '1rem' }}>
        목 피드 로드 실패: {error?.message || 'unknown'}
      </div>
    );
  }

  if (flat.length === 0) {
    if (feedType === 'tag') {
      return (
        <div className="feed-card feed-empty">
          <p>게시글이 없어요</p>
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
      {flat.map((post) => (
        <PostCard key={post.id} post={post} />
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
  );
}
