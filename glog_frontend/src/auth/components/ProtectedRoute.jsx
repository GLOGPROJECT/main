import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// 로그인 + 초기설정 완료 필요
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div>로딩 중...</div>;
  if (!user) return <Navigate to="/" replace />;
  if (!user.is_setup_complete) return <Navigate to="/initial-setup" replace />;

  return children;
}

// 로그인만 필요 (초기설정 미완료 허용)
export function AuthRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div>로딩 중...</div>;
  if (!user) return <Navigate to="/" replace />;

  return children;
}
