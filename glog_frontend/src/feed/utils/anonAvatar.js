/**
 * 익명 게시글 아바타: 10종 PNG (`src/feed/assets/anon/1.png` ~ `10.png`).
 * - DB 연동 후: 계정당 고정 인덱스(0~9)를 `post.anonymousAvatarIndex`로 내려주면 그 값을 우선 사용.
 * - 없으면: `post.id` 문자열로 안정 해시 → 같은 글은 항상 같은 아이콘.
 */

export const ANON_AVATAR_COUNT = 10;

const HUES = [205, 235, 265, 295, 325, 25, 55, 145, 175, 190];

function buildSvgDataUri(index) {
  const h = HUES[index % ANON_AVATAR_COUNT];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="hsl(${h},38%,88%)"/><ellipse cx="32" cy="25" rx="19" ry="17" fill="#fff" stroke="#1e293b" stroke-width="1.8"/><ellipse cx="32" cy="25" rx="13" ry="11" fill="hsl(${h},55%,42%)"/><path d="M14 42c0-4 4-8 18-8s18 4 18 8v10H14z" fill="#fff" stroke="#1e293b" stroke-width="1.8"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Vite가 번들한 PNG URL (1.png~10.png 순서). 없으면 SVG data URI 폴백 */
const pngModules = import.meta.glob('../assets/anon/*.png', { eager: true, query: '?url', import: 'default' });

function buildPngUrlList() {
  const list = [];
  for (let i = 1; i <= ANON_AVATAR_COUNT; i += 1) {
    const entry = Object.entries(pngModules).find(([path]) => path.includes(`/anon/${i}.png`));
    list.push(entry ? entry[1] : buildSvgDataUri(i - 1));
  }
  return list;
}

export const ANON_AVATAR_SRCS = buildPngUrlList();

/** post.id 기준 0~9 (같은 id → 항상 동일) */
export function getStableAnonIndexFromPostId(postId) {
  const s = String(postId);
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (Math.imul(31, hash) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % ANON_AVATAR_COUNT;
}

export function isAnonymousPost(post) {
  if (!post) return false;
  if (post.type === 'anonymous') return true;
  if (post.author?.handle === '익명') return true;
  return false;
}

/** 표시용 인덱스: 서버 값 우선, 없으면 id 기반 */
export function getAnonAvatarIndex(post) {
  const n = post?.anonymousAvatarIndex;
  if (typeof n === 'number' && n >= 0 && n < ANON_AVATAR_COUNT) return n;
  if (isAnonymousPost(post)) return getStableAnonIndexFromPostId(post.id);
  return 0;
}
