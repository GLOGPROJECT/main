/** 구독(등록) 해시태그 — RegisteredHashtagDirectory 등과 동일 키 */
export const TAG_SUBS_LS_KEY = 'glog:hashtag-subscribe-v1';
export const MAX_TAG_SUBS = 5;

export function readSubscribedTagSlugs() {
  try {
    const raw = localStorage.getItem(TAG_SUBS_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map((s) => String(s)) : [];
  } catch {
    return [];
  }
}

/** 구독(등록) 태그 목록에서 제거 — 피드 해시태그 구독과 동일 저장소 */
export function removeSubscribedTagSlug(slug) {
  const key = String(slug || '').trim().toLowerCase();
  if (!key) return;
  try {
    const cur = readSubscribedTagSlugs();
    const next = cur.filter((s) => s.toLowerCase() !== key);
    localStorage.setItem(TAG_SUBS_LS_KEY, JSON.stringify(next.slice(0, MAX_TAG_SUBS)));
    window.dispatchEvent(new CustomEvent('glog:tag-subs-changed'));
  } catch {
    /* ignore */
  }
}
