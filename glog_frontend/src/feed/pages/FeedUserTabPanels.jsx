import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../auth/hooks/useAuth';
import { followUserById, unfollowUserById, fetchFollowingMembers } from '../api/feedApi';
import followIcon from '../assets/follow/follow.png';
import followingIcon from '../assets/follow/following.png';
import unfollowIcon from '../assets/follow/unfollow.png';

const STREAK_ORANGE = '#f59e0b';

function formatYmd(d) {
  if (!d) return '—';
  try {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '—';
    return x.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return '—';
  }
}

/** activity_date → 로컬 달력 YYYY-MM-DD */
function toLocalDayKey(d) {
  if (!d) return null;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localDayKeyFromDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToKey(key, delta) {
  const [y, mo, d] = key.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localDayKeyFromDate(dt);
}

/** 오늘·어제부터 끊김 없이 이어진 현재 스트릭에 속한 기여일 키 (요약과 동일 기준) */
function buildCurrentStreakDayKeys(rows) {
  const keysSet = new Set();
  for (const row of rows) {
    const k = toLocalDayKey(row.activity_date);
    if (k) keysSet.add(k);
  }
  const todayKey = localDayKeyFromDate(new Date());
  const yesterdayKey = addDaysToKey(todayKey, -1);
  const start = keysSet.has(todayKey) ? todayKey : keysSet.has(yesterdayKey) ? yesterdayKey : null;
  const streak = new Set();
  if (!start) return streak;
  let k = start;
  while (keysSet.has(k)) {
    streak.add(k);
    k = addDaysToKey(k, -1);
  }
  return streak;
}

/** 오늘 포함 최근 30일(달력일)만 — API는 최신순 */
function filterContributionDaysLast30(rows) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 29);
  const cutoffMs = cutoff.getTime();
  return rows.filter((row) => {
    const x = new Date(row.activity_date);
    if (Number.isNaN(x.getTime())) return false;
    const dayStart = new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    return dayStart >= cutoffMs;
  });
}

