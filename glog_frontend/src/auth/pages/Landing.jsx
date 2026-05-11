import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// 백엔드 서버 주소 - GitHub OAuth 로그인 요청을 이 주소로 보냄
const BACKEND_URL = 'http://localhost:4000';

// 지구본 이미지가 제자리에서 360도 회전하는 CSS 애니메이션 정의
// animation: spin 10s → 10초에 한 바퀴, linear → 일정한 속도, infinite → 무한 반복
const spinStyle = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .earth-spin {
    animation: spin 10s linear infinite;
  }
`;

export default function Landing() {
  // useAuth 훅에서 현재 로그인된 유저 정보와 로딩 상태를 가져옴
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // 이미 로그인된 사용자는 Landing 페이지를 볼 필요 없으므로 자동으로 이동
  // is_setup_complete가 true면 /globe(메인), false면 /initial-setup(초기 설정)으로 이동
  useEffect(() => {
    if (!loading && user) {
      navigate(user.is_setup_complete ? '/globe' : '/initial-setup', { replace: true });
    }
  }, [user, loading, navigate]);

  // GitHub OAuth 로그인 실패 시 URL에 ?error=... 파라미터가 붙어서 돌아옴
  // 에러 종류에 따라 알림을 띄우고, URL에서 에러 파라미터를 제거해 깔끔하게 정리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error === 'access_denied') {
      alert('GitHub 권한 동의가 거부되었습니다.');
    } else if (error === 'server_error') {
      alert('GitHub 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
    // 에러 파라미터를 URL에서 제거 (새로고침해도 알림이 다시 뜨지 않도록)
    if (error) window.history.replaceState({}, '', '/');
  }, []);

  // GitHub OAuth 로그인 버튼 클릭 시 백엔드의 GitHub 인증 엔드포인트로 이동
  // 백엔드에서 GitHub 인증 URL로 리다이렉트해줌
  function handleGithubLogin() {
    window.location.href = `${BACKEND_URL}/api/auth/github`;
  }

  // 유저 정보 로딩 중일 때는 빈 화면 대신 로딩 표시
  if (loading) return <div>로딩 중...</div>;

  return (
    <>
      {/* 지구본 회전 CSS 애니메이션을 style 태그로 주입 */}
      <style>{spinStyle}</style>

      {/* 전체 레이아웃: 화면 중앙 정렬, 세로 방향으로 요소 배치 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>

        {/* 서비스 이름 - 8rem, 아래 여백 없음 */}
        <h1 style={{ fontSize: '8rem', margin: '0' }}>Glog</h1>

        {/* 지구본 이미지 - 600px 유지, 위아래 여백 없음 */}
        <img
          src="/earth.svg"
          alt="earth"
          className="earth-spin"
          style={{ width: '600px', margin: '0' }}
        />

        {/* 서비스 소개 문구 */}
        <p style={{ fontSize: '1.5rem' }}>개발자들을 위한 3D 소셜 플랫폼</p>

        {/* GitHub OAuth 로그인 버튼 - 클릭 시 handleGithubLogin 실행 */}
        <button
          onClick={handleGithubLogin}
          style={{
            padding: '18px 36px',
            fontSize: '24px',
            backgroundColor: '#24292e', // GitHub 공식 다크 컬러
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {/* GitHub 로고 SVG 아이콘 */}
          <svg height="30" width="30" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub로 로그인
        </button>
      </div>
    </>
  );
}
