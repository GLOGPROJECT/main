/**
 * PetShopModal.jsx
 * 펫 상점 모달
 * - 카드 선택 → 단일 Canvas에서 3D 프리뷰 (WebGL 컨텍스트 1개만 사용)
 */

import { Suspense, useRef, useMemo, useState, useEffect, Component } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Center } from '@react-three/drei';
import { useAuth } from '../auth/hooks/useAuth';

// ──────────────────────────────────────────────────────────────────
// 펫 데이터
// ──────────────────────────────────────────────────────────────────
const PETS = [
  { id: 1, name: '자전거', emoji: '🚲', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/Bike.glb',        price: 500 },
  { id: 2, name: '토끼X2', emoji: '🐰', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/bunny_gltf.glb', price: 600 },
  { id: 3, name: '치킨',   emoji: '🐔', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/chicken.glb',    price: 500 },
  { id: 4, name: '여우',   emoji: '🦊', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/Fox_GLB.glb',    price: 700 },
  { id: 5, name: '개구리', emoji: '🐸', url: 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/pet/FROGG.glb',      price: 600 },
];

PETS.forEach((p) => useGLTF.preload(p.url));

// ──────────────────────────────────────────────────────────────────
// 에러 바운더리 (GLB 로드 실패 시 흰 화면 방지)
// ──────────────────────────────────────────────────────────────────
class CanvasErrorBoundary extends Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ ...previewBoxStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 48 }}>{this.props.emoji}</span>
          <span style={{ fontSize: 12, color: '#adb5bd' }}>미리보기 불가</span>
        </div>
      );
    }
    return this.props.children;
  }
}

// ──────────────────────────────────────────────────────────────────
// 3D 모델 (Canvas 내부)
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
// 3D 프리뷰 패널 (단일 Canvas)
// ──────────────────────────────────────────────────────────────────
function PetPreview({ pet }) {
  return (
    <CanvasErrorBoundary emoji={pet.emoji}>
      <div style={previewBoxStyle}>
        <Canvas camera={{ position: [0, 0.5, 3], fov: 45 }}>
          <ambientLight intensity={1.2} />
          <directionalLight position={[3, 5, 3]} intensity={1.2} />
          <Suspense fallback={null}>
            <PetModel url={pet.url} />
          </Suspense>
        </Canvas>
      </div>
    </CanvasErrorBoundary>
  );
}

// ──────────────────────────────────────────────────────────────────
// 펫 선택 카드
// ──────────────────────────────────────────────────────────────────
function PetCard({ pet, selected, canAfford, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...cardStyle,
        outline: selected ? '2px solid #339af0' : '2px solid transparent',
        background: selected ? '#e7f5ff' : '#fff',
      }}
    >
      <span style={{ fontSize: 36 }}>{pet.emoji}</span>
      <p style={cardNameStyle}>{pet.name}</p>
      <p style={{ ...cardPriceStyle, color: canAfford ? '#495057' : '#ced4da' }}>
        🪙 {pet.price}
      </p>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
// 메인 모달
// ──────────────────────────────────────────────────────────────────
export default function PetShopModal({ onClose }) {
  const { user } = useAuth();
  const coins = user?.coins ?? 0;
  const [selected, setSelected] = useState(PETS[0]);
  const [visible, setVisible] = useState(false); // 슬라이드 인
  const [closing, setClosing] = useState(false); // 슬라이드 아웃
  const canAfford = coins >= selected.price;

  // 마운트 직후 한 프레임 뒤에 visible=true → 슬라이드 인 트랜지션 발동
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 380);
  };

  return (
    <div style={overlayStyle}>
      <div style={{
        ...modalStyle,
        transform: (!visible || closing) ? 'translateX(100%)' : 'translateX(0)',
      }}>

        {/* 헤더 */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>🐾 펫 상점</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={coinsStyle}>🪙 {coins} 코인</span>
            <button onClick={handleClose} style={closeBtnStyle}>×</button>
          </div>
        </div>

        {/* 바디: 왼쪽 프리뷰 + 오른쪽 선택 그리드 */}
        <div style={bodyStyle}>

          {/* 왼쪽: 단일 3D 프리뷰 + 구매 정보 */}
          <div style={leftStyle}>
            <PetPreview key={selected.id} pet={selected} />
            <p style={selectedNameStyle}>{selected.name}</p>
            <p style={selectedPriceStyle}>🪙 {selected.price} 코인</p>
            <button
              style={{
                ...buyBtnStyle,
                background: canAfford ? '#339af0' : '#ced4da',
                color: canAfford ? '#fff' : '#868e96',
                cursor: canAfford ? 'pointer' : 'not-allowed',
              }}
              disabled={!canAfford}
            >
              {canAfford ? '구매하기' : '코인 부족'}
            </button>
          </div>

          {/* 오른쪽: 펫 선택 카드 그리드 */}
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
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 스타일
// ──────────────────────────────────────────────────────────────────
const overlayStyle = {
  position: 'fixed',
  top: 0,
  right: 0,
  width: '50vw',
  height: '100vh',
  zIndex: 2000,
  display: 'flex',
  alignItems: 'stretch',
  overflow: 'hidden',
};

const modalStyle = {
  background: '#dee2e6',
  width: '100%',
  height: '100%',
  overflowY: 'auto',
  padding: '28px 32px 32px',
  boxShadow: '-8px 0 32px rgba(0,0,0,0.25)',
  transform: 'translateX(0)',
  transition: 'transform 0.38s cubic-bezier(.2,.8,.2,1)',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 24,
};

const titleStyle = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  color: '#212529',
};

const coinsStyle = {
  fontSize: 15,
  fontWeight: 700,
  color: '#495057',
  background: '#fff',
  padding: '6px 14px',
  borderRadius: 999,
};

const closeBtnStyle = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: 'none',
  background: '#adb5bd',
  color: '#343a40',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  fontWeight: 700,
};

const bodyStyle = {
  display: 'flex',
  gap: 28,
  alignItems: 'flex-start',
};

const leftStyle = {
  flex: '0 0 240px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
};

const previewBoxStyle = {
  width: 240,
  height: 240,
  borderRadius: 16,
  overflow: 'hidden',
  background: '#f1f3f5',
};

const selectedNameStyle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: '#212529',
};

const selectedPriceStyle = {
  margin: 0,
  fontSize: 14,
  color: '#868e96',
};

const buyBtnStyle = {
  width: '100%',
  marginTop: 4,
  padding: '10px 0',
  borderRadius: 10,
  border: 'none',
  fontWeight: 700,
  fontSize: 15,
};

const gridStyle = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: 12,
};

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '14px 8px',
  borderRadius: 12,
  border: 'none',
  cursor: 'pointer',
  transition: 'outline 0.15s, background 0.15s',
};

const cardNameStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: '#212529',
};

const cardPriceStyle = {
  margin: 0,
  fontSize: 12,
  fontWeight: 500,
};
