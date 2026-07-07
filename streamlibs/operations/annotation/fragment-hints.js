/* eslint-disable max-len */

import { helixPreviewUrlFromRepoPath } from '../edit/fragment-hydrate.js';

export const FRAGMENT_LABEL_CLASS = 'stream-fragment-path-label';
export const FRAGMENT_HIGHLIGHT_CLASS = 'stream-fragment-highlight';
export const FRAGMENT_READONLY_CLASS = 'stream-fragment-readonly';
const FRAGMENT_READONLY_BODY_CLASS = 'stream-fragment-readonly-body';
const FRAGMENT_READONLY_OVERLAY_CLASS = 'stream-fragment-readonly-overlay';
const FRAGMENT_BLOCKED_TITLE_CLASS = 'stream-fragment-blocked-title';

function getRepoOrgFromPageLocation() {
  try {
    const segs = window.location.hostname.toLowerCase().split('.');
    const aemIdx = segs.findIndex((s) => s === 'aem');
    if (aemIdx < 1) return null;
    const hostParts = segs[aemIdx - 1].split('--');
    if (hostParts.length < 3) return null;
    const org = hostParts[hostParts.length - 1];
    const repo = hostParts[hostParts.length - 2];
    return org && repo ? { org, repo } : null;
  } catch {
    return null;
  }
}

function getRepoOrgFromConfig() {
  const candidates = [
    window.streamConfig?.targetUrl,
    window.streamConfig?.pageUrl,
    window.streamConfig?.contentUrl,
    window.streamConfig?.draftLocation,
  ].filter(Boolean);

  for (const raw of candidates) {
    const trimmed = `${raw}`.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      const hostMatch = trimmed.match(/main--([^-]+)--([^./]+)\.aem\.(?:page|live)/i);
      if (hostMatch) {
        return { org: hostMatch[2], repo: hostMatch[1] };
      }
    }
    const path = trimmed.replace(/^\/+/, '').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 2) return { org: parts[0], repo: parts[1] };
  }

  return getRepoOrgFromPageLocation() || { org: '', repo: '' };
}

function resolveRepoOrg() {
  const fromConfig = getRepoOrgFromConfig();
  if (fromConfig.org && fromConfig.repo) return fromConfig;
  return getRepoOrgFromPageLocation() || fromConfig;
}

function readFragmentDataPath(fragmentEl) {
  if (!(fragmentEl instanceof HTMLElement)) return '';

  const ownPath = fragmentEl.getAttribute('data-path');
  if (ownPath) return ownPath;

  const innerFragment = fragmentEl.querySelector(':scope .fragment[data-path]');
  if (innerFragment?.getAttribute('data-path')) {
    return innerFragment.getAttribute('data-path') || '';
  }

  const nestedPath = fragmentEl.querySelector(':scope [data-path]');
  if (nestedPath?.getAttribute('data-path')) {
    return nestedPath.getAttribute('data-path') || '';
  }

  return '';
}

function buildPreviewUrlFromDataPath(dataPath) {
  if (!dataPath) return '';
  const pagePath = dataPath.startsWith('/') ? dataPath : `/${dataPath}`;
  const { org, repo } = resolveRepoOrg();
  if (org && repo) {
    return `https://main--${repo}--${org}.aem.page${pagePath}`;
  }
  return '';
}

function isNestedFragmentRoot(fragmentEl) {
  const parent = fragmentEl.parentElement;
  if (!parent) return false;
  return Boolean(
    parent.closest('[data-class="fragment"]')
    || parent.closest('div.fragment[data-path]'),
  );
}

function findAnnotationFragmentRoots(mainEl) {
  const roots = [];
  const seen = new Set();

  mainEl.querySelectorAll('[data-class="fragment"]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (isNestedFragmentRoot(el)) return;
    if (seen.has(el)) return;
    seen.add(el);
    roots.push(el);
  });

  mainEl.querySelectorAll('div.fragment[data-path]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (seen.has(el)) return;
    if (isNestedFragmentRoot(el)) return;
    if (el.closest('[data-class="fragment"]')) return;
    seen.add(el);
    roots.push(el);
  });

  mainEl.querySelectorAll('a[href*="/fragments/"]').forEach((anchor) => {
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const fragmentEl = anchor.closest('[data-class="fragment"]')
      || anchor.closest('div.fragment[data-path]');
    if (!(fragmentEl instanceof HTMLElement)) return;
    if (isNestedFragmentRoot(fragmentEl)) return;
    if (seen.has(fragmentEl)) return;
    seen.add(fragmentEl);
    roots.push(fragmentEl);
  });

  return roots;
}

