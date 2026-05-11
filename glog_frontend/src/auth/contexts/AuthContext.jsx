import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    if (!window.__accessToken) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      window.__accessToken = null;
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 앱 시작 시: Refresh Token 쿠키가 살아있으면 Access Token 자동 갱신
  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await api.post('/auth/refresh');
        window.__accessToken = data.accessToken;
        await fetchMe();
      } catch {
        setLoading(false);
      }
    };
    init();
  }, [fetchMe]);

  const setAccessToken = useCallback(async (token) => {
    window.__accessToken = token;
    await fetchMe();
  }, [fetchMe]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      window.__accessToken = null;
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((partial) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setAccessToken, logout, updateUser, refetchMe: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}
