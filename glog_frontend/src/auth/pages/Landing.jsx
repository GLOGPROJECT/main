import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api, { API_ORIGIN } from '../../api/axios';
import GlobalTopNav from '../../components/GlobalTopNav';
import * as THREE from 'three';

// 전역 CSS:
// - earth-spin: 지구본 무한 회전 (20초 1바퀴)
// - twinkle: 별 반짝임 애니메이션
// - cta-btn: 하얀 배경 시작하기 버튼
const globalStyles = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes twinkle {
    0%, 100% { opacity: 0.3; }
    50%       { opacity: 1; }
  }
  .earth-spin {
    animation: spin 20s linear infinite;
  }
  .cta-btn {
    background: white;
    color: #0f1c36;
    border: none;
    padding: 16px 36px;
    font-size: 1.1rem;
    font-weight: 700;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .cta-btn:hover {
    background: #dbeafe;
  }
  @keyframes cardFloat1 {
    0%, 100% { transform: perspective(600px) rotateY(-6deg) scale(1.04) translateY(0px); }
    50%       { transform: perspective(600px) rotateY(-6deg) scale(1.04) translateY(-8px); }
  }
  @keyframes cardFloat2 {
    0%, 100% { transform: perspective(600px) rotateY(6deg) scale(1.04) translateY(0px); }
    50%       { transform: perspective(600px) rotateY(6deg) scale(1.04) translateY(-8px); }
  }
`;

// ── 홀로그램 지구 컴포넌트 ──
// Three.js로 격자선 + 대륙 외곽선 + 글로우를 캔버스에 직접 렌더링
// Landing 페이지 전용 — 로그인 전 홈화면에서만 사용
function HologramEarth({ size = 480 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // 씬 / 카메라 / 렌더러
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // 배경 투명
    el.appendChild(renderer.domElement);

    // 위도/경도 → 구체 표면 3D 좌표
    function latLonToVec3(lat, lon, r = 1.002) {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
         r * Math.cos(phi),
         r * Math.sin(phi) * Math.sin(theta)
      );
    }

    // 지구 본체
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshPhongMaterial({ color: 0x001525, emissive: 0x000d18, transparent: true, opacity: 0.95 })
    );
    scene.add(earthMesh);

    // 격자선 그룹 (지구와 함께 회전)
    const gridGroup = new THREE.Group();
    scene.add(gridGroup);
    const gridMat = new THREE.LineBasicMaterial({ color: 0x0077cc, transparent: true, opacity: 0.2 });

    for (let i = 0; i <= 18; i++) {
      const lat = (i / 18) * Math.PI - Math.PI / 2;
      const r = Math.cos(lat), y = Math.sin(lat);
      const pts = [];
      for (let j = 0; j <= 64; j++) {
        const lng = (j / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(r * Math.cos(lng), y, r * Math.sin(lng)));
      }
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let i = 0; i < 24; i++) {
      const lng = (i / 24) * Math.PI * 2;
      const pts = [];
      for (let j = 0; j <= 64; j++) {
        const lat2 = (j / 64) * Math.PI - Math.PI / 2;
        pts.push(new THREE.Vector3(Math.cos(lat2) * Math.cos(lng), Math.sin(lat2), Math.cos(lat2) * Math.sin(lng)));
      }
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    // 외곽 글로우 레이어
    [{ r: 1.08, o: 0.07 }, { r: 1.2, o: 0.03 }, { r: 1.35, o: 0.015 }].forEach(({ r, o }) => {
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(r, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x0055ff, transparent: true, opacity: o, side: THREE.BackSide })
      ));
    });

    // 대륙 외곽선 그룹 (GeoJSON 로드)
    const continentGroup = new THREE.Group();
    scene.add(continentGroup);
    const continentMat = new THREE.LineBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.85 });

    fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
      .then(res => res.json())
      .then(geojson => {
        geojson.features.forEach(feature => {
          const geom = feature.geometry;
          const polys = geom.type === 'Polygon' ? [geom.coordinates]
                      : geom.type === 'MultiPolygon' ? geom.coordinates : [];
          polys.forEach(poly => {
            poly.forEach(ring => {
              let pts = [];
              for (let i = 0; i < ring.length; i++) {
                const [lon, lat] = ring[i];
                // 날짜변경선 근처(경도 차이 90도 이상)는 선 끊기
                if (i > 0 && Math.abs(lon - ring[i - 1][0]) > 90) {
                  if (pts.length > 1) continentGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), continentMat));
                  pts = [];
                }
                pts.push(latLonToVec3(lat, lon));
              }
              if (pts.length > 1) continentGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), continentMat));
            });
          });
        });
      })
      .catch(() => {});

    // 표면 반짝이는 점들
    const dotPositions = [];
    for (let i = 0; i < 150; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      dotPositions.push(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
    const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ color: 0x88ddff, size: 0.015, transparent: true, opacity: 0.8 }));
    scene.add(dots);

    // 조명
    scene.add(new THREE.AmbientLight(0x112244, 2));
    const pl1 = new THREE.PointLight(0x0088ff, 4, 10);
    pl1.position.set(2, 2, 2);
    scene.add(pl1);

    // 자동 회전 애니메이션
    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      earthMesh.rotation.y += 0.003;
      gridGroup.rotation.y = earthMesh.rotation.y;
      continentGroup.rotation.y = earthMesh.rotation.y;
      dots.rotation.y = earthMesh.rotation.y;
      renderer.render(scene, camera);
    }
    animate();

    // 언마운트 시 정리
    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [size]);

  return <div ref={mountRef} style={{ width: size, height: size }} />;
}

export default function Landing() {
  // useAuth 훅에서 현재 로그인된 유저 정보와 로딩 상태를 가져옴
  // user는 로그인된 유저 정보, 프로필 이동 시 user_id 사용
  const { user: me, loading } = useAuth();
  const navigate = useNavigate();

  // 하단 통계 + 오늘 상위 커미터 2명 상태 - API에서 실제 값을 받아와 표시
  const [stats, setStats] = useState({
    userCount: 0,
    countryCount: 0,
    todayCommits: 0,
    topCommitters: [],
  });


  // 배경 별 150개를 랜덤 위치/크기/애니메이션으로 생성
  // useMemo로 한 번만 생성 (리렌더링마다 재계산 방지)
  const stars = useMemo(() =>
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

  // 이미 로그인된 사용자는 메인 또는 초기 설정 페이지로 자동 이동
  useEffect(() => {
    if (!loading && me) {
      navigate(me.is_setup_complete ? '/globe' : '/initial-setup', { replace: true });
    }
  }, [me, loading, navigate]);

  // GitHub OAuth 실패 시 URL에 ?error=... 파라미터 처리 후 URL 정리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error === 'access_denied') alert('GitHub 권한 동의가 거부되었습니다.');
    else if (error === 'db_migration_required') {
      alert(
        'DB 스키마가 최신이 아닙니다. 백엔드에서 prisma/sql/add_daily_contribution_coin.sql 적용(또는 npx prisma db push) 후 다시 로그인해 주세요.',
      );
    } else if (error === 'server_error') alert('GitHub 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    if (error) window.history.replaceState({}, '', '/');
  }, []);

  // 하단 통계 데이터를 백엔드 /api/stats에서 가져옴
  useEffect(() => {
    api.get('/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {});
  }, []);

  // 6시간마다 서버에서 랜덤 유저 2명 (커밋 0이면 0으로 표시)
  const [featuredUsers, setFeaturedUsers] = useState([]);
  useEffect(() => {
    api.get('/stats/featured')
      .then(({ data }) => setFeaturedUsers(data))
      .catch(() => {});
  }, []);

  function handleGithubLogin() {
    window.location.href = `${API_ORIGIN}/api/auth/github`;
  }

  // 로딩 중에는 배경색만 채운 빈 화면 (깜빡임 방지)
  if (loading) return <div style={{ background: '#0f1c36', height: '100vh' }} />;

  return (
    <>
      <style>{globalStyles}</style>

      {/* 전체 페이지 컨테이너 - 배경색 #0f1c36, 별 배경 기준점(relative) */}
      <div style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: '#0f1c36',
        overflowX: 'hidden',
        color: 'white',
        fontFamily: 'sans-serif',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 'max(3rem, 12vh)',
      }}>

        {/* ── 별 배경 레이어 ──
            stars 배열을 순회하며 작은 흰색 원을 절대 위치에 랜덤 배치
            twinkle 애니메이션으로 각각 다른 타이밍에 반짝임 */}
        {/* Landing 배경은 항상 어두운 우주색이므로 별은 항상 표시 */}
        {stars.map(star => (
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
            }}
          />
        ))}

        {/* 네비+로그인 모달은 히어로(지구본)보다 위 레이어 — z-index 같으면 DOM 뒤쪽 히어로가 모달을 덮음 */}
        <div style={{ position: 'relative', zIndex: 40 }}>
          <GlobalTopNav />
        </div>

        {/* ── 히어로 섹션 ──
            왼쪽: 뱃지 + 타이틀 + 서브타이틀 + CTA 버튼
            오른쪽: 회전하는 earth.svg */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '60px 60px 40px',
          flex: 1,
          zIndex: 0,
        }}>
          {/* 왼쪽 텍스트 영역 */}
          <div style={{ flex: 1, maxWidth: '520px' }}>

            {/* 서비스 카테고리 뱃지 - 배경색 #707989 불투명도 70%, 테두리 동일 색상 */}
            <div style={{
              display: 'inline-block',
              padding: '6px 16px',
              borderRadius: '20px',
              border: '1px solid #707989',
              background: 'rgba(112, 121, 137, 0.7)',
              fontSize: '0.85rem',
              color: 'rgba(255,255,255,0.9)',
              marginBottom: '24px',
            }}>
              개발자 소셜 플랫폼
            </div>

            {/* 메인 헤드라인
                '전 세계 개발자들' 부분만 #b8e9ff 색상으로 강조 */}
            <h1 style={{ fontSize: '2.8rem', fontWeight: '800', lineHeight: '1.35', margin: '0 0 16px 0' }}>
              GitHub 연동 하나로<br />
              <span style={{ color: '#b8e9ff' }}>전 세계 개발자들</span>을<br />
              만날 수 있어요.
            </h1>

            {/* 서브 설명 문구 */}
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)', margin: '0 0 40px 0' }}>
              지금바로 나만의 캐릭터를 만나봐요!
            </p>

            {/* GitHub OAuth 로그인 연결 버튼 */}
            <button className="cta-btn" onClick={handleGithubLogin}>
              지금 시작하기 →
            </button>
          </div>

          {/* 오른쪽 지구본 + 상위 커미터 카드
            relative 기준으로 카드 2개를 절대 위치에 배치 */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>

            {/* 홀로그램 지구 — Three.js 캔버스, 배경 투명 */}
            <HologramEarth size={520} />

            {/* 유저 카드 1 — 지구본 우측 상단 */}
            {featuredUsers[0] && (
              <div style={{
                position: 'absolute',
                top: '18%',
                right: '30px',
                background: 'rgba(216, 219, 230, 0.7)',
                backdropFilter: 'blur(16px)',
                borderRadius: '12px',
                padding: '10px 28px',
                color: 'black',
                border: '1px solid rgba(143, 170, 253, 0.5)',
                boxShadow: '0 0 12px rgba(143,170,253,0.6), 0 0 32px rgba(143,170,253,0.25), 0 4px 20px rgba(0,0,0,0.3)',
                transform: 'perspective(600px) rotateY(-6deg) scale(1.04)',
                animation: 'cardFloat1 3.5s ease-in-out infinite',
              }}>
                <div style={{ fontSize: '0.78rem', color: 'rgba(80, 80, 100, 0.75)', marginBottom: '2px', letterSpacing: '0.04em' }}>
                  오늘의 커밋 {featuredUsers[0].commitCount}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', letterSpacing: '-0.01em', color: 'black', marginBottom: '4px', textShadow: '0 0 6px rgba(99,102,241,0.35)' }}>
                  {featuredUsers[0].nickname}
                </div>
                {featuredUsers[0].techStacks?.length > 0 && (
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {featuredUsers[0].techStacks.map((t, i) => (
                      <span key={t} style={{
                        fontSize: '0.68rem', fontWeight: '600',
                        background: i === 0 ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)',
                        border: `1px solid ${i === 0 ? 'rgba(99,102,241,0.45)' : 'rgba(16,185,129,0.45)'}`,
                        borderRadius: '5px', padding: '1px 7px',
                        color: i === 0 ? '#4f46e5' : '#059669',
                      }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 유저 카드 2 — 지구본 좌측 하단 */}
            {featuredUsers[1] && (
              <div style={{
                position: 'absolute',
                bottom: '18%',
                left: '30px',
                background: 'rgba(216, 219, 230, 0.7)',
                backdropFilter: 'blur(16px)',
                borderRadius: '12px',
                padding: '10px 28px',
                color: 'black',
                border: '1px solid rgba(143, 170, 253, 0.5)',
                boxShadow: '0 0 12px rgba(143,170,253,0.6), 0 0 32px rgba(143,170,253,0.25), 0 4px 20px rgba(0,0,0,0.3)',
                transform: 'perspective(600px) rotateY(6deg) scale(1.04)',
                animation: 'cardFloat2 4s ease-in-out infinite',
              }}>
                <div style={{ fontSize: '0.78rem', color: 'rgba(80, 80, 100, 0.75)', marginBottom: '2px', letterSpacing: '0.04em' }}>
                  오늘의 커밋 {featuredUsers[1].commitCount}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', letterSpacing: '-0.01em', color: 'black', marginBottom: '4px', textShadow: '0 0 6px rgba(99,102,241,0.35)' }}>
                  {featuredUsers[1].nickname}
                </div>
                {featuredUsers[1].techStacks?.length > 0 && (
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {featuredUsers[1].techStacks.map((t, i) => (
                      <span key={t} style={{
                        fontSize: '0.68rem', fontWeight: '600',
                        background: i === 0 ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)',
                        border: `1px solid ${i === 0 ? 'rgba(99,102,241,0.45)' : 'rgba(16,185,129,0.45)'}`,
                        borderRadius: '5px', padding: '1px 7px',
                        color: i === 0 ? '#4f46e5' : '#059669',
                      }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* ── 하단 통계 바 ──
            실제 DB 값: 가입 개발자 수 / 참여 국가 수 / 오늘 커밋한 유저 수
            배경박스 제거, 왼쪽 정렬 */}
        <div style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'flex-start',
          gap: '80px',
          padding: '24px 60px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          zIndex: 0,
        }}>
          {[
            { value: stats.userCount.toLocaleString(), label: '가입 개발자' },
            { value: stats.countryCount.toLocaleString(), label: '참여 국가' },
            { value: stats.todayCommits.toLocaleString(), label: '오늘의 커밋' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '800' }}>{stat.value}</div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>{stat.label}</div>
            </div>
          ))}
        </div>

      </div>
    </>
  );
}
