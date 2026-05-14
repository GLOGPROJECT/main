import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../../auth/hooks/useAuth';

/** 기존 단일 키 — 로그인 유저 마이그레이션용으로만 읽음 */
const LS_LEGACY = 'glog-feed-theme';

const ThemeContext = createContext(null);

function userThemeStorageKey(userId) {
  return `glog-feed-theme-u${userId}`;
}

function readValidTheme(key) {
  try {
    const v = localStorage.getItem(key);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function storedThemeForUser(userId) {
  const perUser = readValidTheme(userThemeStorageKey(userId));
  if (perUser) return perUser;
  const legacy = readValidTheme(LS_LEGACY);
  if (legacy) return legacy;
  return 'dark';
}

export function ThemeProvider({ children }) {
  const { user, loading } = useAuth();
  const userId = user?.user_id ?? null;
  const syncedFromAuthRef = useRef(false);

  const [theme, setThemeState] = useState('dark');

  // 비로그인: 항상 야간. 로그인: 계정별 저장값.
  // useLayoutEffect — 로그아웃 직후 저장 effect가 옛 theme로 덮어쓰는 레이스 방지
  useLayoutEffect(() => {
    if (loading) return;
    const next = userId ? storedThemeForUser(userId) : 'dark';
    setThemeState(next);
    syncedFromAuthRef.current = true;
  }, [loading, userId]);

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (loading || !syncedFromAuthRef.current || !userId) return;
    try {
      localStorage.setItem(userThemeStorageKey(userId), theme);
    } catch {
      /* ignore */
    }
  }, [theme, userId, loading]);

  const setTheme = useCallback(
    (next) => {
      if (!userId) return;
      setThemeState(next === 'dark' ? 'dark' : 'light');
    },
    [userId],
  );

  const toggleTheme = useCallback(() => {
    if (!userId) return;
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, [userId]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useFeedTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useFeedTheme must be used within ThemeProvider');
  return ctx;
}
