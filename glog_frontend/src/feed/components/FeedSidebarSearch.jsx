import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../auth/hooks/useAuth';
import { fetchFollowingMembers, followUserById, unfollowUserById } from '../api/feedApi';
import { fetchSearchAutocomplete, normalizeFeedSearchQ } from '../api/searchApi';
import {
  mergeMeIntoUserSearchIfMatch,
  postContentOrHashtagMatchesQuery,
  projectTitleOrDescriptionMatchesQuery,
} from '../utils/searchQueryMatch';
import followIcon from '../assets/follow/follow.png';
import followingIcon from '../assets/follow/following.png';
import unfollowIcon from '../assets/follow/unfollow.png';
import { getTagPillColors, getTagPillLabelCapitalized } from '../utils/tagPillColors';
import { HeartIcon } from './PostCard';
import { SearchAutocompletePostRow, SearchAutocompleteProjectRow } from './SearchAutocompleteRows';

const DEBOUNCE_MS = 280;

const GRADE_IMG = {
  gold: '/goldtrophy.svg',
  silver: '/silvertrophy.svg',
  bronze: '/bronzetrophy.svg',
};

function clampQ(raw) {
  return normalizeFeedSearchQ(raw);
}

function normalizeTag(raw) {
  let s = String(raw ?? '')
    .replace(/^#+/, '')
    .trim()
    .toLowerCase();
  if (s.length > 100) s = s.slice(0, 100);
  return s;
}

async function tagHasRegisteredPosts(name) {
  const key = normalizeTag(name);
  if (!key) return false;
  try {
    const { data } = await api.get(`/tag/${encodeURIComponent(key)}`, { params: { limit: 1 } });
    const tag = data?.hashtag;
    return Boolean(tag && Number(tag.use_count ?? 0) > 0);
  } catch {
    return false;
  }
}

/** 우측 사이드바: 유저 + 트로피 프로젝트 + 피드 게시글 자동완성 */
export default function FeedSidebarSearch() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  /** 바깥 클릭으로 패널만 접음; 입력란에 글이 있어도 다시 포커스/입력하면 패널 재표시 */
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [hashtags, setHashtags] = useState([]);
  const [autoBusy, setAutoBusy] = useState(false);
  const [noResultForQuery, setNoResultForQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [hoverUnfollowUserId, setHoverUnfollowUserId] = useState(null);
  const navigate = useNavigate();
  const wrapRef = useRef(null);

  const { data: followingMembers = [] } = useQuery({
    queryKey: ['feed', 'following-members'],
    queryFn: fetchFollowingMembers,
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const followingIdSet = useMemo(
    () => new Set(followingMembers.map((m) => Number(m.user_id))),
    [followingMembers],
  );

  const iconBtn = {
    flexShrink: 0,
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    borderRadius: '50%',
    lineHeight: 0,
  };

  const iconImg = { width: 36, height: 36, display: 'block' };

  const followMut = useMutation({
    mutationFn: async ({ userId: targetId, doFollow }) => {
      if (doFollow) await followUserById(targetId);
      else await unfollowUserById(targetId);
    },
    onSuccess: (_data, { userId: targetId }) => {
      setHoverUnfollowUserId((cur) => (Number(cur) === Number(targetId) ? null : cur));
      void qc.invalidateQueries({ queryKey: ['feed', 'following-members'] });
      void qc.invalidateQueries({ queryKey: ['feed', 'following'] });
      void qc.invalidateQueries({ queryKey: ['feed', 'trending-developers'] });
    },
  });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setMsg('');
  }, [q]);

  // 디바운스된 검색어로 자동완성 요청 (포커스와 무관)
  useEffect(() => {
    const prefix = clampQ(debounced);
    if (!prefix) {
      setUsers([]);
      setPosts([]);
      setProjects([]);
      setHashtags([]);
      setAutoBusy(false);
      setNoResultForQuery('');
      return;
    }
    let cancelled = false;
    setAutoBusy(true);
    (async () => {
      try {
        const auto = await fetchSearchAutocomplete(prefix);
        const nextUsers = mergeMeIntoUserSearchIfMatch(auto.users || [], prefix, user);
        const nextPosts = (Array.isArray(auto.posts) ? auto.posts : []).filter((p) =>
          postContentOrHashtagMatchesQuery(p, prefix),
        );
        const nextProjects = (Array.isArray(auto.projects) ? auto.projects : []).filter((row) =>
          projectTitleOrDescriptionMatchesQuery(row, prefix),
        );
        const nextTags = Array.isArray(auto.hashtags) ? auto.hashtags : [];
        if (cancelled) return;
        setUsers(nextUsers);
        setPosts(nextPosts);
        setProjects(nextProjects);
        setHashtags(nextTags);
        const any =
          nextUsers.length + nextPosts.length + nextProjects.length + nextTags.length > 0;
        setNoResultForQuery(any ? '' : prefix);
      } catch {
        if (!cancelled) {
          setUsers([]);
          setPosts([]);
          setProjects([]);
          setHashtags([]);
          setNoResultForQuery(prefix);
        }
      } finally {
        if (!cancelled) setAutoBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, user]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setPanelDismissed(true);
    };
    const qTrim = clampQ(q);
    if (qTrim && !panelDismissed) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [q, panelDismissed]);

  const goUser = useCallback(
    (u) => {
      if (!u?.user_id) return;
      setPanelDismissed(true);
      setMsg('');
      navigate(`/feed/user/${u.user_id}`, { state: { nickname: u.nickname || '' } });
    },
    [navigate],
  );

  const goProject = useCallback(
    (projectId) => {
      const pid = Number(projectId);
      if (!Number.isFinite(pid) || pid <= 0) return;
      setPanelDismissed(true);
      setMsg('');
      navigate('/globe', { state: { openTrophy: true, openProjectId: pid } });
    },
    [navigate],
  );

  const goPost = useCallback(
    (postId) => {
      const pid = Number(postId);
      if (!Number.isFinite(pid) || pid <= 0) return;
      setPanelDismissed(true);
      setMsg('');
      navigate(`/feed/post/${pid}`);
    },
    [navigate],
  );

  const goTag = useCallback(
    (name) => {
      const key = normalizeTag(name);
      if (!key) return;
      setPanelDismissed(true);
      setMsg('');
      navigate(`/tag/${encodeURIComponent(key)}?view=latest`);
    },
    [navigate],
  );

  const submitEnter = useCallback(async () => {
    const raw = clampQ(q);
    if (!raw) return;
    setMsg('');
    const rawLower = raw.toLowerCase();
    try {
      const auto = await fetchSearchAutocomplete(raw);
      const ulist = mergeMeIntoUserSearchIfMatch(auto.users || [], raw, user);
      const plist = (Array.isArray(auto.posts) ? auto.posts : []).filter((p) =>
        postContentOrHashtagMatchesQuery(p, raw),
      );
      const projlist = (Array.isArray(auto.projects) ? auto.projects : []).filter((row) =>
        projectTitleOrDescriptionMatchesQuery(row, raw),
      );
      const hlist = Array.isArray(auto.hashtags) ? auto.hashtags : [];
      setUsers(ulist);
      setPosts(plist);
      setProjects(projlist);
      setHashtags(hlist);

      const exactNick = ulist.find((u) => String(u.nickname || '').toLowerCase() === rawLower);
      if (exactNick) {
        setPanelDismissed(true);
        navigate(`/feed/user/${exactNick.user_id}`, { state: { nickname: exactNick.nickname || '' } });
        return;
      }
      if (ulist.length === 1 && plist.length === 0 && projlist.length === 0 && hlist.length === 0) {
        setPanelDismissed(true);
        navigate(`/feed/user/${ulist[0].user_id}`, { state: { nickname: ulist[0].nickname || '' } });
        return;
      }
      if (projlist.length === 1 && ulist.length === 0 && plist.length === 0 && hlist.length === 0) {
        setPanelDismissed(true);
        navigate('/globe', { state: { openTrophy: true, openProjectId: projlist[0].project_id } });
        return;
      }
      if (plist.length === 1 && ulist.length === 0 && projlist.length === 0 && hlist.length === 0) {
        setPanelDismissed(true);
        navigate(`/feed/post/${plist[0].post_id}`);
        return;
      }
      if (hlist.length === 1 && ulist.length === 0 && plist.length === 0 && projlist.length === 0) {
        setPanelDismissed(true);
        navigate(`/tag/${encodeURIComponent(normalizeTag(hlist[0].name))}?view=latest`);
        return;
      }
      if (ulist.length || plist.length || projlist.length || hlist.length) {
        setPanelDismissed(false);
        return;
      }

      const asTag = normalizeTag(raw);
      if (await tagHasRegisteredPosts(asTag)) {
        setPanelDismissed(true);
        navigate(`/tag/${encodeURIComponent(asTag)}?view=latest`);
        return;
      }

      try {
        const { data } = await api.get('/search', { params: { type: 'user', q: raw, limit: 12 } });
        const fu = mergeMeIntoUserSearchIfMatch(Array.isArray(data?.users) ? data.users : [], raw, user);
        const fuExact = fu.find((u) => String(u.nickname || '').toLowerCase() === rawLower);
        if (fuExact?.user_id != null) {
          setPanelDismissed(true);
          navigate(`/feed/user/${fuExact.user_id}`, { state: { nickname: fuExact.nickname || '' } });
          return;
        }
        if (fu.length === 1) {
          setPanelDismissed(true);
          navigate(`/feed/user/${fu[0].user_id}`, { state: { nickname: fu[0].nickname || '' } });
          return;
        }
        if (fu.length) {
          setUsers(fu.map((u) => ({ user_id: u.user_id, nickname: u.nickname, avatar_url: u.avatar_url ?? null })));
          setPosts([]);
          setProjects([]);
          setHashtags([]);
          setPanelDismissed(false);
          return;
        }
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    setMsg('태그 관련 게시글이 없습니다. 목록에서 유저 또는 항목을 선택해 주세요.');
  }, [q, navigate, user]);

  const qTrim = clampQ(q);
  const debTrim = clampQ(debounced);
  const debouncePending = Boolean(qTrim && qTrim !== debTrim);
  const hasDropdown =
    users.length > 0 || posts.length > 0 || projects.length > 0 || hashtags.length > 0;
  const emptyPanel =
    !debouncePending &&
    !autoBusy &&
    Boolean(noResultForQuery) &&
    debTrim === noResultForQuery &&
    qTrim === debTrim;
  const showDropdown =
    qTrim && !panelDismissed && (debouncePending || autoBusy || hasDropdown || emptyPanel);

  return (
    <div ref={wrapRef} className="feed-sidebar-search-wrap" style={{ position: 'relative' }}>
      <div className="feed-search-wrap">
        <input
          className="feed-search"
          type="text"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="유저/피드/트로피 검색…"
          aria-label="유저·피드·트로피 검색"
          value={q}
          onChange={(e) => {
            setPanelDismissed(false);
            setQ(e.target.value);
          }}
          onFocus={() => setPanelDismissed(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submitEnter();
            }
          }}
        />
      </div>
      {msg ? (
        <p className="feed-compose-error" style={{ margin: '0.4rem 0 0', fontSize: '0.82rem' }}>
          {msg}
        </p>
      ) : null}
      {showDropdown ? (
        <div
          className="feed-card feed-sidebar-search-dropdown"
          style={{
            position: 'absolute',
            zIndex: 2000,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 6,
            padding: '0.4rem 0',
            maxHeight: 'min(70vh, 480px)',
            overflowY: 'auto',
          }}
          role="listbox"
        >
          {debouncePending ? (
            <p className="feed-post-meta" style={{ padding: '0.5rem 0.75rem', margin: 0 }}>
              검색어 반영 중…
            </p>
          ) : autoBusy && !hasDropdown ? (
            <p className="feed-post-meta" style={{ padding: '0.5rem 0.75rem', margin: 0 }}>
              검색 중…
            </p>
          ) : emptyPanel ? (
            <p className="feed-post-meta" style={{ padding: '0.5rem 0.75rem', margin: 0 }}>
              일치하는 유저·게시글·트로피 프로젝트·태그가 없습니다.
            </p>
          ) : null}
          {!debouncePending && users.length > 0 ? (
            <div className="feed-sidebar-search-section" role="group" aria-label="유저">
              <div className="feed-sidebar-search-section-label">유저</div>
              {users.map((u) => {
                const selfRow = Boolean(user && Number(user.user_id) === Number(u.user_id));
                const showFollowBtn = Boolean(user) && !selfRow;
                const iFollow = followingIdSet.has(Number(u.user_id));
                const busy =
                  followMut.isPending && Number(followMut.variables?.userId) === Number(u.user_id);
                const showUnfollowPreview = iFollow && hoverUnfollowUserId === u.user_id;
                let followSrc = followIcon;
                let followLabel = '팔로우';
                if (busy) {
                  if (followMut.variables?.doFollow) {
                    followSrc = followingIcon;
                    followLabel = '처리 중…';
                  } else {
                    followSrc = unfollowIcon;
                    followLabel = '처리 중…';
                  }
                } else if (iFollow) {
                  followSrc = showUnfollowPreview ? unfollowIcon : followingIcon;
                  followLabel = showUnfollowPreview ? '언팔로우' : '팔로잉';
                }
                return (
                  <div
                    key={u.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '0.35rem 0.65rem',
                    }}
                  >
                    <button
                      type="button"
                      className="feed-hashtag-suggest-btn"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        width: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => goUser(u)}
                    >
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt=""
                          width={40}
                          height={40}
                          style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          decoding="async"
                        />
                      ) : (
                        <div
                          className="feed-avatar feed-avatar-sm"
                          style={{ width: 40, height: 40, flexShrink: 0 }}
                          aria-hidden
                        />
                      )}
                      <span className="feed-sidebar-search-user-nick">{u.nickname}</span>
                    </button>
                    {showFollowBtn ? (
                      <button
                        type="button"
                        style={{
                          ...iconBtn,
                          cursor: busy ? 'wait' : iconBtn.cursor,
                          opacity: busy ? 0.55 : 1,
                        }}
                        aria-label={followLabel}
                        title={followLabel}
                        disabled={busy}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          followMut.mutate({ userId: u.user_id, doFollow: !iFollow });
                        }}
                        onMouseEnter={() => iFollow && setHoverUnfollowUserId(u.user_id)}
                        onMouseLeave={() =>
                          setHoverUnfollowUserId((cur) =>
                            Number(cur) === Number(u.user_id) ? null : cur,
                          )
                        }
                      >
                        <img src={followSrc} alt="" width={36} height={36} style={iconImg} decoding="async" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {!debouncePending && hashtags.length > 0 ? (
            <div className="feed-sidebar-search-section" role="group" aria-label="해시태그">
              <div className="feed-sidebar-search-section-label">해시태그</div>
              {hashtags.map((h) => {
                const name = String(h.name ?? '').trim();
                if (!name) return null;
                const pill = getTagPillColors(name);
                return (
                  <button
                    key={h.hashtag_id ?? name}
                    type="button"
                    className="feed-hashtag-suggest-btn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      width: '100%',
                      padding: '0.4rem 0.65rem',
                      textAlign: 'left',
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goTag(name)}
                  >
                    <span
                      style={{
                        ...pill,
                        borderRadius: 999,
                        padding: '0.2rem 0.55rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      #{getTagPillLabelCapitalized(name)}
                    </span>
                    <span className="feed-post-meta" style={{ fontSize: '0.75rem', flexShrink: 0 }}>
                      {Number(h.use_count ?? 0).toLocaleString()}건
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {!debouncePending && projects.length > 0 ? (
            <div className="feed-sidebar-search-section" role="group" aria-label="트로피 프로젝트">
              <div className="feed-sidebar-search-section-label">트로피 프로젝트</div>
              {projects.map((p) => (
                <SearchAutocompleteProjectRow
                  key={p.project_id}
                  row={p}
                  gradeImgMap={GRADE_IMG}
                  onPick={goProject}
                />
              ))}
            </div>
          ) : null}
          {!debouncePending && posts.length > 0 ? (
            <div className="feed-sidebar-search-section" role="group" aria-label="피드 게시글">
              <div className="feed-sidebar-search-section-label">피드 게시글</div>
              {posts.map((dto) => (
                <SearchAutocompletePostRow
                  key={dto.post_id ?? dto.id}
                  dto={dto}
                  onPick={goPost}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
