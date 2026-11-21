import {
  getRepo, getTree, getFile, getReadme, getLanguages, searchRepos,
  cdnUrl, rawUrl, decodeText, isBinaryPath, looksBinary, isImagePath,
  findReadme, getToken, setToken, onRateChange, rate, ApiError,
  clearCache, testEndpoints,
} from './api.js';
import {
  getConfig, setConfig, resetConfig,
  API_PRESETS, CDN_PRESETS, DATA_PRESETS, RAW_PRESETS,
} from './config.js';
import { renderMarkdown, escapeHtml as esc } from './markdown.js';
import hljs from 'highlight.js/lib/common';

const app = document.getElementById('app');
const searchInput = document.getElementById('search-input');

let controller = null;
let openEndpointDialog = () => {};

const ICON = {
  folder: '<svg class="icon dir" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>',
  file: '<svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Z"/></svg>',
  star: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>',
  fork: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>',
  eye: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"/></svg>',
  issue: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>',
};

// ---------------------------------------------------------------- helpers

const numFmt = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });
const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'auto' });

const fmtNum = (n) => (n == null ? '—' : numFmt.format(n));

function fmtBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, sec] of units) {
    if (abs >= sec) return rtf.format(Math.round(diff / sec), unit);
  }
  return rtf.format(Math.round(diff), 'second');
}

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Rust: '#dea584',
  Go: '#00ADD8', Java: '#b07219', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600',
  Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF',
  Dart: '#00B4AB', Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c',
  SCSS: '#c6538c', Vue: '#41b883', Svelte: '#ff3e00', Lua: '#000080',
  Haskell: '#5e5086', Elixir: '#6e4a7e', Clojure: '#db5855', Zig: '#ec915c',
  Nix: '#7e7eff', Dockerfile: '#384d54', Makefile: '#427819', Jupyter: '#DA5B0B',
  'Jupyter Notebook': '#DA5B0B', MDX: '#fcb32c', Astro: '#ff5a03',
};

function langColor(lang) {
  return LANG_COLORS[lang] || '#8b949e';
}

const EXT_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
  kts: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp', php: 'php', swift: 'swift', dart: 'dart', sh: 'bash',
  bash: 'bash', zsh: 'bash', fish: 'bash', ps1: 'powershell', lua: 'lua',
  hs: 'haskell', ex: 'elixir', exs: 'elixir', clj: 'clojure', cljs: 'clojure',
  zig: 'zig', nix: 'nix', sql: 'sql', html: 'xml', htm: 'xml', xml: 'xml',
  svg: 'xml', css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  json: 'json', jsonc: 'json', yml: 'yaml', yaml: 'yaml', toml: 'ini',
  ini: 'ini', md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  vue: 'xml', svelte: 'xml', astro: 'xml', dockerfile: 'dockerfile',
  makefile: 'makefile', cmake: 'cmake', gradle: 'groovy', groovy: 'groovy',
  r: 'r', jl: 'julia', pl: 'perl', pm: 'perl', vim: 'vim', diff: 'diff',
  patch: 'diff', graphql: 'graphql', gql: 'graphql', proto: 'protobuf',
};

function langFromPath(path) {
  const name = path.split('/').pop() || '';
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  if (lower === 'cmakelists.txt') return 'cmake';
  const ext = lower.includes('.') ? lower.split('.').pop() : '';
  return EXT_LANG[ext] || '';
}

