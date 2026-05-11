import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, // 백엔드 .env의 FRONTEND_URL(http://localhost:3000)과 맞추기 위해 고정
  },
});
