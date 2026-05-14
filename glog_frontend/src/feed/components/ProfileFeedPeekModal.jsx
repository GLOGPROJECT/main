import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FeedUserStreakPanel, FeedUserProjectsPanel, FeedUserFollowPanel } from '../pages/FeedUserTabPanels';

const TAB_LABEL = {
  streak: '커밋 스트릭 내역',
  projects: '프로젝트',
  following: '팔로우 중',
  followers: '팔로워',
};

/** 지구본 프로필 통계 클릭 시 — 피드 유저 탭과 동일 패널을 작은 오버레이로 표시 */
export default function ProfileFeedPeekModal({ open, onClose, userId, tab, onOpenTrophyProject, onFocusGlobeUser }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (typeof document === 'undefined' || !open || !userId || !tab) return null;

  return createPortal(
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 13000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-feed-peek-title"
        className="feed-card feed-card-surface"
        style={{
          width: 'min(440px, calc(100vw - 32px))',
          maxHeight: 'min(78vh, 620px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgb(0 0 0 / 0.22)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderBottom: '1px solid var(--feed-border)',
            flexShrink: 0,
          }}
        >
          <h2 id="profile-feed-peek-title" className="feed-post-author" style={{ margin: 0, fontSize: '0.95rem' }}>
            {TAB_LABEL[tab] || ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '1.2rem',
              lineHeight: 1,
              color: 'var(--feed-text-secondary)',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 12px', minHeight: 0 }}>
          {tab === 'streak' && <FeedUserStreakPanel userId={userId} />}
          {tab === 'projects' && (
            <FeedUserProjectsPanel
              userId={userId}
              onProjectActivate={
                typeof onOpenTrophyProject === 'function'
                  ? (pid) => {
                      onClose();
                      onOpenTrophyProject(pid);
                    }
                  : undefined
              }
            />
          )}
          {tab === 'following' && (
            <FeedUserFollowPanel
              userId={userId}
              mode="following"
              onUserActivate={
                typeof onFocusGlobeUser === 'function'
                  ? (u) => {
                      onClose();
                      onFocusGlobeUser(u);
                    }
                  : undefined
              }
            />
          )}
          {tab === 'followers' && (
            <FeedUserFollowPanel
              userId={userId}
              mode="followers"
              onUserActivate={
                typeof onFocusGlobeUser === 'function'
                  ? (u) => {
                      onClose();
                      onFocusGlobeUser(u);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