function isMarkdown(path) {
  return /\.(md|markdown|mdown|mkd|mdx)$/i.test(path);
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function repoHref(owner, repo, kind, ref, path) {
  const base = `#/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  if (!kind) return base;
  return `${base}/${kind}/${encodeURIComponent(ref)}${path ? `/${encodePath(path)}` : ''}`;
}

// ---------------------------------------------------------------- routing

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const segs = pathPart
    .split('/')
    .filter(Boolean)
    .map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  return { segs, query: new URLSearchParams(queryPart) };
}

async function route() {
  if (controller) controller.abort();
  controller = new AbortController();
  const { signal } = controller;
  const { segs, query } = parseRoute();

  try {
    if (segs.length === 0) {
      renderHome();
    } else if (segs[0] === 'search') {
      await renderSearch(query.get('q') || '', Number(query.get('page') || 1), signal);
    } else if (segs.length >= 2) {
      const [owner, repo, kind, ref, ...rest] = segs;
      const path = rest.join('/');
      if (kind === 'tree') {
        await renderTree(owner, repo, ref, path, signal);
      } else if (kind === 'blob') {
        await renderBlob(owner, repo, ref, path, signal);
      } else {
        await renderRepo(owner, repo, signal);
      }
    } else {
      renderHome();
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    renderError(err);
  }
}

function renderError(err) {
  const message = err instanceof ApiError ? err.message : (err?.message || 'エラーが発生しました');
  app.innerHTML = `
    <div class="notice error">
      ${esc(message)}
      <div style="margin-top:10px">
        <button class="btn" type="button" data-open-endpoints>接続設定を開く</button>
      </div>
    </div>`;
  app.querySelector('[data-open-endpoints]')?.addEventListener('click', () => openEndpointDialog());
}

function setTitle(text) {
  document.title = text ? `${text} · GitHub Mirror` : 'GitHub Mirror';
}

// ---------------------------------------------------------------- home

function renderHome() {
  setTitle('');
  const recent = getRecent();
  app.innerHTML = `
    <section class="hero">
      <h1>GitHub を、もっと軽く見る。</h1>
      <p>リポジトリ検索・概要・ファイルツリー・ソース表示。ファイルは jsDelivr CDN から取得するので、GitHub API のレート制限をほとんど消費しません。</p>
      <form class="search" id="hero-search" role="search">
        <svg class="search-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>
        <input type="search" placeholder="リポジトリ検索 / owner/repo" autocomplete="off" spellcheck="false" aria-label="リポジトリ検索">
      </form>
      <div class="quick-links">
        ${['facebook/react', 'microsoft/vscode', 'vercel/next.js', 'tailwindlabs/tailwindcss', 'denoland/deno', 'rust-lang/rust']
          .map((r) => `<a class="chip" href="#/${r}">${r}</a>`).join('')}
      </div>
    </section>
    ${recent.length ? `
      <div class="section-title"><span>最近見たリポジトリ</span><button class="btn ghost" id="clear-recent" type="button">クリア</button></div>
      <div class="repo-grid" id="recent-grid">
        ${recent.map((r) => `
          <a class="repo-card" href="#/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}">
            <div class="name"><span class="owner">${esc(r.owner)} /</span> ${esc(r.repo)}</div>
            <div class="desc">${esc(r.description || '')}</div>
            <div class="meta"><span>${ICON.star} ${fmtNum(r.stars)}</span><span>${timeAgo(r.ts)}</span></div>
          </a>`).join('')}
      </div>` : ''}
  `;

  const form = document.getElementById('hero-search');
  form.addEventListener('submit', onSearchSubmit);
  document.getElementById('clear-recent')?.addEventListener('click', () => {
    localStorage.removeItem('ghm.recent');
    renderHome();
  });
}

function getRecent() {
  try {
    const list = JSON.parse(localStorage.getItem('ghm.recent') || '[]');
    return Array.isArray(list) ? list.slice(0, 8) : [];
  } catch { return []; }
}

function addRecent(repo) {
  try {
    const list = getRecent().filter((r) => !(r.owner === repo.owner.login && r.repo === repo.name));
    list.unshift({
      owner: repo.owner.login,
      repo: repo.name,
      description: repo.description,
      stars: repo.stargazers_count,
      ts: Date.now(),
    });
    localStorage.setItem('ghm.recent', JSON.stringify(list.slice(0, 8)));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------- search

async function renderSearch(q, page, signal) {
  setTitle(q ? `検索: ${q}` : '検索');
  searchInput.value = q;
  if (!q) {
    app.innerHTML = `<div class="notice">検索キーワードを入力してください。</div>`;
    return;
  }

  app.innerHTML = `
    <div class="section-title"><span>「${esc(q)}」の検索結果</span><span class="muted">GitHub リポジトリ検索</span></div>
    <div class="loading-row"><div class="spinner"></div>検索中…</div>`;

  const data = await searchRepos(q, { page, signal });
  if (signal.aborted) return;

  const items = data.items || [];
  const total = data.total_count || 0;
  const perPage = 30;
  const maxPage = Math.min(Math.ceil(total / perPage), 34);

  app.innerHTML = `
    <div class="section-title">
      <span>「${esc(q)}」の検索結果</span>
      <span class="muted">${fmtNum(total)} 件</span>
    </div>
    ${items.length ? `<div class="repo-grid">${items.map(repoCard).join('')}</div>` : `<div class="empty">該当するリポジトリがありません。</div>`}
    ${maxPage > 1 ? `
      <div class="toolbar" style="justify-content:center;margin-top:20px">
        <a class="btn ${page <= 1 ? 'disabled' : ''}" ${page > 1 ? `href="#/search?q=${encodeURIComponent(q)}&page=${page - 1}"` : 'aria-disabled="true"'}>← 前へ</a>
        <span class="muted small">${page} / ${maxPage}</span>
        <a class="btn ${page >= maxPage ? 'disabled' : ''}" ${page < maxPage ? `href="#/search?q=${encodeURIComponent(q)}&page=${page + 1}"` : 'aria-disabled="true"'}>次へ →</a>
      </div>` : ''}
  `;
}

function repoCard(item) {
  return `
    <a class="repo-card" href="#/${encodeURIComponent(item.owner.login)}/${encodeURIComponent(item.name)}">
      <div class="name"><span class="owner">${esc(item.owner.login)} /</span> ${esc(item.name)}</div>
      <div class="desc">${esc(item.description || '説明なし')}</div>
      <div class="meta">
        ${item.language ? `<span><i class="lang-dot" style="background:${langColor(item.language)}"></i>${esc(item.language)}</span>` : ''}
        <span>${ICON.star} ${fmtNum(item.stargazers_count)}</span>
        <span>${ICON.fork} ${fmtNum(item.forks_count)}</span>
        <span>更新 ${timeAgo(item.pushed_at)}</span>
      </div>
    </a>`;
}

// ---------------------------------------------------------------- repo

function repoHeaderHtml(data) {
  const owner = data.owner?.login || '';
  const topics = (data.topics || []).slice(0, 12);
  const license = data.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION'
    ? data.license.spdx_id : null;

  return `
    <section class="repo-head">
      <h1 class="title">
        <span class="owner"><a href="#/search?q=${encodeURIComponent(`user:${owner}`)}">${esc(owner)}</a> /</span>
        <span>${esc(data.name)}</span>
        ${data.private ? '<span class="topic">Private</span>' : ''}
        ${data.archived ? '<span class="topic">Archived</span>' : ''}
      </h1>
      ${data.description ? `<p class="desc">${esc(data.description)}</p>` : ''}
      ${topics.length ? `<div class="topics">${topics.map((t) => `<a class="topic" href="#/search?q=${encodeURIComponent(`topic:${t}`)}">${esc(t)}</a>`).join('')}</div>` : ''}
      <div class="stat-row">
        <span class="stat">${ICON.star} <strong>${fmtNum(data.stargazers_count)}</strong></span>
        <span class="stat">${ICON.fork} <strong>${fmtNum(data.forks_count)}</strong></span>
        <span class="stat">${ICON.eye} <strong>${fmtNum(data.subscribers_count)}</strong></span>
        <span class="stat">${ICON.issue} <strong>${fmtNum(data.open_issues_count)}</strong></span>
        ${data.language ? `<span class="stat"><i class="lang-dot" style="background:${langColor(data.language)}"></i>${esc(data.language)}</span>` : ''}
        ${license ? `<span class="stat">${esc(license)}</span>` : ''}
        <span class="stat">更新 ${timeAgo(data.pushed_at)}</span>
      </div>
      <div id="lang-bar-slot"></div>
      <div class="toolbar" style="margin:14px 0 0">
        <a class="btn" href="${esc(data.html_url)}" target="_blank" rel="noopener noreferrer">GitHub で開く</a>
        ${data.homepage ? `<a class="btn ghost" href="${esc(data.homepage)}" target="_blank" rel="noopener noreferrer">Homepage</a>` : ''}
        <span class="spacer"></span>
        <span class="muted small">default: <code class="mono">${esc(data.default_branch)}</code></span>
      </div>
    </section>`;
}

async function fillLanguages(owner, repo, signal) {
  const slot = document.getElementById('lang-bar-slot');
  if (!slot) return;
  try {
    const langs = await getLanguages(owner, repo, { signal });
    if (signal.aborted || !slot.isConnected) return;
    const entries = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    if (!total) return;
    slot.innerHTML = `
      <div class="lang-bar">${entries.map(([l, v]) => `<span style="width:${(v / total * 100).toFixed(2)}%;background:${langColor(l)}" title="${esc(l)} ${(v / total * 100).toFixed(1)}%"></span>`).join('')}</div>
      <div class="lang-legend">${entries.map(([l, v]) => `<span><i class="lang-dot" style="background:${langColor(l)}"></i>${esc(l)} ${(v / total * 100).toFixed(1)}%</span>`).join('')}</div>`;
  } catch { /* rate limited or unavailable — ignore */ }
}

async function renderRepo(owner, repo, signal) {
  setTitle(`${owner}/${repo}`);
  app.innerHTML = `<div class="loading-row"><div class="spinner"></div>読み込み中…</div>`;

  const data = await getRepo(owner, repo, { signal });
  if (signal.aborted) return;
  addRecent(data);
  setTitle(`${data.full_name}`);

  const branch = data.default_branch;
  app.innerHTML = `
    ${repoHeaderHtml(data)}
    <div id="readme-slot"><div class="loading-row"><div class="spinner"></div>README を読み込み中…</div></div>
    <div class="section-title"><span>ファイル</span><a class="muted small" href="${repoHref(owner, repo, 'tree', branch, '')}">ツリーで開く →</a></div>
    <div class="panel" id="root-files"><div class="loading-row"><div class="spinner"></div>ファイル一覧を読み込み中…</div></div>
  `;

  fillLanguages(owner, repo, signal);

  let tree = null;
  try {
    tree = await getTree(owner, repo, branch, { signal });
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  if (signal.aborted) return;

  const rootSlot = document.getElementById('root-files');
  if (rootSlot) {
    if (tree) {
      const { dirs, files } = listDir(tree, '');
      rootSlot.innerHTML = fileListHtml(owner, repo, branch, dirs, files);
    } else {
      rootSlot.innerHTML = `<div class="empty">ファイル一覧を取得できませんでした。<a href="${repoHref(owner, repo, 'tree', branch, '')}">再試行</a></div>`;
    }
  }

  loadReadme(owner, repo, branch, tree, signal);
}

async function loadReadme(owner, repo, branch, tree, signal) {
  const slot = document.getElementById('readme-slot');
  if (!slot) return;
  try {
    let text;
    let path;
    const readmePath = tree ? findReadme(tree) : null;
    if (readmePath) {
      const file = await getFile(owner, repo, branch, readmePath, { signal });
      text = decodeText(file.buffer);
      path = readmePath;
    } else {
      const res = await getReadme(owner, repo, branch, { signal });
      text = res.text;
      path = res.path;
    }
    if (signal.aborted || !slot.isConnected) return;
    slot.innerHTML = `
      <div class="panel">
        <div class="file-head">
          <span class="path">${esc(path)}</span>
          <a class="btn ghost" href="${repoHref(owner, repo, 'blob', branch, path)}">ソース</a>
        </div>
        <div class="markdown">${renderMarkdown(text, { owner, repo, ref: branch, path })}</div>
      </div>`;
  } catch (err) {
    if (err.name === 'AbortError' || !slot.isConnected) return;
    slot.innerHTML = '';
  }
}

// ---------------------------------------------------------------- tree

function listDir(tree, dir) {
  const prefix = dir ? `${dir.replace(/\/+$/, '')}/` : '';
  const dirs = new Set();
  const files = [];

  for (const entry of tree) {
    if (!entry.path.startsWith(prefix)) continue;
    const rest = entry.path.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf('/');
    if (slash === -1) {
      files.push({ name: rest, path: entry.path, size: entry.size, type: 'file' });
    } else {
      dirs.add(rest.slice(0, slash));
    }
  }

  return {
    dirs: [...dirs].sort((a, b) => a.localeCompare(b)).map((name) => ({
      name, path: `${prefix}${name}`, type: 'dir',
    })),
    files: files.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function fileListHtml(owner, repo, ref, dirs, files) {
  if (!dirs.length && !files.length) {
    return `<div class="empty">このディレクトリは空です。</div>`;
  }
  const rows = [
    ...dirs.map((d) => `
      <li><a href="${repoHref(owner, repo, 'tree', ref, d.path)}">
        ${ICON.folder}<span class="fname">${esc(d.name)}</span>
      </a></li>`),
    ...files.map((f) => `
      <li><a href="${repoHref(owner, repo, 'blob', ref, f.path)}">
        ${ICON.file}<span class="fname">${esc(f.name)}</span>
        <span class="fsize">${fmtBytes(f.size)}</span>
      </a></li>`),
  ];
  return `<ul class="file-list">${rows.join('')}</ul>`;
}

function breadcrumbHtml(owner, repo, ref, path) {
  const parts = path ? path.split('/') : [];
  const items = [`<a href="${repoHref(owner, repo, 'tree', ref, '')}">${esc(repo)}</a>`];
  let acc = '';
  parts.forEach((part, i) => {
    acc = acc ? `${acc}/${part}` : part;
    const isLast = i === parts.length - 1;
    items.push('<span class="sep">/</span>');
    items.push(isLast
      ? `<span class="current">${esc(part)}</span>`
      : `<a href="${repoHref(owner, repo, 'tree', ref, acc)}">${esc(part)}</a>`);
  });
  return `<nav class="breadcrumb" aria-label="パンくず">${items.join('')}</nav>`;
}

function refToolbarHtml(owner, repo, ref) {
  return `
    <div class="toolbar">
      <form class="ref-form" id="ref-form">
        <input id="ref-input" value="${esc(ref)}" aria-label="ブランチ / タグ / コミット" spellcheck="false">
        <button class="btn" type="submit">移動</button>
      </form>
      <span class="spacer"></span>
      <a class="btn ghost" href="https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree/${encodePath(ref)}" target="_blank" rel="noopener noreferrer">GitHub</a>
    </div>`;
}

function wireRefForm(owner, repo, ref, path, kind) {
  const form = document.getElementById('ref-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const next = document.getElementById('ref-input').value.trim();
    if (!next) return;
    location.hash = repoHref(owner, repo, kind, next, path);
  });
}

async function renderTree(owner, repo, ref, path, signal) {
  setTitle(`${owner}/${repo}${path ? `/${path}` : ''}`);
  app.innerHTML = `<div class="loading-row"><div class="spinner"></div>読み込み中…</div>`;

  const data = await getRepo(owner, repo, { signal });
  if (signal.aborted) return;
  const branch = ref || data.default_branch;

  const tree = await getTree(owner, repo, branch, { signal });
  if (signal.aborted) return;

  // If the path is actually a file, show it.
  if (path && tree.some((f) => f.path === path)) {
    await renderBlob(owner, repo, branch, path, signal);
    return;
  }

  const { dirs, files } = listDir(tree, path);

  app.innerHTML = `
    ${repoHeaderHtml(data)}
    ${refToolbarHtml(owner, repo, branch)}
    <div class="panel">
      ${breadcrumbHtml(owner, repo, branch, path)}
      ${fileListHtml(owner, repo, branch, dirs, files)}
    </div>
  `;
  fillLanguages(owner, repo, signal);
  wireRefForm(owner, repo, branch, path, 'tree');
}

// ---------------------------------------------------------------- blob

function renderCode(text, lang) {
  const lines = text.split('\n');
  const MAX_LINES = 20000;
  const shown = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines;
  const source = shown.join('\n');

  let body = null;
  if (shown.length <= 5000) {
    try {
      body = lang && hljs.getLanguage(lang)
        ? hljs.highlight(source, { language: lang, ignoreIllegals: true }).value
        : hljs.highlightAuto(source).value;
    } catch { body = null; }
  }
  if (body == null) body = esc(source);

  const gutter = shown.map((_, i) => i + 1).join('\n');
  const truncated = lines.length > MAX_LINES
    ? `<div class="notice">大きすぎるファイルのため先頭 ${MAX_LINES.toLocaleString()} 行のみ表示しています。</div>`
    : '';

  return `${truncated}<div class="code-wrap"><div class="gutter">${gutter}</div><pre><code class="hljs">${body}</code></pre></div>`;
}

async function renderBlob(owner, repo, ref, path, signal) {
  setTitle(`${owner}/${repo}/${path}`);
  app.innerHTML = `<div class="loading-row"><div class="spinner"></div>ファイルを読み込み中…</div>`;

  const data = await getRepo(owner, repo, { signal });
  if (signal.aborted) return;
  const branch = ref || data.default_branch;

  const file = await getFile(owner, repo, branch, path, { signal });
  if (signal.aborted) return;

  const binary = isBinaryPath(path) || looksBinary(file.buffer);
  const size = file.buffer.byteLength;
  const downloadUrl = cdnUrl(owner, repo, branch, path);
  const rawLink = rawUrl(owner, repo, branch, path);

  let bodyHtml;
  if (binary) {
    bodyHtml = isImagePath(path)
      ? `<div class="binary-preview"><img src="${esc(downloadUrl)}" alt="${esc(path)}"><a class="btn" href="${esc(downloadUrl)}" download>ダウンロード (${fmtBytes(size)})</a></div>`
      : `<div class="binary-preview"><p class="muted">バイナリファイルのため表示できません。</p><a class="btn" href="${esc(downloadUrl)}" download>ダウンロード (${fmtBytes(size)})</a></div>`;
  } else {
    const text = decodeText(file.buffer);
    const lang = langFromPath(path);
    const code = renderCode(text, lang);
    if (isMarkdown(path)) {
      bodyHtml = `
        <div class="toolbar" style="padding:10px 14px;margin:0;border-bottom:1px solid var(--border)">
          <button class="btn" id="md-preview" type="button">プレビュー</button>
          <button class="btn ghost" id="md-source" type="button">ソース</button>
        </div>
        <div id="md-slot"><div class="markdown">${renderMarkdown(text, { owner, repo, ref: branch, path })}</div></div>
        <div id="code-slot" hidden>${code}</div>`;
    } else {
      bodyHtml = code;
    }
  }

  app.innerHTML = `
    ${repoHeaderHtml(data)}
    ${refToolbarHtml(owner, repo, branch)}
    <div class="panel">
      ${breadcrumbHtml(owner, repo, branch, path)}
      <div class="file-head">
        <span class="path">${esc(path)}</span>
        <span class="muted small">${fmtBytes(size)}</span>
        <a class="btn ghost" href="${esc(rawLink)}" target="_blank" rel="noopener noreferrer">Raw</a>
        <a class="btn ghost" href="${esc(downloadUrl)}" download>Download</a>
        <button class="btn ghost" id="copy-path" type="button">パスをコピー</button>
      </div>
      ${bodyHtml}
    </div>
  `;

  fillLanguages(owner, repo, signal);
  wireRefForm(owner, repo, branch, path, 'blob');

  document.getElementById('copy-path')?.addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(path);
      e.currentTarget.textContent = 'コピーしました';
      setTimeout(() => { e.currentTarget.textContent = 'パスをコピー'; }, 1500);
    } catch { /* clipboard unavailable */ }
  });

  const previewBtn = document.getElementById('md-preview');
  const sourceBtn = document.getElementById('md-source');
  if (previewBtn && sourceBtn) {
    const mdSlot = document.getElementById('md-slot');
    const codeSlot = document.getElementById('code-slot');
    const setMode = (preview) => {
      mdSlot.hidden = !preview;
      codeSlot.hidden = preview;
      previewBtn.classList.toggle('ghost', !preview);
      sourceBtn.classList.toggle('ghost', preview);
    };
    previewBtn.addEventListener('click', () => setMode(true));
    sourceBtn.addEventListener('click', () => setMode(false));
  }
}

// ---------------------------------------------------------------- chrome

function onSearchSubmit(e) {
  e.preventDefault();
  const input = e.currentTarget.querySelector('input');
  const q = input.value.trim();
  if (!q) return;
  if (/^[\w.-]+\/[\w.-]+$/.test(q)) {
    const [owner, repo] = q.split('/');
    location.hash = `#/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  } else {
    location.hash = `#/search?q=${encodeURIComponent(q)}`;
  }
}

