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
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth/hooks/useAuth";
import api from "./api/axios";
import * as THREE from "three";

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
function EarthScene({ autoRotate, onSelectUser, onSceneClick, dragRef, groupRef }) {
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
    // 지구본 또는 마커 클릭 시 onSceneClick 호출 → 배경 클릭과 구분하여 패널 유지
    <group ref={group} onClick={(e) => { e.stopPropagation(); onSceneClick(); }}>
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
    // lat/lon이 있는 유저만 카메라 이동 (없으면 지구본 가운데 유지)
    // 내 프로필처럼 위치 정보 없이 패널만 여는 경우 카메라를 건드리지 않음
    if (selectedUser && earthRef.current && selectedUser.lat != null && selectedUser.lon != null) {
      // 유저의 로컬 좌표를 지구 그룹의 회전을 적용한 월드 좌표로 변환
      const local = latLonToVec3(selectedUser.lat, selectedUser.lon, 1);
      const world = local.clone().applyMatrix4(earthRef.current.matrixWorld);
      // 그 방향에서 2.2배 떨어진 위치로 카메라 이동
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
  // 랜딩 페이지와 동일한 상단 메뉴 active 상태
  const [activeNav, setActiveNav] = useState(null);
  // 새 DM·알림 여부 - 읽으면 false로 변경 (데모: 각각 1개씩 온 상태)
  const [hasNewDm, setHasNewDm] = useState(true);
  const [hasNewNotif, setHasNewNotif] = useState(true);
  const earthRef = useRef();
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0, deltaX: 0, deltaY: 0 });

  // 프로필 페이지 이동을 위한 navigate, 로그인 유저 정보
  const navigate = useNavigate();
  const { user: me, updateUser } = useAuth();

  // 마커 클릭과 빈 배경 클릭을 구분하기 위한 ref
  // 마커 클릭 시 true로 설정 → 캔버스 onClick에서 패널 닫힘 방지
  const markerClickedRef = useRef(false);

  // 자동 회전: 선택된 유저가 없을 때만
  const autoRotate = !selectedUser;

  // 빈 배경 클릭 시 패널 닫기
  // 마커를 클릭한 경우는 markerClickedRef가 true이므로 건너뜀
  const handleCanvasClick = () => {
    if (markerClickedRef.current) {
      markerClickedRef.current = false;
      return;
    }
    // 빈 배경 클릭 시 패널 닫기 + 메뉴 강조 해제
    setSelectedUser(null);
    setActiveNav(null);
  };

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
      <div style={canvasHostStyle} onClick={handleCanvasClick}>
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
                onSelectUser={(u) => {
                  // 마커 클릭임을 표시 → 캔버스 onClick이 패널을 닫지 않도록
                  markerClickedRef.current = true;
                  setSelectedUser(u);
                }}
                onSceneClick={() => {
                  // 지구본 본체 클릭 시에도 패널이 닫히지 않도록 표시
                  markerClickedRef.current = true;
                }}
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

      {/* 랜딩 페이지와 동일한 구조의 상단 네비게이션 바
          - 프로필 패널이 열리면 opacity 0으로 페이드아웃 + 클릭 차단
          - 패널이 닫히면 다시 페이드인 */}
      <style>{navGlobalStyles}</style>
      <nav style={{
        ...earthNavbarStyle,
        opacity: selectedUser ? 0 : 1,
        // 패널 열릴 때 background/backdropFilter도 제거 - opacity:0만으론 렌더링 아티팩트 발생
        background: selectedUser ? 'transparent' : 'rgba(11, 16, 38, 0.75)',
        backdropFilter: selectedUser ? 'none' : 'blur(8px)',
        pointerEvents: selectedUser ? 'none' : 'auto',
        transition: 'opacity 0.3s ease',
      }}>
        {/* GLog 로고 - 클릭 시 랜딩 홈으로 이동 */}
        <div
          onClick={() => navigate('/')}
          style={{ fontSize: '2.1rem', fontWeight: 'bold', color: '#ffffff', cursor: 'pointer' }}
        >
          GLog 🌍
        </div>
        {/* 메뉴 버튼 목록 - 랜딩과 동일한 항목 */}
        <div style={{ display: 'flex', gap: '40px' }}>
          {navItems.map(item => (
            <button
              key={item}
              className={`globe-nav-item${activeNav === item ? ' active' : ''}`}
              onClick={() => {
                if (item === '프로필') {
                  // 프로필 active 강조 표시 + 패널 열기
                  setActiveNav('프로필');
                  if (me) {
                    // globe_lat/globe_lon → lat/lon 매핑, status 포함하여 전달
                    setSelectedUser({
                      id: me.user_id,
                      name: me.nickname,
                      bio: me.bio || '',
                      color: '#4e9af1',
                      avatar_url: me.avatar_url,
                      lat: me.globe_lat,
                      lon: me.globe_lon,
                      status: me.status || 'offline',
                      isMe: true,
                    });
                  }
                } else {
                  // 나머지 메뉴는 시각적 선택 효과만 (추후 각 기능 구현)
                  setActiveNav(item);
                }
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>

      {/* 유저 상세 패널 - 캐릭터 클릭 시 오른쪽에서 슬라이드 인 */}
      <UserPanel
        user={selectedUser}
        onClose={() => {
          setSelectedUser(null);
          setActiveNav(null);
        }}
        onViewProfile={(userId) => navigate(`/profile/${userId}`)}
        onStatusChange={(newStatus) => updateUser({ status: newStatus })}
        hasNewDm={hasNewDm}
        hasNewNotif={hasNewNotif}
        onDmClick={() => setHasNewDm(false)}
        onNotifClick={() => setHasNewNotif(false)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 6. 유저 상세 패널 (오른쪽 슬라이드 인) - PNG 디자인 기반
// ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  online:  { color: '#22c55e', label: '온라인' },
  away:    { color: '#eab308', label: '자리비움' },
  offline: { color: '#ef4444', label: '오프라인' },
};

// 더미 데이터 (추후 API 연결 시 교체)
const DUMMY_POSTS = [
  { id: 1, content: '오늘 드디어 백엔드 API 연결 완료! 🎉 CORS 3시간 잡았다...', likes: 24, comments: 3, timeAgo: '2시간 전' },
  { id: 2, content: 'React Query로 서버 상태 관리 리팩토링 완료. 코드가 훨씬 깔끔해졌다!', likes: 18, comments: 5, timeAgo: '5시간 전' },
  { id: 3, content: 'Three.js 지구본 구현 중 🌍 위도/경도 좌표 변환이 생각보다 복잡하네', likes: 31, comments: 8, timeAgo: '1일 전' },
  { id: 4, content: 'JWT 인증 흐름 완성! Access + Refresh Token으로 보안 강화 🔐', likes: 12, comments: 2, timeAgo: '2일 전' },
  { id: 5, content: 'Prisma ORM 처음 써봤는데 타입 자동완성이 진짜 편하다 ✨', likes: 9, comments: 1, timeAgo: '3일 전' },
];

// 트로피 등급별 설정 - SVG 파일 경로 사용
const TROPHY_GRADE = {
  gold:   { src: '/goldtrophy.svg',   color: '#f59e0b', label: '금' },
  silver: { src: '/silvertrophy.svg', color: '#9ca3af', label: '은' },
  bronze: { src: '/bronzetrophy.svg', color: '#92400e', label: '동' },
};

// 프로젝트(트로피) 더미 - image: null 일 때 썸네일 플레이스홀더 사용
const DUMMY_TROPHIES = [
  {
    id: 1, image: null, title: 'DevGlobe',
    desc: '개발자들을 위한 SNS 플랫폼. 프로젝트 공유, 피드, 상점 등 다양한 기능을 제공해요.',
    techStacks: ['React', 'TypeScript', 'Node.js'], dateRange: '2024.01.10 ~ 2024.03.20',
    timeAgo: '2시간 전', grade: 'gold', likes: 58, comments: 12,
  },
  {
    id: 2, image: null, title: 'FocusMind',
    desc: '집중력 향상을 위한 타이머 & 백색소음 앱. 포모도로 타이머와 통계 기능을 제공해요.',
    techStacks: ['React Native', 'TypeScript'], dateRange: '2024.02.05 ~ 2024.03.15',
    timeAgo: '5시간 전', grade: 'silver', likes: 32, comments: 7,
  },
  {
    id: 3, image: null, title: 'DataFlow',
    desc: '데이터 시각화 대시보드 서비스. 실시간 데이터 분석과 다양한 차트를 지원해요.',
    techStacks: ['Next.js', 'TypeScript', 'Tailwind CSS'], dateRange: '2024.01.20 ~ 2024.03.01',
    timeAgo: '1일 전', grade: 'bronze', likes: 21, comments: 4,
  },
];

// hasNewDm, hasNewNotif: 새 메시지·알림 여부 → true면 아이콘 왼쪽 하단에 빨간 점 표시
// onDmClick / onNotifClick: 아이콘 클릭 시 부모에서 읽음 처리
function UserPanel({ user, onClose, onViewProfile, onStatusChange, hasNewDm = false, hasNewNotif = false, onDmClick, onNotifClick }) {
  const open = !!user;

  const [profileData, setProfileData] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('offline');
  const [activeTab, setActiveTab] = useState('posts');
  // 좋아요 누른 글 ID 집합 - 클릭 시 토글
  const [likedSet, setLikedSet] = useState(new Set());
  // 내 글/트로피 카드 펼치기 모드 (true: 확장, false: 기본)
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfileData(null);
      setStatusOpen(false);
      setIsExpanded(false);
      return;
    }
    setCurrentStatus(user.status || 'offline');

    if (user.isMe) {
      api.get('/users/me/profile')
        .then(({ data }) => {
          setProfileData(data);
          setCurrentStatus(data.status || 'offline');
        })
        .catch(() => setProfileData(null));
    } else {
      setProfileData(null);
    }
  }, [user?.id]);

  const handleStatusChange = async (newStatus) => {
    try {
      await api.patch('/users/me/status', { status: newStatus });
      setCurrentStatus(newStatus);
      setStatusOpen(false);
      onStatusChange?.(newStatus);
    } catch (err) {
      console.error('[StatusChange Error]', err);
    }
  };

  const toggleLike = (postId) => {
    setLikedSet(prev => {
      const next = new Set(prev);
      next.has(postId) ? next.delete(postId) : next.add(postId);
      return next;
    });
  };

  const d = user ? {
    id:             user.id,
    name:           profileData?.nickname    ?? user.name,
    bio:            profileData?.bio         ?? user.bio,
    avatar_url:     profileData?.avatar_url  ?? user.avatar_url,
    color:          user.color,
    tech_stacks:    profileData?.tech_stacks ?? [],
    coins:          profileData?.coins       ?? 0,
    current_streak: profileData?.current_streak ?? 0,
    follower_count: profileData?.follower_count ?? 0,
    isMe:           user.isMe,
  } : null;

  const statusInfo = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.offline;

  return (
    <aside
      style={{
        ...panelStyle,
        transform: open ? "translateX(0)" : "translateX(110%)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {d && (
        <>
          {/* ── 카드 1: 프로필 정보 ── */}
          <div style={profileCardStyle}>

            {/* 상단 바: DM·알림 아이콘(왼쪽) / 닫기·상태(오른쪽) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>

              {/* 왼쪽 아이콘 영역
                  - 내 프로필: DM(새 메시지 표시) + 알림 벨(새 알림 표시)
                  - 타유저 프로필: DM 아이콘만 표시 (빨간 점 없음), 알림 벨 숨김 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ ...iconBoxStyle, position: 'relative' }} onClick={d.isMe ? onDmClick : undefined}>
                  <img src="/dm_icon.svg" alt="DM" style={iconImgStyle} />
                  {d.isMe && hasNewDm && <div className="notif-dot" />}
                </div>
                {d.isMe && (
                  <div style={{ ...iconBoxStyle, position: 'relative' }} onClick={onNotifClick}>
                    <img src="/notification_bell.svg" alt="알림" style={iconImgStyle} />
                    {hasNewNotif && <div className="notif-dot" />}
                  </div>
                )}
              </div>

              {/* 오른쪽: 상태 + 닫기 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  {/* 상태 표시 - 0.1cm 위로 */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: d.isMe ? 'pointer' : 'default', transform: 'translateY(-4px)' }}
                    onClick={d.isMe ? () => setStatusOpen(!statusOpen) : undefined}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusInfo.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.85rem', color: '#374151', fontWeight: 600 }}>{statusInfo.label}</span>
                    {d.isMe && <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>▾</span>}
                  </div>

                  {statusOpen && (
                    <div style={statusDropdownStyle}>
                      {Object.entries(STATUS_CONFIG).map(([key, { color, label }]) => (
                        <button
                          key={key}
                          style={{ ...statusOptionStyle, background: currentStatus === key ? 'rgba(0,0,0,0.05)' : 'none' }}
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(key); }}
                        >
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={onClose} style={closeBtnStyle}>×</button>
              </div>
            </div>

            {/* 아바타 - 확장 모드에선 60px로 축소 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: isExpanded ? 8 : 14 }}>
              {d.avatar_url ? (
                <img src={d.avatar_url} alt={d.name}
                  style={{
                    width: isExpanded ? 60 : 80, height: isExpanded ? 60 : 80,
                    borderRadius: '50%', objectFit: 'cover',
                    border: '3px solid rgba(255,255,255,0.9)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    transition: 'width 0.3s ease, height 0.3s ease',
                  }} />
              ) : (
                <div style={{
                  width: isExpanded ? 60 : 80, height: isExpanded ? 60 : 80,
                  borderRadius: '50%', background: d.color,
                  boxShadow: `0 4px 16px ${d.color}88`,
                  transition: 'width 0.3s ease, height 0.3s ease',
                }} />
              )}
            </div>

            {/* 닉네임 */}
            <div style={{ textAlign: 'center', marginBottom: isExpanded ? 6 : 10 }}>
              <span style={{ fontSize: isExpanded ? '1.05rem' : '1.25rem', fontWeight: 800, color: '#0f1c36', transition: 'font-size 0.3s ease' }}>{d.name}</span>
            </div>

            {/* 기술 스택 칩 - 확장 모드에선 숨김 */}
            {!isExpanded && d.tech_stacks.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
                {d.tech_stacks.map(stack => (
                  <span key={stack} style={techChipStyle}>{stack}</span>
                ))}
              </div>
            )}

            {/* 자기소개 - 확장 모드에선 숨김 */}
            {!isExpanded && d.bio && (
              <p style={{ fontSize: '0.88rem', color: '#6b7280', textAlign: 'center', margin: '0 0 10px', lineHeight: 1.5 }}>
                {d.bio}
              </p>
            )}

            {/* 코인 - 본인만 */}
            {d.isMe && (
              <p style={{ textAlign: 'center', fontSize: '0.95rem', fontWeight: 700, color: '#d97706', margin: '0 0 16px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  보유 코인
                  <img src="/coin_icon.svg" alt="코인" style={{ width: 18, height: 18 }} />
                  {(d.coins).toLocaleString()}
                </span>
              </p>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.08)', margin: '0 0 16px' }} />

            {/* 통계: 버튼과 3등분 정렬 맞춤 (flex:1로 각 섹션 동일 너비) */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b' }}>{d.current_streak}</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 3 }}>커밋 스트릭</div>
              </div>
              <div style={{ width: 1, height: 32, background: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f1c36' }}>0</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 3 }}>프로젝트</div>
              </div>
              <div style={{ width: 1, height: 32, background: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f1c36' }}>{d.follower_count}</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 3 }}>팔로워</div>
              </div>
            </div>

            {/* 프로필 수정 / 팔로우 버튼 - 확장 모드에선 숨김 (공간 절약) */}
            {!isExpanded && (
              <button style={profileActionBtnStyle} onClick={() => onViewProfile(d.id)}>
                {d.isMe ? '프로필 수정' : '팔로우'}
              </button>
            )}
          </div>

          {/* ── 카드 2: 내 글 / 트로피 탭 ── */}
          {/* 외부 카드: flex column, 패딩 없음 → 헤더와 스크롤 영역을 분리 */}
          <div style={{ ...profileCardStyle, marginTop: 10, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0, overflow: 'hidden' }}>
            {/* 탭 헤더 + 펼치기 토글 버튼 - 고정 (스크롤 안 됨) */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '0 20px', flexShrink: 0 }}>
              {[['posts', '내 글'], ['trophies', '트로피']].map(([key, label]) => (
                <button key={key}
                  style={{
                    flex: 1, border: 'none', background: 'none',
                    padding: '10px 0', cursor: 'pointer',
                    fontSize: '0.95rem', fontWeight: activeTab === key ? 700 : 400,
                    color: activeTab === key ? '#3b82f6' : '#9ca3af',
                    borderBottom: activeTab === key ? '2px solid #3b82f6' : '2px solid transparent',
                    transition: 'color 0.2s',
                  }}
                  onClick={() => setActiveTab(key)}
                >
                  {label}
                </button>
              ))}
              {/* 펼치기/접기 토글 - ▲ 확장, ▼ 기본 */}
              <button
                onClick={() => setIsExpanded(prev => !prev)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  padding: '4px 8px', fontSize: '0.75rem', color: '#9ca3af',
                  flexShrink: 0, transition: 'color 0.2s',
                }}
                title={isExpanded ? '접기' : '펼치기'}
              >
                {isExpanded ? '▲' : '▼'}
              </button>
            </div>

            {/* 스크롤 가능한 콘텐츠 영역 - 탭 헤더는 고정, 이 영역만 스크롤됨 */}
            <div className="tab-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 20px 16px' }}>

            {/* 내 글 탭 */}
            {activeTab === 'posts' && (
              <div>
                {DUMMY_POSTS.map(post => (
                  <div key={post.id} style={postItemStyle}>
                    <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: '#1f2937', lineHeight: 1.5 }}>
                      {post.content}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* 좋아요 - 누르면 핑크색으로 채워짐 */}
                      <button
                        style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                        onClick={() => toggleLike(post.id)}
                      >
                        <img
                          src="/heart.svg"
                          alt="좋아요"
                          style={{
                            width: 16, height: 16,
                            filter: likedSet.has(post.id)
                              ? 'invert(53%) sepia(90%) saturate(500%) hue-rotate(290deg) brightness(1.1)'
                              : 'none',
                          }}
                        />
                        <span style={{ fontSize: '0.8rem', color: likedSet.has(post.id) ? '#ec4899' : '#9ca3af' }}>
                          {post.likes + (likedSet.has(post.id) ? 1 : 0)}
                        </span>
                      </button>
                      {/* 댓글 */}
                      <button
                        style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <img src="/message_icon.svg" alt="댓글" style={{ width: 16, height: 16, opacity: 0.5 }} />
                        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{post.comments}</span>
                      </button>
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#9ca3af' }}>{post.timeAgo}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 트로피 탭 */}
            {activeTab === 'trophies' && (
              <div>
                {DUMMY_TROPHIES.map(trophy => (
                  isExpanded ? (
                    /* 확장 모드 - 프로젝트 상세 카드 */
                    <div key={trophy.id} style={projectCardStyle}>
                      {/* 왼쪽: 더 큰 프로젝트 썸네일 */}
                      <div style={projectThumbStyle}>
                        {trophy.image ? (
                          <img src={trophy.image} alt={trophy.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: '#e5e7eb', borderRadius: 8,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
                            📁
                          </div>
                        )}
                      </div>

                      {/* 가운데: 텍스트 정보 (우측 1/5 침범 금지) */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {/* 제목 + 경과시간 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f1c36',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {trophy.title}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#9ca3af', flexShrink: 0 }}>{trophy.timeAgo}</span>
                        </div>

                        {/* 설명 - 2줄 초과 시 ... */}
                        <p style={{
                          margin: 0, fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.4,
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {trophy.desc}
                        </p>

                        {/* 기술 스택 - 넘치면 ... 처리 */}
                        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 3, overflow: 'hidden' }}>
                          {trophy.techStacks.slice(0, 3).map(t => (
                            <span key={t} style={{ ...techChipStyle, fontSize: '0.65rem', padding: '2px 7px' }}>{t}</span>
                          ))}
                          {trophy.techStacks.length > 3 && (
                            <span style={{ fontSize: '0.68rem', color: '#9ca3af', alignSelf: 'center' }}>...</span>
                          )}
                        </div>

                        {/* 날짜 + 좋아요·댓글 버튼 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                          <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{trophy.dateRange}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              style={{ display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                              onClick={() => toggleLike('t_' + trophy.id)}
                            >
                              <img src="/heart.svg" alt="좋아요" style={{
                                width: 13, height: 13,
                                filter: likedSet.has('t_' + trophy.id)
                                  ? 'invert(53%) sepia(90%) saturate(500%) hue-rotate(290deg) brightness(1.1)'
                                  : 'none',
                              }} />
                              <span style={{ fontSize: '0.75rem', color: likedSet.has('t_' + trophy.id) ? '#ec4899' : '#9ca3af' }}>
                                {trophy.likes + (likedSet.has('t_' + trophy.id) ? 1 : 0)}
                              </span>
                            </button>
                            <button
                              style={{ display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              <img src="/message_icon.svg" alt="댓글" style={{ width: 13, height: 13, opacity: 0.5 }} />
                              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{trophy.comments ?? 0}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 우측 1/5: 트로피 아이콘 전용 영역 */}
                      <div style={{ width: 100, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {TROPHY_GRADE[trophy.grade] && (
                          <img src={TROPHY_GRADE[trophy.grade].src} alt={trophy.grade}
                            style={{ width: 88, height: 88, objectFit: 'contain' }} />
                        )}
                      </div>
                    </div>
                  ) : (
                    /* 기본 모드 - 간략 표시 */
                    <div key={trophy.id} style={trophyItemStyle}>
                      {/* 트로피 아이콘 래퍼 - relative로 경과시간 뱃지를 우상단에 절대 배치 */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        {/* 경과시간 - 트로피 이미지 우상단 */}
                        <span style={{
                          position: 'absolute',
                          top: -6,
                          right: -4,
                          fontSize: '0.62rem',
                          color: '#9ca3af',
                          whiteSpace: 'nowrap',
                          background: 'rgba(255,255,255,0.85)',
                          borderRadius: 4,
                          padding: '1px 4px',
                        }}>
                          {trophy.timeAgo}
                        </span>
                        {TROPHY_GRADE[trophy.grade] ? (
                          <img src={TROPHY_GRADE[trophy.grade].src} alt={trophy.grade}
                            style={{ width: 64, height: 'auto', display: 'block', objectFit: 'contain' }} />
                        ) : (
                          <span style={{ fontSize: '2.5rem' }}>🏆</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#92400e' }}>{trophy.title}</div>
                        <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 2 }}>{trophy.desc}</div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}

            </div>{/* end of tab-scroll */}
          </div>
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

// 랜딩 페이지 nav-item CSS와 동일한 스타일 + DM·알림 빨간점 펄스 애니메이션
const navGlobalStyles = `
  .globe-nav-item {
    color: #ffffff;
    cursor: pointer;
    padding: 8px 0;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    font-size: 1.5rem;
    font-weight: 700;
    font-family: inherit;
    transition: color 0.2s, border-color 0.2s;
  }
  .globe-nav-item:hover {
    color: rgba(255,255,255,0.8);
  }
  .globe-nav-item.active {
    color: #4e9af1;
    border-bottom: 2px solid #4e9af1;
  }
  @keyframes pulse-red {
    0%   { box-shadow: 0 0 0 0   rgba(239, 68, 68, 0.8); }
    60%  { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0);   }
    100% { box-shadow: 0 0 0 0   rgba(239, 68, 68, 0);   }
  }
  .notif-dot {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 9px;
    height: 9px;
    background: #ef4444;
    border-radius: 50%;
    border: 1.5px solid white;
    animation: pulse-red 1.6s ease-out infinite;
  }
  /* 탭 스크롤 영역 - 오른쪽에 얇은 스크롤바 표시 */
  .tab-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(0,0,0,0.18) transparent;
  }
  .tab-scroll::-webkit-scrollbar {
    width: 5px;
  }
  .tab-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .tab-scroll::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.18);
    border-radius: 3px;
  }
`;

// 랜딩 페이지와 동일한 레이아웃의 상단 네비게이션 바
// 지구본 위에 반투명하게 오버레이되도록 position: absolute
const earthNavbarStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '20px 60px',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(11, 16, 38, 0.75)',
  backdropFilter: 'blur(8px)',
  zIndex: 10,
};

// 메뉴 항목 목록 - 랜딩 페이지와 동일
const navItems = ['프로필', '피드', '트로피', '상점', '로그아웃'];

// 패널 전체 컨테이너 - flex column: 프로필 카드 고정 + 탭 카드가 나머지 공간 차지
const panelStyle = {
  position: "absolute",
  top: 90,
  right: 16,
  bottom: 16,
  width: 360,
  display: "flex",
  flexDirection: "column",
  overflowX: "hidden",
  overflowY: "hidden",
  transition: "transform 0.45s cubic-bezier(.2,.8,.2,1)",
  zIndex: 3,
  scrollbarWidth: "none",
};

// 프로필 카드 - PNG처럼 흰색 반투명 카드
const profileCardStyle = {
  background: "rgba(255, 255, 255, 0.92)",
  backdropFilter: "blur(16px)",
  borderRadius: 20,
  padding: "20px",
  border: "1px solid rgba(255,255,255,0.7)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
};

// 닫기 버튼 - 밝은 카드 배경에 맞게 다크 색상
const closeBtnStyle = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "none",
  background: "rgba(0,0,0,0.08)",
  color: "#374151",
  fontSize: 16,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

// DM·알림 아이콘 - 고정 크기 박스로 감싸서 SVG 내재 크기 차이 무시
const iconBoxStyle = {
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  opacity: 0.65,
  flexShrink: 0,
};

// 박스 안 img - 박스에 꽉 차되 비율 유지
const iconImgStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
};

// 기술 스택 칩
const techChipStyle = {
  background: "rgba(59, 130, 246, 0.1)",
  border: "1px solid rgba(59, 130, 246, 0.3)",
  color: "#3b82f6",
  padding: "3px 10px",
  borderRadius: 20,
  fontSize: "0.78rem",
  fontWeight: 500,
};

// 상태 선택 드롭다운 컨테이너
const statusDropdownStyle = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  background: "white",
  borderRadius: 12,
  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
  border: "1px solid rgba(0,0,0,0.07)",
  padding: "6px 0",
  zIndex: 100,
  minWidth: 130,
};

// 상태 드롭다운 각 옵션 버튼
const statusOptionStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "8px 14px",
  border: "none",
  cursor: "pointer",
  fontSize: "0.88rem",
  color: "#374151",
};

// 글 아이템
const postItemStyle = {
  padding: "12px 0",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};

// 트로피 아이템 - gap 줄여서 아이콘과 텍스트 사이 빈 공간 최소화
const trophyItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "12px 0",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};

// 프로필 수정 / 팔로우 버튼
const profileActionBtnStyle = {
  width: "100%",
  padding: "12px",
  background: "#3b82f6",
  color: "white",
  border: "none",
  borderRadius: 10,
  fontSize: "0.95rem",
  fontWeight: 700,
  cursor: "pointer",
};

// 더보기 버튼
const showMoreBtnStyle = {
  width: "100%",
  padding: "10px 0",
  background: "none",
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: 8,
  fontSize: "0.82rem",
  color: "#6b7280",
  cursor: "pointer",
  marginTop: 8,
  fontWeight: 500,
};

// 확장 모드 트로피 - 프로젝트 상세 카드 (썸네일 + 정보)
const projectCardStyle = {
  display: "flex",
  gap: 10,
  padding: "10px 0",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  alignItems: "flex-start",
};

// 프로젝트 썸네일 (왼쪽 고정 크기 이미지)
const projectThumbStyle = {
  width: 96,
  height: 84,
  flexShrink: 0,
  borderRadius: 8,
  overflow: "hidden",
  background: "#e5e7eb",
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

