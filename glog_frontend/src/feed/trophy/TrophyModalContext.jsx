import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import TrophyModal from './TrophyModal';

const TrophyModalContext = createContext(null);

export function TrophyModalProvider({ children }) {
  const [open, setOpen] = useState(false);
  const openTrophyModal = useCallback(() => setOpen(true), []);
  const closeTrophyModal = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ openTrophyModal, closeTrophyModal, isTrophyModalOpen: open }),
    [open, openTrophyModal, closeTrophyModal],
  );
  return (
    <TrophyModalContext.Provider value={value}>
      {children}
      <TrophyModal open={open} onClose={closeTrophyModal} />
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
