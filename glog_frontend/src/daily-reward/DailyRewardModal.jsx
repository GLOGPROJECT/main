/**
 * DailyRewardModal.jsx
 * 하루 첫 로그인 보상 팝업
 * - 10vw × 10vw 정사각형, 화면 정중앙
 * - petShopModal과 동일한 opacity + translateY 애니메이션
 * - nav(z-index:100) 아래, z-index:90
 *
 * 중앙 정렬 방식:
 *   포지셔닝 wrapper(inset:0, margin:auto)로 중앙을 잡고
 *   모달 div에는 translateY 애니메이션만 적용 → 두 transform이 충돌하지 않음
 */

import { useState, useEffect } from 'react';

export default function DailyRewardModal({ amount = 700, onClose }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 320);
  };

  const show = visible && !closing;

  return (
    <div style={wrapperStyle}>
      <div
        style={{
          ...modalStyle,
          opacity: show ? 1 : 0,
          transform: `translateY(${show ? '0px' : '20px'})`,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="일일 로그인 보상"
      >
        <button onClick={handleClose} style={closeBtnStyle} aria-label="닫기">
          ×
        </button>

        <div style={coinIconStyle}>🪙</div>

        <p style={titleStyle}>출석 보상</p>
        <p style={amountStyle}>+{amount}</p>
        <p style={subStyle}>코인 획득!</p>

        <button onClick={handleClose} style={confirmBtnStyle}>
          확인
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 스타일
// ──────────────────────────────────────────────────────────────────

/** inset:0 + margin:auto → transform 없이 완벽한 중앙 정렬 */
const wrapperStyle = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 90,
  pointerEvents: 'none', // 배경 클릭 통과
};

const modalStyle = {
  pointerEvents: 'auto',
  width: '10vw',
  height: '10vw',
  minWidth: 160,
  minHeight: 160,
  borderRadius: 20,
  background: 'rgba(15, 28, 54, 0.82)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.4vw',
  padding: '1vw',
  position: 'relative',
  transition: 'opacity 0.32s ease, transform 0.32s ease',
};

const closeBtnStyle = {
  position: 'absolute',
  top: 8,
  right: 8,
  width: 24,
  height: 24,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(255,255,255,0.16)',
  color: '#dee2e6',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

const coinIconStyle = {
  fontSize: 'clamp(28px, 3vw, 48px)',
  lineHeight: 1,
  filter: 'drop-shadow(0 0 8px rgba(255,212,59,0.7))',
};

const titleStyle = {
  margin: 0,
  fontSize: 'clamp(10px, 0.9vw, 14px)',
  fontWeight: 600,
  color: '#adb5bd',
  letterSpacing: '0.05em',
};

const amountStyle = {
  margin: 0,
  fontSize: 'clamp(18px, 2vw, 32px)',
  fontWeight: 800,
  color: '#ffd43b',
  lineHeight: 1.1,
};

const subStyle = {
  margin: 0,
  fontSize: 'clamp(10px, 0.85vw, 13px)',
  fontWeight: 600,
  color: '#f1f3f5',
};

const confirmBtnStyle = {
  marginTop: '0.5vw',
  padding: '0.3vw 1.2vw',
  minWidth: 56,
  borderRadius: 8,
  border: 'none',
  background: '#4e9af1',
  color: '#fff',
  fontWeight: 700,
  fontSize: 'clamp(10px, 0.8vw, 13px)',
  cursor: 'pointer',
};
