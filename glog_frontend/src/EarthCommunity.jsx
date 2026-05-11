/**
 * EarthCommunity.jsx
 * ------------------------------------------------------------------
 * 지구본 위에 유저 캐릭터들이 떠있는 커뮤니티 메인 화면.
 *
 * 동작:
 *  1) 지구는 기본적으로 천천히 오른쪽(시계 반대방향, +Y)으로 자전.
 *  2) 빈 공간을 좌/우로 클릭-드래그하면 사용자가 직접 회전 가능.
 *     드래그를 놓으면 다시 자동 회전이 부드럽게 재개됨.
 *  3) 캐릭터(마커) 클릭 시 자전이 멈추고, 카메라가 해당 캐릭터를
 *     정면으로 보도록 부드럽게 이동 + 패널이 슬라이드 인.
 *  4) 패널의 닫기 버튼을 누르면 다시 자동 회전 모드로 복귀.
 *
 * 필요 패키지:
 *   npm i three @react-three/fiber @react-three/drei
 *
 * 에셋:
 *   /public/models/earth/scene.gltf  (+ scene.bin)
 *   업로드해주신 두 파일을 위 경로에 같이 넣어주세요.
 * ------------------------------------------------------------------
 */

import React, { useRef, useState, useMemo, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import GlobalTopNav from "./components/GlobalTopNav";

// Html 라벨을 body에 붙여 canvas 상위 overflow에 잘리지 않게 함
const htmlLabelPortal = typeof document !== "undefined" ? { current: document.body } : { current: null };

// ──────────────────────────────────────────────────────────────────
// 1. 데모용 유저 데이터 (위도 / 경도 기반)
// ──────────────────────────────────────────────────────────────────
const USERS = [
  { id: "u1", name: "Jiwoo",  bio: "프론트엔드 / 서울",       lat: 37.56,  lon: 126.97, color: "#ff5d8f" },
  { id: "u2", name: "Marco",  bio: "디자이너 / 밀라노",       lat: 45.46,  lon: 9.19,   color: "#ffd166" },
  { id: "u3", name: "Aisha",  bio: "AI 연구자 / 두바이",      lat: 25.27,  lon: 55.30,  color: "#06d6a0" },
  { id: "u4", name: "Liam",   bio: "백엔드 / 뉴욕",           lat: 40.71,  lon: -74.0,  color: "#4cc9f0" },
  { id: "u5", name: "Sora",   bio: "블로거 / 도쿄",           lat: 35.68,  lon: 139.69, color: "#b388eb" },
  { id: "u6", name: "Diego",  bio: "게임 개발자 / 상파울루",  lat: -23.55, lon: -46.63, color: "#f9844a" },
];

// 위도/경도 → 단위구 위 3D 좌표 (반지름 r)
function latLonToVec3(lat, lon, r = 1) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

// ──────────────────────────────────────────────────────────────────
// 2. GLTF 지구 모델 + 유저 마커들
//    (자전과 마커가 같이 돌도록 한 group 안에 묶음)
// ──────────────────────────────────────────────────────────────────
function EarthScene({ autoRotate, onSelectUser, dragRef, groupRef }) {
  const group = groupRef;
  const { scene } = useGLTF("/models/earth/scene.gltf");

  // GLTF 모델의 실제 반지름이 약 1 정도이므로 그대로 사용.
  // 마커는 표면에 살짝 띄워서 (1.02) 박히지 않게 한다.
  const MARKER_R = 1.02;

  useFrame((_, delta) => {
    if (!group.current) return;
    // 드래그 중에는 사용자 입력만 적용, 그 외엔 자동 회전.
    if (dragRef.current.dragging) {
      group.current.rotation.y += dragRef.current.deltaX;
      group.current.rotation.x += dragRef.current.deltaY;
      // X축 회전을 -80°~80° 사이로 제한 (뒤집히지 않게)
      group.current.rotation.x = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, group.current.rotation.x));
      dragRef.current.deltaX = 0;
      dragRef.current.deltaY = 0;
    } else {
      // 손을 놓으면 X축은 부드럽게 0으로 복귀
      group.current.rotation.x *= 0.9;
      if (autoRotate) {
        group.current.rotation.y += delta * 0.15;
      }
    }
  });

  return (
    <group ref={group}>
      {/* GLTF 지구 본체 */}
      <primitive object={scene} />

      {/* 유저 캐릭터 마커들 */}
      {USERS.map((u) => {
        const pos = latLonToVec3(u.lat, u.lon, MARKER_R);
        return (
          <UserMarker
            key={u.id}
            position={pos}
            user={u}
            onClick={() => onSelectUser(u)}
          />
        );
      })}
    </group>
  );
}

