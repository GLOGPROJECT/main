/**
 * 팔로우는 있으나 팔로우 피드에 노출될 글이 없을 때
 * @param {() => void} [onOpenFollowList]
 */
export default function FollowingNoPostsState({ onOpenFollowList }) {
  return (
    <div className="feed-card feed-empty feed-following-noposts">
      <div className="feed-following-noposts-inner">
        {typeof onOpenFollowList === 'function' ? (
          <div className="feed-following-noposts-topbar">
            <button type="button" className="feed-follow-list-btn" onClick={onOpenFollowList}>
              팔로우 목록
            </button>
          </div>
        ) : null}
        <div className="feed-following-noposts-body">
          <div className="feed-empty-icon" aria-hidden>
            📭
          </div>
          <h2>팔로우한 개발자의 글이 아직 없어요</h2>
          <p>팔로우한 분이 글을 올리면 여기에 표시돼요.</p>
        </div>
      </div>
    </div>
  );
}