/** 커밋 스트릭 요약 + 기여 인정일 목록 */
export function FeedUserStreakPanel({ userId }) {
  const [profile, setProfile] = useState(null);
  const [days, setDays] = useState([]);
  const [load, setLoad] = useState('loading');
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoad('loading');
    setErr(null);
    Promise.all([
      api.get(`/users/${userId}`),
      api.get(`/users/${userId}/contribution-days`),
    ])
      .then(([pr, dr]) => {
        if (!alive) return;
        setProfile(pr.data);
        setDays(Array.isArray(dr.data?.days) ? dr.data.days : []);
        setLoad('ok');
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e.response?.data?.message || '불러오지 못했습니다.');
        setLoad('error');
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const streakDayKeys = useMemo(() => buildCurrentStreakDayKeys(days), [days]);
  const displayDays = useMemo(() => filterContributionDaysLast30(days), [days]);

  if (load === 'loading') {
    return <p className="feed-post-meta" style={{ margin: '1rem 0' }}>불러오는 중…</p>;
  }
  if (load === 'error') {
    return <p className="feed-compose-error" style={{ margin: '1rem 0' }}>{err}</p>;
  }

  return (
    <div className="feed-card feed-card-surface" style={{ padding: '1rem 1.1rem' }}>
      <p className="feed-post-author" style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>커밋 스트릭 요약</p>
      <p className="feed-post-meta" style={{ margin: '0 0 0.75rem', lineHeight: 1.5 }}>
        현재{' '}
        <strong style={{ color: '#f59e0b' }}>
          {profile?.current_streak ?? 0}일 연속
        </strong>
        {' · '}최대 <strong>{profile?.max_streak ?? 0}일</strong>
        <br />
        위 연속 일수는 <strong>오늘 또는 어제부터</strong> 하루도 빠짐 없이 이어진 기여일만 셉니다. 아래는 GitHub 동기화로 인정된 <strong>최근 30일</strong> 기여일입니다.
      </p>
      {days.length === 0 ? (
        <p className="feed-post-meta" style={{ margin: 0 }}>아직 기록된 기여일이 없습니다. GitHub 연동 후 스트릭 동기화를 해 보세요.</p>
      ) : displayDays.length === 0 ? (
        <p className="feed-post-meta" style={{ margin: 0 }}>최근 30일 안에 인정된 기여일이 없습니다.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {displayDays.map((row, i) => {
            const dk = toLocalDayKey(row.activity_date);
            const inStreak = dk && streakDayKeys.has(dk);
            return (
              <li
                key={`${row.activity_date}-${i}`}
                className="feed-post-meta"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '0.45rem 0',
                  borderBottom: '1px solid var(--feed-border)',
                  fontSize: '0.82rem',
                }}
              >
                <span style={{ color: inStreak ? STREAK_ORANGE : undefined, fontWeight: inStreak ? 600 : undefined }}>
                  기여 인정일 {formatYmd(row.activity_date)}
                </span>
                <span style={{ opacity: 0.75 }}>반영 {formatYmd(row.synced_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const GRADE_IMG = {
  gold: '/goldtrophy.svg',
  silver: '/silvertrophy.svg',
  bronze: '/bronzetrophy.svg',
};

/** 내 프로젝트(트로피) 목록 — onProjectActivate 있으면 클릭 시 콜백만(지구본 피크 모달 등), 없으면 /globe 트로피로 이동 */
export function FeedUserProjectsPanel({ userId, onProjectActivate }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [load, setLoad] = useState('loading');
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoad('loading');
    api
      .get(`/projects/user/${userId}`, { params: { sort: 'latest' } })
      .then(({ data }) => {
        if (!alive) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
        setLoad('ok');
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e.response?.data?.message || '불러오지 못했습니다.');
        setLoad('error');
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (load === 'loading') {
    return <p className="feed-post-meta" style={{ margin: '1rem 0' }}>불러오는 중…</p>;
  }
  if (load === 'error') {
    return <p className="feed-compose-error" style={{ margin: '1rem 0' }}>{err}</p>;
  }
  if (items.length === 0) {
    return (
      <div className="feed-card feed-card-surface" style={{ padding: '1rem 1.1rem' }}>
        <p className="feed-post-meta" style={{ margin: 0 }}>등록된 프로젝트가 없습니다.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {items.map((p) => {
        const g = p.grade && GRADE_IMG[p.grade] ? p.grade : null;
        const pid = p.project_id != null ? Number(p.project_id) : NaN;
        const goTrophyProject = () => {
          if (!Number.isFinite(pid) || pid <= 0) return;
          if (typeof onProjectActivate === 'function') {
            onProjectActivate(pid);
          } else {
            navigate('/globe', { state: { openTrophy: true, openProjectId: pid } });
          }
        };
        return (
          <div
            key={p.project_id}
            role="button"
            tabIndex={0}
            onClick={goTrophyProject}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goTrophyProject();
              }
            }}
            className="feed-card feed-card-surface"
            style={{ padding: '0.75rem 1rem', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
          >
            {g ? (
              <img src={GRADE_IMG[g]} alt="" width={36} height={36} style={{ objectFit: 'contain', flexShrink: 0 }} />
            ) : (
              <span style={{ width: 36, flexShrink: 0 }} aria-hidden>📁</span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="feed-post-author" style={{ fontSize: '0.92rem' }}>{p.title}</div>
              <p className="feed-post-meta" style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', lineHeight: 1.45 }}>
                {(p.description || '').slice(0, 160)}
                {(p.description || '').length > 160 ? '…' : ''}
              </p>
              <p className="feed-post-meta" style={{ margin: '0.35rem 0 0', fontSize: '0.72rem' }}>
                좋아요 {p.likes ?? 0} · 댓글 {p.comments ?? 0}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 팔로워 또는 팔로우 중 목록 — onUserActivate 있으면 행 클릭 시 콜백(지구본 포커스 등), 없으면 피드 유저 링크 */
export function FeedUserFollowPanel({ userId, mode, onUserActivate }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [users, setUsers] = useState([]);
  const [load, setLoad] = useState('loading');
  const [err, setErr] = useState(null);
  const [hoverUnfollowUserId, setHoverUnfollowUserId] = useState(null);

  const isOwnFollowingList = mode === 'following' && user && Number(user.user_id) === Number(userId);

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
    onSuccess: (_data, { userId: targetId, doFollow }) => {
      setHoverUnfollowUserId((cur) => (Number(cur) === Number(targetId) ? null : cur));
      void qc.invalidateQueries({ queryKey: ['feed', 'following-members'] });
      void qc.invalidateQueries({ queryKey: ['feed', 'following'] });
      void qc.invalidateQueries({ queryKey: ['feed', 'trending-developers'] });
      if (isOwnFollowingList && !doFollow) {
        setUsers((prev) => prev.filter((x) => Number(x.user_id) !== Number(targetId)));
      }
    },
  });

  useEffect(() => {
    let alive = true;
    setLoad('loading');
    const path = mode === 'followers' ? `/users/${userId}/followers` : `/users/${userId}/following`;
    api
      .get(path)
      .then(({ data }) => {
        if (!alive) return;
        setUsers(Array.isArray(data?.users) ? data.users : []);
        setLoad('ok');
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e.response?.data?.message || '불러오지 못했습니다.');
        setLoad('error');
      });
    return () => {
      alive = false;
    };
  }, [userId, mode]);

  if (load === 'loading') {
    return <p className="feed-post-meta" style={{ margin: '1rem 0' }}>불러오는 중…</p>;
  }
  if (load === 'error') {
    return <p className="feed-compose-error" style={{ margin: '1rem 0' }}>{err}</p>;
  }
  if (users.length === 0) {
    return (
      <div className="feed-card feed-card-surface" style={{ padding: '1rem 1.1rem' }}>
        <p className="feed-post-meta" style={{ margin: 0 }}>표시할 유저가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="feed-card feed-card-surface" style={{ padding: '0.5rem 0' }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {users.map((u) => {
          const selfRow = Boolean(user && Number(user.user_id) === Number(u.user_id));
          const showFollowBtn = Boolean(user) && !selfRow;
          const iFollow = isOwnFollowingList ? true : followingIdSet.has(Number(u.user_id));
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
          const rowClick = () => {
            if (typeof onUserActivate === 'function') onUserActivate(u);
          };
          const inner = (
            <>
              {u.avatar_url ? (
                <img src={u.avatar_url} alt="" width={40} height={40} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--feed-border)', flexShrink: 0 }} aria-hidden />
              )}
              <span className="feed-post-author" style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.nickname || `유저 #${u.user_id}`}
              </span>
            </>
          );
          return (
            <li
              key={u.user_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '0.55rem 1rem',
                borderBottom: '1px solid var(--feed-border)',
              }}
            >
              {typeof onUserActivate === 'function' ? (
                <button
                  type="button"
                  onClick={rowClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textDecoration: 'none',
                    color: 'inherit',
                    minWidth: 0,
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {inner}
                </button>
              ) : (
                <Link to={`/feed/user/${u.user_id}`} state={{ nickname: u.nickname }} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', minWidth: 0, flex: 1 }}>
                  {inner}
                </Link>
              )}
              <span className="feed-post-meta" style={{ fontSize: '0.72rem', flexShrink: 0 }}>
                {formatYmd(u.since)}
              </span>
              {showFollowBtn ? (
                <button
                  type="button"
                  style={{ ...iconBtn, cursor: busy ? 'wait' : iconBtn.cursor, opacity: busy ? 0.55 : 1 }}
                  aria-label={followLabel}
                  title={followLabel}
                  disabled={busy}
                  onClick={() => followMut.mutate({ userId: u.user_id, doFollow: !iFollow })}
                  onMouseEnter={() => iFollow && setHoverUnfollowUserId(u.user_id)}
                  onMouseLeave={() =>
                    setHoverUnfollowUserId((cur) => (Number(cur) === Number(u.user_id) ? null : cur))
                  }
                >
                  <img src={followSrc} alt="" width={36} height={36} style={iconImg} decoding="async" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
