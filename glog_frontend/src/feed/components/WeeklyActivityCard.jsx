import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWeeklyActivity } from '../api/feedApi';
import { mondayYmdSeoulWeekContaining } from '../utils/seoulWeek';

const lsSiteKey = (weekKey) => `glog:weekly-site:${weekKey}`;

function formatHm(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const TRACK_PX = 80;

export default function WeeklyActivityCard({ isLoggedIn }) {
  const qc = useQueryClient();
  const [siteSec, setSiteSec] = useState(0);

  const { data, isSuccess, isPending, isError } = useQuery({
    queryKey: ['weekly-activity'],
    queryFn: fetchWeeklyActivity,
    enabled: isLoggedIn,
    staleTime: 20_000,
  });

  useEffect(() => {
    if (!isLoggedIn) {
      setSiteSec(0);
      return;
    }
    const mon = mondayYmdSeoulWeekContaining();
    try {
      const raw = localStorage.getItem(lsSiteKey(mon));
      setSiteSec(raw ? parseInt(raw, 10) || 0 : 0);
    } catch {
      setSiteSec(0);
    }
  }, [isLoggedIn, data?.weekKey]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const mon = mondayYmdSeoulWeekContaining();
      setSiteSec(() => {
        let fromLs = 0;
        try {
          const r = localStorage.getItem(lsSiteKey(mon));
          fromLs = r ? parseInt(r, 10) || 0 : 0;
        } catch {
          /* ignore */
        }
        const next = fromLs + 1;
        try {
          localStorage.setItem(lsSiteKey(mon), String(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    const onNew = () => {
      qc.invalidateQueries({ queryKey: ['weekly-activity'] });
    };
    window.addEventListener('glog:new-post', onNew);
    return () => window.removeEventListener('glog:new-post', onNew);
  }, [isLoggedIn, qc]);

  const days = useMemo(() => {
    if (!isSuccess || !data?.days?.length) {
      return ['월', '화', '수', '목', '금', '토', '일'].map((label) => ({ label, count: 0, isToday: false }));
    }
    return data.days;
  }, [data, isSuccess]);

  const maxCount = data?.maxCount > 0 ? data.maxCount : 1;

  if (!isLoggedIn) {
    return (
      <div className="feed-card feed-week-activity">
        <div className="feed-week-activity-head">
          <div className="feed-week-activity-titles">
            <span className="feed-post-author">이번 주 활동</span>
            <span className="feed-week-activity-sub feed-post-meta">요일별 게시글 수</span>
          </div>
          <span className="feed-week-activity-time feed-post-meta">—</span>
        </div>
        <div className="feed-week-chart" aria-hidden>
          {['월', '화', '수', '목', '금', '토', '일'].map((label) => (
            <div key={label} className="feed-week-bar-col">
              <div className="feed-week-bar-track">
                <div className="feed-week-bar-pill" style={{ height: '8px' }} />
              </div>
              <span className="feed-week-day-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="feed-card feed-week-activity">
        <div className="feed-week-activity-head">
          <div className="feed-week-activity-titles">
            <span className="feed-post-author">이번 주 활동</span>
            <span className="feed-week-activity-sub feed-post-meta">요일별 게시글 수</span>
          </div>
        </div>
        <p className="feed-week-activity-hint feed-post-meta">활동 요약을 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="feed-card feed-week-activity">
        <div className="feed-week-activity-head">
          <div className="feed-week-activity-titles">
            <span className="feed-post-author">이번 주 활동</span>
            <span className="feed-week-activity-sub feed-post-meta">요일별 게시글 수</span>
          </div>
          <span className="feed-week-activity-time feed-post-meta">…</span>
        </div>
        <p className="feed-week-activity-hint feed-post-meta">불러오는 중</p>
      </div>
    );
  }

  return (
    <div className="feed-card feed-week-activity">
      <div className="feed-week-activity-head">
        <div className="feed-week-activity-titles">
          <span className="feed-post-author">이번 주 활동</span>
          <span className="feed-week-activity-sub feed-post-meta">요일별 게시글 수</span>
        </div>
        <span
          className="feed-week-activity-time feed-post-meta"
          title="탭이 보이는 동안 이번 주 누적(매주 월요일 0시 서울 기준 초기화)"
        >
          {formatHm(siteSec)}
        </span>
      </div>
      <div className="feed-week-chart" role="img" aria-label="요일별 이번 주 게시글 수">
        {days.map((d) => {
          const count = Number(d.count) || 0;
          const frac = maxCount > 0 ? count / maxCount : 0;
          const px = count === 0 ? 6 : Math.max(12, Math.round(TRACK_PX * frac));
          const isHi = Boolean(d.isToday || count > 0);
          return (
            <div key={d.ymd ?? d.label} className="feed-week-bar-col">
              <div className="feed-week-bar-track" style={{ height: TRACK_PX }}>
                <div
                  className={`feed-week-bar-pill${isHi ? ' feed-week-bar-pill--today' : ''}`}
                  style={{ height: `${px}px` }}
                />
              </div>
              <span className={`feed-week-day-label${isHi ? ' feed-week-day-label--today' : ''}`}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
