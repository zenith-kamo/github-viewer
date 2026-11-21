// Data access layer.
//
// Metadata/search: GitHub REST API (official or a mirror).
// File tree:       jsDelivr data API, GitHub git/trees, or ungh.
// File contents:   jsDelivr CDN (or another template) with raw fallbacks.
//
// Every endpoint is configurable (see config.js) so the viewer still works
// when github.com itself is unreachable.

import {
  getConfig, buildUrl, joinUrl, isOfficialApi, getOrder, rememberEndpoint,
  API_FALLBACKS, CDN_FALLBACKS, RAW_FALLBACKS,
} from './config.js';

const TOKEN_KEY = 'ghm.token';

export const rate = { limit: null, remaining: null, reset: null, searchRemaining: null, searchLimit: null };
const rateListeners = new Set();

export function onRateChange(fn) {
  rateListeners.add(fn);
  return () => rateListeners.delete(fn);
}
function emitRate() {
  for (const fn of rateListeners) fn(rate);
}

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage disabled */ }
}

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function readRate(headers) {
  const limit = headers.get('x-ratelimit-limit');
  if (!limit) return;
  const resource = headers.get('x-ratelimit-resource');
  const remaining = Number(headers.get('x-ratelimit-remaining'));
  const reset = Number(headers.get('x-ratelimit-reset')) * 1000;
  if (resource === 'search') {
    rate.searchLimit = Number(limit);
    rate.searchRemaining = remaining;
  } else {
    rate.limit = Number(limit);
    rate.remaining = remaining;
    rate.reset = reset;
  }
  emitRate();
}

const DEFINITIVE = new Set([400, 401, 404, 422]);

function apiErrorFor(status, data, token) {
  let message = data?.message || `GitHub API エラー (${status})`;
  if (status === 403 && /rate limit/i.test(message)) {
    message = token
      ? 'API レート制限に達しました。しばらく待つか、接続設定でミラー API を指定してください。'
      : 'API レート制限に達しました。トークンを設定するか、接続設定でミラー API を指定してください。';
  } else if (status === 404) {
    message = 'リポジトリまたはリソースが見つかりません（非公開の可能性があります）。';
  } else if (status === 401) {
    message = 'アクセストークンが無効です。接続設定から確認してください。';
  }
  return new ApiError(message, status, data);
}

async function gh(path, { signal, allowFallback = true } = {}) {
  const cfg = getConfig();
  const bases = allowFallback && cfg.fallback
    ? getOrder('api', cfg.api, API_FALLBACKS)
    : [cfg.api];
  const token = getToken();
  let lastError = null;

  for (const base of bases) {
    const headers = { Accept: 'application/vnd.github+json' };
    if (token && (isOfficialApi(base) || cfg.sendTokenToMirror)) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const res = await fetch(joinUrl(base, path), { headers, signal });
      readRate(res.headers);

      if (res.ok) {
        rememberEndpoint('api', base);
        return res.json();
      }

      let data = null;
      try { data = await res.json(); } catch { /* ignore */ }
      const err = apiErrorFor(res.status, data, token);
      if (DEFINITIVE.has(res.status)) throw err;
      lastError = err;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (err instanceof ApiError && DEFINITIVE.has(err.status)) throw err;
      lastError = err;
    }
  }

  if (lastError instanceof ApiError) throw lastError;
  throw new ApiError(
    'GitHub API に接続できません。接続設定でミラー API を指定してください。',
    0,
  );
}

async function fetchJson(url, { signal } = {}) {
  let res;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(`接続できません: ${url}`, 0);
  }
  if (!res.ok) throw new ApiError(`取得に失敗しました (${res.status})`, res.status);
  return res.json();
}

// --- tiny promise cache -------------------------------------------------

const cache = new Map();

function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < ttl) return hit.promise;
  const promise = fn().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { time: Date.now(), promise });
  return promise;
}

export function clearCache() {
  cache.clear();
}

// --- ungh normalization -------------------------------------------------

