/**
 * petShopModal.jsx
 * 펫 상점 모달
 * - 화면 오른쪽 절반, 가로 30vw 정사각형
 * - 투명도 70%, 상단 nav(z-index:100)를 가리지 않도록 z-index:90
 */

import { useState, useEffect, Component, Suspense, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Center, Html } from '@react-three/drei';
import { useAuth } from '../auth/hooks/useAuth';

// ──────────────────────────────────────────────────────────────────
// 펫 데이터 (토끼X2, 개구리, 펭구, 자전거, 치킨, 여우)
// ──────────────────────────────────────────────────────────────────
const PETS = [
  { id: 1, name: '토끼X2', emoji: '🐰', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/bunny_gltf.glb', price: 600 },
  { id: 2, name: '개구리', emoji: '🐸', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/FROGG.glb',      price: 600 },
  { id: 3, name: '펭구',   emoji: '🐧', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/penguin.glb',    price: 650 },
  { id: 4, name: '자전거', emoji: '🚲', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/Bike.glb',       price: 500 },
  { id: 5, name: '치킨',   emoji: '🐔', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/chicken.glb',   price: 500 },
  { id: 6, name: '여우',   emoji: '🦊', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/Fox_GLB.glb',   price: 700 },
];

// S3에 존재하는 GLB만 preload
const PRELOAD_URLS = [
  'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/bunny_gltf.glb',
  'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/FROGG.glb',
  'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/Bike.glb',
  'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/chicken.glb',
  'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/Fox_GLB.glb',
];
PRELOAD_URLS.forEach((u) => useGLTF.preload(u));

// ──────────────────────────────────────────────────────────────────
// 에러 바운더리 (GLB 로드 실패 시 이모지 폴백)
// ──────────────────────────────────────────────────────────────────
class CanvasErrorBoundary extends Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) {
      return (
        <div style={previewFallbackStyle}>
          <span style={{ fontSize: 52 }}>{this.props.emoji}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

// ──────────────────────────────────────────────────────────────────
// 3D 모델 회전 컴포넌트
// ──────────────────────────────────────────────────────────────────
function PetModel({ url }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.8;
  });
  return (
    <Center>
      <primitive ref={ref} object={cloned} />
    </Center>
  );
}

// ──────────────────────────────────────────────────────────────────
// 선택된 펫 3D 미리보기
// ──────────────────────────────────────────────────────────────────
function PetPreview({ pet }) {
  return (
    <CanvasErrorBoundary emoji={pet.emoji}>
      <div style={previewBoxStyle}>
        <Canvas camera={{ position: [0, 0.5, 3], fov: 45 }}>
          <ambientLight intensity={1.2} />
          <directionalLight position={[3, 5, 3]} intensity={1.2} />
          <Suspense fallback={
            <Html center>
              <span style={{ fontSize: 36 }}>{pet.emoji}</span>
            </Html>
          }>
            <PetModel url={pet.url} />
          </Suspense>
        </Canvas>
      </div>
    </CanvasErrorBoundary>
  );
}

// ──────────────────────────────────────────────────────────────────
// 펫 선택 카드 (그리드 아이템)
// ──────────────────────────────────────────────────────────────────
function PetCard({ pet, selected, canAfford, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...cardStyle,
        outline: selected ? '2px solid #4e9af1' : '2px solid transparent',
        background: selected ? 'rgba(78,154,241,0.22)' : 'rgba(255,255,255,0.10)',
      }}
    >
      <span style={{ fontSize: 22 }}>{pet.emoji}</span>
      <p style={cardNameStyle}>{pet.name}</p>
      <p style={{ ...cardPriceStyle, color: canAfford ? '#ced4da' : '#868e96' }}>
        🪙 {pet.price}
      </p>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
// 메인 모달
// ──────────────────────────────────────────────────────────────────
export default function PetShopModal({ onClose, navHeight = 80 }) {
  const { user } = useAuth();
  const coins = user?.coins ?? 0;
  const [selected, setSelected] = useState(PETS[0]);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const canAfford = coins >= selected.price;

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 320);
  };

  return (
    <div
      style={{
        ...modalStyle,
        top: navHeight + 16,
        opacity: (!visible || closing) ? 0 : 1,
        transform: `translateY(${(!visible || closing) ? '16px' : '0px'})`,
      }}
    >
      {/* 헤더 */}
      <div style={headerStyle}>
        <span style={titleStyle}>🐾 펫 상점</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={coinsStyle}>🪙 {coins}</span>
          <button onClick={handleClose} style={closeBtnStyle}>×</button>
        </div>
      </div>

      {/* 선택된 펫 정보 + 구매 버튼 */}
      <div style={selectedInfoStyle}>
        <span style={{ fontSize: 28 }}>{selected.emoji}</span>
        <div style={{ flex: 1 }}>
          <p style={selectedNameStyle}>{selected.name}</p>
          <p style={selectedPriceStyle}>🪙 {selected.price} 코인</p>
        </div>
        <button
          style={{
            ...buyBtnStyle,
            background: canAfford ? '#4e9af1' : 'rgba(134,142,150,0.35)',
            color: canAfford ? '#fff' : '#868e96',
            cursor: canAfford ? 'pointer' : 'not-allowed',
          }}
          disabled={!canAfford}
        >
          {canAfford ? '구매' : '부족'}
        </button>
      </div>

      {/* 펫 선택 그리드 (3열 × 2행) */}
      <div style={gridStyle}>
        {PETS.map((pet) => (
          <PetCard
            key={pet.id}
            pet={pet}
            selected={selected.id === pet.id}
            canAfford={coins >= pet.price}
            onClick={() => setSelected(pet)}
          />
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 스타일
// ──────────────────────────────────────────────────────────────────

/** 모달 본체: 화면 오른쪽, 30vw × 30vw 정사각형, 투명도 70% */
const modalStyle = {
  position: 'fixed',
  right: '10vw',
  width: '30vw',
  height: '30vw',
  zIndex: 90,                                        // nav(100) 아래
  borderRadius: 20,
  background: 'rgba(15, 28, 54, 0.70)',              // 투명도 70%
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 8px 40px rgba(0,0,0,0.50)',
  padding: '14px 16px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  transition: 'opacity 0.32s ease, transform 0.32s ease',
  overflow: 'hidden',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
};

const titleStyle = {
  fontSize: '1.1vw',
  fontWeight: 700,
  color: '#f1f3f5',
};

const coinsStyle = {
  fontSize: '0.85vw',
  fontWeight: 700,
  color: '#ffd43b',
  background: 'rgba(255,255,255,0.12)',
  padding: '2px 10px',
  borderRadius: 999,
};

const closeBtnStyle = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(255,255,255,0.16)',
  color: '#dee2e6',
  fontSize: 16,
  lineHeight: '1',
  cursor: 'pointer',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

const selectedInfoStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '6px 10px',
  flexShrink: 0,
};

const selectedNameStyle = {
  margin: 0,
  fontSize: '0.9vw',
  fontWeight: 700,
  color: '#f1f3f5',
};

const selectedPriceStyle = {
  margin: 0,
  fontSize: '0.75vw',
  color: '#adb5bd',
};

const buyBtnStyle = {
  padding: '5px 12px',
  borderRadius: 8,
  border: 'none',
  fontWeight: 700,
  fontSize: '0.8vw',
  transition: 'background 0.15s',
  flexShrink: 0,
};

/** 3열 × 2행 그리드 */
const gridStyle = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 6,
  overflow: 'hidden',
};

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  padding: '4px',
  borderRadius: 10,
  border: 'none',
  cursor: 'pointer',
  transition: 'outline 0.12s, background 0.12s',
};

const cardNameStyle = {
  margin: 0,
  fontSize: '0.75vw',
  fontWeight: 600,
  color: '#dee2e6',
};

const cardPriceStyle = {
  margin: 0,
  fontSize: '0.65vw',
  fontWeight: 500,
};

const previewBoxStyle = {
  width: '100%',
  height: '100%',
  borderRadius: 10,
  overflow: 'hidden',
  background: 'rgba(255,255,255,0.06)',
};

const previewFallbackStyle = {
  width: '100%',
  height: '100%',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.06)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
