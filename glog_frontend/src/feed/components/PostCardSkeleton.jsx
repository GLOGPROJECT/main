export default function PostCardSkeleton() {
  return (
    <div className="feed-card feed-post feed-skeleton-card" aria-hidden>
      <div className="feed-post-header">
        <div className="feed-skeleton-circle" />
        <div style={{ flex: 1 }}>
          <div className="feed-skeleton-bar feed-skeleton-bar-md" />
          <div className="feed-skeleton-bar feed-skeleton-bar-sm" style={{ marginTop: 8 }} />
        </div>
      </div>
      <div className="feed-skeleton-tags">
        <span className="feed-skeleton-pill" />
        <span className="feed-skeleton-pill" />
      </div>
      <div className="feed-skeleton-bar feed-skeleton-bar-lg" style={{ marginTop: 12 }} />
      <div className="feed-skeleton-bar feed-skeleton-bar-lg" />
      <div className="feed-skeleton-bar feed-skeleton-bar-md" />
      <div className="feed-skeleton-actions">
        <span className="feed-skeleton-pill" />
        <span className="feed-skeleton-pill" />
        <span className="feed-skeleton-pill" />
      </div>
    </div>
  );
}
