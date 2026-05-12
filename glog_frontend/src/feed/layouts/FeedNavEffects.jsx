import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

/** 피드 하위 경로 전환 시 스크롤 상단 + 피드 쿼리 무효화 (탭/태그 전환) */
export default function FeedNavEffects() {
  const location = useLocation();
  const qc = useQueryClient();
  const prevPath = useRef(location.pathname);

  useLayoutEffect(() => {
    const prev = prevPath.current;
    const next = location.pathname;
    const inFeedShell = (p) => p.startsWith('/feed') || p.startsWith('/tag/');
    if (prev !== next && inFeedShell(prev) && inFeedShell(next)) {
      qc.invalidateQueries({ queryKey: ['feed'], exact: false });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    prevPath.current = next;
  }, [location.pathname, qc]);

  return null;
}
