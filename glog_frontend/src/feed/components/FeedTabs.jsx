import { NavLink, useMatch } from 'react-router-dom';

const tabClass = ({ isActive }) => `feed-tab ${isActive ? 'feed-tab-active' : ''}`;

export default function FeedTabs() {
  const tagHub = useMatch({ path: '/feed/tag', end: true });
  const tagSlug = useMatch({ path: '/tag/:slug', end: true });
  const hashtagActive = Boolean(tagHub || tagSlug);

  return (
    <div className="feed-tabs-row">
      <NavLink to="/feed" end className={tabClass}>
        전체
      </NavLink>
      <NavLink to="/feed/follow" className={tabClass}>
        팔로우
      </NavLink>
      <NavLink
        to="/feed/tag"
        end
        className={({ isActive }) => `feed-tab ${isActive || hashtagActive ? 'feed-tab-active' : ''}`}
      >
        # 해시태그
      </NavLink>
      <NavLink to="/feed/anonymous" className={tabClass}>
        익명
      </NavLink>
    </div>
  );
}
