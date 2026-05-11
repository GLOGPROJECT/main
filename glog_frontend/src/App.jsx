import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/contexts/AuthContext';
import { ProtectedRoute, AuthRoute } from './auth/components/ProtectedRoute';
import Landing from './auth/pages/Landing';
import OAuthCallback from './auth/pages/OAuthCallback';
import InitialSetup from './auth/pages/InitialSetup';
import EarthCommunity from './EarthCommunity';
import ProfilePage from './profile/ProfilePage';

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
              //일단 로그인없이 지구본 테스트
            //  <ProtectedRoute>
                <EarthCommunity />
             // </ProtectedRoute>
            }
          />

          {/* 유저 프로필 페이지 - /profile/me (본인) 또는 /profile/:userId (타인) */}
          <Route
            path="/profile/:userId"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
