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
 *  줌 인/아웃 동작 방식:
 *   - 휠 위로: 지구 확대 (최대 2배)
 *   - 휠 아래로: 지구 축소 (최소 절반)
 *
 * 필요 패키지:
 *   npm i three @react-three/fiber @react-three/drei
 *
 * 에셋:
 *   /public/models/earth/scene.gltf  (+ scene.bin)
 *
 * ------------------------------------------------------------------
 */

import React, { useRef, useState, useMemo, useEffect, useLayoutEffect, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Html, OrbitControls, useAnimations } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import { useLocation, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { useAuth } from "./auth/hooks/useAuth";
import api, { API_ORIGIN } from "./api/axios";
import { getAppSocket } from "./realtime/appSocket";
import DmPanel from "./dm/DmPanel";
import { useDmSocket } from "./dm/useDmSocket";
import PetShopModal from "./petshop/petShopModal";
import DailyRewardModal from "./daily-reward/DailyRewardModal";
import AvatarViewerModal from "./avatar-viewer/AvatarViewerModal";
import PostCard, { HeartIcon } from "./feed/components/PostCard";
import CommentSection from "./feed/components/CommentSection";
import { isAnonymousPost } from "./feed/utils/anonAvatar";
import { getTagPillColors } from "./feed/utils/tagPillColors";
import { fetchPostById, togglePostLike, toggleTrophyLike } from "./feed/api/feedApi";
import { fetchSearchAutocomplete } from "./feed/api/searchApi";
import { streakBadgeEmoji } from "./utils/streakBadgeEmoji";
import ProjectRegisterModal from "./feed/components/ProjectRegisterModal";
import { LoginModalProvider } from "./feed/auth/LoginModalContext";
import { useTrophyModal } from "./feed/trophy/TrophyModalContext";
import { useFeedTheme } from "./feed/theme/ThemeContext";
import * as THREE from "three";

// Html 라벨을 body에 붙여 canvas 상위 overflow에 잘리지 않게 함
const htmlLabelPortal = typeof document !== "undefined" ? { current: document.body } : { current: null };

// ──────────────────────────────────────────────────────────────────
// 1. 데모용 유저 데이터 (위도 / 경도 기반) — dev push 전 주석 해제
// ──────────────────────────────────────────────────────────────────
// const USERS = [
//   { id: "u1", name: "Jiwoo",  bio: "프론트엔드 / 서울",       lat: 37.56,  lon: 126.97, color: "#ff5d8f", avatar: "/models/avatar/f_1.glb" },
//   { id: "u2", name: "Marco",  bio: "디자이너 / 밀라노",       lat: 45.46,  lon: 9.19,   color: "#ffd166", avatar: "/models/avatar/m_2.glb" },
//   { id: "u3", name: "Aisha",  bio: "AI 연구자 / 두바이",      lat: 25.27,  lon: 55.30,  color: "#06d6a0", avatar: "/models/avatar/f_4.glb" },
//   { id: "u4", name: "Liam",   bio: "백엔드 / 뉴욕",           lat: 40.71,  lon: -74.0,  color: "#4cc9f0", avatar: "/models/avatar/m_4.glb" },
//   { id: "u5", name: "Sora",   bio: "블로거 / 도쿄",           lat: 35.68,  lon: 139.69, color: "#b388eb", avatar: "/models/avatar/f_7.glb" },
//   { id: "u6", name: "Diego",  bio: "게임 개발자 / 상파울루",  lat: -23.55, lon: -46.63, color: "#f9844a", avatar: "/models/avatar/m_6.glb" },
// ];

const S3_AVATAR_BASE = 'https://glogs3bucketforimage.s3.ap-northeast-2.amazonaws.com/avatar';
const AVATAR_POOL = [
  `${S3_AVATAR_BASE}/f_1.glb`,  `${S3_AVATAR_BASE}/f_2.glb`,  `${S3_AVATAR_BASE}/f_3.glb`,
  `${S3_AVATAR_BASE}/f_4.glb`,  `${S3_AVATAR_BASE}/f_5.glb`,  `${S3_AVATAR_BASE}/f_6.glb`,
  `${S3_AVATAR_BASE}/f_7.glb`,  `${S3_AVATAR_BASE}/f_8.glb`,  `${S3_AVATAR_BASE}/f_9.glb`,
  `${S3_AVATAR_BASE}/f_10.glb`,
  `${S3_AVATAR_BASE}/m_1.glb`,  `${S3_AVATAR_BASE}/m_2.glb`,  `${S3_AVATAR_BASE}/m_3.glb`,
  `${S3_AVATAR_BASE}/m_4.glb`,  `${S3_AVATAR_BASE}/m_5.glb`,  `${S3_AVATAR_BASE}/m_6.glb`,
  `${S3_AVATAR_BASE}/m_7.glb`,  `${S3_AVATAR_BASE}/m_8.glb`,  `${S3_AVATAR_BASE}/m_9.glb`,
  `${S3_AVATAR_BASE}/m_10.glb`,
];

/** model_url 없는 유저의 임시 폴백 (user_id 기반 고정) */
// Html 라벨 스크린 좌표: 마커 투영 위치에 최대한 가깝게 두되 캔버스 밖·오른쪽 패널 구역으로 클램프
function clampHtmlLabelScreenPosition(el, camera, size, profilePanelOpen) {
  const objectPos = new THREE.Vector3().setFromMatrixPosition(el.matrixWorld);
  objectPos.project(camera);
  const widthHalf = size.width / 2;
  const heightHalf = size.height / 2;
  let x = objectPos.x * widthHalf + widthHalf;
  let y = -(objectPos.y * heightHalf) + heightHalf;

  const margin = 12;
  const labelHalfW = 92;
  const labelHalfH = 24;
  const rightReserve = profilePanelOpen ? 368 : 20;

  const minX = margin + labelHalfW;
  const maxX = Math.max(minX, size.width - margin - labelHalfW - rightReserve);
  const minY = margin + labelHalfH;
  const maxY = Math.max(minY, size.height - margin - labelHalfH);

  x = THREE.MathUtils.clamp(x, minX, maxX);
  y = THREE.MathUtils.clamp(y, minY, maxY);
  return [x, y];
}

function pickAvatarByUserId(userId) {
  const n = Number(userId);
  const idx = Number.isFinite(n) ? Math.abs(n) % AVATAR_POOL.length : 0;
  return AVATAR_POOL[idx];
}

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

/** 카메라(+Z) 쪽으로 표면 마커가 오도록 지구 그룹 회전 스냅 */
function snapEarthGroupTowardCamera(groupRef, lat, lon) {
  if (!groupRef?.current) return;
  const v = latLonToVec3(lat, lon, 1).normalize();
  const toward = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(v, toward);
  groupRef.current.quaternion.copy(q);
  groupRef.current.updateMatrixWorld(true);
}

function parseGlobeCoord(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : fallback;
}

// ──────────────────────────────────────────────────────────────────
// 2. GLTF 지구 모델 + 유저 마커들
//    (자전과 마커가 같이 돌도록 한 group 안에 묶음)
// ──────────────────────────────────────────────────────────────────
function EarthScene({ users = [], autoRotate, onSelectUser, onSceneClick, dragRef, groupRef, profilePanelOpen }) {
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
      const resumed = Date.now() > dragRef.current.pausedUntil;
      if (resumed) {
        // 3초 경과 후: X축 부드럽게 0으로 복귀 + Y축 자동 회전 재개
        group.current.rotation.x *= 0.9;
        if (autoRotate) {
          group.current.rotation.y += delta * 0.15;
        }
      }
      // 대기 중엔 X/Y 모두 드래그 위치 그대로 고정
    }
  });

  return (
    // 지구본 또는 마커 클릭 시 onSceneClick 호출 → 배경 클릭과 구분하여 패널 유지
    <group ref={group} onClick={(e) => { e.stopPropagation(); onSceneClick(); }}>
      {/* GLTF 지구 본체 */}
      <primitive object={scene} />

      {/* 유저 캐릭터 마커들 */}
      {users.map((u) => {
        const pos = latLonToVec3(u.lat, u.lon, MARKER_R);
        return (
          <UserMarker
            key={u.id}
            position={pos}
            user={u}
            profilePanelOpen={profilePanelOpen}
            onClick={() => onSelectUser(u)}
          />
        );
      })}
    </group>
  );
}

// 미리 로딩
useGLTF.preload("/models/earth/scene.gltf");
// USERS.forEach((u) => useGLTF.preload(u.avatar)); // 더미 데이터 사용 시 주석 해제
AVATAR_POOL.forEach((url) => useGLTF.preload(url));

// ──────────────────────────────────────────────────────────────────
// 3. 유저 마커 - GLB 아바타 + idle 애니메이션 + 카메라 거리 기반 스케일
// ──────────────────────────────────────────────────────────────────

// SkeletonUtils.clone: SkinnedMesh 스켈레톤까지 올바르게 복제
function AvatarModel({ url }) {
  const { scene, animations } = useGLTF(url);
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const rootRef = useRef();
  const { actions, names } = useAnimations(animations, rootRef);

  useEffect(() => {
    if (!names.length) return;
    const idleAction = actions[names[1]] ?? actions[names[0]];
    if (idleAction) idleAction.reset().fadeIn(0.3).play();
    return () => { idleAction?.stop(); };
  }, [actions, names]);

  return <primitive ref={rootRef} object={cloned} />;
}

// 카메라 거리 기반 동적 스케일 상수
const BASE_DISTANCE = 3.35;  // 기본 카메라 거리 (초기값과 동일)
const MIN_SCALE = 0.3;       // 줌아웃 최소 (기본에서 14% 이상 멀어지면 도달)
const MAX_SCALE = 2.0;       // 줌인 최대 2배 (기본에서 20% 가까워지면 도달)
const AVATAR_BASE_SCALE = 0.084; // 기본 거리 아바타 크기 (0.028 × 3)

function UserMarker({ position, user, onClick, profilePanelOpen }) {
  const scaleRef = useRef();
  const outerGroupRef = useRef();
  const labelScaleRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const { camera } = useThree();
  const markerWorldPos = useMemo(() => new THREE.Vector3(), []);

  const labelCalculatePosition = useCallback(
    (el, cam, size) => clampHtmlLabelScreenPosition(el, cam, size, profilePanelOpen),
    [profilePanelOpen],
  );

  // 지구 표면 법선 방향(position)으로 Y축을 맞추는 쿼터니언 → 아바타가 지표면에 수직으로 섬
  const quaternion = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const dir = position.clone().normalize();
    return new THREE.Quaternion().setFromUnitVectors(up, dir);
  }, [position]);

  useFrame(() => {
    if (!scaleRef.current) return;

    // 카메라는 항상 원점을 바라보므로 position.length() = 줌 거리와 동일
    // 기본 거리 기준으로 1% 줌인마다 5%씩 커지고, 1% 줌아웃마다 5%씩 작아짐
    const dist = camera.position.length();
    const dynamicScale = THREE.MathUtils.clamp(1 + (1 - dist / BASE_DISTANCE) * 5, MIN_SCALE, MAX_SCALE);

    // 호버 배율(1.3×) × 거리 배율 × 아바타 기본 크기
    const target = (hovered ? 1.3 : 1.0) * dynamicScale * AVATAR_BASE_SCALE;
    const s = scaleRef.current.scale.x;
    scaleRef.current.scale.setScalar(s + (target - s) * 0.15);

    // 호버 이름 캡슐: 줌인 시 과대 방지 (스크린 위치는 Html calculatePosition에서 클램프)
    if (labelScaleRef.current && hovered && outerGroupRef.current) {
      outerGroupRef.current.getWorldPosition(markerWorldPos);
      const camDist = camera.position.distanceTo(markerWorldPos);
      let labelScale = THREE.MathUtils.clamp((camDist - 1.08) / 2.15, 0.28, 1.12);
      if (profilePanelOpen) labelScale = Math.min(labelScale, 0.72);
      labelScaleRef.current.style.transform = `translateY(14px) scale(${labelScale})`;
    }
  });

  return (
    // 외부 그룹: position + quaternion + 이벤트 담당
    <group
      ref={outerGroupRef}
      position={position}
      quaternion={quaternion}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
    >
      {/* 내부 그룹: 스케일 lerp 전용 */}
      <group ref={scaleRef}>
        <Suspense fallback={null}>
          {/* avatar: 더미 데이터용 GLB 경로, 없으면 기본 아바타 사용 */}
          <AvatarModel url={user.avatar || `${S3_AVATAR_BASE}/m_1.glb`} />
        </Suspense>
      </group>

      {/* 호버 시 이름 라벨 — body 포털로 canvas overflow 잘림 방지 */}
      {hovered && (
        <Html
          center
          distanceFactor={6.5}
          calculatePosition={labelCalculatePosition}
          portal={htmlLabelPortal}
          style={{ pointerEvents: "none", zIndex: 10000 }}
        >
          <div ref={labelScaleRef} style={labelStyle}>{user.name}</div>
        </Html>
      )}
    </group>
  );
}

// ──────────────────────────────────────────────────────────────────
// 4. 카메라 컨트롤러
//    - 평소엔 (0,0,zoomRef)에서 지구 정면을 본다.
//    - 유저가 선택되면 그 유저의 표면 좌표 바깥쪽으로 부드럽게 이동.
// ──────────────────────────────────────────────────────────────────
function CameraRig({ selectedUser, earthRef, zoomRef }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 0, 3), []);
  const lookAt = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useFrame(() => {
    const z = zoomRef.current;
    // lat/lon이 있는 유저만 카메라 이동 (없으면 지구본 가운데 유지)
    if (selectedUser && earthRef.current && selectedUser.lat != null && selectedUser.lon != null) {
      const local = latLonToVec3(selectedUser.lat, selectedUser.lon, 1);
      const world = local.clone().applyMatrix4(earthRef.current.matrixWorld);
      // zoom 비율 반영
      // z·계수가 너무 작으면 휠 줌인 시 카메라가 구 안쪽으로 들어가는 것처럼 보임 → 표면 밖 여유 확보
      target.copy(world).multiplyScalar(z * 0.76);
      lookAt.copy(world);
    } else {
      target.set(0, 0, z);
      lookAt.set(0, 0, 0);
    }
    camera.position.lerp(target, 0.08);
    camera.lookAt(lookAt);
  });

  return null;
}

// 트로피 등급별 설정 — 지구 패널·프로젝트 미리보기 모달에서 공통 사용
const TROPHY_GRADE = {
  gold: { src: '/goldtrophy.svg', color: '#f59e0b', label: '금' },
  silver: { src: '/silvertrophy.svg', color: '#9ca3af', label: '은' },
  bronze: { src: '/bronzetrophy.svg', color: '#92400e', label: '동' },
};

function resolveProjectThumb(raw) {
  if (raw == null) return null;
  const first = String(raw).split(/[,|\n]+/)[0].trim();
  if (!first) return null;
  if (/^https?:\/\//i.test(first)) return first;
  if (first.startsWith('/')) return `${API_ORIGIN}${first}`;
  return first;
}

function resolveMediaUrl(path) {
  if (path == null || path === '') return null;
  const s = String(path).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return `${API_ORIGIN}${s}`;
  return s;
}

function formatGlobeProjectCommentAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 대표 이미지 필드에 여러 경로가 있을 때 캐러셀용 URL 목록 */
function parseProjectImageGalleryUrls(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map((x) => resolveMediaUrl(String(x).trim())).filter(Boolean);
      }
    } catch {
      /* fallthrough */
    }
  }
  return s
    .split(/[,|\n]+/)
    .map((x) => resolveMediaUrl(x.trim()))
    .filter(Boolean);
}

