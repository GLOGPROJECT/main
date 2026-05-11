import { useState } from 'react';

/**
 * 비제어: 내부 state
 * 제어: value + onChange (무한 스크롤 queryKey와 동기화)
 */
export default function SortToggle({ value, onChange }) {
  const [internal, setInternal] = useState('latest');
  const controlled = value != null && typeof onChange === 'function';
  const sort = controlled ? value : internal;
  const setSort = controlled ? onChange : setInternal;

  return (
    <div className="feed-sort">
      <button type="button" className={sort === 'latest' ? 'feed-sort-active' : ''} onClick={() => setSort('latest')}>
        최신순
      </button>
      <button type="button" className={sort === 'popular' ? 'feed-sort-active' : ''} onClick={() => setSort('popular')}>
        인기글
      </button>
    </div>
  );
}
