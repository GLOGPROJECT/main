import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/contexts/AuthContext';
import { ProtectedRoute, AuthRoute } from './auth/components/ProtectedRoute';
import Landing from './auth/pages/Landing';
import OAuthCallback from './auth/pages/OAuthCallback';
import InitialSetup from './auth/pages/InitialSetup';

// 나중에 추가할 페이지들
const GlobePage = () => <div>지구본 메인 페이지 (추후 구현)</div>;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 공개 라우트 */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />

          {/* 로그인만 필요 (초기설정 진행 중) */}
          <Route
            path="/initial-setup"
            element={
              <AuthRoute>
                <InitialSetup />
              </AuthRoute>
            }
          />

          {/* 로그인 + 초기설정 완료 필요 */}
          <Route
            path="/globe"
            element={
              <ProtectedRoute>
                <GlobePage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
