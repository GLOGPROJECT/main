import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './feed/theme/feedTheme.css';

// Access Token 메모리 저장소 (전역 변수, 새로고침 시 초기화 → AuthContext가 refresh로 복구)
window.__accessToken = null;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
