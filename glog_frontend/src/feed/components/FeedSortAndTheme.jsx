import SortToggle from './SortToggle';
import { useAuth } from '../../auth/hooks/useAuth';
import { useFeedTheme } from '../theme/ThemeContext';

/** 최신/인기 정렬 + 테마 토글(정렬 바로 옆). toolbarStart: 탭 오른쪽 정렬줄 맨 앞(예: 팔로우 목록) */
export default function FeedSortAndTheme({ sortValue, onSortChange, showSort = true, toolbarStart = null }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useFeedTheme();

  return (
    <div className="feed-tabs-controls">
      {toolbarStart}
      {showSort && sortValue != null && typeof onSortChange === 'function' ? (
        <SortToggle value={sortValue} onChange={onSortChange} />
      ) : null}
      {user ? (
        <button
          type="button"
          className="feed-theme-toggle-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? '밝게' : '야간'}
          aria-label={theme === 'dark' ? '라이트 모드' : '다크 모드'}
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
      ) : null}
    </div>
  );
}
