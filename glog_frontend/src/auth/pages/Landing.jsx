import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const BACKEND_URL = 'http://localhost:4000';

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // 이미 로그인된 경우 메인으로 이동
  useEffect(() => {
    if (!loading && user) {
      navigate(user.is_setup_complete ? '/globe' : '/initial-setup', { replace: true });
    }
  }, [user, loading, navigate]);

  // URL에 에러 파라미터가 있으면 토스트 안내
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error === 'access_denied') {
      alert('GitHub 권한 동의가 거부되었습니다.');
    } else if (error === 'server_error') {
      alert('GitHub 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
    if (error) window.history.replaceState({}, '', '/');
  }, []);

  function handleGithubLogin() {
    window.location.href = `${BACKEND_URL}/api/auth/github`;
  }

  if (loading) return <div>로딩 중...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>Glog</h1>
      <p>개발자들을 위한 3D 소셜 플랫폼</p>
      <button
        onClick={handleGithubLogin}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          backgroundColor: '#24292e',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        GitHub로 로그인
      </button>
    </div>
  );
}