/** True when a panel row already embeds a fragment (including after reprocess from DA). */
export function isFragmentPanelRow(blockEl) {
  if (!(blockEl instanceof HTMLElement)) return false;
  if (blockEl.getAttribute('data-class') === 'fragment') return true;
  if (blockEl.dataset.fragmentBlock === 'true') return true;
  if (blockEl.classList.contains('fragment') && blockEl.hasAttribute('data-path')) return true;
  if (blockEl.querySelector(`.${FRAGMENT_LABEL_CLASS}`)) return true;
  return Boolean(
    blockEl.querySelector(
      '[data-class="fragment"], .fragment[data-path], a[href*="/fragments/"]',
    ),
  );
}

/** Disable create-fragment on rows that already embed a fragment. */
export function syncFragmentBlockControls() {
  document.querySelectorAll(
    '.da-panel > [data-source], .figma-panel > [data-source], .da-panel > [id^="block-"], .figma-panel > [id^="block-"]',
  ).forEach((row) => {
    if (!(row instanceof HTMLElement) || !isFragmentPanelRow(row)) return;
    row.dataset.fragmentBlock = 'true';
    row.querySelectorAll('.block-action-btn').forEach((btn) => btn.remove());
    row.classList.remove('has-block-action');
  });
}

function getEditFragmentIndicatorHost(fragmentEl) {
  const panelRow = fragmentEl.closest(
    '.da-panel > [data-source], .figma-panel > [data-source], .da-panel > [id^="block-"], .figma-panel > [id^="block-"]',
  );
  if (panelRow instanceof HTMLElement) return panelRow;

  const main = fragmentEl.closest('main');
  if (main) {
    let node = fragmentEl;
    while (node.parentElement && node.parentElement !== main) {
      node = node.parentElement;
    }
    if (node.parentElement === main) return node;
  }

  if (fragmentEl.matches('[data-source], [id^="block-"]')) return fragmentEl;
  return fragmentEl;
}

function resolveFragmentPreviewUrl(fragmentEl) {
  if (!(fragmentEl instanceof HTMLElement)) return '';

  const dataPath = readFragmentDataPath(fragmentEl);
  const fromPath = buildPreviewUrlFromDataPath(dataPath);
  if (fromPath) return fromPath;

  const anchor = fragmentEl.querySelector(
    'a[href*="/fragments/"], a[href*="fragments"], a[href*=".aem.page"], a[href*=".aem.live"]',
  );
  if (anchor) {
    try {
      const href = anchor.getAttribute('href') || '';
      return new URL(href, window.location.href).href.replace(/\.html$/, '');
    } catch {
      /* ignore */
    }
  }

  const repoPath = fragmentEl.getAttribute('data-fragment-repo-path');
  if (repoPath) {
    return helixPreviewUrlFromRepoPath(repoPath);
  }

  return '';
}

function truncateUrl(url, max = 72) {
  if (!url || url.length <= max) return url;
  return `${url.slice(0, max)}…`;
}

function createFragmentLink(previewUrl) {
  const link = document.createElement('a');
  link.href = previewUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'stream-fragment-path-link';
  link.title = previewUrl;
  link.textContent = truncateUrl(previewUrl);
  return link;
}

function createFragmentLabel(previewUrl, { linkOnly = false } = {}) {
  const label = document.createElement('div');
  label.className = FRAGMENT_LABEL_CLASS;
  label.setAttribute('role', 'note');

  if (linkOnly) {
    label.appendChild(createFragmentLink(previewUrl));
  } else {
    const prefix = document.createElement('span');
    prefix.className = 'stream-fragment-path-prefix';
    prefix.textContent = 'Fragment';
    label.append(prefix, createFragmentLink(previewUrl));
  }

  return label;
}

function createAnnotationFragmentBanner(previewUrl, dataPath) {
  const label = document.createElement('div');
  label.className = FRAGMENT_LABEL_CLASS;
  label.setAttribute('role', 'note');

  const title = document.createElement('div');
  title.className = FRAGMENT_BLOCKED_TITLE_CLASS;
  title.textContent = 'Fragment edit blocked';
  label.appendChild(title);

  if (previewUrl) {
    label.appendChild(createFragmentLink(previewUrl));
    return label;
  }

  const fallbackUrl = buildPreviewUrlFromDataPath(dataPath);
  if (fallbackUrl) {
    label.appendChild(createFragmentLink(fallbackUrl));
    return label;
  }

  if (dataPath) {
    const pathNote = document.createElement('span');
    pathNote.className = 'stream-fragment-path-fallback';
    pathNote.textContent = dataPath;
    label.appendChild(pathNote);
  }

  return label;
}

