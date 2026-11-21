// Markdown rendering for READMEs and .md files.
// marked + DOMPurify + highlight.js are bundled by the build, then relative
// links are rewritten so they stay inside the viewer and images load from the
// configured CDN.

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { cdnUrl } from './api.js';

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u00a0-\uffff\- ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function isExternal(href) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href);
}

function normalizePath(path) {
  const out = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/**
 * @param {string} markdown
 * @param {{owner:string, repo:string, ref:string, path?:string}} ctx
 * @returns {string} sanitized HTML
 */
export function renderMarkdown(markdown, ctx) {
  const { owner, repo, ref, path = '' } = ctx;
  const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

  let html;
  try {
    html = marked.parse(markdown, { gfm: true, breaks: false });
  } catch {
    return `<pre>${escapeHtml(markdown)}</pre>`;
  }

  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'align', 'checked', 'disabled'],
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'],
  });

  const tpl = document.createElement('template');
  tpl.innerHTML = clean;
  const root = tpl.content;

  // Rewrite links and images.
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!href || isExternal(href)) {
      if (/^https?:/i.test(href || '')) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
      continue;
    }
    const [rawPath, hash = ''] = href.split('#');
    const resolved = normalizePath(baseDir ? `${baseDir}/${rawPath}` : rawPath);
    if (!resolved) continue;
    const isDir = rawPath.endsWith('/') || !/\.[a-z0-9]+$/i.test(resolved);
    const kind = isDir ? 'tree' : 'blob';
    a.setAttribute(
      'href',
      `#/${owner}/${repo}/${kind}/${encodeURIComponent(ref)}/${resolved}${hash ? `#${hash}` : ''}`,
    );
  }

  for (const img of root.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (!src || isExternal(src)) continue;
    const resolved = normalizePath(baseDir ? `${baseDir}/${src}` : src);
    if (!resolved) continue;
    img.setAttribute('src', cdnUrl(owner, repo, ref, resolved));
    img.setAttribute('loading', 'lazy');
  }

  // Heading anchors.
  const used = new Map();
  for (const h of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const base = slugify(h.textContent || '');
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    h.id = count ? `${base}-${count}` : base;
  }

  // Syntax highlighting for fenced blocks.
  for (const code of root.querySelectorAll('pre code')) {
    const cls = [...code.classList].find((c) => c.startsWith('language-'));
    const lang = cls ? cls.slice(9) : '';
    try {
      if (lang && hljs.getLanguage(lang)) {
        code.innerHTML = hljs.highlight(code.textContent, {
          language: lang,
          ignoreIllegals: true,
        }).value;
      } else {
        code.innerHTML = hljs.highlightAuto(code.textContent).value;
      }
      code.classList.add('hljs');
    } catch { /* leave plain */ }
  }

  return tpl.innerHTML;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
