import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const LoginModalContext = createContext(null);

export function LoginModalProvider({ isLoggedIn, children }) {
  const [open, setOpen] = useState(false);
  const [browseEnabled, setBrowseEnabled] = useState(Boolean(isLoggedIn));

  useEffect(() => {
    if (isLoggedIn) {
      setOpen(false);
      setBrowseEnabled(true);
      return;
    }

    setBrowseEnabled(false);
    const timer = setTimeout(() => {
      setBrowseEnabled(true);
      setOpen(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [isLoggedIn]);

  const requestLogin = useCallback(() => {
    if (isLoggedIn) return false;
    setOpen(true);
    return true;
  }, [isLoggedIn]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isLoggedIn,
      open,
      browseEnabled,
      requestLogin,
      openModal: () => setOpen(true),
      closeModal: close,
    }),
    [isLoggedIn, open, browseEnabled, requestLogin, close]
  );

  return <LoginModalContext.Provider value={value}>{children}</LoginModalContext.Provider>;
}

export function useLoginModal() {
  const ctx = useContext(LoginModalContext);
  if (!ctx) throw new Error('useLoginModal must be used inside LoginModalProvider');
  return ctx;
}

