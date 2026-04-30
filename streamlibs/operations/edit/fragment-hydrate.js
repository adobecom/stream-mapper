/**
 * Before Milo loadArea: resolve /fragments/ links in DA blocks with fetch fallback chain
 * (aem.page plain → aem.live plain → admin.da.live/source).
 */
import { getMiloCompatibleHtml } from '../../sources/da.js';

/**
 * Parse main--repo--org.aem.page / .aem.live hostnames.
 * @returns {{ org: string, repo: string, ref: string } | null}
 */
export function parseHelixPreviewHostname(hostname) {
  const h = hostname.toLowerCase();
  const m = h.match(/^(.+)\.aem\.(page|live)$/);
  if (!m) return null;
  const segs = m[1].split('--');
  if (segs.length < 3) return null;
  const org = segs[segs.length - 1];
  const repo = segs[segs.length - 2];
  const ref = segs.slice(0, -2).join('--');
  return { org, repo, ref };
}

/**
 * Repo path org/repo/drafts/.../fragment (no .html) for admin.da.live/source.
 */
export function previewUrlToRepoPath(absoluteUrl) {
  let u;
  try {
    u = new URL(absoluteUrl);
  } catch {
    return null;
  }
  const parts = parseHelixPreviewHostname(u.hostname);
  if (!parts) return null;
  let path = u.pathname.replace(/^\/+/, '');
  if (path.endsWith('.html')) path = path.slice(0, -5);
  else if (path.endsWith('.plain.html')) path = path.slice(0, -'.plain.html'.length);
  path = path.replace(/\/+$/, '');
  return `${parts.org}/${parts.repo}/${path}`.replace(/\/+$/, '');
}

function toPlainHtmlUrl(href) {
  const u = new URL(href);
  u.hash = '';
  u.search = '';
  let p = u.pathname;
  if (/\.plain\.html$/i.test(p)) return u.toString();
  if (p.endsWith('.html')) p = p.slice(0, -5);
  p = p.replace(/\/+$/, '');
  u.pathname = `${p}.plain.html`;
  return u.toString();
}

function swapAemPageToLive(urlString) {
  try {
    const u = new URL(urlString);
    u.hostname = u.hostname.replace(/\.aem\.page$/i, '.aem.live');
    return u.toString();
  } catch {
    return null;
  }
}

/** GET without throwing on !ok (accessibility probe). */
async function fetchTextIfOk(url) {
  try {
    const r = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!r.ok) return null;
    const t = await r.text();
    return t && t.trim() ? t : null;
  } catch {
    return null;
  }
}

async function fetchFragmentFromAdminSource(repoPath) {
  let path = repoPath.replace(/^\/+/, '');
  if (!path.endsWith('.html')) path += '.html';
  const url = `https://admin.da.live/source/${path}`;
  const token = window.streamConfig?.token;
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/html',
        ...(token ? { Authorization: token } : {}),
      },
    });
    if (!r.ok) return null;
    let html = await r.text();
    html = getMiloCompatibleHtml(html);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const mainEl = parsed.querySelector('main');
    const slice = (mainEl ? mainEl.innerHTML : parsed.body.innerHTML).trim();
    return slice || null;
  } catch {
    return null;
  }
}

function sectionsFragmentFromPlainHtml(htmlString) {
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const sections = [...doc.body.querySelectorAll(':scope > div')];
  const frag = document.createDocumentFragment();
  if (sections.length) {
    sections.forEach((s) => frag.appendChild(s.cloneNode(true)));
  } else {
    const wrap = document.createElement('div');
    wrap.innerHTML = doc.body.innerHTML;
    [...wrap.childNodes].forEach((n) => frag.appendChild(n.cloneNode(true)));
  }
  return frag;
}

function dataPathFromRepoPath(repoPath) {
  const clean = repoPath.replace(/^\/+/, '');
  const parts = clean.split('/');
  if (parts.length <= 2) return `/${clean}`;
  return `/${parts.slice(2).join('/')}`;
}

/**
 * Resolve href to fragment body HTML string, with dedupe cache.
 */
function createFragmentResolver() {
  const cache = new Map();

  async function resolve(absoluteHref) {
    const key = previewUrlToRepoPath(absoluteHref) || absoluteHref;
    if (cache.has(key)) return cache.get(key);

    let text = await fetchTextIfOk(toPlainHtmlUrl(absoluteHref));
    if (text) text = getMiloCompatibleHtml(text);
    if (!text) {
      const live = swapAemPageToLive(toPlainHtmlUrl(absoluteHref));
      if (live) {
        text = await fetchTextIfOk(live);
        if (text) text = getMiloCompatibleHtml(text);
      }
    }
    if (!text) {
      const rp = previewUrlToRepoPath(absoluteHref);
      if (rp) text = await fetchFragmentFromAdminSource(rp);
    }

    cache.set(key, text);
    return text;
  }

  return { resolve };
}