function normalizeUnghRepo(data, owner, repo) {
  const r = data?.repo || data || {};
  const license = r.license
    ? { spdx_id: typeof r.license === 'string' ? r.license : (r.license.spdx_id || r.license.name || null) }
    : null;
  return {
    name: r.name || repo,
    full_name: r.repo || `${owner}/${repo}`,
    owner: { login: r.owner || owner },
    description: r.description || '',
    default_branch: r.defaultBranch || r.default_branch || 'main',
    stargazers_count: r.stars ?? r.stargazers_count ?? 0,
    forks_count: r.forks ?? r.forks_count ?? 0,
    subscribers_count: r.watchers ?? r.subscribers_count ?? 0,
    open_issues_count: r.openIssues ?? r.open_issues_count ?? 0,
    language: r.language || null,
    topics: Array.isArray(r.topics) ? r.topics : [],
    license,
    pushed_at: r.pushedAt || r.pushed_at || null,
    html_url: `https://github.com/${owner}/${repo}`,
    homepage: r.homepage || null,
    private: Boolean(r.private),
    archived: Boolean(r.archived),
  };
}

function normalizeUnghTree(data) {
  const list = data?.files || data?.tree || [];
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === 'string') return { path: item.replace(/^\//, ''), size: null };
      const path = item.path || item.name;
      if (!path) return null;
      return { path: String(path).replace(/^\//, ''), size: item.size ?? null };
    })
    .filter(Boolean);
}

// --- endpoints ----------------------------------------------------------

export function getRepo(owner, repo, opts = {}) {
  const cfg = getConfig();
  if (cfg.mode === 'ungh') {
    return cached(`repo:ungh:${owner}/${repo}`, 5 * 60e3, async () => {
      try {
        const data = await fetchJson(joinUrl(cfg.ungh, `/repos/${owner}/${repo}`), opts);
        return normalizeUnghRepo(data, owner, repo);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        return gh(`/repos/${owner}/${repo}`, opts);
      }
    });
  }
  return cached(`repo:${owner}/${repo}`, 5 * 60e3, () => gh(`/repos/${owner}/${repo}`, opts));
}

export function searchRepos(query, { sort = 'stars', page = 1, perPage = 30, signal } = {}) {
  const params = new URLSearchParams({
    q: query,
    sort,
    order: 'desc',
    per_page: String(perPage),
    page: String(page),
  });
  return gh(`/search/repositories?${params}`, { signal });
}

export function getLanguages(owner, repo, opts = {}) {
  const cfg = getConfig();
  if (cfg.mode === 'ungh') return Promise.resolve({});
  return cached(`languages:${owner}/${repo}`, 30 * 60e3, () =>
    gh(`/repos/${owner}/${repo}/languages`, opts));
}

/** README via ungh or the GitHub API (fallback when the tree is unavailable). */
export async function getReadme(owner, repo, ref, opts = {}) {
  const cfg = getConfig();
  if (cfg.mode === 'ungh') {
    try {
      const data = await fetchJson(joinUrl(cfg.ungh, `/repos/${owner}/${repo}/readme`), opts);
      const text = data?.markdown || data?.content || data?.readme;
      if (typeof text === 'string' && text) {
        return { path: data?.path || 'README.md', text };
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      // fall through to the GitHub API
    }
  }

  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const data = await gh(`/repos/${owner}/${repo}/readme${query}`, opts);
  const base64 = String(data.content || '').replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return { path: data.path || 'README.md', text: new TextDecoder().decode(bytes) };
}

/**
 * Full recursive file list for a ref.
 * Order: ungh (if selected) → jsDelivr data API → GitHub git/trees → ungh.
 */
export function getTree(owner, repo, ref, opts = {}) {
  const cfg = getConfig();
  return cached(`tree:${owner}/${repo}@${ref}`, 10 * 60e3, async () => {
    if (cfg.mode === 'ungh') {
      try {
        const files = await unghTree(cfg, owner, repo, ref, opts);
        if (files.length) return files;
      } catch (err) {
        if (err.name === 'AbortError') throw err;
      }
    }

    try {
      const url = buildUrl(cfg.data, { owner, repo, ref });
      const data = await fetchJson(url, opts);
      const files = (data.files || []).map((f) => ({
        path: String(f.name).replace(/^\//, ''),
        size: f.size ?? null,
      }));
      if (files.length) return files;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
    }

    try {
      return await getTreeFromGitHub(owner, repo, ref, opts);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (cfg.mode !== 'ungh') {
        const files = await unghTree(cfg, owner, repo, ref, opts);
        if (files.length) return files;
      }
      throw err;
    }
  });
}

async function unghTree(cfg, owner, repo, ref, opts) {
  const data = await fetchJson(
    joinUrl(cfg.ungh, `/repos/${owner}/${repo}/files/${encodeURIComponent(ref)}`),
    opts,
  );
  return normalizeUnghTree(data);
}

async function getTreeFromGitHub(owner, repo, ref, opts = {}) {
  const data = await gh(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    opts,
  );
  return (data.tree || [])
    .filter((n) => n.type === 'blob')
    .map((n) => ({ path: n.path, size: n.size ?? null }));
}

export function cdnUrl(owner, repo, ref, path) {
  return buildUrl(getConfig().cdn, { owner, repo, ref, path });
}

export function rawUrl(owner, repo, ref, path) {
  return buildUrl(getConfig().raw, { owner, repo, ref, path });
}

/**
 * Fetch a file's bytes. Tries the configured CDN, CDN mirrors, then raw
 * endpoints. Returns { buffer, contentType, url }.
 */
export async function getFile(owner, repo, ref, path, { signal } = {}) {
  const cfg = getConfig();
  const cdnTemplates = cfg.fallback ? getOrder('cdn', cfg.cdn, CDN_FALLBACKS) : [cfg.cdn];
  const rawTemplates = cfg.fallback ? getOrder('raw', cfg.raw, RAW_FALLBACKS) : [cfg.raw];

  const urls = [];
  for (const template of cdnTemplates) {
    urls.push({ kind: 'cdn', template, url: buildUrl(template, { owner, repo, ref, path }) });
  }
  for (const template of rawTemplates) {
    urls.push({ kind: 'raw', template, url: buildUrl(template, { owner, repo, ref, path }) });
  }

  const seen = new Set();
  let lastError = null;

  for (const { kind, template, url } of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        lastError = new ApiError(`ファイルを取得できません (${res.status})`, res.status);
        continue;
      }
      const buffer = await res.arrayBuffer();
      rememberEndpoint(kind, template);
      return { buffer, contentType: res.headers.get('content-type') || '', url };
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
    }
  }
  throw lastError || new ApiError('ファイルを取得できません', 0);
}

export function decodeText(buffer) {
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'tif', 'tiff',
  'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz', 'tar', '7z', 'rar',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'm4a', 'webm', 'ogg', 'wav', 'flac', 'mov', 'avi', 'mkv',
  'wasm', 'exe', 'dll', 'so', 'dylib', 'class', 'jar', 'pyc', 'o', 'a', 'bin',
  'psd', 'ai', 'sketch', 'fig', 'heic', 'db', 'sqlite', 'parquet',
]);

