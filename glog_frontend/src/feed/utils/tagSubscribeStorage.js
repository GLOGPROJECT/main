/** 레거시 단일 키 — 최초 로그인 시 계정 키로만 이전 */
export const TAG_SUBS_LS_KEY = 'glog:hashtag-subscribe-v1';
export const MAX_TAG_SUBS = 5;

export function tagSubsKeyForUser(userId) {
  if (userId == null || userId === '') return null;
  return `glog:hashtag-subscribe-v1-u${userId}`;
}

function parseList(raw) {
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map((s) => String(s)) : [];
  } catch {
    return [];
  }
}

/** userId 없으면 비로그인 → 구독 목록 없음 */
export function readSubscribedTagSlugs(userId) {
  const key = tagSubsKeyForUser(userId);
  if (!key) return [];
  try {
    let list = parseList(localStorage.getItem(key));
    if (list.length === 0) {
      const legacy = parseList(localStorage.getItem(TAG_SUBS_LS_KEY));
      if (legacy.length > 0) {
        list = legacy.slice(0, MAX_TAG_SUBS);
        localStorage.setItem(key, JSON.stringify(list));
        localStorage.removeItem(TAG_SUBS_LS_KEY);
      }
    }
    return list;
  } catch {
    return [];
  }
}

export function writeSubscribedTagSlugs(list, userId) {
  const key = tagSubsKeyForUser(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_TAG_SUBS)));
    window.dispatchEvent(new CustomEvent('glog:tag-subs-changed'));
  } catch {
    /* ignore */
  }
}

export function removeSubscribedTagSlug(slug, userId) {
  const slugKey = String(slug || '').trim().toLowerCase();
  if (!slugKey) return;
  const key = tagSubsKeyForUser(userId);
  if (!key) return;
  try {
    const cur = readSubscribedTagSlugs(userId);
    const next = cur.filter((s) => s.toLowerCase() !== slugKey);
    localStorage.setItem(key, JSON.stringify(next.slice(0, MAX_TAG_SUBS)));
    window.dispatchEvent(new CustomEvent('glog:tag-subs-changed'));
  } catch {
    /* ignore */
  }
}
