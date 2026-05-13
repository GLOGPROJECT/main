import React, { useRef, useEffect, useLayoutEffect, useMemo, useState, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';

/** 뷰어 전용 아바타 — scale / rotationY 외부에서 제어 */
function AvatarViewer({ url, scale, rotationY }) {
  const { scene, animations } = useGLTF(url);
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const rootRef = useRef();
  const { actions, names } = useAnimations(animations, rootRef);

  useEffect(() => {
    if (!names.length) return;
    // index 1 = idle (가만히 서있는 애니메이션)
    const idleAction = actions[names[1]] ?? actions[names[0]];
    if (idleAction) idleAction.reset().fadeIn(0.3).play();
    return () => { idleAction?.stop(); };
  }, [actions, names]);

  return (
    <primitive
      ref={rootRef}
      object={cloned}
      scale={scale}
      rotation={[0, rotationY, 0]}
    />
  );
}

/** 캐릭터 수직 중앙(y≈0.85)을 바라보도록 카메라 고정 */
function CameraSetup() {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(0, 0.85, 3.2);
    camera.lookAt(0, 0.85, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 5, 3]} intensity={1.2} />
      <directionalLight position={[-2, 2, -2]} intensity={0.3} />
      <pointLight position={[0, 3, 2]} intensity={0.5} color="#8ecae6" />
    </>
  );
}

/** 슬라이더 한 줄 */
function SliderRow({ label, value, min, max, step, fmt, onChange }) {
  return (
    <div style={sliderRowStyle}>
      <div style={sliderLabelStyle}>
        <span>{label}</span>
        <span style={{ color: '#7eb3ff', fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
      </div>
      <input
        className="av-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={rangeBaseStyle}
      />
    </div>
  );
}

/* ── 스타일 ─────────────────────────────────────────── */
const panelStyle = {
  position: 'fixed',
  left: '24px',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '240px',
  height: '440px',
  background: 'rgba(10, 18, 42, 0.82)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: '20px',
  border: '1px solid rgba(100, 160, 255, 0.22)',
  boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  zIndex: 89,
  animation: 'avSlideIn 0.38s cubic-bezier(0.34,1.56,0.64,1)',
};

const canvasWrapStyle = {
  flex: 1,
  position: 'relative',
};

const nameBadgeStyle = {
  position: 'absolute',
  top: '14px',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(14, 26, 64, 0.78)',
  border: '1px solid rgba(100,160,255,0.28)',
  borderRadius: '20px',
  padding: '4px 14px',
  color: '#c8dcff',
  fontSize: '13px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
};

const controlsStyle = {
  padding: '10px 16px 14px',
  borderTop: '1px solid rgba(100,160,255,0.12)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const sliderRowStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const sliderLabelStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  color: '#9ab5e0',
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.3px',
};

const rangeBaseStyle = {
  width: '100%',
  cursor: 'pointer',
  accentColor: '#4e9af1',
};

const css = `
@keyframes avSlideIn {
  from { opacity: 0; transform: translateY(-50%) translateX(-20px) scale(0.94); }
  to   { opacity: 1; transform: translateY(-50%) translateX(0)     scale(1);    }
}
.av-range {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 4px;
  background: rgba(78,154,241,0.25);
  outline: none;
  width: 100%;
}
.av-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4e9af1;
  cursor: pointer;
  box-shadow: 0 0 6px rgba(78,154,241,0.6);
  transition: transform 0.15s ease;
}
.av-range::-webkit-slider-thumb:hover {
  transform: scale(1.25);
}
.av-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4e9af1;
  cursor: pointer;
  border: none;
  box-shadow: 0 0 6px rgba(78,154,241,0.6);
}
`;

/* ── 컴포넌트 ─────────────────────────────────────────── */
export default function AvatarViewerModal({ user }) {
  const [modelScale, setModelScale] = useState(1.0);
  const [rotY, setRotY] = useState(0);

  // 유저가 바뀔 때 슬라이더 초기화
  useEffect(() => {
    setModelScale(1.0);
    setRotY(0);
  }, [user?.id]);

  if (!user?.avatar) return null;

  return (
    <>
      <style>{css}</style>
      <div style={panelStyle}>
        {/* 이름 뱃지 */}
        <div style={{ position: 'relative' }}>
          <div style={nameBadgeStyle}>{user.name}</div>
        </div>

        {/* 3D Canvas */}
        <div style={canvasWrapStyle}>
          <Canvas
            camera={{ position: [0, 0.85, 3.2], fov: 48 }}
            style={{ width: '100%', height: '100%' }}
          >
            <CameraSetup />
            <Lights />
            <Suspense fallback={null}>
              <AvatarViewer
                url={user.avatar}
                scale={modelScale}
                rotationY={rotY * (Math.PI / 180)}
              />
            </Suspense>
          </Canvas>
        </div>

        {/* 슬라이더 컨트롤 */}
        <div style={controlsStyle}>
          <SliderRow
            label="크기"
            value={modelScale}
            min={0.3}
            max={3}
            step={0.05}
            fmt={(v) => `${v.toFixed(2)}x`}
            onChange={setModelScale}
          />
          <SliderRow
            label="방향"
            value={rotY}
            min={0}
            max={360}
            step={1}
            fmt={(v) => `${v}°`}
            onChange={setRotY}
          />
        </div>
      </div>
    </>
  );
}