export function isBinaryPath(path) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return BINARY_EXT.has(ext);
}

export function looksBinary(buffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8000));
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

export function isImagePath(path) {
  return /\.(png|jpe?g|gif|webp|avif|ico|bmp|svg)$/i.test(path);
}

export function findReadme(files) {
  const root = files.filter((f) => !f.path.includes('/'));
  const match = root.find((f) => /^readme(\.(md|markdown|mdown|txt|rst))?$/i.test(f.path));
  return match ? match.path : null;
}

// --- connection test ----------------------------------------------------

export async function testEndpoints(cfg) {
  const timeout = (ms) => {
    try { return AbortSignal.timeout(ms); } catch { return undefined; }
  };

  const checks = [
    { name: 'API', url: joinUrl(cfg.api, '/repos/octocat/Hello-World') },
    { name: 'CDN', url: buildUrl(cfg.cdn, { owner: 'octocat', repo: 'Hello-World', ref: 'master', path: 'README' }) },
    { name: 'ファイル一覧', url: buildUrl(cfg.data, { owner: 'octocat', repo: 'Hello-World', ref: 'master' }) },
    { name: 'Raw', url: buildUrl(cfg.raw, { owner: 'octocat', repo: 'Hello-World', ref: 'master', path: 'README' }) },
  ];
  if (cfg.mode === 'ungh') {
    checks.push({ name: 'ungh', url: joinUrl(cfg.ungh, '/repos/octocat/Hello-World') });
  }

  return Promise.all(checks.map(async ({ name, url }) => {
    const start = performance.now();
    try {
      const res = await fetch(url, { signal: timeout(12000) });
      return {
        name,
        url,
        ok: res.ok,
        status: res.status,
        ms: Math.round(performance.now() - start),
      };
    } catch (err) {
      return {
        name,
        url,
        ok: false,
        status: 0,
        ms: Math.round(performance.now() - start),
        error: err?.message || '接続失敗',
      };
    }
  }));
}
