import { API_ORIGIN } from '../../api/axios';

function startGithubOAuth() {
  window.location.assign(`${API_ORIGIN}/api/auth/github`);
}

/**
 * @param {boolean} [isLoggedIn] — true면 로그인 유도 UI 없이 안내만 표시
 */
export default function GuestModal({ open, onClose, onBrowseLater, browseEnabled = false, isLoggedIn = false }) {
  if (!open) return null;

  if (isLoggedIn) {
    return (
      <div
        className="feed-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onClick={onClose}
      >
        <div className="feed-modal" style={{ maxWidth: 400, marginTop: '4rem' }} onClick={(e) => e.stopPropagation()}>
          <div className="feed-modal-body" style={{ textAlign: 'center', paddingTop: '1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }} aria-hidden>
              GLog 🌍
            </div>
            <h2 id="guide-title" className="feed-modal-title" style={{ textAlign: 'center', width: '100%' }}>
              이용 약관
            </h2>
            <p className="feed-post-meta" style={{ marginTop: '0.75rem', textAlign: 'left', lineHeight: 1.5 }}>
              GLog 피드·계정 서비스는 GitHub 로그인 기준으로 운영됩니다. 게시물·댓글 작성 시 커뮤니티 가이드를 준수해 주세요. 상세 약관·개인정보 처리는 정식
              서비스 오픈 시 이 페이지 또는 별도 문서로 안내드릴 예정입니다.
            </p>
            <button type="button" className="feed-modal-close" style={{ marginTop: '1.25rem' }} onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <button type="button" className="feed-btn-primary" style={{ marginTop: '1rem' }} onClick={startGithubOAuth}>
            <span aria-hidden style={{ marginRight: '0.4rem' }}>🐙</span>
            GitHub으로 로그인
          </button>
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