// 미리 로딩 (선택 사항)
useGLTF.preload("/models/earth/scene.gltf");

// ──────────────────────────────────────────────────────────────────
// 3. 유저 마커 (호버 시 살짝 커지고 이름 툴팁 표시)
// ──────────────────────────────────────────────────────────────────
function UserMarker({ position, user, onClick }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const target = hovered ? 1.4 : 1.0;
    ref.current.scale.lerp(new THREE.Vector3(target, target, target), 0.15);
  });

  return (
    <group position={position}>
      <mesh
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        {/* 캐릭터 핀: 작은 구 + 외곽 글로우 */}
        <sphereGeometry args={[0.025, 16, 16]} />
        <meshStandardMaterial
          color={user.color}
          emissive={user.color}
          emissiveIntensity={hovered ? 1.2 : 0.6}
        />
      </mesh>

      {/* 호버 시 이름 라벨 — body 포털 + 핀 아래쪽 배치로 상단 잘림 방지 */}
      {hovered && (
        <Html
          center
          distanceFactor={8}
          portal={htmlLabelPortal}
          style={{ pointerEvents: "none", zIndex: 10000 }}
        >
          <div style={labelStyle}>{user.name}</div>
        </Html>
      )}
    </group>
  );
}

// ──────────────────────────────────────────────────────────────────
// 4. 카메라 컨트롤러
//    - 평소엔 (0,0,3)에서 지구 정면을 본다.
//    - 유저가 선택되면 그 유저의 표면 좌표 바깥쪽으로 부드럽게 이동.
// ──────────────────────────────────────────────────────────────────
function CameraRig({ selectedUser, earthRef }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 0, 3), []);
  const lookAt = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useFrame(() => {
    if (selectedUser && earthRef.current) {
      // 유저의 로컬 좌표를 지구 그룹의 회전을 적용한 월드 좌표로 변환
      const local = latLonToVec3(selectedUser.lat, selectedUser.lon, 1);
      const world = local.clone().applyMatrix4(earthRef.current.matrixWorld);
      // 그 방향에서 1.2배 떨어진 위치로 카메라 이동
      target.copy(world).multiplyScalar(2.2);
      lookAt.copy(world);
    } else {
      target.set(0, 0, 3);
      lookAt.set(0, 0, 0);
    }
    camera.position.lerp(target, 0.08);
    camera.lookAt(lookAt);
  });

  return null;
}