function clearAnnotationFragmentChrome(fragmentEl) {
  if (!(fragmentEl instanceof HTMLElement)) return;

  fragmentEl.querySelectorAll(`:scope > .${FRAGMENT_LABEL_CLASS}`).forEach((el) => el.remove());

  const body = fragmentEl.querySelector(`:scope > .${FRAGMENT_READONLY_BODY_CLASS}`);
  if (body) {
    [...body.childNodes].forEach((child) => {
      if (child instanceof HTMLElement && child.classList.contains(FRAGMENT_READONLY_OVERLAY_CLASS)) {
        child.remove();
        return;
      }
      fragmentEl.appendChild(child);
    });
    body.remove();
  }

  fragmentEl.classList.remove(FRAGMENT_READONLY_CLASS);
}

function mountAnnotationFragmentChrome(fragmentEl) {
  if (!(fragmentEl instanceof HTMLElement)) return;
  if (fragmentEl.querySelector(`:scope > .${FRAGMENT_READONLY_BODY_CLASS}`)) return;

  clearAnnotationFragmentChrome(fragmentEl);
  fragmentEl.classList.add(FRAGMENT_READONLY_CLASS);

  const previewUrl = resolveFragmentPreviewUrl(fragmentEl);
  const dataPath = readFragmentDataPath(fragmentEl);
  const banner = createAnnotationFragmentBanner(previewUrl, dataPath);
  fragmentEl.insertBefore(banner, fragmentEl.firstChild);

  const body = document.createElement('div');
  body.className = FRAGMENT_READONLY_BODY_CLASS;

  const overlay = document.createElement('div');
  overlay.className = FRAGMENT_READONLY_OVERLAY_CLASS;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.textContent = 'Fragment edit blocked';

  const movable = [...fragmentEl.children].filter((child) => child !== banner);
  movable.forEach((child) => body.appendChild(child));
  body.appendChild(overlay);
  fragmentEl.appendChild(body);
}

function clearFragmentIndicators(rootEl) {
  if (!(rootEl instanceof HTMLElement)) return;
  rootEl.querySelectorAll('[data-class="fragment"]').forEach((fragmentEl) => {
    if (fragmentEl instanceof HTMLElement) clearAnnotationFragmentChrome(fragmentEl);
  });
  rootEl.querySelectorAll(`.${FRAGMENT_LABEL_CLASS}`).forEach((el) => el.remove());
  rootEl.querySelectorAll(`.${FRAGMENT_HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.remove(FRAGMENT_HIGHLIGHT_CLASS);
  });
}

/**
 * @param {HTMLElement} rootEl
 * @param {{ variant?: 'highlight' | 'link-only', clearOnly?: boolean, blockControls?: boolean }} options
 */
export function syncFragmentPathIndicators(rootEl, options = {}) {
  const {
    variant = 'highlight',
    clearOnly = false,
    blockControls = false,
  } = options;

  if (!(rootEl instanceof HTMLElement)) return;

  clearFragmentIndicators(rootEl);
  if (clearOnly) return;

  const highlight = variant === 'highlight';

  findAnnotationFragmentRoots(rootEl).forEach((fragmentEl) => {
    const host = highlight ? getEditFragmentIndicatorHost(fragmentEl) : fragmentEl;
    const previewUrl = resolveFragmentPreviewUrl(fragmentEl);
    if (!previewUrl) return;

    if (highlight) host.classList.add(FRAGMENT_HIGHLIGHT_CLASS);
    if (!host.querySelector(`:scope > .${FRAGMENT_LABEL_CLASS}`)) {
      host.insertBefore(
        createFragmentLabel(previewUrl, { linkOnly: !highlight }),
        host.firstChild,
      );
    }
  });

  if (blockControls) syncFragmentBlockControls();
}

/** Strip UI-only fragment labels/highlights before cloning blocks into preview HTML. */
export function stripFragmentIndicatorChrome(block) {
  if (!(block instanceof Element)) return;
  if (block.matches('[data-class="fragment"]')) {
    clearAnnotationFragmentChrome(block);
  }
  block.querySelectorAll('[data-class="fragment"]').forEach((fragmentEl) => {
    clearAnnotationFragmentChrome(fragmentEl);
  });
  block.querySelectorAll(`.${FRAGMENT_LABEL_CLASS}`).forEach((el) => el.remove());
  block.classList.remove(
    FRAGMENT_HIGHLIGHT_CLASS,
    FRAGMENT_READONLY_CLASS,
  );
}

/**
 * Annotation / collab canvas: every fragment gets blocked banner, DA link, blur, and overlay.
 */
export default function syncFragmentEditDisabledHints(mainEl, showHints = true) {
  if (!(mainEl instanceof HTMLElement)) return;

  findAnnotationFragmentRoots(mainEl).forEach((fragmentEl) => {
    clearAnnotationFragmentChrome(fragmentEl);
    if (showHints) mountAnnotationFragmentChrome(fragmentEl);
  });
}
