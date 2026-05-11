import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function OAuthCallback() {
  const { setAccessToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const setup = params.get('setup') === 'true';

    if (!token) {
      navigate('/', { replace: true });
      return;
    }

    // URL에서 토큰 즉시 제거 (보안: 브라우저 히스토리에 토큰 노출 최소화)
    window.history.replaceState({}, '', '/auth/callback');

    setAccessToken(token).then(() => {
      if (!setup) {
        navigate('/initial-setup', { replace: true });
      } else {
        navigate('/globe', { replace: true });
      }
    });
  }, [navigate, setAccessToken]);

  return <div>로그인 처리 중...</div>;
}
