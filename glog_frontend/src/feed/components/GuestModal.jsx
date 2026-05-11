import { Link } from 'react-router-dom';

export default function GuestModal({ open, onClose, onBrowseLater, browseEnabled = false }) {
  if (!open) return null;

  return (
    <div
      className="feed-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-title"
      onClick={onClose}
    >
      <div className="feed-modal" style={{ maxWidth: 400, marginTop: '4rem' }} onClick={(e) => e.stopPropagation()}>
        <div className="feed-modal-body" style={{ textAlign: 'center', paddingTop: '1.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }} aria-hidden>
            GLog 🌍
          </div>
          <h2 id="guest-title" className="feed-modal-title" style={{ textAlign: 'center', width: '100%' }}>
            계속하려면 로그인이 필요해요
          </h2>
          <p className="feed-post-meta" style={{ marginTop: '0.5rem' }}>GitHub 계정으로 바로 이어서 사용할 수 있어요.</p>
          <Link to="/" className="feed-btn-primary" style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none' }}>
            <span aria-hidden style={{ marginRight: '0.4rem' }}>🐙</span>
            GitHub으로 로그인
          </Link>
          <div style={{ marginTop: '1rem' }}>
            <button type="button" className="feed-btn-outline" onClick={onBrowseLater} disabled={!browseEnabled}>
              나중에 둘러보기
            </button>
            <p className="feed-post-meta" style={{ marginTop: '0.35rem', fontSize: '0.7rem' }}>
              {browseEnabled ? '지금은 모달을 닫고 둘러볼 수 있어요.' : '5초 후 활성화됩니다.'}
            </p>
          </div>
          <button type="button" className="feed-modal-close" style={{ marginTop: '1rem' }} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
