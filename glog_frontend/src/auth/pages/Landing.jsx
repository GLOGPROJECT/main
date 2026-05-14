import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api, { API_ORIGIN } from '../../api/axios';
import GlobalTopNav from '../../components/GlobalTopNav';

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
`;

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
  // 실패해도 기본값(0)으로 유지해 화면이 깨지지 않도록 처리
  useEffect(() => {
    api.get('/stats')
      .then(({ data }) => setStats(data))
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

            {/* 지구본 - 기존 480px의 1.5배인 720px */}
            <img
              src="/earth.svg"
              alt="earth"
              className="earth-spin"
              style={{ width: '720px' }}
            />

            {/* 1위 커미터 카드
                - 지구본 우측 중앙에 바짝 붙여 배치
                - 금빛 형광 네온 글로우 효과 (box-shadow 다중 레이어)
                - 흰색 반투명 배경 */}
            {stats.topCommitters[0] && (
              <div style={{
                position: 'absolute',
                top: '20%',
                right: '30px',
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                padding: '20px 24px',
                minWidth: '200px',
                color: '#0f1c36',
                border: '1.5px solid rgba(251, 191, 36, 0.8)',
                // 금빛 네온 글로우: 안쪽 → 바깥쪽으로 점점 퍼지는 3단계 그림자
                boxShadow: `
                  0 0 8px rgba(251, 191, 36, 0.9),
                  0 0 20px rgba(251, 191, 36, 0.5),
                  0 0 40px rgba(251, 191, 36, 0.25),
                  0 8px 32px rgba(0,0,0,0.2)
                `,
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#d97706', marginBottom: '8px', letterSpacing: '0.05em' }}>
                  🥇 오늘의 1위
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '6px' }}>
                  {stats.topCommitters[0].nickname}
                </div>
                <div style={{ fontSize: '1rem', color: '#374151', fontWeight: '600' }}>
                  커밋 {stats.topCommitters[0].commitCount}회
                </div>
              </div>
            )}

            {/* 2위 커미터 카드
                - 지구본 좌측 하단에 바짝 붙여 배치
                - 은빛 형광 네온 글로우 효과 */}
            {stats.topCommitters[1] && (
              <div style={{
                position: 'absolute',
                bottom: '20%',
                left: '30px',
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                padding: '20px 24px',
                minWidth: '200px',
                color: '#0f1c36',
                border: '1.5px solid rgba(192, 192, 220, 0.9)',
                // 은빛 네온 글로우
                boxShadow: `
                  0 0 8px rgba(200, 200, 255, 0.9),
                  0 0 20px rgba(200, 200, 255, 0.5),
                  0 0 40px rgba(200, 200, 255, 0.25),
                  0 8px 32px rgba(0,0,0,0.2)
                `,
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#6b7280', marginBottom: '8px', letterSpacing: '0.05em' }}>
                  🥈 오늘의 2위
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '6px' }}>
                  {stats.topCommitters[1].nickname}
                </div>
                <div style={{ fontSize: '1rem', color: '#374151', fontWeight: '600' }}>
                  커밋 {stats.topCommitters[1].commitCount}회
                </div>
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