// ──────────────────────────────────────────────────────────────────
// 5. 메인 컴포넌트
// ──────────────────────────────────────────────────────────────────
export default function EarthCommunity() {
  const [selectedUser, setSelectedUser] = useState(null);
  const earthRef = useRef();           // 카메라 릭에서 회전 행렬을 읽기 위함
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0, deltaX: 0, deltaY: 0 });

  // 자동 회전: 선택된 유저가 없을 때만
  const autoRotate = !selectedUser;

  // 마우스 드래그로 회전 (캔버스 div에 직접 바인딩)
  const handlePointerDown = (e) => {
    dragRef.current.dragging = true;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    dragRef.current.deltaX = 0;
    dragRef.current.deltaY = 0;
  };
  const handlePointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    dragRef.current.deltaX += dx * 0.005;
    dragRef.current.deltaY += dy * 0.005;
  };
  const handlePointerUp = () => {
    dragRef.current.dragging = false;
  };

  // 전역 mouseup으로 캔버스 밖에서 떼도 처리
  useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  return (
    <div style={wrapperStyle}>
      <GlobalTopNav />
      <p
        style={{
          margin: 0,
          padding: "18px 60px 14px",
          fontSize: 12,
          opacity: 0.72,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        드래그해서 지구를 돌리고, 캐릭터를 클릭해보세요.
      </p>
      <div style={canvasHostStyle}>
        <div
          style={canvasWrapStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
        <Canvas camera={{ position: [0, 0, 3.35], fov: 45 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 3, 5]} intensity={1.1} />
          <Suspense fallback={null}>
            <EarthScene
                autoRotate={autoRotate}
                onSelectUser={setSelectedUser}
                groupRef={earthRef}
                dragRef={dragRef}
              />
          </Suspense>
          <CameraRig selectedUser={selectedUser} earthRef={earthRef} />
          {/* 드래그 회전을 직접 구현했기 때문에 OrbitControls는 비활성.
              필요하면 enableRotate=false로 줌만 살리는 식으로 활용 가능. */}
          {/* <OrbitControls enableRotate={false} enablePan={false} /> */}
        </Canvas>
        </div>
      </div>

      {/* 유저 상세 패널 */}
      <UserPanel user={selectedUser} onClose={() => setSelectedUser(null)} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 6. 유저 상세 패널 (오른쪽 슬라이드 인)
// ──────────────────────────────────────────────────────────────────
function UserPanel({ user, onClose }) {
  const open = !!user;
  return (
    <aside
      style={{
        ...panelStyle,
        transform: open ? "translateX(0)" : "translateX(110%)",
      }}
    >
      {user && (
        <>
          <button onClick={onClose} style={closeBtnStyle}>×</button>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: user.color,
              marginBottom: 16,
              boxShadow: `0 0 24px ${user.color}`,
            }}
          />
          <h2 style={{ margin: 0 }}>{user.name}</h2>
          <p style={{ opacity: 0.7, marginTop: 4 }}>{user.bio}</p>
          <hr style={{ borderColor: "#ffffff22", margin: "16px 0" }} />
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>
            여기에 이 유저의 최근 글, 팔로우 버튼, 메시지 보내기 같은
            커뮤니티 액션을 붙이면 됩니다.
          </p>
        </>
      )}
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────
// 7. 스타일
// ──────────────────────────────────────────────────────────────────
const wrapperStyle = {
  position: "relative",
  width: "100%",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  background: "radial-gradient(circle at 50% 50%, #0b1026 0%, #04060f 100%)",
  color: "white",
  fontFamily: "Inter, system-ui, sans-serif",
  overflow: "hidden",
};

const canvasHostStyle = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  width: "100%",
};

const canvasWrapStyle = {
  position: "absolute",
  inset: 0,
  cursor: "grab",
  touchAction: "none",
};

const panelStyle = {
  position: "absolute",
  top: 100,
  right: 24,
  bottom: 24,
  width: 320,
  padding: 24,
  background: "rgba(15, 18, 36, 0.85)",
  backdropFilter: "blur(12px)",
  borderRadius: 16,
  border: "1px solid #ffffff1a",
  boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  transition: "transform 0.45s cubic-bezier(.2,.8,.2,1)",
  zIndex: 3,
};

const closeBtnStyle = {
  position: "absolute",
  top: 12,
  right: 12,
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "none",
  background: "#ffffff14",
  color: "white",
  fontSize: 20,
  cursor: "pointer",
};

const labelStyle = {
  background: "rgba(0,0,0,0.78)",
  color: "white",
  padding: "6px 12px",
  borderRadius: 999,
  fontSize: 12,
  whiteSpace: "nowrap",
  transform: "translateY(14px)",
};