function formatYmdDotFromIso(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function projectDescToBulletLines(desc) {
  const s = String(desc || '').trim();
  if (!s) return [];
  const lines = s.split(/\n+/).map((t) => t.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return [s];
}

function normalizeGlobeSearchKeyword(raw) {
  return String(raw ?? "").trim().slice(0, 100);
}

function buildSearchSnippet(raw) {
  const txt = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!txt) return "";
  return txt.length > 90 ? `${txt.slice(0, 90)}…` : txt;
}

function buildProjectEditDraftFromPreview(p) {
  if (!p?.id) return null;
  const contributors = Array.isArray(p.contributors)
    ? p.contributors.map((c) => ({
        user_id: Number(c.user_id),
        nickname: c.nickname != null ? String(c.nickname) : '',
        avatar_url: c.avatar_url ?? null,
      }))
    : [];
  return {
    project_id: Number(p.id),
    title: String(p.title ?? '').trim(),
    description: String(p.desc ?? '').trim(),
    github_url: p.github_url != null ? String(p.github_url) : '',
    deploy_url: p.deploy_url != null ? String(p.deploy_url) : '',
    video_url: p.video_url != null ? String(p.video_url) : '',
    image_url: p.image_url_raw != null ? String(p.image_url_raw) : '',
    tags: Array.isArray(p.techStacks) ? p.techStacks.map((t) => String(t)) : [],
    contributors,
    start_date: p.start_date != null && String(p.start_date).length >= 10 ? String(p.start_date).slice(0, 10) : '',
    end_date: p.end_date != null && String(p.end_date).length >= 10 ? String(p.end_date).slice(0, 10) : '',
  };
}

function mapProjectsApiToTrophyList(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((row) => ({
    id: row.project_id,
    trophyId: row.trophy_id,
    ownerUserId: row.owner_user_id != null ? Number(row.owner_user_id) : null,
    authorNickname: String(row.author_nickname || '').trim(),
    authorAvatarUrl: row.author_avatar_url ?? null,
    title: row.title,
    desc: String(row.description || '').trim(),
    image: resolveProjectThumb(row.image_url),
    image_url_raw: row.image_url ?? null,
    imageGallery: parseProjectImageGalleryUrls(row.image_url),
    github_url: row.github_url || null,
    deploy_url: row.deploy_url || null,
    video_url: row.video_url || null,
    techStacks: Array.isArray(row.techStacks) ? row.techStacks : [],
    dateRange: row.dateRange || '',
    timeAgo: row.timeAgo || '',
    grade: row.grade,
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    startDateLabel: formatYmdDotFromIso(row.start_date),
    endDateLabel: formatYmdDotFromIso(row.end_date),
    updatedAtLabel: formatYmdDotFromIso(row.updated_at),
    contributors: Array.isArray(row.contributors) ? row.contributors : [],
  }));
}

/** 패널용: 타임스탬프(ms) → 상대 시각 문자열 */
function panelTimeAgoFromTs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (diffMin < 60) return `${diffMin}분 전`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

/** 좋아요 탭: 피드 raw + 트로피 API row → 시간순 병합 엔트리 */
function buildMergedLikeEntries(feedPosts, trophyRows) {
  const fp = Array.isArray(feedPosts) ? feedPosts : [];
  const tr = Array.isArray(trophyRows) ? trophyRows : [];
  const feedItems = fp.map((p) => {
    const likedAt = p.liked_at ? Date.parse(p.liked_at) : 0;
    return {
      kind: 'feed',
      likedAt,
      id: `f_${p.post_id}`,
      postId: p.post_id,
      content: String(p.content || '').trim(),
      tags: Array.isArray(p.hashtags)
        ? p.hashtags.map((h) => String(h?.name || '').trim()).filter(Boolean)
        : [],
      likes: Number(p.like_count ?? 0),
      comments: Number(p.comment_count ?? 0),
      isLiked: Boolean(p.isLiked),
      timeAgo: panelTimeAgoFromTs(likedAt),
    };
  });
  const trophyMapped = mapProjectsApiToTrophyList({ items: tr }).map((t, idx) => ({
    kind: 'trophy',
    likedAt: tr[idx]?.liked_at ? Date.parse(tr[idx].liked_at) : 0,
    id: `t_${t.trophyId}`,
    trophy: t,
  }));
  return [...feedItems, ...trophyMapped].sort((a, b) => b.likedAt - a.likedAt);
}

const trophyFeedCardStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: 10,
  marginBottom: 8,
  borderRadius: 12,
  border: '1px solid var(--feed-border)',
  background: 'var(--feed-bg-card)',
  cursor: 'pointer',
  outline: 'none',
};

const trophyFeedCardThumbWrap = {
  width: 48,
  height: 48,
  flexShrink: 0,
  borderRadius: '50%',
  overflow: 'hidden',
  background: 'var(--feed-bg-header)',
};

const PROJECT_MODAL_TAG_PALETTE = [
  { background: '#eef2ff', color: '#4338ca' },
  { background: '#ecfeff', color: '#0e7490' },
  { background: '#fef3c7', color: '#b45309' },
  { background: '#fce7f3', color: '#be185d' },
  { background: '#ecfccb', color: '#3f6212' },
];

