const axios = require('axios');
const { URL } = require('url');

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function isBlockedHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0') return true;
  if (h.endsWith('.local')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function pickMeta(html, prop, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]+${prop}=["']${esc}["'][^>]+content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${prop}=["']${esc}["']`, 'i');
  let m = html.match(re1);
  if (!m) m = html.match(re2);
  return m ? decodeHtmlEntities(m[1]) : null;
}

function pickTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : null;
}

/**
 * @param {string} rawUrl
 * @returns {Promise<{ url: string, title: string, description: string, image: string }>}
 */
async function fetchOgPreview(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl).trim());
  } catch {
    const e = new Error('유효한 URL이 아닙니다.');
    e.code = 'VALIDATION_ERROR';
    throw e;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    const e = new Error('http 또는 https 주소만 사용할 수 있습니다.');
    e.code = 'VALIDATION_ERROR';
    throw e;
  }
  if (isBlockedHost(u.hostname)) {
    const e = new Error('해당 주소는 미리보기를 지원하지 않습니다.');
    e.code = 'VALIDATION_ERROR';
    throw e;
  }

  const res = await axios.get(u.toString(), {
    timeout: 12000,
    maxRedirects: 5,
    maxContentLength: 2 * 1024 * 1024,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GLogLinkPreview/1.0; +https://glog.local)',
      Accept: 'text/html,application/xhtml+xml',
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const html = String(res.data || '').slice(0, 600000);
  let title =
    pickMeta(html, 'property', 'og:title') ||
    pickMeta(html, 'name', 'twitter:title') ||
    pickTitle(html) ||
    u.hostname;
  let description =
    pickMeta(html, 'property', 'og:description') ||
    pickMeta(html, 'name', 'twitter:description') ||
    pickMeta(html, 'name', 'description') ||
    '';
  let image = pickMeta(html, 'property', 'og:image') || pickMeta(html, 'name', 'twitter:image') || '';
  if (image.startsWith('//')) image = `${u.protocol}${image}`;
  else if (image.startsWith('/')) image = `${u.origin}${image}`;

  return {
    url: u.toString(),
    title: String(title).trim().slice(0, 500) || u.hostname,
    description: String(description).trim().slice(0, 500),
    image: String(image).trim().slice(0, 2048),
  };
}

module.exports = { fetchOgPreview };
