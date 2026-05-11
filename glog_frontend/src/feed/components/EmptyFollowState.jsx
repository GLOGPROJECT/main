export default function EmptyFollowState() {
  return (
    <div className="feed-card feed-empty">
      <div className="feed-empty-icon" aria-hidden>
        👥
      </div>
      <h2>아직 팔로우한 개발자가 없어요</h2>
      <p>팔로우하면 이곳에 글이 표시돼요</p>
      <p className="feed-post-meta" style={{ marginTop: '0.75rem' }}>
        follows 테이블 — following_id 목록 없음 (목업 안내)
      </p>
    </div>
  );
}