function updateRateBadge() {
  const badge = document.getElementById('rate-badge');
  const text = document.getElementById('rate-text');
  if (!badge || !text) return;
  if (rate.remaining == null) {
    text.textContent = '—';
    return;
  }
  text.textContent = `${rate.remaining}/${rate.limit}`;
  badge.classList.toggle('warn', rate.remaining <= Math.max(5, rate.limit * 0.2));
  badge.classList.toggle('danger', rate.remaining <= 2);
  badge.title = `GitHub API: 残り ${rate.remaining}/${rate.limit}`
    + (rate.reset ? `（${new Date(rate.reset).toLocaleTimeString('ja-JP')} リセット）` : '')
    + (rate.searchRemaining != null ? ` / 検索: 残り ${rate.searchRemaining}/${rate.searchLimit}` : '');
}

function setupTokenDialog() {
  const dialog = document.getElementById('token-dialog');
  const input = document.getElementById('token-input');
  const status = document.getElementById('token-status');

  const open = () => {
    input.value = getToken();
    status.textContent = getToken() ? 'トークンは保存されています。' : 'トークンは未設定です。';
    dialog.showModal();
  };

  document.getElementById('token-btn').addEventListener('click', open);
  document.getElementById('rate-badge').addEventListener('click', open);
  document.getElementById('token-cancel').addEventListener('click', () => dialog.close());
  document.getElementById('token-clear').addEventListener('click', () => {
    setToken('');
    input.value = '';
    status.textContent = 'トークンを削除しました。';
    updateRateBadge();
  });
  document.getElementById('token-form').addEventListener('submit', (e) => {
    e.preventDefault();
    setToken(input.value.trim());
    status.textContent = input.value.trim() ? '保存しました。' : 'トークンを削除しました。';
    updateRateBadge();
    dialog.close();
  });
}

