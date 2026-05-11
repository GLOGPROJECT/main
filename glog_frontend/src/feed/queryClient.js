import { QueryClient } from '@tanstack/react-query';

/** 피드 무한 스크롤 등 — 목 API 기준 staleTime 30초 */
export const feedQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});
