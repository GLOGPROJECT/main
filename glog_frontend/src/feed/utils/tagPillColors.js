/**
 * 태그 문자열 기반 파스텔 배경 + 글자색 (동일 태그는 항상 동일)
 * @param {string} slug
 * @returns {{ background: string, color: string }}
 */
export function getTagPillColors(slug) {
  const s = String(slug || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const sat = 48 + (h % 22);
  return {
    background: `hsl(${hue} ${sat}% 90%)`,
    color: `hsl(${hue} ${Math.min(72, sat + 12)}% 26%)`,
  };
}

/** 구독 사이드바 등: 첫 글자만 대문자 */
export function getTagPillLabelCapitalized(slug) {
  const s = String(slug || '');
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
