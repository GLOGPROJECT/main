/** GitHub 커밋 스트릭 기준 이름 옆 훈장(가장 높은 단계 하나만) */
export function streakBadgeEmoji(currentStreak) {
  const n = Math.max(0, Math.floor(Number(currentStreak) || 0));
  if (n >= 200) return '👑';
  if (n >= 100) return '🌟';
  if (n >= 30) return '⭐';
  if (n >= 7) return '🔥';
  if (n >= 2) return '🌳';
  if (n >= 1) return '🌱';
  return '';
}
