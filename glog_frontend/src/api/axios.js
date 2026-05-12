import axios from 'axios';

function resolveApiOrigin() {
  const o = import.meta.env.VITE_API_ORIGIN;
  if (o) return String(o).replace(/\/$/, '');
  const base = import.meta.env.VITE_API_BASE_URL;
  if (base && /^https?:\/\//i.test(String(base))) {
    try {
      return new URL(String(base)).origin;
    } catch {
      /* ignore */
    }
  }
  return 'http://localhost:4000';
}

/** 백엔드 루트 (OAuth `GET /api/auth/github` 등). `VITE_API_ORIGIN` 또는 `VITE_API_BASE_URL`에서 유도 */
export const API_ORIGIN = resolveApiOrigin();

const apiBase =
  import.meta.env.VITE_API_BASE_URL && /^https?:\/\//i.test(String(import.meta.env.VITE_API_BASE_URL))
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')
    : `${API_ORIGIN}/api`;

const api = axios.create({
  baseURL: apiBase,
  withCredentials: true, // httpOnly 쿠키(refresh_token) 자동 전송
});

// 요청 인터셉터: Access Token을 Authorization 헤더에 자동 첨부
api.interceptors.request.use((config) => {
  const token = window.__accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
}

// 응답 인터셉터: Access Token 만료 시 Refresh Token으로 자동 갱신
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // /auth/refresh 자체가 401이면 재시도 없이 그냥 에러 반환 (무한루프 방지)
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/refresh')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post('/auth/refresh');
        window.__accessToken = data.accessToken;
        processQueue(null, data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        window.__accessToken = null;
        window.location.href = '/';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
