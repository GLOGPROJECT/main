/** 서울(Asia/Seoul) 달력·이번 주 월요일 기준 — 백엔드 주간 활동 API와 동일 규칙 */

const SEOUL_TZ = 'Asia/Seoul';

export function seoulYmdOf(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function seoulWeekdayShort(d) {
  return new Intl.DateTimeFormat('en-US', { timeZone: SEOUL_TZ, weekday: 'short' }).format(d);
}

/** 이번 주를 포함하는 주의 월요일 날짜 YYYY-MM-DD */
export function mondayYmdSeoulWeekContaining(ref = new Date()) {
  let cur = new Date(ref.getTime());
  for (let i = 0; i < 14; i += 1) {
    if (seoulWeekdayShort(cur) === 'Mon') return seoulYmdOf(cur);
    cur = new Date(cur.getTime() - 86400000);
  }
  return seoulYmdOf(ref);
}

export function addCalendarDaysSeoulYmd(ymd, n) {
  const base = new Date(`${ymd}T12:00:00+09:00`);
  return seoulYmdOf(new Date(base.getTime() + n * 86400000));
}