function insertFailureBlock(anchorEl) {
  const p = anchorEl.tagName === 'P' ? anchorEl : anchorEl.closest('p');
  const host = p || anchorEl.parentElement;
  if (!host) return;
  const wrap = document.createElement('div');
  wrap.className = 'text broken-placeholder-fragment';
  wrap.setAttribute('data-failed', 'true');
  wrap.textContent = 'Fragment could not be loaded.';
  host.replaceWith(wrap);
}

/**
 * Replace the placeholder (top <p> around the link) with a Milo fragment root and injected sections.
 */
function mountFragmentFromPlain(anchorEl, plainHtml, dataPathAttr) {
  const p = anchorEl.tagName === 'P' ? anchorEl : anchorEl.closest('p');
  const replaceTarget = p || anchorEl.parentElement;
  if (!replaceTarget) return null;

  const inner = sectionsFragmentFromPlainHtml(plainHtml);
  const wrap = document.createElement('div');
  wrap.setAttribute('data-class', 'fragment');
  wrap.setAttribute('data-path', dataPathAttr.startsWith('/') ? dataPathAttr : `/${dataPathAttr}`);
  wrap.setAttribute('data-block-status', 'loaded');
  wrap.appendChild(inner);

  replaceTarget.replaceWith(wrap);
  return wrap;
}

/** Helix preview URL for repo path `org/repo/drafts/...` (matches fragment preview links). */
export function helixPreviewUrlFromRepoPath(repoPath) {
  let path = typeof repoPath === 'string' ? repoPath.trim() : '';
  if (!path) return '';
  if (path.endsWith('.html')) path = path.slice(0, -5);
  path = path.replace(/^\/+/, '');
  const parts = path.split('/');
  const org = parts[0] || '';
  const repo = parts[1] || '';
  const rest = parts.slice(2).join('/');
  const pagePath = rest ? `/${rest.replace(/\/+$/, '')}` : '';
  return `https://main--${repo}--${org}.aem.page${pagePath}`;
}

/**
 * Replace wrapper contents with fetched fragment document HTML (plain.html chain).
 * Use when referencing an existing fragment whose markup differs from the current selection.
 */
export async function fillFragmentWrapperFromRepo(fragmentWrapEl, repoPath) {
  const cleanPath = String(repoPath || '').trim().replace(/^\/+/, '').replace(/\.html$/i, '');
  const previewUrl = helixPreviewUrlFromRepoPath(cleanPath);
  if (!previewUrl) return false;

  const resolver = createFragmentResolver();
  const plain = await resolver.resolve(previewUrl);
  const dataPathAttr = dataPathFromRepoPath(cleanPath);

  fragmentWrapEl.innerHTML = '';
  if (!plain) {
    const wrap = document.createElement('div');
    wrap.className = 'text broken-placeholder-fragment';
    wrap.setAttribute('data-failed', 'true');
    wrap.textContent = 'Fragment could not be loaded.';
    fragmentWrapEl.appendChild(wrap);
    return false;
  }

  const inner = sectionsFragmentFromPlainHtml(plain);
  fragmentWrapEl.appendChild(inner);
  fragmentWrapEl.setAttribute('data-class', 'fragment');
  fragmentWrapEl.setAttribute('data-path', dataPathAttr.startsWith('/') ? dataPathAttr : `/${dataPathAttr}`);
  fragmentWrapEl.setAttribute('data-block-status', 'loaded');
  return true;
}

/**
 * Walk DA-only block roots under `main`, hydrate /fragments/ links before global Milo loadArea.
 * @returns {Promise<Element[]>} inserted .fragment roots (for optional follow-up loadArea)
 */
export async function hydrateFragmentLinksInDaBlocks(mainEl) {
  const inserted = [];
  const daBlocks = mainEl.querySelectorAll(':scope > div[data-source="da"]');
  const resolver = createFragmentResolver();

  for (const block of daBlocks) {
    const anchors = [...block.querySelectorAll('a[href*="/fragments/"]')];

    for (const a of anchors) {
      if (!a.isConnected) continue;

      let absolute;
      try {
        absolute = new URL(a.getAttribute('href'), window.location.href).href;
      } catch {
        // eslint-disable-next-line no-continue
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const plain = await resolver.resolve(absolute);
      const rp = previewUrlToRepoPath(absolute);
      const dataPath = rp ? dataPathFromRepoPath(rp) : '/';

      if (!plain) {
        insertFailureBlock(a);
        // eslint-disable-next-line no-continue
        continue;
      }

      const frag = mountFragmentFromPlain(a, plain, dataPath);
      if (frag) inserted.push(frag);
    }
  }

  return inserted;
}