// ──────────────────────────────────────────────────────────────────
// 5. 메인 컴포넌트
// ──────────────────────────────────────────────────────────────────
export default function EarthCommunity() {
  const [selectedUser, setSelectedUser] = useState(null);
  const [showShop, setShowShop] = useState(false);
  const [showDailyReward, setShowDailyReward] = useState(false);
  const [dailyRewardAmount, setDailyRewardAmount] = useState(700);
  // 랜딩 페이지와 동일한 상단 메뉴 active 상태
  const [activeNav, setActiveNav] = useState(null);
  const [hasNewDm, setHasNewDm] = useState(false);
  // DM 아이콘 드래그 위치 (null이면 기본 위치)
  const [dmIconPos, setDmIconPos] = useState(null);
  const dmIconDragging = useRef(false);
  const dmIconDragOffset = useRef({ x: 0, y: 0 });
  const dmIconHasDragged = useRef(false);
  const [hasNewNotif, setHasNewNotif] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [dmPartnerId, setDmPartnerId] = useState(null);

  // DmPanel에 등록할 수신/전송 핸들러 ref — 패널이 열릴 때 등록됨
  const dmReceiveHandlerRef = useRef(null);
  const dmSentHandlerRef = useRef(null);
  const dmReadAckHandlerRef = useRef(null);

  // 소켓은 EarthCommunity에서 항상 연결 유지 — 패널 닫혀있어도 새 메시지 감지
  const { sendMessage, markRead } = useDmSocket({
    onReceive: (msg) => {
      if (dmReceiveHandlerRef.current) {
        dmReceiveHandlerRef.current(msg);
      } else {
        setHasNewDm(true);
      }
    },
    onSent: (msg) => { dmSentHandlerRef.current?.(msg); },
    onReadAck: (room_id) => { dmReadAckHandlerRef.current?.(room_id); },
  });

  const [globePostModalId, setGlobePostModalId] = useState(null);
  const [globeProjectPreview, setGlobeProjectPreview] = useState(null);
  const [globeProjectLikeBusy, setGlobeProjectLikeBusy] = useState(false);
  const [globeProjectEditOpen, setGlobeProjectEditOpen] = useState(false);
  const [globeProjectEditDraft, setGlobeProjectEditDraft] = useState(null);
  const [globeProjectSlideIdx, setGlobeProjectSlideIdx] = useState(0);
  const [globeProjectTagsExpanded, setGlobeProjectTagsExpanded] = useState(false);
  const [globeProjectShareHint, setGlobeProjectShareHint] = useState('');
  const globeProjectCommentsRef = useRef(null);
  const [globeProjComments, setGlobeProjComments] = useState([]);
  const [globeProjCommentDraft, setGlobeProjCommentDraft] = useState('');
  const [globeProjCommentBusy, setGlobeProjCommentBusy] = useState(false);
  const [globeProjCommentErr, setGlobeProjCommentErr] = useState('');
  const globeProjAbsorbedIdsRef = useRef(new Set());
  const globeProjDeleteDedupRef = useRef(new Set());
  const [trophyRefreshKey, setTrophyRefreshKey] = useState(0);
  const [earthPanelPostListRefreshKey, setEarthPanelPostListRefreshKey] = useState(0);
  const [globeSearchQ, setGlobeSearchQ] = useState("");
  const [globeSearchDebounced, setGlobeSearchDebounced] = useState("");
  const [globeSearchOpen, setGlobeSearchOpen] = useState(false);
  const [globeSearchUsers, setGlobeSearchUsers] = useState([]);
  const [globeSearchPosts, setGlobeSearchPosts] = useState([]);
  const [globeSearchProjects, setGlobeSearchProjects] = useState([]);
  const [globeSearchResultOpen, setGlobeSearchResultOpen] = useState(false);
  const [globeSearchResultPosts, setGlobeSearchResultPosts] = useState([]);
  const [globeSearchResultProjects, setGlobeSearchResultProjects] = useState([]);
  const globeSearchWrapRef = useRef(null);
  const [globeModalPost, setGlobeModalPost] = useState(null);
  const [globeModalLoad, setGlobeModalLoad] = useState("idle");
  const globeModalBodyRef = useRef(null);
  const [globeModalScrollRoot, setGlobeModalScrollRoot] = useState(null);
  const earthRef = useRef();
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0, deltaX: 0, deltaY: 0, pausedUntil: 0 });
  const zoomRef = useRef(3); // 카메라 Z 거리 (기본 3). 유저 미선택 1.5~6, 선택 시 더 큰 하한으로 구 관통 방지
  const GLOBE_ZOOM_MIN = 1.5;
  const GLOBE_ZOOM_MIN_SELECTED = 2.05;

  // 프로필 페이지 이동을 위한 navigate, 로그인 유저 정보
  const navigate = useNavigate();
  const location = useLocation();
  /** 피드 등에서 진입 시 location.state (effect에서 clear 되기 전 스냅샷) */
  const initialRouteStateRef = useRef(location.state);
  const earthRootRef = useRef(null);
  const wasTrophyModalOpenRef = useRef(false);
  const { user: me, updateUser, logout } = useAuth();
  const { theme, toggleTheme } = useFeedTheme();
  const { openTrophyModal, closeTrophyModal, isTrophyModalOpen } = useTrophyModal();

  const globeChrome = useMemo(() => {
    const L = theme === "light";
    return {
      wrapperBg: L
        ? "radial-gradient(circle at 50% 48%, #e8edf7 0%, #d8e2ef 52%, #b8c9dc 100%)"
        : "radial-gradient(circle at 50% 50%, #0b1026 0%, #04060f 100%)",
      wrapperFg: L ? "#0f172a" : "#ffffff",
      navBg: L ? "rgba(255,255,255,0.9)" : "rgba(11, 16, 38, 0.75)",
      navBorder: L ? "1px solid rgba(15,23,42,0.1)" : "1px solid rgba(255,255,255,0.1)",
      logoColor: L ? "#0f172a" : "#ffffff",
      navVarFg: L ? "#334155" : "#ffffff",
      navVarFgHover: L ? "#0f172a" : "rgba(255,255,255,0.88)",
      navVarActive: "#3b82f6",
      searchPh: L ? "#64748b" : "#94a3b8",
      notifRing: "#ffffff",
      searchBar: {
        display: "flex",
        gap: 8,
        alignItems: "center",
        borderRadius: 10,
        padding: "6px",
        background: L ? "rgba(255,255,255,0.96)" : "rgba(30, 41, 59, 0.92)",
        border: L ? "1px solid rgba(15,23,42,0.14)" : "1px solid rgba(148,163,184,0.28)",
        boxShadow: L ? "0 8px 20px rgba(15,23,42,0.1)" : "0 8px 28px rgba(0,0,0,0.45)",
      },
      searchInput: {
        flex: 1,
        minWidth: 0,
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: "0.82rem",
        color: L ? "#0f1c36" : "#e2e8f0",
        background: L ? "#ffffff" : "#0f172a",
        border: L ? "1px solid rgba(15,23,42,0.12)" : "1px solid rgba(100,116,139,0.35)",
      },
      searchSuggest: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "calc(100% + 8px)",
        maxHeight: 250,
        overflowY: "auto",
        borderRadius: 10,
        padding: "8px 0",
        background: L ? "rgba(248,250,252,0.98)" : "rgba(15,23,42,0.97)",
        border: L ? "1px solid rgba(15,23,42,0.12)" : "1px solid rgba(148,163,184,0.22)",
        boxShadow: L ? "0 8px 24px rgba(0,0,0,0.15)" : "0 8px 28px rgba(0,0,0,0.55)",
      },
      searchSectionTitle: {
        fontSize: "0.72rem",
        fontWeight: 700,
        padding: "4px 6px",
        color: L ? "#64748b" : "#94a3b8",
      },
      searchItemBtn: {
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        fontSize: "0.78rem",
        padding: "7px 8px",
        cursor: "pointer",
        color: L ? "#0f172a" : "#e2e8f0",
      },
      searchItemHoverBg: L ? "rgba(15,23,42,0.06)" : "rgba(148,163,184,0.12)",
      searchResultPopup: {
        position: "absolute",
        right: 14,
        bottom: 74,
        width: 356,
        maxHeight: 300,
        display: "flex",
        flexDirection: "column",
        borderRadius: 12,
        zIndex: 23,
        overflow: "hidden",
        background: L ? "rgba(248,250,252,0.98)" : "rgba(15,23,42,0.97)",
        border: L ? "1px solid rgba(15,23,42,0.16)" : "1px solid rgba(148,163,184,0.22)",
        boxShadow: L ? "0 10px 28px rgba(0,0,0,0.18)" : "0 10px 32px rgba(0,0,0,0.55)",
      },
      searchResultHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 10px",
        borderBottom: L ? "1px solid rgba(15,23,42,0.1)" : "1px solid rgba(148,163,184,0.18)",
        background: L ? "rgba(241,245,249,0.95)" : "rgba(30,41,59,0.95)",
        color: L ? "#0f172a" : "#e2e8f0",
      },
      searchResultBody: {
        padding: "8px",
        overflowY: "auto",
        maxHeight: 248,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: L ? "transparent" : "rgba(15,23,42,0.4)",
      },
    };
  }, [theme]);

  // 밤 테마일 때 배경에 뿌릴 별 150개 — 랜덤 위치/크기/반짝임 타이밍 (한 번만 생성)
  const nightStars = useMemo(() =>
    Array.from({ length: 150 }, (_, i) => ({
      id: i,
      top: Math.random() * 100,
      left: Math.random() * 100,
      size: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.5 + 0.3,
      duration: Math.random() * 3 + 2,
      delay: Math.random() * 4,
    }))
  , []);

  // 소켓/DmPanel에서 내 userId 식별용 — GlobalTopNav가 없는 globe 페이지에서 직접 세팅
  if (me) window.__myUserId = me.user_id;

  // 피드(공개/익명) 글·댓글 실시간 반영: 프로필 패널이 열려 있을 때만 리패치 트리거
  useEffect(() => {
    if (!me?.user_id) return undefined;
    const socket = getAppSocket();
    if (!socket) return undefined;

    const bumpIfPanelOpen = () => {
      if (!selectedUser) return;
      setEarthPanelPostListRefreshKey((k) => k + 1);
    };

    socket.on('feed_post:new', bumpIfPanelOpen);
    socket.on('feed_post:updated', bumpIfPanelOpen);
    socket.on('feed_post:deleted', bumpIfPanelOpen);
    socket.on('feed_comment:new', bumpIfPanelOpen);
    socket.on('feed_comment:deleted', bumpIfPanelOpen);

    return () => {
      socket.off('feed_post:new', bumpIfPanelOpen);
      socket.off('feed_post:updated', bumpIfPanelOpen);
      socket.off('feed_post:deleted', bumpIfPanelOpen);
      socket.off('feed_comment:new', bumpIfPanelOpen);
      socket.off('feed_comment:deleted', bumpIfPanelOpen);
    };
  }, [me?.user_id, selectedUser]);

  // 트로피/프로젝트 목록 실시간 반영: 우측 패널/프로젝트 미리보기에서 바로 갱신
  useEffect(() => {
    if (!me?.user_id) return undefined;
    const socket = getAppSocket();
    if (!socket) return undefined;

    const bumpTrophy = () => setTrophyRefreshKey((k) => k + 1);
    socket.on('project:changed', bumpTrophy);
    socket.on('trophy:like_changed', bumpTrophy);

    return () => {
      socket.off('project:changed', bumpTrophy);
      socket.off('trophy:like_changed', bumpTrophy);
    };
  }, [me?.user_id]);

  // 마커 클릭과 빈 배경 클릭을 구분하기 위한 ref
  // 마커 클릭 시 true로 설정 → 캔버스 onClick에서 패널 닫힘 방지
  const markerClickedRef = useRef(false);

  // API에서 실유저 목록 불러오기
  const [apiGlobeUsers, setApiGlobeUsers] = useState([]);
  useEffect(() => {
    api.get('/users/globe')
      .then(({ data }) => setApiGlobeUsers(data))
      .catch((err) => console.error('[GlobeUsers]', err));
  }, []);

  // 하루 첫 로그인 보상 요청 (로그인 유저가 확인된 시점에 1회만 실행)
  useEffect(() => {
    if (!me?.user_id) return;
    const key = `dailyReward_${me.user_id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    api.post('/auth/daily-reward')
      .then(({ data }) => {
        if (data.rewarded) {
          setDailyRewardAmount(data.amount);
          setShowDailyReward(true);
          updateUser({ coins: data.coins });
        }
      })
      .catch(() => { /* 조용히 무시 */ });
  }, [me?.user_id, updateUser]);

  const globeUsers = useMemo(() => {
    const normalized = apiGlobeUsers.map((u) => ({
      ...u,
      avatar: u.avatar || u.model_url || pickAvatarByUserId(u.id),
      // API 목록에 내 마킹이 있어도 isMe가 없으면 패널에서 팔로우로 잘못 표시됨
      isMe: Boolean(me?.user_id != null && Number(u.id) === Number(me.user_id)),
    }));
    if (!me?.user_id) return normalized;
    // API 결과에 내가 없으면 직접 추가 (id는 숫자/문자열 모두 대응)
    const hasMe = normalized.some((u) => Number(u.id) === Number(me.user_id));
    if (hasMe) return normalized;
    const lat = parseGlobeCoord(me.globe_lat, 37.56);
    const lon = parseGlobeCoord(me.globe_lon, 126.97);
    // globe_lat/lon이 없으면 지구본에 표시하지 않음
    if (!me.globe_lat || !me.globe_lon) return normalized;
    const meUser = {
      id: String(me.user_id),
      name: me.nickname || me.username || me.name || `user-${me.user_id}`,
      bio: me.bio || "내 프로필",
      lat,
      lon,
      color: "#4e9af1",
      avatar: me.model_url || pickAvatarByUserId(me.user_id),
      avatar_url: me.avatar_url || null,
      isMe: true,
      status: me.status || "offline",
    };
    return [meUser, ...normalized];
  }, [me, apiGlobeUsers]);

  const buildMePanelUser = useMemo(() => {
    if (!me?.user_id) return null;
    const lat = parseGlobeCoord(me.globe_lat, 37.56);
    const lon = parseGlobeCoord(me.globe_lon, 126.97);
    return {
      id: me.user_id,
      name: me.nickname || me.username || me.name || `user-${me.user_id}`,
      bio: me.bio || "",
      color: "#4e9af1",
      avatar: me.model_url || pickAvatarByUserId(me.user_id),
      avatar_url: me.avatar_url || null,
      lat,
      lon,
      status: me.status || "online",
      isMe: true,
    };
  }, [me]);

  useEffect(() => {
    const t = setTimeout(() => {
      setGlobeSearchDebounced(normalizeGlobeSearchKeyword(globeSearchQ));
    }, 260);
    return () => clearTimeout(t);
  }, [globeSearchQ]);

  useEffect(() => {
    const q = globeSearchDebounced;
    if (!globeSearchOpen || !q) {
      setGlobeSearchUsers([]);
      setGlobeSearchPosts([]);
      setGlobeSearchProjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [auto, projectsRes] = await Promise.all([
          fetchSearchAutocomplete(q).catch(() => ({ users: [], suggestions: [] })),
          api.get("/projects/community", { params: { sort: "latest" } }).catch(() => ({ data: { items: [] } })),
        ]);
        if (cancelled) return;
        const users = Array.isArray(auto?.users) ? auto.users.slice(0, 6) : [];
        const posts = (Array.isArray(auto?.suggestions) ? auto.suggestions : [])
          .filter((s) => s && s.type === "post" && s.post_id != null)
          .slice(0, 6);
        const rows = Array.isArray(projectsRes?.data?.items) ? projectsRes.data.items : [];
        const lowQ = q.toLowerCase();
        const projects = rows
          .filter((row) => {
            const title = String(row?.title ?? "").toLowerCase();
            const desc = String(row?.description ?? "").toLowerCase();
            const author = String(row?.author_nickname ?? "").toLowerCase();
            return title.includes(lowQ) || desc.includes(lowQ) || author.includes(lowQ);
          })
          .slice(0, 6)
          .map((row) => ({
            id: row.project_id,
            title: String(row.title ?? "").trim() || "제목 없음",
            author: String(row.author_nickname ?? "").trim(),
            snippet: buildSearchSnippet(row.description),
          }));
        setGlobeSearchUsers(users);
        setGlobeSearchPosts(posts);
        setGlobeSearchProjects(projects);
      } catch {
        if (cancelled) return;
        setGlobeSearchUsers([]);
        setGlobeSearchPosts([]);
        setGlobeSearchProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [globeSearchDebounced, globeSearchOpen]);

  useEffect(() => {
    if (!globeSearchOpen) return undefined;
    const onDocDown = (e) => {
      if (!globeSearchWrapRef.current?.contains(e.target)) setGlobeSearchOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [globeSearchOpen]);

  const moveToSearchedUser = useCallback(
    (rawUser) => {
      const userId = Number(rawUser?.user_id ?? rawUser?.id);
      if (!Number.isFinite(userId)) return;
      const found = globeUsers.find((u) => Number(u.id) === userId);
      if (found) {
        markerClickedRef.current = true;
        setSelectedUser(found);
        setActiveNav("프로필");
        dragRef.current.pausedUntil = Date.now() + 4000;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            snapEarthGroupTowardCamera(earthRef, found.lat, found.lon);
          });
        });
      } else {
        navigate(`/profile/${userId}`);
      }
      setGlobeSearchOpen(false);
    },
    [globeUsers, navigate],
  );

  const openGlobeSearchResults = useCallback(async () => {
    const q = normalizeGlobeSearchKeyword(globeSearchQ);
    if (!q) return;
    try {
      const [postRes, projectsRes] = await Promise.all([
        api.get("/search", { params: { type: "post", q, limit: 8 } }).catch(() => ({ data: { posts: [] } })),
        api.get("/projects/community", { params: { sort: "latest" } }).catch(() => ({ data: { items: [] } })),
      ]);
      const posts = (Array.isArray(postRes?.data?.posts) ? postRes.data.posts : []).map((p) => ({
        id: p.post_id,
        author: String(p?.user?.nickname ?? "").trim(),
        snippet: buildSearchSnippet(p.content),
      }));
      const lowQ = q.toLowerCase();
      const projects = mapProjectsApiToTrophyList(projectsRes?.data)
        .filter((p) => {
          const title = String(p.title ?? "").toLowerCase();
          const desc = String(p.desc ?? "").toLowerCase();
          const author = String(p.authorNickname ?? "").toLowerCase();
          return title.includes(lowQ) || desc.includes(lowQ) || author.includes(lowQ);
        })
        .slice(0, 8);
      setGlobeSearchResultPosts(posts);
      setGlobeSearchResultProjects(projects);
      setGlobeSearchResultOpen(true);
      setGlobeSearchOpen(false);
    } catch {
      setGlobeSearchResultPosts([]);
      setGlobeSearchResultProjects([]);
      setGlobeSearchResultOpen(true);
      setGlobeSearchOpen(false);
    }
  }, [globeSearchQ]);

  useLayoutEffect(() => {
    const st = initialRouteStateRef.current;
    if (st?.openShop !== true && st?.openMyProfile !== true && st?.openTrophy !== true) return;
    earthRootRef.current?.classList.add("earth-community-root--route-enter");
  }, []);

  useEffect(() => {
    if (location.state?.openShop !== true) return;
    closeTrophyModal();
    setShowShop(true);
    setActiveNav("상점");
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate, closeTrophyModal]);

  useEffect(() => {
    if (location.state?.openTrophy !== true) return;
    setShowShop(false);
    setActiveNav("트로피");
    openTrophyModal();
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate, openTrophyModal]);

  useEffect(() => {
    if (wasTrophyModalOpenRef.current && !isTrophyModalOpen) {
      setActiveNav((prev) => (prev === "트로피" ? null : prev));
    }
    wasTrophyModalOpenRef.current = isTrophyModalOpen;
  }, [isTrophyModalOpen]);

  useEffect(() => {
    if (location.state?.openMyProfile !== true || !buildMePanelUser) return;
    markerClickedRef.current = true;
    setActiveNav("프로필");
    setSelectedUser(buildMePanelUser);
    dragRef.current.pausedUntil = Date.now() + 4000;
    // navigate로 state를 지우면 effect cleanup이 rAF를 취소할 수 있어, 스냅은 cleanup 없이 예약
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        snapEarthGroupTowardCamera(earthRef, buildMePanelUser.lat, buildMePanelUser.lon);
      });
    });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, buildMePanelUser, navigate]);

  useEffect(() => {
    if (!globePostModalId) {
      setGlobeModalPost(null);
      setGlobeModalLoad("idle");
      return undefined;
    }
    let cancelled = false;
    setGlobeModalLoad("loading");
    fetchPostById(globePostModalId)
      .then((p) => {
        if (cancelled) return;
        if (p) {
          setGlobeModalPost(p);
          setGlobeModalLoad("ok");
        } else {
          setGlobeModalPost(null);
          setGlobeModalLoad("error");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setGlobeModalPost(null);
        setGlobeModalLoad("error");
      });
    return () => {
      cancelled = true;
    };
  }, [globePostModalId]);

  useLayoutEffect(() => {
    if (!globePostModalId) {
      setGlobeModalScrollRoot(null);
      return;
    }
    setGlobeModalScrollRoot(globeModalBodyRef.current);
  }, [globePostModalId, globeModalLoad, globeModalPost]);

  useEffect(() => {
    if (!globePostModalId && !globeProjectPreview) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (globeProjectPreview) setGlobeProjectPreview(null);
      else if (globePostModalId) setGlobePostModalId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [globePostModalId, globeProjectPreview]);

  const bumpGlobeModalCommentCount = useCallback((delta) => {
    setGlobeModalPost((p) => {
      if (!p) return p;
      return { ...p, commentsCount: Math.max(0, (p.commentsCount || 0) + delta) };
    });
  }, []);

  useEffect(() => {
    if (!globeProjectPreview) {
      setGlobeProjectShareHint('');
      setGlobeProjComments([]);
      globeProjAbsorbedIdsRef.current = new Set();
      globeProjDeleteDedupRef.current = new Set();
      setGlobeProjCommentDraft('');
      setGlobeProjCommentErr('');
      return;
    }
    setGlobeProjectSlideIdx(0);
    setGlobeProjectTagsExpanded(false);
  }, [globeProjectPreview?.id]);

  useEffect(() => {
    const bump = () => setTrophyRefreshKey((k) => k + 1);
    window.addEventListener('glog:trophy-project-comments', bump);
    return () => window.removeEventListener('glog:trophy-project-comments', bump);
  }, []);

  useEffect(() => {
    if (!globeProjectPreview?.id) return undefined;
    let cancelled = false;
    const pid = globeProjectPreview.id;
    globeProjAbsorbedIdsRef.current = new Set();
    globeProjDeleteDedupRef.current = new Set();
    api
      .get(`/projects/${pid}/comments`)
      .then(({ data }) => {
        if (cancelled) return;
        const arr = Array.isArray(data?.comments) ? data.comments : [];
        setGlobeProjComments(arr);
        globeProjAbsorbedIdsRef.current = new Set(arr.map((x) => Number(x.id)));
      })
      .catch(() => {
        if (!cancelled) {
          setGlobeProjComments([]);
          globeProjAbsorbedIdsRef.current = new Set();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [globeProjectPreview?.id]);

  const absorbGlobeProjectComment = useCallback((c) => {
    if (!c?.id || c.project_id == null) return;
    const pid = Number(c.project_id);
    const idNum = Number(c.id);
    if (globeProjAbsorbedIdsRef.current.has(idNum)) return;
    globeProjAbsorbedIdsRef.current.add(idNum);
    setGlobeProjComments((prev) =>
      [...prev, c].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    );
    setGlobeProjectPreview((prev) =>
      prev && Number(prev.id) === pid ? { ...prev, comments: Number(prev.comments ?? 0) + 1 } : prev,
    );
    setTrophyRefreshKey((k) => k + 1);
  }, []);

  const applyGlobeCommentDeleted = useCallback((projectId, commentId) => {
    const pid = Number(projectId);
    const cid = Number(commentId);
    const key = `${pid}:${cid}`;
    if (globeProjDeleteDedupRef.current.has(key)) return;
    globeProjDeleteDedupRef.current.add(key);
    globeProjAbsorbedIdsRef.current.delete(cid);
    setGlobeProjComments((prev) => prev.filter((x) => Number(x.id) !== cid));
    setGlobeProjectPreview((prev) =>
      prev && Number(prev.id) === pid
        ? { ...prev, comments: Math.max(0, Number(prev.comments ?? 0) - 1) }
        : prev,
    );
    setTrophyRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!globeProjectPreview?.id || !me?.user_id) return undefined;
    const token = window.__accessToken;
    if (!token) return undefined;
    const pid = globeProjectPreview.id;
    const socket = io(API_ORIGIN, { auth: { token } });
    const onNew = (c) => {
      if (!c || Number(c.project_id) !== Number(pid)) return;
      absorbGlobeProjectComment(c);
    };
    const onDel = (payload) => {
      if (!payload || Number(payload.project_id) !== Number(pid)) return;
      applyGlobeCommentDeleted(pid, payload.id);
    };
    socket.on('connect', () => {
      socket.emit('project:join', pid);
    });
    socket.on('project_comment:new', onNew);
    socket.on('project_comment:deleted', onDel);
    return () => {
      socket.emit('project:leave', pid);
      socket.off('project_comment:new', onNew);
      socket.off('project_comment:deleted', onDel);
      socket.disconnect();
    };
  }, [globeProjectPreview?.id, me?.user_id, absorbGlobeProjectComment, applyGlobeCommentDeleted]);

  const submitGlobeProjectComment = useCallback(async () => {
    if (!me?.user_id || !globeProjectPreview?.id || globeProjCommentBusy) return;
    const text = globeProjCommentDraft.trim();
    if (!text) return;
    setGlobeProjCommentBusy(true);
    setGlobeProjCommentErr('');
    try {
      const { data } = await api.post(`/projects/${globeProjectPreview.id}/comments`, { content: text });
      setGlobeProjCommentDraft('');
      absorbGlobeProjectComment(data);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || '댓글 등록에 실패했습니다.';
      setGlobeProjCommentErr(String(msg));
    } finally {
      setGlobeProjCommentBusy(false);
    }
  }, [me?.user_id, globeProjectPreview?.id, globeProjCommentDraft, globeProjCommentBusy, absorbGlobeProjectComment]);

  const deleteGlobeProjectCommentRow = useCallback(
    async (cm) => {
      if (!me?.user_id || !globeProjectPreview?.id || !cm?.id) return;
      if (Number(cm.user_id) !== Number(me.user_id)) return;
      try {
        await api.delete(`/projects/${globeProjectPreview.id}/comments/${cm.id}`);
        applyGlobeCommentDeleted(globeProjectPreview.id, cm.id);
      } catch {
        /* 무시 */
      }
    },
    [me?.user_id, globeProjectPreview?.id, applyGlobeCommentDeleted],
  );

  const globeProjectGallery = useMemo(() => {
    const p = globeProjectPreview;
    if (!p) return [];
    const g = p.imageGallery;
    if (Array.isArray(g) && g.length) return g;
    return p.image ? [p.image] : [];
  }, [globeProjectPreview]);

  const globeProjectMainImg =
    globeProjectGallery.length > 0
      ? globeProjectGallery[Math.min(globeProjectSlideIdx, globeProjectGallery.length - 1)]
      : null;

  const globeProjectDescLines = useMemo(
    () => (globeProjectPreview ? projectDescToBulletLines(globeProjectPreview.desc) : []),
    [globeProjectPreview?.desc],
  );

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
    if (dragRef.current.dragging) {
      dragRef.current.dragging = false;
      dragRef.current.pausedUntil = Date.now() + 3000; // 드래그 후 3초 정지
    }
  };

  // 전역 mouseup으로 캔버스 밖에서 떼도 처리
  useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  // DM 아이콘 드래그
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dmIconDragging.current) return;
      dmIconHasDragged.current = true;
      setDmIconPos({
        x: e.clientX - dmIconDragOffset.current.x,
        y: e.clientY - dmIconDragOffset.current.y,
      });
    };
    const onMouseUp = () => { dmIconDragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // 마우스 휠로 지구 확대/축소 (프로필/마커 선택 시 하한을 올려 카메라가 지구를 뚫지 않게)
  const handleWheel = (e) => {
    e.preventDefault();
    const zMin = selectedUser ? GLOBE_ZOOM_MIN_SELECTED : GLOBE_ZOOM_MIN;
    zoomRef.current = Math.max(zMin, Math.min(6, zoomRef.current + e.deltaY * 0.005));
  };

  useEffect(() => {
    if (!selectedUser) return;
    if (zoomRef.current < GLOBE_ZOOM_MIN_SELECTED) zoomRef.current = GLOBE_ZOOM_MIN_SELECTED;
  }, [selectedUser]);

  const globePostModalBackdropStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 12000,
    background: "var(--feed-overlay, rgba(15, 28, 54, 0.45))",
  };
  const globePostModalPanelStyle = {
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(780px, calc(100vw - 24px))",
    maxHeight: "min(88vh, 920px)",
    zIndex: 12001,
    display: "flex",
    flexDirection: "column",
    background: "var(--feed-bg-card)",
    color: "var(--feed-text-primary)",
    borderRadius: 16,
    boxShadow: "var(--feed-shadow, 0 12px 40px rgba(0,0,0,0.35))",
    border: "1px solid var(--feed-border)",
    overflow: "hidden",
  };
  const globePostModalHeaderStyle = {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderBottom: "1px solid var(--feed-border)",
  };
  const globePostModalBodyStyle = {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    padding: "10px 12px 16px",
  };
  const globePostModalCloseStyle = {
    border: "none",
    background: "transparent",
    fontSize: "1.35rem",
    lineHeight: 1,
    cursor: "pointer",
    color: "inherit",
    padding: "0 6px",
    opacity: 0.7,
  };
  const globeProjectModalPanelStyle = {
    ...globePostModalPanelStyle,
    width: "min(960px, calc(100vw - 24px))",
    maxHeight: "min(90vh, 900px)",
  };

  return (
    <LoginModalProvider isLoggedIn={Boolean(me)}>
    <div
      ref={earthRootRef}
      style={{
        ...wrapperStyle,
        background: globeChrome.wrapperBg,
        color: globeChrome.wrapperFg,
        ["--globe-nav-fg"]: globeChrome.navVarFg,
        ["--globe-nav-fg-hover"]: globeChrome.navVarFgHover,
        ["--globe-nav-active"]: globeChrome.navVarActive,
        ["--globe-search-hit-hover"]: globeChrome.searchItemHoverBg,
        ["--globe-search-ph"]: globeChrome.searchPh,
        ["--globe-notif-ring"]: globeChrome.notifRing,
      }}
    >
      {/* 별 반짝임 애니메이션 정의 — dark 테마 별에서 사용 */}
      <style>{`@keyframes twinkle { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>

      {/* 밤 테마일 때만 별 배경 레이어 표시 — 포인터 이벤트 없음(캔버스 클릭 방해 방지) */}
      {theme === 'dark' && nightStars.map(star => (
        <div
          key={star.id}
          style={{
            position: 'absolute',
            top: `${star.top}%`,
            left: `${star.left}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            background: 'white',
            borderRadius: '50%',
            opacity: star.opacity,
            animation: `twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      ))}
      <div style={canvasHostStyle} onClick={handleCanvasClick}>
        <div
          style={canvasWrapStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onWheel={handleWheel}
        >
          <Canvas camera={{ position: [0, 0, 3.35], fov: 45 }}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 3, 5]} intensity={1.1} />
            <Suspense fallback={null}>
              <EarthScene
                users={globeUsers}
                autoRotate={autoRotate}
                profilePanelOpen={Boolean(selectedUser)}
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
            <CameraRig selectedUser={selectedUser} earthRef={earthRef} zoomRef={zoomRef} />
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
        background: selectedUser ? 'transparent' : globeChrome.navBg,
        backdropFilter: selectedUser ? 'none' : 'blur(8px)',
        pointerEvents: selectedUser ? 'none' : 'auto',
        transition: 'opacity 0.3s ease',
        borderBottom: selectedUser ? 'none' : globeChrome.navBorder,
      }}>
        {/* GLog 로고 - 클릭 시 랜딩 홈으로 이동 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            onClick={() => navigate('/')}
            style={{ fontSize: '2.1rem', fontWeight: 'bold', color: globeChrome.logoColor, cursor: 'pointer' }}
          >
            GLog 🌍
          </div>
          <button
            type="button"
            className="feed-theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? '밝게' : '야간'}
            aria-label={theme === 'dark' ? '라이트 모드' : '다크 모드'}
          >
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
        </div>
        {/* 메뉴 버튼 목록 - 랜딩과 동일한 항목 */}
        <div style={{ display: 'flex', gap: '40px' }}>
          {navItems.map(item => (
            <button
              key={item}
              className={`globe-nav-item${activeNav === item ? ' active' : ''}`}
              onClick={async () => {
                if (item === '프로필') {
                  setActiveNav('프로필');
                  if (me) {
                    const lat = parseGlobeCoord(me.globe_lat, 37.56);
                    const lon = parseGlobeCoord(me.globe_lon, 126.97);
                    dragRef.current.pausedUntil = Date.now() + 4000;
                    markerClickedRef.current = true;
                    setSelectedUser({
                      id: me.user_id,
                      name: me.nickname,
                      bio: me.bio || '',
                      color: '#4e9af1',
                      avatar: me.model_url || pickAvatarByUserId(me.user_id),
                      avatar_url: me.avatar_url,
                      lat,
                      lon,
                      status: me.status || 'offline',
                      isMe: true,
                    });
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        snapEarthGroupTowardCamera(earthRef, lat, lon);
                      });
                    });
                  }
                } else if (item === '피드') {
                  navigate('/feed', { state: { feedRouteEnter: true } });
                } else if (item === '트로피') {
                  setShowShop(false);
                  setActiveNav('트로피');
                  openTrophyModal();
                } else if (item === '상점') {
                  closeTrophyModal();
                  setActiveNav('상점');
                  setShowShop(true);
                } else if (item === '로그아웃') {
                  await logout();
                  navigate('/', { replace: true });
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

      {/* DM 아이콘 — 메뉴바 바로 아래 오른쪽, 프로필 패널 열리면 숨김, 드래그로 위치 변경 가능 */}
      {!selectedUser && (
        <button
          title="메시지"
          onMouseDown={(e) => {
            dmIconDragging.current = true;
            dmIconHasDragged.current = false;
            const rect = e.currentTarget.getBoundingClientRect();
            dmIconDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            e.preventDefault();
          }}
          onClick={() => { if (!dmIconHasDragged.current) setDmOpen(true); }}
          style={{
            position: 'fixed',
            ...(dmIconPos
              ? { left: dmIconPos.x, top: dmIconPos.y }
              : { top: 99, right: 32 }),
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(78,154,241,0.85)',
            backdropFilter: 'blur(8px)',
            border: '2px solid rgba(255,255,255,0.6)',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <img src="/dm_icon.svg" alt="DM" style={{ width: 22, height: 22, filter: 'brightness(0) invert(1)', pointerEvents: 'none' }} />
          {hasNewDm && (
            <span style={{
              position: 'absolute', top: 4, right: 4,
              width: 8, height: 8,
              background: '#ef4444', borderRadius: '50%',
              pointerEvents: 'none',
            }} />
          )}
        </button>
      )}

      {/* 펫 상점 모달 */}
      {showShop && (
        <PetShopModal
          onClose={() => {
            setShowShop(false);
            setActiveNav((prev) => (prev === '상점' ? null : prev));
          }}
        />
      )}

      {/* 일일 첫 로그인 보상 모달 */}
      {showDailyReward && (
        <DailyRewardModal
          amount={dailyRewardAmount}
          onClose={() => setShowDailyReward(false)}
        />
      )}

      {/* 아바타 클릭 시 3D 뷰어 패널 (프로필 패널과 함께 표시) */}
      <AvatarViewerModal user={selectedUser} />

      {/* 유저 상세 패널 - 캐릭터 클릭 시 오른쪽에서 슬라이드 인 */}
      <UserPanel
        viewer={me}
        user={selectedUser}
        onClose={() => {
          setSelectedUser(null);
          setActiveNav(null);
          setGlobeProjectPreview(null);
        }}
        onViewProfile={(userId) => navigate(`/profile/${userId}`)}
        onStatusChange={(newStatus) => updateUser({ status: newStatus })}
        hasNewDm={hasNewDm}
        hasNewNotif={hasNewNotif}
        onDmClick={() => { setHasNewDm(false); setDmPartnerId(null); setDmOpen(true); }}
        onNotifClick={() => setHasNewNotif(false)}
        onSendDm={(partnerId) => { setDmPartnerId(Number(partnerId)); setDmOpen(true); }}
        onOpenFeedPost={(pid) => setGlobePostModalId(String(pid))}
        onViewMorePosts={(nickname) => {
          const uid = Number(selectedUser?.id);
          if (!Number.isFinite(uid) || uid <= 0) return;
          const nick = String(nickname ?? '').trim() || String(selectedUser?.name ?? '').trim();
          navigate(`/feed/user/${uid}`, nick ? { state: { nickname: nick } } : undefined);
        }}
        trophyRefreshKey={trophyRefreshKey}
        postListRefreshKey={earthPanelPostListRefreshKey}
        onPostLikeUpdated={(detail) => {
          setGlobeModalPost((prev) => {
            if (!prev || Number(prev.id) !== Number(detail.postId)) return prev;
            return { ...prev, likes: detail.likeCount, isLiked: detail.liked };
          });
        }}
        onOpenProject={(p) => setGlobeProjectPreview(p)}
      />

      <div ref={globeSearchWrapRef} style={globeSearchWrapStyle}>
        {globeSearchOpen && globeSearchDebounced && (globeSearchUsers.length > 0 || globeSearchPosts.length > 0 || globeSearchProjects.length > 0) ? (
          <div style={globeChrome.searchSuggest}>
            {globeSearchUsers.length > 0 ? (
              <div style={globeSearchSectionStyle}>
                <div style={globeChrome.searchSectionTitle}>유저</div>
                {globeSearchUsers.map((u) => (
                  <button
                    key={`u-${u.user_id}`}
                    type="button"
                    style={globeChrome.searchItemBtn}
                    className="globe-search-hit"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => moveToSearchedUser(u)}
                  >
                    {u.nickname}
                  </button>
                ))}
              </div>
            ) : null}
            {globeSearchPosts.length > 0 ? (
              <div style={globeSearchSectionStyle}>
                <div style={globeChrome.searchSectionTitle}>피드 게시글</div>
                {globeSearchPosts.map((p) => (
                  <button
                    key={`p-${p.post_id}`}
                    type="button"
                    style={globeChrome.searchItemBtn}
                    className="globe-search-hit"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setGlobePostModalId(String(p.post_id));
                      setGlobeSearchOpen(false);
                    }}
                  >
                    {p.author_nickname ? `${p.author_nickname} · ` : ""}
                    {buildSearchSnippet(p.snippet)}
                  </button>
                ))}
              </div>
            ) : null}
            {globeSearchProjects.length > 0 ? (
              <div style={globeSearchSectionStyle}>
                <div style={globeChrome.searchSectionTitle}>트로피 프로젝트</div>
                {globeSearchProjects.map((p) => (
                  <button
                    key={`t-${p.id}`}
                    type="button"
                    style={globeChrome.searchItemBtn}
                    className="globe-search-hit"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={async () => {
                      try {
                        const { data } = await api.get("/projects/community", { params: { sort: "latest" } });
                        const found = mapProjectsApiToTrophyList(data).find((x) => Number(x.id) === Number(p.id));
                        if (found) setGlobeProjectPreview(found);
                      } catch {
                        /* ignore */
                      }
                      setGlobeSearchOpen(false);
                    }}
                  >
                    {p.author ? `${p.author} · ` : ""}
                    {p.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div style={globeChrome.searchBar}>
          <input
            type="search"
            value={globeSearchQ}
            placeholder="유저/피드/트로피 검색"
            className="globe-search-input"
            style={globeChrome.searchInput}
            onChange={(e) => setGlobeSearchQ(e.target.value)}
            onFocus={() => setGlobeSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void openGlobeSearchResults();
              }
            }}
          />
          <button type="button" style={globeSearchBtnStyle} onClick={() => void openGlobeSearchResults()}>
            이동
          </button>
        </div>
      </div>

      {globePostModalId ? (
        <div
          role="presentation"
          style={globePostModalBackdropStyle}
          onClick={() => setGlobePostModalId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="게시글 미리보기"
            className="feed-post-popup-modal"
            style={globePostModalPanelStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={globePostModalHeaderStyle}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>게시글</span>
              <button
                type="button"
                style={globePostModalCloseStyle}
                aria-label="닫기"
                onClick={() => setGlobePostModalId(null)}
              >
                ×
              </button>
            </div>
            <div ref={globeModalBodyRef} style={globePostModalBodyStyle}>
              {globeModalLoad === "loading" ? (
                <p className="feed-post-meta" style={{ margin: "1rem" }}>불러오는 중…</p>
              ) : globeModalLoad === "error" || !globeModalPost ? (
                <p className="feed-compose-error" style={{ margin: "1rem" }}>게시글을 불러오지 못했습니다.</p>
              ) : (
                <>
                  <PostCard
                    post={globeModalPost}
                    variant="static"
                    onLikeChange={() => setEarthPanelPostListRefreshKey((k) => k + 1)}
                  />
                  <div className="feed-post-popup-modal-comments-wrap">
                    <CommentSection
                      postId={String(globePostModalId)}
                      anonymousThread={Boolean(globeModalPost && isAnonymousPost(globeModalPost))}
                      onCommentCountChange={bumpGlobeModalCommentCount}
                      intersectionRoot={globeModalScrollRoot}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {globeSearchResultOpen ? (
        <div style={globeChrome.searchResultPopup}>
          <div style={globeChrome.searchResultHeader}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>검색 결과</span>
            <button
              type="button"
              style={globePostModalCloseStyle}
              aria-label="검색 결과 닫기"
              onClick={() => setGlobeSearchResultOpen(false)}
            >
              ×
            </button>
          </div>
          <div style={globeChrome.searchResultBody}>
            {globeSearchResultPosts.length > 0 ? (
              <div style={globeSearchSectionStyle}>
                <div style={globeChrome.searchSectionTitle}>피드 게시글</div>
                {globeSearchResultPosts.map((p) => (
                  <button
                    key={`rp-${p.id}`}
                    type="button"
                    style={globeChrome.searchItemBtn}
                    className="globe-search-hit"
                    onClick={() => {
                      setGlobePostModalId(String(p.id));
                      setGlobeSearchResultOpen(false);
                    }}
                  >
                    {p.author ? `${p.author} · ` : ""}
                    {p.snippet || "게시글"}
                  </button>
                ))}
              </div>
            ) : null}
            {globeSearchResultProjects.length > 0 ? (
              <div style={globeSearchSectionStyle}>
                <div style={globeChrome.searchSectionTitle}>트로피 프로젝트</div>
                {globeSearchResultProjects.map((p) => (
                  <button
                    key={`rt-${p.id}`}
                    type="button"
                    style={globeChrome.searchItemBtn}
                    className="globe-search-hit"
                    onClick={() => {
                      setGlobeProjectPreview(p);
                      setGlobeSearchResultOpen(false);
                    }}
                  >
                    {p.authorNickname ? `${p.authorNickname} · ` : ""}
                    {p.title}
                  </button>
                ))}
              </div>
            ) : null}
            {globeSearchResultPosts.length === 0 && globeSearchResultProjects.length === 0 ? (
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.78rem" }}>연관 검색 결과가 없습니다.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {globeProjectPreview ? (
        <div
          role="presentation"
          style={globePostModalBackdropStyle}
          onClick={() => setGlobeProjectPreview(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="프로젝트"
            style={globeProjectModalPanelStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ ...globePostModalHeaderStyle, gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem", flexShrink: 0 }}>프로젝트</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                {globeProjectPreview.ownerProfile?.isOwnerMe && me?.user_id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const draft = buildProjectEditDraftFromPreview(globeProjectPreview);
                        if (draft) {
                          setGlobeProjectEditDraft(draft);
                          setGlobeProjectEditOpen(true);
                        }
                      }}
                      style={{
                        padding: "4px 10px",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        borderRadius: 8,
                        border: "1px solid var(--feed-border)",
                        background: "var(--feed-bg-card)",
                        color: "var(--feed-text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm("이 프로젝트를 삭제할까요? 트로피도 함께 삭제됩니다.")) return;
                        try {
                          await api.delete(`/projects/${globeProjectPreview.id}`);
                          setGlobeProjectPreview(null);
                          setTrophyRefreshKey((k) => k + 1);
                        } catch (err) {
                          const msg = err.response?.data?.message;
                          if (msg) console.warn("[project delete]", msg);
                        }
                      }}
                      style={{
                        padding: "4px 10px",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        borderRadius: 8,
                        border: "1px solid #fecaca",
                        background: "#fef2f2",
                        color: "#b91c1c",
                        cursor: "pointer",
                      }}
                    >
                      삭제
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  style={globePostModalCloseStyle}
                  aria-label="닫기"
                  onClick={() => setGlobeProjectPreview(null)}
                >
                  ×
                </button>
              </div>
            </div>
            <div style={{ ...globePostModalBodyStyle, maxHeight: "min(82vh, 720px)", padding: "12px 14px 14px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                <div
                  style={{
                    flex: "1 1 280px",
                    minWidth: 0,
                    marginTop: "clamp(1.75rem, 2.85vw, 2.6rem)",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "16 / 10",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "var(--feed-bg-header)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {globeProjectMainImg ? (
                      <img src={globeProjectMainImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ color: "#64748b", fontSize: "2rem" }} aria-hidden>
                        📁
                      </span>
                    )}
                  </div>
                  {globeProjectGallery.length > 1 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        aria-label="이전 이미지"
                        onClick={() =>
                          setGlobeProjectSlideIdx((i) => (i - 1 + globeProjectGallery.length) % globeProjectGallery.length)
                        }
                        style={{
                          flexShrink: 0,
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          border: "1px solid var(--feed-border)",
                          background: "var(--feed-bg-card)",
                          cursor: "pointer",
                        }}
                      >
                        ‹
                      </button>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          overflowX: "auto",
                          flex: 1,
                          minWidth: 0,
                          paddingBottom: 2,
                        }}
                      >
                        {globeProjectGallery.map((url, i) => (
                          <button
                            key={`${url}-${i}`}
                            type="button"
                            onClick={() => setGlobeProjectSlideIdx(i)}
                            style={{
                              flexShrink: 0,
                              width: 52,
                              height: 52,
                              borderRadius: 8,
                              overflow: "hidden",
                              padding: 0,
                              border:
                                i === Math.min(globeProjectSlideIdx, globeProjectGallery.length - 1)
                                  ? "2px solid #2563eb"
                                  : "1px solid var(--feed-border)",
                              cursor: "pointer",
                              background: "var(--feed-bg-header)",
                            }}
                          >
                            <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label="다음 이미지"
                        onClick={() =>
                          setGlobeProjectSlideIdx((i) => (i + 1) % globeProjectGallery.length)
                        }
                        style={{
                          flexShrink: 0,
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          border: "1px solid var(--feed-border)",
                          background: "var(--feed-bg-card)",
                          cursor: "pointer",
                        }}
                      >
                        ›
                      </button>
                    </div>
                  ) : null}
                </div>
                <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                    {TROPHY_GRADE[globeProjectPreview.grade] ? (
                      <img
                        src={TROPHY_GRADE[globeProjectPreview.grade].src}
                        alt=""
                        style={{ width: 36, height: "auto", objectFit: "contain" }}
                      />
                    ) : (
                      <span style={{ fontSize: "1.5rem" }} aria-hidden>
                        🏆
                      </span>
                    )}
                    <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "#64748b" }}>
                      {TROPHY_GRADE[globeProjectPreview.grade]
                        ? `${TROPHY_GRADE[globeProjectPreview.grade].label} 트로피`
                        : "트로피"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.34rem",
                        fontWeight: 800,
                        color: "var(--feed-text-primary)",
                        lineHeight: 1.25,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {globeProjectPreview.title}
                    </h3>
                    <button
                      type="button"
                      className="feed-post-like-btn"
                      data-liked={globeProjectPreview.liked ? "true" : "false"}
                      disabled={globeProjectLikeBusy || !me?.user_id}
                      aria-label={globeProjectPreview.liked ? "좋아요 취소" : "좋아요"}
                      onClick={async () => {
                        if (!globeProjectPreview?.trophyId || !me?.user_id || globeProjectLikeBusy) return;
                        setGlobeProjectLikeBusy(true);
                        try {
                          const { liked, likeCount } = await toggleTrophyLike(globeProjectPreview.trophyId);
                          setGlobeProjectPreview((prev) => (prev ? { ...prev, likes: likeCount, liked } : prev));
                          setTrophyRefreshKey((k) => k + 1);
                        } catch {
                          /* 유지 */
                        } finally {
                          setGlobeProjectLikeBusy(false);
                        }
                      }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                    >
                      <HeartIcon filled={globeProjectPreview.liked} />
                      <span style={{ fontSize: "0.86rem", fontWeight: 600 }}>{globeProjectPreview.likes}</span>
                    </button>
                  </div>
                  {globeProjectDescLines.length ? (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        fontSize: "0.84rem",
                        lineHeight: 1.55,
                        color: "var(--feed-text-secondary)",
                      }}
                    >
                      {globeProjectDescLines.map((line, idx) => (
                        <li key={idx}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {globeProjectPreview.github_url ? (
                      <a
                        href={globeProjectPreview.github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 12px",
                          borderRadius: 10,
                          background: "var(--feed-bg-page)",
                          border: "1px solid var(--feed-border)",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: "var(--feed-text-primary)",
                          textDecoration: "none",
                          maxWidth: "100%",
                        }}
                      >
                        <span aria-hidden>🔗</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>GitHub</span>
                      </a>
                    ) : null}
                    {globeProjectPreview.deploy_url ? (
                      <a
                        href={globeProjectPreview.deploy_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 12px",
                          borderRadius: 10,
                          background: "var(--feed-bg-page)",
                          border: "1px solid var(--feed-border)",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: "var(--feed-text-primary)",
                          textDecoration: "none",
                          maxWidth: "100%",
                        }}
                      >
                        <span aria-hidden>🌐</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>배포</span>
                      </a>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: "0.78rem", color: "#64748b" }}>
                    {globeProjectPreview.startDateLabel ? (
                      <span>
                        <strong style={{ color: "#475569" }}>시작일</strong> {globeProjectPreview.startDateLabel}
                      </span>
                    ) : null}
                    {globeProjectPreview.endDateLabel ? (
                      <span>
                        <strong style={{ color: "#475569" }}>완성일</strong> {globeProjectPreview.endDateLabel}
                      </span>
                    ) : null}
                    {!globeProjectPreview.startDateLabel &&
                    !globeProjectPreview.endDateLabel &&
                    globeProjectPreview.dateRange ? (
                      <span>{globeProjectPreview.dateRange}</span>
                    ) : null}
                  </div>
                  {globeProjectPreview.video_url ? (
                    <a
                      href={globeProjectPreview.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.78rem", color: "#2563eb", fontWeight: 600 }}
                    >
                      동영상 링크
                    </a>
                  ) : null}
                  {(globeProjectPreview.techStacks || []).length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      {(globeProjectTagsExpanded
                        ? globeProjectPreview.techStacks
                        : globeProjectPreview.techStacks.slice(0, 5)
                      ).map((name, idx) => (
                        <span
                          key={`${name}-${idx}`}
                          style={{
                            fontSize: "0.72rem",
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontWeight: 600,
                            ...PROJECT_MODAL_TAG_PALETTE[idx % PROJECT_MODAL_TAG_PALETTE.length],
                          }}
                        >
                          #{name}
                        </span>
                      ))}
                      {globeProjectPreview.techStacks.length > 5 ? (
                        <button
                          type="button"
                          onClick={() => setGlobeProjectTagsExpanded((v) => !v)}
                          style={{
                            fontSize: "0.72rem",
                            border: "none",
                            background: "transparent",
                            color: "#2563eb",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {globeProjectTagsExpanded ? "접기" : "더보기"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 12,
                  borderTop: "1px solid var(--feed-border)",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 12,
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {resolveMediaUrl(globeProjectPreview.ownerProfile?.avatar_url) ? (
                    <img
                      src={resolveMediaUrl(globeProjectPreview.ownerProfile?.avatar_url)}
                      alt=""
                      style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "#e2e8f0",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.84rem",
                        color: "var(--feed-text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {globeProjectPreview.ownerProfile?.nickname || "—"}
                    </div>
                    <div
                      style={{
                        fontSize: "0.74rem",
                        color: "#64748b",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {globeProjectPreview.ownerProfile?.bio != null &&
                      String(globeProjectPreview.ownerProfile.bio).trim() !== ""
                        ? globeProjectPreview.ownerProfile.bio
                        : "\u00a0"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const url =
                        globeProjectPreview.deploy_url ||
                        globeProjectPreview.github_url ||
                        window.location.href;
                      try {
                        if (navigator.share) {
                          await navigator.share({
                            title: globeProjectPreview.title,
                            text: globeProjectPreview.desc,
                            url: String(url),
                          });
                        } else if (navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(String(url));
                          setGlobeProjectShareHint("링크를 클립보드에 복사했어요.");
                          window.setTimeout(() => setGlobeProjectShareHint(""), 2500);
                        }
                      } catch {
                        /* 공유 취소 등 */
                      }
                    }}
                    style={{
                      padding: "6px 12px",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      borderRadius: 8,
                      border: "1px solid var(--feed-border)",
                      background: "var(--feed-bg-card)",
                      color: "var(--feed-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    공유하기
                  </button>
                </div>
              </div>
              <div style={{ width: "100%", textAlign: "right", marginTop: 8 }}>
                {globeProjectPreview.updatedAtLabel ? (
                  <p className="feed-post-meta" style={{ margin: 0, fontSize: "0.72rem", color: "#94a3b8" }}>
                    마지막 업데이트 {globeProjectPreview.updatedAtLabel}
                  </p>
                ) : null}
                {globeProjectShareHint ? (
                  <p style={{ margin: "4px 0 0", fontSize: "0.72rem", color: "#2563eb" }}>{globeProjectShareHint}</p>
                ) : null}
              </div>
              <div ref={globeProjectCommentsRef} tabIndex={-1} style={{ outline: "none", marginTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--feed-text-primary)", marginBottom: 8 }}>댓글</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch", marginBottom: 8 }}>
                  <textarea
                    value={globeProjCommentDraft}
                    onChange={(e) => setGlobeProjCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitGlobeProjectComment();
                      }
                    }}
                    placeholder="댓글을 입력하세요 (Shift+Enter 줄바꿈)"
                    rows={2}
                    disabled={!me?.user_id || globeProjCommentBusy}
                    style={{
                      flex: "1 1 200px",
                      minWidth: 0,
                      resize: "vertical",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--feed-border)",
                      fontSize: "0.8rem",
                      fontFamily: "inherit",
                      background: "var(--feed-bg-card)",
                      color: "var(--feed-text-primary)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={submitGlobeProjectComment}
                    disabled={!me?.user_id || globeProjCommentBusy || !globeProjCommentDraft.trim()}
                    style={{
                      padding: "8px 16px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      borderRadius: 999,
                      border: "none",
                      background: !me?.user_id || globeProjCommentBusy ? "#94a3b8" : "#2563eb",
                      color: "#fff",
                      cursor: !me?.user_id || globeProjCommentBusy ? "not-allowed" : "pointer",
                      alignSelf: "flex-end",
                    }}
                  >
                    {globeProjCommentBusy ? "등록 중…" : "댓글달기"}
                  </button>
                </div>
                {!me?.user_id ? (
                  <p style={{ margin: "0 0 8px", fontSize: "0.74rem", color: "#64748b" }}>로그인 후 댓글을 남길 수 있어요.</p>
                ) : null}
                {globeProjCommentErr ? (
                  <p style={{ margin: "0 0 8px", fontSize: "0.74rem", color: "#dc2626" }}>{globeProjCommentErr}</p>
                ) : null}
                <div style={{ maxHeight: 240, overflowY: "auto", borderTop: "1px solid var(--feed-border)", paddingTop: 6 }}>
                  {globeProjComments.map((cm) => {
                    const av = cm.avatar_url ? resolveMediaUrl(cm.avatar_url) : null;
                    const canDel = me?.user_id != null && Number(cm.user_id) === Number(me.user_id);
                    return (
                      <div
                        key={cm.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          padding: "8px 0",
                          borderBottom: "1px solid var(--feed-border)",
                        }}
                      >
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: "50%",
                            overflow: "hidden",
                            flexShrink: 0,
                            background: "#e2e8f0",
                          }}
                        >
                          {av ? (
                            <img src={av} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : null}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline", marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--feed-text-primary)" }}>{cm.nickname || "—"}</span>
                            <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{formatGlobeProjectCommentAgo(cm.created_at)}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--feed-text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                            {cm.content}
                          </p>
                        </div>
                        {canDel ? (
                          <button
                            type="button"
                            aria-label="댓글 삭제"
                            title="삭제"
                            onClick={() => deleteGlobeProjectCommentRow(cm)}
                            style={{
                              flexShrink: 0,
                              border: "none",
                              background: "transparent",
                              color: "#94a3b8",
                              cursor: "pointer",
                              fontSize: "1.1rem",
                              lineHeight: 1,
                              padding: "2px 4px",
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ProjectRegisterModal
        open={globeProjectEditOpen}
        onClose={() => {
          setGlobeProjectEditOpen(false);
          setGlobeProjectEditDraft(null);
        }}
        mode="edit"
        initialDraft={globeProjectEditDraft}
        onSuccess={() => {
          setGlobeProjectEditOpen(false);
          setGlobeProjectEditDraft(null);
          setGlobeProjectPreview(null);
          setTrophyRefreshKey((k) => k + 1);
        }}
      />

      {/* DM 패널 */}
      {me && (
        <DmPanel
          isOpen={dmOpen}
          onClose={() => { setDmOpen(false); setDmPartnerId(null); }}
          initialPartnerId={dmPartnerId}
          sendMessage={sendMessage}
          markRead={markRead}
          registerReceive={(fn) => { dmReceiveHandlerRef.current = fn; }}
          registerSent={(fn) => { dmSentHandlerRef.current = fn; }}
          registerReadAck={(fn) => { dmReadAckHandlerRef.current = fn; }}
        />
      )}
    </div>
    </LoginModalProvider>
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

// 기술 스택 선택 옵션 목록
const TECH_STACK_OPTIONS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Kotlin', 'Swift', 'Go', 'Rust', 'C++', 'C#',
  'React', 'Vue', 'Angular', 'Next.js', 'Svelte',
  'Node.js', 'Express', 'NestJS', 'Spring', 'Django', 'FastAPI',
  'React Native', 'Flutter',
  'MySQL', 'PostgreSQL', 'MongoDB', 'Redis',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
  'GraphQL', 'Tailwind CSS', 'Git',
];

// hasNewDm, hasNewNotif: 새 메시지·알림 여부 → true면 아이콘 왼쪽 하단에 빨간 점 표시
// onDmClick / onNotifClick: 아이콘 클릭 시 부모에서 읽음 처리
function UserPanel({ viewer, user, onClose, onViewProfile, onStatusChange, hasNewDm = false, hasNewNotif = false, onDmClick, onNotifClick, onSendDm, onOpenFeedPost, onViewMorePosts, onOpenProject, trophyRefreshKey = 0, postListRefreshKey = 0, onPostLikeUpdated }) {
  const navigate = useNavigate();
  const open = !!user;

  const [profileData, setProfileData] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('offline');
  const [activeTab, setActiveTab] = useState('posts');
  // 좋아요 누른 글 ID 집합 - 클릭 시 토글
  const [likedSet, setLikedSet] = useState(new Set());
  // 내 글/트로피 카드 펼치기 모드 (true: 확장, false: 기본)
  const [isExpanded, setIsExpanded] = useState(false);
  // 팔로우 상태 — 실제 API 연결 전 로컬 토글
  const [isFollowing, setIsFollowing] = useState(false);
  const [trophyList, setTrophyList] = useState([]);
  const [trophiesLoad, setTrophiesLoad] = useState('idle'); // idle | loading | ok | error
  const [trophySort, setTrophySort] = useState('latest'); // 'latest' | 'popular'
  const [postSort, setPostSort] = useState('latest'); // 'latest' | 'popular'
  const [combinedLikes, setCombinedLikes] = useState([]);
  const [combinedLikesLoad, setCombinedLikesLoad] = useState('idle');
  const [likesLoadingMore, setLikesLoadingMore] = useState(false);
  const [likesHasMore, setLikesHasMore] = useState(false);
  const likesFeedAccumRef = useRef([]);
  const likesTrophyAccumRef = useRef([]);
  const likesFeedNextRef = useRef(null);
  const likesTrophyNextRef = useRef(null);
  const likesLoadMoreLockRef = useRef(false);
  const likesScrollRootRef = useRef(null);
  const likesSentinelRef = useRef(null);

  const applyProjectsResponse = useCallback((data) => {
    const items = Array.isArray(data?.items) ? data.items : [];
    setTrophyList(mapProjectsApiToTrophyList(data));
    setLikedSet((prev) => {
      const next = new Set([...prev].filter((k) => String(k).startsWith('t_')));
      items.forEach((row) => {
        if (row.liked_by_me) next.add(`t_${row.trophy_id}`);
      });
      return next;
    });
    setTrophiesLoad('ok');
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setTrophyList([]);
      setTrophiesLoad('idle');
      return;
    }
    const uid = Number(user.id);
    if (!Number.isFinite(uid) || uid <= 0) {
      setTrophyList([]);
      setTrophiesLoad('idle');
      return;
    }
    let cancelled = false;
    setTrophiesLoad('loading');
    const sortParam = trophySort === 'popular' ? 'popular' : 'latest';
    api
      .get(`/projects/user/${uid}`, { params: { sort: sortParam } })
      .then(({ data }) => {
        if (!cancelled) applyProjectsResponse(data);
      })
      .catch(() => {
        if (!cancelled) {
          setTrophiesLoad('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, trophySort, trophyRefreshKey, applyProjectsResponse]);

  useEffect(() => {
    if (!user?.id) {
      setUserPosts([]);
      return;
    }
    const uid = Number(user.id);
    if (!Number.isFinite(uid) || uid <= 0) {
      setUserPosts([]);
      return;
    }
    let cancelled = false;
    const sortParam = postSort === 'popular' ? 'popular' : 'latest';
    api
      .get(`/feed/user/${uid}`, { params: { limit: 10, sort: sortParam } })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.posts) ? data.posts : [];
        setUserPosts(
          rows.map((p) => ({
            id: p.post_id,
            isFeedPost: true,
            content: String(p.content || '').trim(),
            tags: Array.isArray(p.hashtags)
              ? p.hashtags.map((h) => String(h?.name || '').trim()).filter(Boolean)
              : [],
            likes: Number(p.like_count ?? 0),
            comments: Number(p.comment_count ?? 0),
            isLiked: Boolean(p.isLiked),
            timeAgo: (() => {
              try {
                const created = new Date(p.created_at);
                const diffMin = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
                if (diffMin < 60) return `${diffMin}분 전`;
                const h = Math.floor(diffMin / 60);
                if (h < 24) return `${h}시간 전`;
                const d = Math.floor(h / 24);
                return `${d}일 전`;
              } catch {
                return '';
              }
            })(),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setUserPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, postSort, postListRefreshKey]);

  const fetchCombinedLikes = useCallback(async () => {
    const vid = Number(viewer?.user_id);
    if (!Number.isFinite(vid) || vid <= 0) {
      setCombinedLikes([]);
      setCombinedLikesLoad('idle');
      likesFeedAccumRef.current = [];
      likesTrophyAccumRef.current = [];
      likesFeedNextRef.current = null;
      likesTrophyNextRef.current = null;
      setLikesHasMore(false);
      return;
    }
    likesFeedAccumRef.current = [];
    likesTrophyAccumRef.current = [];
    likesFeedNextRef.current = null;
    likesTrophyNextRef.current = null;
    setLikesHasMore(false);
    setCombinedLikesLoad('loading');
    try {
      const [fr, tr] = await Promise.all([
        api.get(`/feed/user/${vid}/likes`, { params: { limit: 50 } }),
        api.get('/projects/me/liked', { params: { limit: 50 } }),
      ]);
      const feedPosts = Array.isArray(fr.data?.posts) ? fr.data.posts : [];
      const trophyRows = Array.isArray(tr.data?.items) ? tr.data.items : [];
      likesFeedAccumRef.current = feedPosts;
      likesTrophyAccumRef.current = trophyRows;
      likesFeedNextRef.current = fr.data?.nextCursor ?? null;
      likesTrophyNextRef.current = tr.data?.nextCursor ?? null;
      setLikesHasMore(Boolean(likesFeedNextRef.current || likesTrophyNextRef.current));
      setCombinedLikes(buildMergedLikeEntries(feedPosts, trophyRows));
      setCombinedLikesLoad('ok');
    } catch {
      setCombinedLikes([]);
      setCombinedLikesLoad('error');
    }
  }, [viewer?.user_id]);

  const loadMoreCombinedLikes = useCallback(async () => {
    const vid = Number(viewer?.user_id);
    if (!Number.isFinite(vid) || vid <= 0 || likesLoadMoreLockRef.current) return;
    const fNext = likesFeedNextRef.current;
    const tNext = likesTrophyNextRef.current;
    if (fNext == null && tNext == null) return;
    likesLoadMoreLockRef.current = true;
    setLikesLoadingMore(true);
    try {
      const feedP =
        fNext != null
          ? api.get(`/feed/user/${vid}/likes`, { params: { limit: 50, last_post_id: fNext } })
          : Promise.resolve({ data: { posts: [], nextCursor: null } });
      const trophyP =
        tNext != null
          ? api.get('/projects/me/liked', { params: { limit: 50, last_trophy_id: tNext } })
          : Promise.resolve({ data: { items: [], nextCursor: null } });
      const [fr, tr] = await Promise.all([feedP, trophyP]);
      const newPosts = Array.isArray(fr.data?.posts) ? fr.data.posts : [];
      const newItems = Array.isArray(tr.data?.items) ? tr.data.items : [];
      if (fNext != null) {
        likesFeedAccumRef.current = [...likesFeedAccumRef.current, ...newPosts];
        likesFeedNextRef.current = fr.data?.nextCursor ?? null;
      }
      if (tNext != null) {
        likesTrophyAccumRef.current = [...likesTrophyAccumRef.current, ...newItems];
        likesTrophyNextRef.current = tr.data?.nextCursor ?? null;
      }
      setLikesHasMore(Boolean(likesFeedNextRef.current || likesTrophyNextRef.current));
      setCombinedLikes(buildMergedLikeEntries(likesFeedAccumRef.current, likesTrophyAccumRef.current));
    } catch {
      /* 추가 페이지 실패 시 기존 목록 유지 */
    } finally {
      likesLoadMoreLockRef.current = false;
      setLikesLoadingMore(false);
    }
  }, [viewer?.user_id]);

  useEffect(() => {
    if (activeTab === 'likes' && !user?.isMe) setActiveTab('posts');
  }, [user?.id, user?.isMe, activeTab]);

  useEffect(() => {
    if (!open || !user?.isMe || activeTab !== 'likes' || !viewer?.user_id) return undefined;
    void fetchCombinedLikes();
    return undefined;
  }, [open, user?.isMe, activeTab, viewer?.user_id, trophyRefreshKey, postListRefreshKey, fetchCombinedLikes]);

  useEffect(() => {
    if (activeTab !== 'likes' || !user?.isMe || combinedLikesLoad !== 'ok' || !likesHasMore) return undefined;
    const root = likesScrollRootRef.current;
    const sent = likesSentinelRef.current;
    if (!root || !sent) return undefined;
    const ob = new IntersectionObserver(
      (ents) => {
        if (!ents[0]?.isIntersecting || likesLoadMoreLockRef.current) return;
        void loadMoreCombinedLikes();
      },
      { root, rootMargin: '120px', threshold: 0 },
    );
    ob.observe(sent);
    return () => ob.disconnect();
  }, [activeTab, user?.isMe, combinedLikesLoad, likesHasMore, combinedLikes.length, likesLoadingMore, loadMoreCombinedLikes]);

  useEffect(() => {
    if (!user) {
      setProfileData(null);
      setUserPosts([]);
      setCombinedLikes([]);
      setCombinedLikesLoad('idle');
      likesFeedAccumRef.current = [];
      likesTrophyAccumRef.current = [];
      likesFeedNextRef.current = null;
      likesTrophyNextRef.current = null;
      setLikesHasMore(false);
      setLikesLoadingMore(false);
      setStatusOpen(false);
      setIsExpanded(false);
      setIsFollowing(false);
      setTrophyList([]);
      setTrophiesLoad('idle');
      return;
    }
    setCurrentStatus(user.status || 'offline');

    let cancelled = false;
    const uid = Number(user.id);

    if (user.isMe) {
      api
        .get('/users/me/profile')
        .then(({ data }) => {
          if (cancelled) return;
          setProfileData(data);
          setCurrentStatus(data.status || 'offline');
        })
        .catch(() => {
          if (!cancelled) setProfileData(null);
        });
    } else if (Number.isFinite(uid) && uid > 0) {
      api
        .get(`/users/${uid}`)
        .then(({ data }) => {
          if (cancelled) return;
          setProfileData(data);
        })
        .catch(() => {
          if (!cancelled) setProfileData(null);
        });
    } else {
      setProfileData(null);
    }

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isMe, applyProjectsResponse]);

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

  const handleFeedPostLike = async (postId, e) => {
    e?.stopPropagation?.();
    if (!viewer?.user_id) return;
    const pid = Number(postId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
      const { liked, likeCount } = await togglePostLike(pid);
      setUserPosts((prev) =>
        prev.map((p) => (Number(p.id) === pid ? { ...p, likes: likeCount, isLiked: liked } : p)),
      );
      likesFeedAccumRef.current = likesFeedAccumRef.current
        .map((p) =>
          Number(p.post_id) === pid ? { ...p, like_count: likeCount, isLiked: liked } : p,
        )
        .filter((p) => !(Number(p.post_id) === pid && !liked));
      setCombinedLikes(buildMergedLikeEntries(likesFeedAccumRef.current, likesTrophyAccumRef.current));
      onPostLikeUpdated?.({ postId: pid, liked, likeCount });
    } catch (err) {
      const msg = err.response?.data?.message;
      if (msg) console.warn('[post like]', msg);
    }
  };

  const handleTrophyLike = async (trophyId, e) => {
    if (e) e.stopPropagation();
    if (!viewer?.user_id) return;
    try {
      const { liked, likeCount } = await toggleTrophyLike(trophyId);
      setTrophyList((prev) => prev.map((t) => (t.trophyId === trophyId ? { ...t, likes: likeCount } : t)));
      setLikedSet((prev) => {
        const next = new Set(prev);
        if (liked) next.add(`t_${trophyId}`);
        else next.delete(`t_${trophyId}`);
        return next;
      });
      likesTrophyAccumRef.current = likesTrophyAccumRef.current
        .map((row) =>
          Number(row.trophy_id) === trophyId ? { ...row, likes: likeCount } : row,
        )
        .filter((row) => !(Number(row.trophy_id) === trophyId && !liked));
      setCombinedLikes(buildMergedLikeEntries(likesFeedAccumRef.current, likesTrophyAccumRef.current));
    } catch (err) {
      const msg = err.response?.data?.message;
      if (msg) console.warn('[trophy like]', msg);
    }
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
    follower_count: Number(profileData?.follower_count ?? 0),
    isMe:           user.isMe,
  } : null;

  const profileTabs = user?.isMe
    ? [['posts', '내 글'], ['trophies', '트로피'], ['likes', '좋아요']]
    : [['posts', '내 글'], ['trophies', '트로피']];

  const streakNameBadge = d ? streakBadgeEmoji(d.current_streak) : '';

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
          <div style={{ ...profileCardStyle, padding: '11px 12px', flex: '0 0 auto', overflow: 'visible' }}>

            {/* 상단 바: DM·알림 아이콘(왼쪽) / 닫기·상태(오른쪽) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>

              {/* 왼쪽 아이콘 영역
                  - 내 프로필: DM(새 메시지 표시) + 알림 벨(새 알림 표시)
                  - 타유저 프로필: DM 아이콘만 표시 (빨간 점 없음), 알림 벨 숨김 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* 내 프로필: DM 아이콘 클릭 시 내 메시지함 열기 / 타유저: 해당 유저와 바로 DM 시작 */}
                <div style={{ ...iconBoxStyle, position: 'relative', cursor: 'pointer' }}
                  onClick={d.isMe ? onDmClick : () => onSendDm?.(d.id)}>
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
                    <span style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 600 }}>{statusInfo.label}</span>
                    {d.isMe && <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>▾</span>}
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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: isExpanded ? 4 : 6 }}>
              {d.avatar_url ? (
                <img src={d.avatar_url} alt={d.name}
                  style={{
                    width: isExpanded ? 50 : 56, height: isExpanded ? 50 : 56,
                    borderRadius: '50%', objectFit: 'cover',
                    border: '2px solid rgba(255,255,255,0.9)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    transition: 'width 0.3s ease, height 0.3s ease',
                  }} />
              ) : (
                <div style={{
                  width: isExpanded ? 50 : 56, height: isExpanded ? 50 : 56,
                  borderRadius: '50%', background: d.color,
                  boxShadow: `0 4px 16px ${d.color}88`,
                  transition: 'width 0.3s ease, height 0.3s ease',
                }} />
              )}
            </div>

            {/* 닉네임 */}
            <div style={{ textAlign: 'center', marginBottom: isExpanded ? 4 : 6 }}>
              <span style={{ fontSize: isExpanded ? '0.95rem' : '1.02rem', fontWeight: 800, color: 'var(--feed-text-primary)', transition: 'font-size 0.3s ease' }}>{d.name}{streakNameBadge ? ` ${streakNameBadge}` : ''}</span>
            </div>

            {/* 기술 스택 칩 - 확장 모드에선 숨김 */}
            {!isExpanded && d.tech_stacks.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', marginBottom: 6 }}>
                {d.tech_stacks.map(stack => (
                  <span key={stack} style={profileTechChipStyle}>{stack}</span>
                ))}
              </div>
            )}

            {/* 자기소개 - 확장 모드에선 숨김 */}
            {!isExpanded && d.bio && (
              <p style={{ fontSize: '0.78rem', color: '#6b7280', textAlign: 'center', margin: '0 0 6px', lineHeight: 1.42 }}>
                {d.bio}
              </p>
            )}

            {/* 코인 - 본인만 */}
            {d.isMe && (
              <p style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 700, color: '#d97706', margin: '0 0 8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  보유 코인
                  <img src="/coin_icon.svg" alt="코인" style={{ width: 15, height: 15 }} />
                  {(d.coins).toLocaleString()}
                </span>
              </p>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid var(--feed-border)', margin: '0 0 8px' }} />

            {/* 통계: 버튼과 3등분 정렬 맞춤 (flex:1로 각 섹션 동일 너비) */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#f59e0b' }}>{d.current_streak}</div>
                <div style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: 2 }}>커밋 스트릭</div>
              </div>
              <div style={{ width: 1, height: 22, background: 'var(--feed-border)', flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--feed-text-primary)' }}>
                  {trophiesLoad === 'ok' || (trophiesLoad === 'error' && trophyList.length > 0)
                    ? trophyList.length
                    : trophiesLoad === 'error'
                      ? '—'
                      : trophiesLoad === 'loading'
                        ? '…'
                        : 0}
                </div>
                <div style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: 2 }}>프로젝트</div>
              </div>
              <div style={{ width: 1, height: 22, background: 'var(--feed-border)', flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--feed-text-primary)' }}>{d.follower_count}</div>
                <div style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: 2 }}>팔로워</div>
              </div>
            </div>

            {/* 프로필 수정(본인) / 팔로우 토글(타유저) - 확장 모드에선 숨김 */}
            {!isExpanded && (
              d.isMe ? (
                <button style={profileActionBtnStyle} onClick={() => onViewProfile(d.id)}>
                  프로필 수정
                </button>
              ) : (
                <button
                  style={isFollowing
                    ? { ...profileActionBtnStyle, background: 'var(--feed-bg-page)', color: 'var(--feed-text-primary)', border: '1px solid var(--feed-border)' }
                    : profileActionBtnStyle
                  }
                  onClick={() => setIsFollowing((prev) => !prev)}
                >
                  {isFollowing ? '팔로잉' : '팔로우'}
                </button>
              )
            )}
          </div>

          {/* ── 카드 2: 내 글 / 트로피 (세로 최대 약 72%로 제한) */}
          <div style={{ ...profileCardStyle, marginTop: 8, flex: '1 1 0', maxHeight: '72%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0, overflow: 'hidden' }}>
            {/* 탭 헤더 + 펼치기 토글 버튼 - 고정 (스크롤 안 됨) */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--feed-border)', padding: '0 16px', flexShrink: 0, minHeight: 40 }}>
              {profileTabs.map(([key, label]) => (
                <button key={key}
                  style={{
                    flex: 1, border: 'none', background: 'none',
                    padding: '10px 0', cursor: 'pointer',
                    fontSize: profileTabs.length > 2 ? '0.82rem' : '0.9rem', fontWeight: activeTab === key ? 700 : 400,
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
            <div className="tab-scroll" ref={likesScrollRootRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '6px 14px 14px' }}>

            {/* 내 글 탭 */}
            {activeTab === 'posts' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <label style={{ fontSize: '0.74rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>정렬</span>
                    <select
                      value={postSort}
                      onChange={(e) => setPostSort(e.target.value === 'popular' ? 'popular' : 'latest')}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.76rem',
                        borderRadius: 8,
                        border: '1px solid var(--feed-border)',
                        background: 'var(--feed-bg-card)',
                        color: 'var(--feed-text-primary)',
                      }}
                    >
                      <option value="latest">최신순</option>
                      <option value="popular">인기순</option>
                    </select>
                  </label>
                </div>
                {userPosts.length === 0 ? (
                  <p style={{ margin: '1.1rem 0', textAlign: 'center', fontSize: '0.86rem', color: '#6b7280' }}>
                    등록된 게시글이 없습니다
                  </p>
                ) : (
                  <>
                {userPosts.map(post => (
                  <div
                    key={post.id}
                    style={{
                      ...postItemStyle,
                      cursor: post.isFeedPost ? 'pointer' : 'default',
                    }}
                    role={post.isFeedPost ? 'link' : undefined}
                    tabIndex={post.isFeedPost ? 0 : undefined}
                    onClick={() => {
                      if (!post.isFeedPost) return;
                      const pid = Number(post.id);
                      if (!Number.isFinite(pid) || pid <= 0) return;
                      onOpenFeedPost?.(pid);
                    }}
                    onKeyDown={(e) => {
                      if (!post.isFeedPost) return;
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      const pid = Number(post.id);
                      if (!Number.isFinite(pid) || pid <= 0) return;
                      onOpenFeedPost?.(pid);
                    }}
                  >
                    <p style={{ margin: '0 0 6px', fontSize: '0.86rem', color: 'var(--feed-text-primary)', lineHeight: 1.45 }}>
                      {post.content}
                    </p>
                    {Array.isArray(post.tags) && post.tags.length > 0 ? (
                      <div
                        className="feed-tags"
                        style={{ margin: '2px 0 8px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {post.tags.slice(0, 5).map((t, ti) => {
                          const pill = getTagPillColors(t);
                          return (
                            <span
                              key={`${post.id}-${t}-${ti}`}
                              className="feed-tag-pill"
                              role="link"
                              tabIndex={0}
                              style={{
                                ...pill,
                                borderRadius: '999px',
                                padding: '0.2rem 0.55rem',
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                display: 'inline-block',
                                lineHeight: 1.35,
                                cursor: 'pointer',
                              }}
                              title={`${t} 태그 피드`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                navigate(`/tag/${encodeURIComponent(t)}`);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  navigate(`/tag/${encodeURIComponent(t)}`);
                                }
                              }}
                            >
                              {t}
                            </span>
                          );
                        })}
                        {post.tags.length > 5 ? (
                          <span
                            className="feed-tag-pill"
                            aria-label={`해시태그 ${post.tags.length - 5}개 더 있음`}
                            style={{
                              borderRadius: '999px',
                              padding: '0.2rem 0.5rem',
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              display: 'inline-block',
                              lineHeight: 1.35,
                              background: 'rgba(148, 163, 184, 0.28)',
                              color: '#475569',
                            }}
                          >
                            +
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 0 }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* 좋아요 — 피드와 동일한 채움 하트(빨간색) */}
                      <button
                        type="button"
                        className="feed-post-like-btn"
                        data-liked={
                          (post.isFeedPost ? Boolean(post.isLiked) : likedSet.has(post.id))
                            ? 'true'
                            : 'false'
                        }
                        disabled={post.isFeedPost && !viewer?.user_id}
                        aria-label={
                          (post.isFeedPost ? Boolean(post.isLiked) : likedSet.has(post.id))
                            ? '좋아요 취소'
                            : '좋아요'
                        }
                        aria-pressed={
                          post.isFeedPost ? Boolean(post.isLiked) : likedSet.has(post.id)
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          border: 'none',
                          background: 'none',
                          cursor: post.isFeedPost && !viewer?.user_id ? 'default' : 'pointer',
                          padding: '2px 0',
                          opacity: post.isFeedPost && !viewer?.user_id ? 0.5 : 1,
                          color: (post.isFeedPost ? Boolean(post.isLiked) : likedSet.has(post.id))
                            ? '#e11d48'
                            : '#94a3b8',
                        }}
                        onClick={(e) => {
                          if (post.isFeedPost) handleFeedPostLike(post.id, e);
                          else toggleLike(post.id);
                        }}
                      >
                        <span style={{ display: 'inline-flex', transform: 'scale(0.88)', transformOrigin: 'center' }}>
                          <HeartIcon
                            filled={
                              post.isFeedPost ? Boolean(post.isLiked) : likedSet.has(post.id)
                            }
                          />
                        </span>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                          {post.isFeedPost ? post.likes : post.likes + (likedSet.has(post.id) ? 1 : 0)}
                        </span>
                      </button>
                      {/* 댓글 */}
                      <button
                        type="button"
                        style={{ display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: '2px 0' }}
                      >
                        <img src="/message_icon.svg" alt="댓글" style={{ width: 15, height: 15, opacity: 0.5 }} />
                        <span style={{ fontSize: '0.76rem', color: '#9ca3af' }}>{post.comments}</span>
                      </button>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af', flexShrink: 0 }}>{post.timeAgo}</span>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  style={{ marginTop: 8, background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}
                  onClick={() => onViewMorePosts?.(String(d?.name ?? '').trim())}
                >
                  더보기 →
                </button>
                  </>
                )}
              </div>
            )}

            {/* 트로피 탭 — 서버 프로젝트 목록 */}
            {activeTab === 'trophies' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>
                    총{' '}
                    {trophiesLoad === 'ok' || (trophiesLoad === 'error' && trophyList.length > 0)
                      ? trophyList.length
                      : trophiesLoad === 'error'
                        ? '—'
                        : trophiesLoad === 'loading'
                          ? '…'
                          : 0}
                    개의 프로젝트
                  </span>
                  <label style={{ fontSize: '0.74rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>정렬</span>
                    <select
                      value={trophySort}
                      onChange={(e) => setTrophySort(e.target.value === 'popular' ? 'popular' : 'latest')}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.76rem',
                        borderRadius: 8,
                        border: '1px solid var(--feed-border)',
                        background: 'var(--feed-bg-card)',
                        color: 'var(--feed-text-primary)',
                      }}
                    >
                      <option value="latest">최신순</option>
                      <option value="popular">인기순</option>
                    </select>
                  </label>
                </div>
                {trophiesLoad === 'loading' && (
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', padding: '8px 0' }}>불러오는 중…</p>
                )}
                {trophiesLoad === 'error' && (
                  <p style={{ fontSize: '0.82rem', color: '#f87171', padding: '8px 0' }}>목록을 불러오지 못했습니다.</p>
                )}
                {trophiesLoad === 'ok' && trophyList.length === 0 && (
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', padding: '8px 0' }}>등록된 프로젝트가 없습니다.</p>
                )}
                {trophiesLoad === 'ok' &&
                  trophyList.map((trophy) => (
                    <div
                      key={trophy.id}
                      role="button"
                      tabIndex={0}
                      style={trophyFeedCardStyle}
                      onClick={() =>
                        onOpenProject?.({
                          ...trophy,
                          liked: likedSet.has(`t_${trophy.trophyId}`),
                          ownerProfile: {
                            nickname: trophy.authorNickname || '—',
                            avatar_url: trophy.authorAvatarUrl,
                            bio: '',
                            isOwnerMe:
                              viewer?.user_id != null &&
                              trophy.ownerUserId != null &&
                              Number(viewer.user_id) === Number(trophy.ownerUserId),
                          },
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        onOpenProject?.({
                          ...trophy,
                          liked: likedSet.has(`t_${trophy.trophyId}`),
                          ownerProfile: {
                            nickname: trophy.authorNickname || '—',
                            avatar_url: trophy.authorAvatarUrl,
                            bio: '',
                            isOwnerMe:
                              viewer?.user_id != null &&
                              trophy.ownerUserId != null &&
                              Number(viewer.user_id) === Number(trophy.ownerUserId),
                          },
                        });
                      }}
                    >
                      <div style={trophyFeedCardThumbWrap}>
                        {trophy.image ? (
                          <img src={trophy.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#94a3b8',
                              fontSize: '1.25rem',
                            }}
                            aria-hidden
                          >
                            📁
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            color: 'var(--feed-text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {trophy.title}
                        </span>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '0.78rem',
                            color: '#64748b',
                            lineHeight: 1.45,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {trophy.desc}
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          {trophy.techStacks.slice(0, 4).map((tag) => (
                            <span key={tag} style={{ ...techChipStyle, fontSize: '0.62rem', padding: '2px 6px' }}>
                              {tag}
                            </span>
                          ))}
                          {trophy.techStacks.length > 4 ? (
                            <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>+{trophy.techStacks.length - 4}</span>
                          ) : null}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{trophy.dateRange}</span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          justifyContent: 'space-between',
                          flexShrink: 0,
                          minHeight: 88,
                          width: 56,
                        }}
                      >
                        {TROPHY_GRADE[trophy.grade] ? (
                          <img
                            src={TROPHY_GRADE[trophy.grade].src}
                            alt=""
                            style={{ width: 44, height: 'auto', objectFit: 'contain' }}
                          />
                        ) : (
                          <span style={{ fontSize: '1.5rem' }} aria-hidden>
                            🏆
                          </span>
                        )}
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          role="presentation"
                        >
                          <button
                            type="button"
                            className="feed-post-like-btn"
                            data-liked={likedSet.has(`t_${trophy.trophyId}`) ? 'true' : 'false'}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.68rem' }}
                            onClick={(e) => handleTrophyLike(trophy.trophyId, e)}
                            disabled={!viewer?.user_id}
                            aria-label="좋아요"
                          >
                            <HeartIcon filled={likedSet.has(`t_${trophy.trophyId}`)} />
                            <span>{trophy.likes}</span>
                          </button>
                          <span className="feed-post-meta" style={{ fontSize: '0.62rem', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            💬 {trophy.comments ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {activeTab === 'likes' && user?.isMe && (
              <div>
                {combinedLikesLoad === 'loading' && (
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', padding: '8px 0' }}>불러오는 중…</p>
                )}
                {combinedLikesLoad === 'error' && (
                  <p style={{ fontSize: '0.82rem', color: '#f87171', padding: '8px 0' }}>목록을 불러오지 못했습니다.</p>
                )}
                {combinedLikesLoad === 'ok' && combinedLikes.length === 0 && (
                  <p style={{ margin: '1.1rem 0', textAlign: 'center', fontSize: '0.86rem', color: '#6b7280' }}>
                    좋아요한 항목이 없습니다
                  </p>
                )}
                {combinedLikesLoad === 'ok' &&
                  combinedLikes.map((entry) =>
                    entry.kind === 'feed' ? (
                      <div
                        key={entry.id}
                        style={{ ...postItemStyle, cursor: 'pointer' }}
                        role="link"
                        tabIndex={0}
                        onClick={() => {
                          const pid = Number(entry.postId);
                          if (!Number.isFinite(pid) || pid <= 0) return;
                          onOpenFeedPost?.(pid);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          const pid = Number(entry.postId);
                          if (!Number.isFinite(pid) || pid <= 0) return;
                          onOpenFeedPost?.(pid);
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 6,
                              background: '#dbeafe',
                              color: '#1d4ed8',
                            }}
                          >
                            피드
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#9ca3af', flexShrink: 0 }}>{entry.timeAgo}</span>
                        </div>
                        <p style={{ margin: '0 0 6px', fontSize: '0.86rem', color: 'var(--feed-text-primary)', lineHeight: 1.45 }}>
                          {entry.content}
                        </p>
                        {Array.isArray(entry.tags) && entry.tags.length > 0 ? (
                          <div
                            className="feed-tags"
                            style={{ margin: '2px 0 8px' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {entry.tags.slice(0, 5).map((t, ti) => {
                              const pill = getTagPillColors(t);
                              return (
                                <span
                                  key={`${entry.id}-${t}-${ti}`}
                                  className="feed-tag-pill"
                                  role="link"
                                  tabIndex={0}
                                  style={{
                                    ...pill,
                                    borderRadius: '999px',
                                    padding: '0.2rem 0.55rem',
                                    fontWeight: 600,
                                    fontSize: '0.72rem',
                                    display: 'inline-block',
                                    lineHeight: 1.35,
                                    cursor: 'pointer',
                                  }}
                                  title={`${t} 태그 피드`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    navigate(`/tag/${encodeURIComponent(t)}`);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      navigate(`/tag/${encodeURIComponent(t)}`);
                                    }
                                  }}
                                >
                                  {t}
                                </span>
                              );
                            })}
                            {entry.tags.length > 5 ? (
                              <span
                                className="feed-tag-pill"
                                aria-label={`해시태그 ${entry.tags.length - 5}개 더 있음`}
                                style={{
                                  borderRadius: '999px',
                                  padding: '0.2rem 0.5rem',
                                  fontWeight: 700,
                                  fontSize: '0.72rem',
                                  display: 'inline-block',
                                  lineHeight: 1.35,
                                  background: 'rgba(148, 163, 184, 0.28)',
                                  color: '#475569',
                                }}
                              >
                                +
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <div
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 0 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                              type="button"
                              className="feed-post-like-btn"
                              data-liked={entry.isLiked ? 'true' : 'false'}
                              disabled={!viewer?.user_id}
                              aria-label={entry.isLiked ? '좋아요 취소' : '좋아요'}
                              aria-pressed={entry.isLiked}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                border: 'none',
                                background: 'none',
                                cursor: viewer?.user_id ? 'pointer' : 'default',
                                padding: '2px 0',
                                opacity: viewer?.user_id ? 1 : 0.5,
                                color: entry.isLiked ? '#e11d48' : '#94a3b8',
                              }}
                              onClick={(e) => handleFeedPostLike(entry.postId, e)}
                            >
                              <span style={{ display: 'inline-flex', transform: 'scale(0.88)', transformOrigin: 'center' }}>
                                <HeartIcon filled={entry.isLiked} />
                              </span>
                              <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>{entry.likes}</span>
                            </button>
                            <button
                              type="button"
                              style={{ display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: '2px 0' }}
                            >
                              <img src="/message_icon.svg" alt="댓글" style={{ width: 15, height: 15, opacity: 0.5 }} />
                              <span style={{ fontSize: '0.76rem', color: '#9ca3af' }}>{entry.comments}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={entry.id}
                        role="button"
                        tabIndex={0}
                        style={trophyFeedCardStyle}
                        onClick={() => {
                          const trophy = entry.trophy;
                          onOpenProject?.({
                            ...trophy,
                            liked: true,
                            ownerProfile: {
                              nickname: trophy.authorNickname || '—',
                              avatar_url: trophy.authorAvatarUrl,
                              bio: '',
                              isOwnerMe:
                                viewer?.user_id != null &&
                                trophy.ownerUserId != null &&
                                Number(viewer.user_id) === Number(trophy.ownerUserId),
                            },
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          const trophy = entry.trophy;
                          onOpenProject?.({
                            ...trophy,
                            liked: true,
                            ownerProfile: {
                              nickname: trophy.authorNickname || '—',
                              avatar_url: trophy.authorAvatarUrl,
                              bio: '',
                              isOwnerMe:
                                viewer?.user_id != null &&
                                trophy.ownerUserId != null &&
                                Number(viewer.user_id) === Number(trophy.ownerUserId),
                            },
                          });
                        }}
                      >
                        <div style={trophyFeedCardThumbWrap}>
                          {entry.trophy.image ? (
                            <img src={entry.trophy.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div
                              style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#94a3b8',
                                fontSize: '1.25rem',
                              }}
                              aria-hidden
                            >
                              📁
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span
                              style={{
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 6,
                                background: '#fef3c7',
                                color: '#b45309',
                              }}
                            >
                              트로피
                            </span>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0 }}>
                              {panelTimeAgoFromTs(entry.likedAt)}
                            </span>
                          </div>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '0.88rem',
                              color: 'var(--feed-text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {entry.trophy.title}
                          </span>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '0.78rem',
                              color: '#64748b',
                              lineHeight: 1.45,
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {entry.trophy.desc}
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                            {entry.trophy.techStacks.slice(0, 4).map((tag) => (
                              <span key={tag} style={{ ...techChipStyle, fontSize: '0.62rem', padding: '2px 6px' }}>
                                {tag}
                              </span>
                            ))}
                            {entry.trophy.techStacks.length > 4 ? (
                              <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>+{entry.trophy.techStacks.length - 4}</span>
                            ) : null}
                          </div>
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{entry.trophy.dateRange}</span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            justifyContent: 'space-between',
                            flexShrink: 0,
                            minHeight: 88,
                            width: 56,
                          }}
                        >
                          {TROPHY_GRADE[entry.trophy.grade] ? (
                            <img
                              src={TROPHY_GRADE[entry.trophy.grade].src}
                              alt=""
                              style={{ width: 44, height: 'auto', objectFit: 'contain' }}
                            />
                          ) : (
                            <span style={{ fontSize: '1.5rem' }} aria-hidden>
                              🏆
                            </span>
                          )}
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            role="presentation"
                          >
                            <button
                              type="button"
                              className="feed-post-like-btn"
                              data-liked="true"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.68rem' }}
                              onClick={(e) => handleTrophyLike(entry.trophy.trophyId, e)}
                              disabled={!viewer?.user_id}
                              aria-label="좋아요"
                            >
                              <HeartIcon filled />
                              <span>{entry.trophy.likes}</span>
                            </button>
                            <span className="feed-post-meta" style={{ fontSize: '0.62rem', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              💬 {entry.trophy.comments ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                {combinedLikesLoad === 'ok' && likesLoadingMore ? (
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>더 불러오는 중…</p>
                ) : null}
                {combinedLikesLoad === 'ok' && likesHasMore ? (
                  <div ref={likesSentinelRef} style={{ height: 1 }} aria-hidden />
                ) : null}
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

const globeSearchWrapStyle = {
  position: "absolute",
  right: 14,
  bottom: 18,
  width: 356,
  zIndex: 22,
};

const globeSearchBarStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  background: "rgba(255,255,255,0.96)",
  borderRadius: 10,
  border: "1px solid rgba(15,23,42,0.14)",
  boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
  padding: "6px",
};

const globeSearchInputStyle = {
  flex: 1,
  minWidth: 0,
  border: "1px solid rgba(15,23,42,0.12)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: "0.82rem",
  color: "#0f1c36",
  background: "#fff",
};

const globeSearchBtnStyle = {
  border: "none",
  background: "#3b82f6",
  color: "#fff",
  fontWeight: 700,
  fontSize: "0.78rem",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const globeSearchSuggestStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: "calc(100% + 8px)",
  maxHeight: 250,
  overflowY: "auto",
  background: "rgba(248,250,252,0.98)",
  border: "1px solid rgba(15,23,42,0.12)",
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
  padding: "8px 0",
};

const globeSearchSectionStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "0 8px",
};

const globeSearchSectionTitleStyle = {
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "#64748b",
  padding: "4px 6px",
};

const globeSearchItemBtnStyle = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderRadius: 8,
  color: "#0f172a",
  fontSize: "0.78rem",
  padding: "7px 8px",
  cursor: "pointer",
};

const globeSearchResultPopupStyle = {
  position: "absolute",
  right: 14,
  bottom: 74,
  width: 356,
  maxHeight: 300,
  display: "flex",
  flexDirection: "column",
  background: "rgba(248,250,252,0.98)",
  border: "1px solid rgba(15,23,42,0.16)",
  borderRadius: 12,
  boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
  zIndex: 23,
  overflow: "hidden",
};

const globeSearchResultHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 10px",
  borderBottom: "1px solid rgba(15,23,42,0.1)",
  background: "rgba(241,245,249,0.9)",
};

const globeSearchResultBodyStyle = {
  padding: "8px",
  overflowY: "auto",
  maxHeight: 248,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

// 랜딩 페이지 nav-item CSS와 동일한 스타일 + DM·알림 빨간점 펄스 애니메이션
const navGlobalStyles = `
  .globe-nav-item {
    color: var(--globe-nav-fg, #ffffff);
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
    color: var(--globe-nav-fg-hover, rgba(255,255,255,0.8));
  }
  .globe-nav-item.active {
    color: var(--globe-nav-active, #4e9af1);
    border-bottom: 2px solid var(--globe-nav-active, #4e9af1);
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
    border: 1.5px solid var(--globe-notif-ring, #ffffff);
    animation: pulse-red 1.6s ease-out infinite;
  }
  .globe-search-hit:hover {
    background: var(--globe-search-hit-hover, rgba(15,23,42,0.06));
  }
  .globe-search-input::placeholder {
    color: var(--globe-search-ph, #64748b);
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
  @keyframes earth-route-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .earth-community-root--route-enter {
    animation: earth-route-fade-in 0.42s ease-out;
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

// 패널 전체 컨테이너 - flex column: 프로필 카드 + 탭 카드 (하단 여백 넉넉히 → 화면에서 위로)
const panelStyle = {
  position: "absolute",
  top: 78,
  right: 14,
  bottom: 104,
  width: 384,
  display: "flex",
  flexDirection: "column",
  overflowX: "hidden",
  overflowY: "hidden",
  transition: "transform 0.45s cubic-bezier(.2,.8,.2,1)",
  zIndex: 3,
  scrollbarWidth: "none",
};

// 프로필 카드 — :root data-theme 변수와 동기화
const profileCardStyle = {
  background: "var(--feed-bg-card)",
  backdropFilter: "blur(16px)",
  borderRadius: 20,
  padding: "20px",
  border: "1px solid var(--feed-border)",
  boxShadow: "var(--feed-shadow, 0 8px 32px rgba(0,0,0,0.14))",
  color: "var(--feed-text-primary)",
};

// 닫기 버튼
const closeBtnStyle = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "none",
  background: "var(--feed-bg-page)",
  color: "var(--feed-text-secondary)",
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

// 프로필 카드 안 기술 스택 칩 (트로피 탭과 구분 — 작게)
const profileTechChipStyle = {
  background: "rgba(59, 130, 246, 0.1)",
  border: "1px solid rgba(59, 130, 246, 0.28)",
  color: "#3b82f6",
  padding: "1px 5px",
  borderRadius: 10,
  fontSize: "0.62rem",
  fontWeight: 500,
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
  background: "var(--feed-bg-card)",
  borderRadius: 12,
  boxShadow: "var(--feed-shadow, 0 4px 20px rgba(0,0,0,0.15))",
  border: "1px solid var(--feed-border)",
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
  color: "var(--feed-text-primary)",
  background: "transparent",
};

// 글 아이템
const postItemStyle = {
  padding: "10px 0",
  borderBottom: "1px solid var(--feed-border)",
};

// 트로피 아이템
const trophyItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 0",
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

// 확장 모드 트로피 - 프로젝트 상세 카드 (썸네일 + 정보)
const projectCardStyle = {
  display: "flex",
  gap: 8,
  padding: "8px 0",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  alignItems: "flex-start",
};

// 프로젝트 썸네일 (왼쪽 고정 크기 이미지)
const projectThumbStyle = {
  width: 56,
  height: 54,
  flexShrink: 0,
  borderRadius: 8,
  overflow: "hidden",
  background: "#e5e7eb",
};

const labelStyle = {
  background: "rgba(0,0,0,0.78)",
  color: "white",
  padding: "7px 14px",
  borderRadius: 999,
  fontSize: 13,
  whiteSpace: "nowrap",
  transform: "translateY(14px)",
};

