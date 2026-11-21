// Endpoint configuration. Everything that talks to the network is driven by
// these values so the viewer keeps working when github.com is unreachable.

const KEY = 'ghm.endpoints.v1';
const LAST_KEY = 'ghm.endpoints.last';

export const DEFAULTS = {
  mode: 'github', // 'github' | 'ungh'
  api: 'https://api.github.com',
  cdn: 'https://cdn.jsdelivr.net/gh/{owner}/{repo}@{refEncoded}/{pathEncoded}',
  data: 'https://data.jsdelivr.com/v1/packages/gh/{owner}/{repo}@{refEncoded}?structure=flat',
  raw: 'https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{pathEncoded}',
  ungh: 'https://ungh.cc',
  fallback: true,
  sendTokenToMirror: false,
};

export const API_PRESETS = [
  { label: 'GitHub 公式', value: 'https://api.github.com' },
  { label: 'KKGitHub ミラー', value: 'https://api.kkgithub.com' },
  { label: 'gh-proxy 経由', value: 'https://gh-proxy.com/https://api.github.com' },
  { label: 'ghproxy.net 経由', value: 'https://ghproxy.net/https://api.github.com' },
];

export const CDN_PRESETS = [
  { label: 'jsDelivr', value: 'https://cdn.jsdelivr.net/gh/{owner}/{repo}@{refEncoded}/{pathEncoded}' },
  { label: 'jsDelivr (Fastly)', value: 'https://fastly.jsdelivr.net/gh/{owner}/{repo}@{refEncoded}/{pathEncoded}' },
  { label: 'jsDelivr (Gcore)', value: 'https://gcore.jsdelivr.net/gh/{owner}/{repo}@{refEncoded}/{pathEncoded}' },
  { label: 'jsDelivr ミラー', value: 'https://cdn.jsdmirror.com/gh/{owner}/{repo}@{refEncoded}/{pathEncoded}' },
  { label: 'jsDelivr 中国ミラー', value: 'https://jsd.onmicrosoft.cn/gh/{owner}/{repo}@{refEncoded}/{pathEncoded}' },
  { label: 'Statically', value: 'https://cdn.statically.io/gh/{owner}/{repo}/{ref}/{pathEncoded}' },
  { label: 'raw.githack', value: 'https://raw.githack.com/{owner}/{repo}/{ref}/{pathEncoded}' },
];

export const DATA_PRESETS = [
  { label: 'jsDelivr data', value: 'https://data.jsdelivr.com/v1/packages/gh/{owner}/{repo}@{refEncoded}?structure=flat' },
];

export const RAW_PRESETS = [
  { label: 'GitHub raw', value: 'https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{pathEncoded}' },
  { label: 'gh-proxy 経由', value: 'https://gh-proxy.com/https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{pathEncoded}' },
  { label: 'ghproxy.net 経由', value: 'https://ghproxy.net/https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{pathEncoded}' },
];

export const API_FALLBACKS = [
  'https://api.kkgithub.com',
  'https://gh-proxy.com/https://api.github.com',
  'https://ghproxy.net/https://api.github.com',
];

export const CDN_FALLBACKS = [
  'https://fastly.jsdelivr.net/gh/{owner}/{repo}@{refEncoded}/{pathEncoded}',
  'https://gcore.jsdelivr.net/gh/{owner}/{repo}@{refEncoded}/{pathEncoded}',
  'https://cdn.jsdmirror.com/gh/{owner}/{repo}@{refEncoded}/{pathEncoded}',
  'https://jsd.onmicrosoft.cn/gh/{owner}/{repo}@{refEncoded}/{pathEncoded}',
];

export const RAW_FALLBACKS = [
  'https://gh-proxy.com/https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{pathEncoded}',
  'https://ghproxy.net/https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{pathEncoded}',
];

export function getConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  clearLast();
  return next;
}

export function resetConfig() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  clearLast();
  return { ...DEFAULTS };
}

export function buildUrl(template, { owner = '', repo = '', ref = '', path = '' }) {
  const values = {
    owner: encodeURIComponent(owner),
    repo: encodeURIComponent(repo),
    ref: ref.split('/').map(encodeURIComponent).join('/'),
    refEncoded: encodeURIComponent(ref),
    path: path.split('/').map(encodeURIComponent).join('/'),
    pathEncoded: path.split('/').map(encodeURIComponent).join('/'),
  };
  return String(template).replace(/\{(owner|repo|ref|refEncoded|path|pathEncoded)\}/g, (_, key) => values[key] ?? '');
}

export function joinUrl(base, path) {
  return `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;
}

export function isOfficialApi(base) {
  try { return new URL(base).hostname === 'api.github.com'; } catch { return false; }
}

function getLast() {
  try { return JSON.parse(sessionStorage.getItem(LAST_KEY) || '{}') || {}; } catch { return {}; }
}

export function rememberEndpoint(kind, value) {
  try {
    const last = getLast();
    if (last[kind] === value) return;
    last[kind] = value;
    sessionStorage.setItem(LAST_KEY, JSON.stringify(last));
  } catch { /* ignore */ }
}

export function clearLast() {
  try { sessionStorage.removeItem(LAST_KEY); } catch { /* ignore */ }
}

/** Configured endpoint first, then the last one that worked, then fallbacks. */
export function getOrder(kind, primary, fallbacks) {
  const list = [primary, ...fallbacks].filter(Boolean);
  const last = getLast()[kind];
  if (last && list.includes(last)) {
    return [last, ...list.filter((item) => item !== last)];
  }
  return list;
}
