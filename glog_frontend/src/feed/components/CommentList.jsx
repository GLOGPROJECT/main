export default function CommentList({ comments }) {
  return (
    <div style={{ marginTop: '1rem' }}>
      <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>댓글</h3>
      {comments.map((c) => (
        <div key={c.id} className="feed-comment">
          {c.is_deleted ? (
            <p className="feed-comment-deleted">삭제된 댓글입니다</p>
          ) : (
            <>
              <strong>{c.author}</strong>
              <span> · </span>
              <span>{c.body}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
