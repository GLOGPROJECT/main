import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import TrophyModal from './TrophyModal';

const TrophyModalContext = createContext(null);

export function TrophyModalProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [focusProjectId, setFocusProjectId] = useState(null);
  const openTrophyModal = useCallback((opts) => {
    const raw = opts?.projectId;
    const n = raw != null ? Number(raw) : NaN;
    setFocusProjectId(Number.isFinite(n) && n > 0 ? n : null);
    setOpen(true);
  }, []);
  const closeTrophyModal = useCallback(() => {
    setFocusProjectId(null);
    setOpen(false);
  }, []);
  const clearFocusProjectId = useCallback(() => setFocusProjectId(null), []);
  const value = useMemo(
    () => ({ openTrophyModal, closeTrophyModal, isTrophyModalOpen: open }),
    [open, openTrophyModal, closeTrophyModal],
  );
  return (
    <TrophyModalContext.Provider value={value}>
      {children}
      <TrophyModal
        open={open}
        onClose={closeTrophyModal}
        focusProjectId={focusProjectId}
        onFocusProjectConsumed={clearFocusProjectId}
      />
    </TrophyModalContext.Provider>
  );
}

export function useTrophyModal() {
  const ctx = useContext(TrophyModalContext);
  if (!ctx) {
    throw new Error('useTrophyModal must be used within TrophyModalProvider');
  }
  return ctx;
}
