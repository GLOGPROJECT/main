/** 프로젝트·트로피 목록 row의 grade로 금/은/동 개수 집계 */
export function countTrophiesByGrade(rows) {
  const out = { gold: 0, silver: 0, bronze: 0 };
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const g = row?.grade;
    if (g === 'gold') out.gold += 1;
    else if (g === 'silver') out.silver += 1;
    else if (g === 'bronze') out.bronze += 1;
  }
  return out;
}
