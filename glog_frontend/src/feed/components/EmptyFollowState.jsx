export default function EmptyFollowState() {
  return (
    <div className="feed-card feed-empty feed-empty-follow-wrap">
      <div className="feed-empty-follow-hero">
        <div className="feed-empty-icon" aria-hidden>
          👥
        </div>
        <h2>아직 팔로우한 개발자가 없어요</h2>
        <p>팔로우하면 이곳에 글이 표시돼요</p>
      </div>
    </div>
  );
}
