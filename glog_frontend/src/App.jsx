import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/contexts/AuthContext';
import { ProtectedRoute, AuthRoute } from './auth/components/ProtectedRoute';
import Landing from './auth/pages/Landing';
import OAuthCallback from './auth/pages/OAuthCallback';
import InitialSetup from './auth/pages/InitialSetup';
import { ThemeProvider } from './feed/theme/ThemeContext';
import FeedLayout from './feed/layouts/FeedLayout';
import FeedHomePage from './feed/pages/FeedHomePage';
import FeedFollowPage from './feed/pages/FeedFollowPage';
import FeedTagPage from './feed/pages/FeedTagPage';
import FeedTagHubPage from './feed/pages/FeedTagHubPage';
import FeedTagRedirect from './feed/pages/FeedTagRedirect';
import FeedPostDetailPage from './feed/pages/FeedPostDetailPage';
import FeedAnonymousPage from './feed/pages/FeedAnonymousPage';
import { feedQueryClient } from './feed/queryClient';
import EarthCommunity from './EarthCommunity';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <QueryClientProvider client={feedQueryClient}>
          <AuthProvider>
            <Routes>
              {/* 공개 라우트 */}
              <Route path="/" element={<Landing />} />
              <Route path="/auth/callback" element={<OAuthCallback />} />

              {/* 피드 관련 라우트 */}
              <Route path="/tag/:slug" element={<FeedLayout />}>
                <Route index element={<FeedTagPage />} />
              </Route>
              
              <Route path="/feed" element={<FeedLayout />}>
                <Route index element={<FeedHomePage />} />
                <Route path="follow" element={<FeedFollowPage />} />
                <Route path="tag" element={<FeedTagHubPage />} />
                <Route path="tag/:slug" element={<FeedTagRedirect />} />
                <Route path="post/:postId" element={<FeedPostDetailPage />} />
                <Route path="anonymous" element={<FeedAnonymousPage />} />
              </Route>

              {/* 로그인만 필요 (초기설정 진행 중) */}
              <Route
                path="/initial-setup"
                element={
                  <AuthRoute>
                    <InitialSetup />
                  </AuthRoute>
                }
              />

              <Route
                path="/globe"
                element={
                  // <ProtectedRoute>
                    <EarthCommunity />
                  // </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}