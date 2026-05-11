import SortToggle from './SortToggle';
import { useFeedTheme } from '../theme/ThemeContext';

/** 최신/인기 정렬 + 테마 토글(정렬 바로 옆) */
export default function FeedSortAndTheme({ sortValue, onSortChange, showSort = true }) {
  const { theme, toggleTheme } = useFeedTheme();

  return (
    <div className="feed-tabs-controls">
      {showSort && sortValue != null && typeof onSortChange === 'function' ? (
        <SortToggle value={sortValue} onChange={onSortChange} />
      ) : null}
      <button
        type="button"
        className="feed-theme-toggle-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? '밝게' : '야간'}
        aria-label={theme === 'dark' ? '라이트 모드' : '다크 모드'}
      >
        {theme === 'dark' ? '☀' : '🌙'}
      </button>
    </div>
  );
}