function setupEndpointDialog() {
  const dialog = document.getElementById('endpoint-dialog');
  const form = document.getElementById('endpoint-form');
  const mode = document.getElementById('ep-mode');
  const api = document.getElementById('ep-api');
  const cdn = document.getElementById('ep-cdn');
  const data = document.getElementById('ep-data');
  const raw = document.getElementById('ep-raw');
  const ungh = document.getElementById('ep-ungh');
  const fallback = document.getElementById('ep-fallback');
  const tokenMirror = document.getElementById('ep-token-mirror');
  const unghField = document.getElementById('ep-ungh-field');
  const result = document.getElementById('ep-test-result');

  const fillDatalist = (id, presets) => {
    const list = document.getElementById(id);
    if (!list) return;
    list.innerHTML = presets
      .map((p) => `<option value="${esc(p.value)}">${esc(p.label)}</option>`)
      .join('');
  };
  fillDatalist('ep-api-presets', API_PRESETS);
  fillDatalist('ep-cdn-presets', CDN_PRESETS);
  fillDatalist('ep-data-presets', DATA_PRESETS);
  fillDatalist('ep-raw-presets', RAW_PRESETS);

  const syncMode = () => {
    unghField.style.display = mode.value === 'ungh' ? '' : 'none';
  };

  const fill = (cfg) => {
    mode.value = cfg.mode;
    api.value = cfg.api;
    cdn.value = cfg.cdn;
    data.value = cfg.data;
    raw.value = cfg.raw;
    ungh.value = cfg.ungh;
    fallback.checked = cfg.fallback;
    tokenMirror.checked = cfg.sendTokenToMirror;
    syncMode();
  };

  const read = () => ({
    mode: mode.value,
    api: api.value.trim(),
    cdn: cdn.value.trim(),
    data: data.value.trim(),
    raw: raw.value.trim(),
    ungh: ungh.value.trim(),
    fallback: fallback.checked,
    sendTokenToMirror: tokenMirror.checked,
  });

  openEndpointDialog = () => {
    fill(getConfig());
    result.innerHTML = '';
    dialog.showModal();
  };

  document.getElementById('endpoint-btn').addEventListener('click', () => openEndpointDialog());
  document.getElementById('ep-cancel').addEventListener('click', () => dialog.close());
  mode.addEventListener('change', syncMode);

  document.getElementById('ep-reset').addEventListener('click', () => {
    const cfg = resetConfig();
    fill(cfg);
    result.innerHTML = '<div class="test-row"><span class="name">初期化しました</span></div>';
    clearCache();
    route();
  });

  document.getElementById('ep-test').addEventListener('click', async () => {
    const cfg = read();
    result.innerHTML = '<div class="test-row"><span class="name">テスト中…</span><span class="spinner"></span></div>';
    const rows = await testEndpoints(cfg);
    result.innerHTML = rows.map((r) => `
      <div class="test-row">
        <span class="name">${esc(r.name)}</span>
        <span class="status ${r.ok ? 'ok' : 'ng'}">${r.ok ? 'OK' : (r.status || 'ERR')}</span>
        <span class="url" title="${esc(r.url)}">${esc(r.url)}</span>
        <span class="ms">${r.ms}ms</span>
      </div>`).join('');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    setConfig(read());
    clearCache();
    dialog.close();
    route();
  });
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
    if (e.key === '/' && !typing) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if (e.key === 'Escape' && document.activeElement === searchInput) {
      searchInput.blur();
    }
  });
}

function init() {
  document.getElementById('search-form').addEventListener('submit', onSearchSubmit);
  setupTokenDialog();
  setupEndpointDialog();
  setupKeyboard();
  onRateChange(updateRateBadge);
  updateRateBadge();
  window.addEventListener('hashchange', route);
  route();
}

init();
