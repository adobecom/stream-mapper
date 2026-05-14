/* eslint-disable prefer-destructuring */
/* eslint-disable no-console */
/**
 * Stream HTML Review (tenant-side).
 *
 * Single ES module the tenant page imports when the URL has ?streamHtmlReview=1.
 * Replaces the older `html-review-bootstrap.js` + `html-review-postmessage-bridge.js` pair.
 *
 * Responsibilities (parent ↔ tenant iframe contract):
 *   1. Capture a clean baseline of <main>.innerHTML once the page is rendered.
 *   2. postMessage(parent, STREAM_HTML_REVIEW_READY) so the parent can enable Start Collab.
 *   3. Reply to STREAM_GET_TARGET_HTML with the captured HTML (used by collab create-page).
 *   4. On STREAM_HTML_REVIEW_INIT, set window.streamConfig (token, collabId, pageUrl, …)
 *      and start htmlRendererStandaloneAnnotation against the live <main>.
 *   5. Forward editor messages: SAVE_ANNOTATION_CHANGES / PUSH_TO_DA / STREAM_COLLAB_SNAPSHOT.
 *   6. Notify parent of Push-to-DA results: PUSH_TO_DA_RESULT.
 */

import {
  initializeTokens,
  ensureStreamMapperForStandalone,
  setLibs,
} from '../utils/utils.js';
import {
  annotationOperationOnHostPage,
  saveAnnotationChanges,
  persistAnnotationChangesToDA,
  applyRemoteCollabSnapshot,
  recordTextRegenAsEdit,
  recordImageRegenAsLocalAsset,
} from '../operations/annotation.js';

/**
 * Stream-mapper's `scripts.js` normally calls setLibs to bootstrap the Milo libs URL,
 * but the tenant page never loads scripts.js. Initialise it ourselves so getConfig()
 * resolves (otherwise getLibs() === undefined → dynamic import of `undefined/utils/utils.js`
 * throws and INIT silently fails).
 */
function initMiloLibs() {
  try {
    setLibs('/libs');
  } catch {
    /* setLibs is a one-shot setter; safe to no-op on re-entry */
  }
}

const MESSAGE = {
  ready: 'STREAM_HTML_REVIEW_READY',
  init: 'STREAM_HTML_REVIEW_INIT',
  getTargetHtml: 'STREAM_GET_TARGET_HTML',
  targetHtml: 'STREAM_TARGET_HTML',
  saveChanges: 'SAVE_ANNOTATION_CHANGES',
  pushToDa: 'PUSH_TO_DA',
  pushToDaResult: 'PUSH_TO_DA_RESULT',
  collabSnapshot: 'STREAM_COLLAB_SNAPSHOT',
  annotationReady: 'STREAM_ANNOTATION_READY',
  previewInteractive: 'STREAM_PREVIEW_INTERACTIVE',
};

const STYLES_LINK_ID = 'stream-mapper-html-review-styles';

const CONTENT_REGEN_STYLES = `
.stream-regen-btn {
  position: fixed;
  display: none;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border-radius: 50%;
  background: #1473e6;
  border: none;
  cursor: pointer;
  z-index: 2147483500;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  padding: 0;
  transition: transform 0.1s, background 0.15s;
}
.stream-regen-btn:hover { transform: scale(1.12); background: #0d66d0; }
.stream-regen-btn.stream-regen-visible { display: flex; }
.stream-regen-btn.stream-regen-loading { background: #888; cursor: wait; pointer-events: none; }
.stream-regen-btn svg { width: 15px; height: 15px; fill: #fff; }
`;

// eslint-disable-next-line max-len
/** Walk up from el to find the first ancestor directly inside a .section div; return its first class. */
function getBlockName(el) {
  let cur = el;
  while (cur && cur !== document.body) {
    const parent = cur.parentElement;
    if (parent && parent.classList.contains('section')) {
      return cur.classList[0] || '';
    }
    cur = parent;
  }
  return '';
}

function getMapperEnvEP() {
  const { origin } = window.location;
  if (origin.includes('dev--')) return 'https://adobe-acom-stream-service-deploy-ethos502-prod-or2-1de07c.cloud.adobe.io';
  if (origin.includes('dev02--')) return 'https://adobe-acom-stream-service-deploy-ethos501-prod-or2-b0c6b7.cloud.adobe.io';
  if (origin.includes('stage--')) return 'https://adobe-acom-stream-service-deploy-ethos502-prod-or2-32c93a.cloud.adobe.io';
  if (origin.includes('main--')) return 'https://adobe-acom-stream-service-deploy-ethos501-prod-or2-ab8ae6.cloud.adobe.io';
  return 'https://adobe-acom-stream-service-deploy-ethos502-prod-or2-1de07c.cloud.adobe.io';
}

function getRegenEndpoint() {
  const ep = (window.streamConfig && window.streamConfig.streamServiceEP) || '';
  if (ep) return `${ep.replace(/\/$/, '')}/api/content-regeneration`;
  return `${getMapperEnvEP()}/api/content-regeneration`;
}

const regenState = {
  btn: null,
  target: null,
  hideTimer: null,
};

function hideRegenBtn() {
  regenState.hideTimer = null;
  if (regenState.btn) regenState.btn.classList.remove('stream-regen-visible');
  regenState.target = null;
}

function scheduleHideRegenBtn() {
  regenState.hideTimer = setTimeout(hideRegenBtn, 180);
}

function cancelHideRegenBtn() {
  if (regenState.hideTimer) {
    clearTimeout(regenState.hideTimer);
    regenState.hideTimer = null;
  }
}

function ensureRegenButton() {
  if (regenState.btn) return regenState.btn;

  const style = document.createElement('style');
  style.id = 'stream-regen-inline-styles';
  style.textContent = CONTENT_REGEN_STYLES;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'stream-regen-btn';
  btn.title = 'Regenerate content';
  btn.setAttribute('aria-label', 'Regenerate content');
  btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74Z"/>'
    + '<path d="M19 15l1.09 2.91L23 19l-2.91 1.09L19 23l-1.09-2.91L15 19l2.91-1.09Z"/>'
    + '</svg>';
  document.body.appendChild(btn);

  btn.addEventListener('mouseenter', cancelHideRegenBtn);
  btn.addEventListener('mouseleave', scheduleHideRegenBtn);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const el = regenState.target;
    if (!el || btn.classList.contains('stream-regen-loading')) return;

    const text = el.textContent.trim();
    if (!text) return;

    const block = getBlockName(el);
    const threadId = new URLSearchParams(window.location.search).get('thread_id') || '';
    const token = (window.streamConfig && window.streamConfig.token) || '';
    const endpoint = getRegenEndpoint();

    btn.classList.add('stream-regen-loading');
    btn.title = 'Regenerating…';

    const fromHtml = el.innerHTML;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, block, thread_id: threadId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const newText = json?.response?.text || json.text || json.content || json.result || '';
      if (newText && el.isConnected) {
        el.textContent = newText;
        recordTextRegenAsEdit(el, text, newText, fromHtml);
      }
    } catch (err) {
      console.error('[stream-html-review] content-regeneration failed', err);
    } finally {
      btn.classList.remove('stream-regen-loading');
      btn.title = 'Regenerate content';
      hideRegenBtn();
    }
  });

  regenState.btn = btn;
  return btn;
}

function showRegenBtn(el) {
  if (window.streamConfig.operation !== 'htmlRendererStandaloneAnnotation') return;
  if (!document.body.classList.contains('annotation-inline-edit-mode')) return;
  cancelHideRegenBtn();
  regenState.target = el;
  const btn = ensureRegenButton();
  const r = el.getBoundingClientRect();
  // Anchor to the top-right corner of the hovered element, slightly inset
  btn.style.top = `${Math.max(4, r.top + 2)}px`;
  btn.style.left = `${r.right - 32}px`;
  btn.classList.add('stream-regen-visible');
}

function attachContentRegenHandlers() {
  const main = document.querySelector('main');
  if (!main) return;

  const TEXT_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th';

  main.addEventListener('mouseover', (e) => {
    const el = e.target.closest(TEXT_SELECTOR);
    if (!el || !el.textContent.trim()) return;
    showRegenBtn(el);
  });

  main.addEventListener('mouseout', (e) => {
    const to = e.relatedTarget;
    if (regenState.btn && (to === regenState.btn || regenState.btn.contains(to))) return;
    // Ignore child-to-child transitions within the same text element
    if (regenState.target && regenState.target.contains(to)) return;
    scheduleHideRegenBtn();
  });

  // Hide on scroll so the button doesn't drift from its target
  window.addEventListener('scroll', hideRegenBtn, { passive: true });
}

// ---------------------------------------------------------------------------
// Image regeneration
// ---------------------------------------------------------------------------

const IMAGE_REGEN_STYLES = `
.stream-img-regen-btn {
  position: fixed;
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border-radius: 50%;
  background: #1473e6;
  border: none;
  cursor: pointer;
  z-index: 2147483500;
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  padding: 0;
  transition: transform 0.1s, background 0.15s;
}
.stream-img-regen-btn:hover { transform: scale(1.1); background: #0d66d0; }
.stream-img-regen-btn.stream-img-regen-visible { display: flex; }
.stream-img-regen-btn svg { width: 16px; height: 16px; fill: #fff; }

.stream-img-prompt-overlay {
  position: fixed;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.22);
  padding: 14px 16px;
  z-index: 2147483600;
  display: none;
  flex-direction: column;
  gap: 10px;
  width: 300px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.stream-img-prompt-overlay.stream-img-prompt-visible { display: flex; }
.stream-img-prompt-overlay label { font-size: 13px; font-weight: 600; color: #222; margin: 0; }
.stream-img-prompt-input {
  border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px;
  font-size: 13px; resize: vertical; min-height: 64px;
  outline: none; font-family: inherit; color: #222;
  line-height: 1.4;
}
.stream-img-prompt-input:focus { border-color: #1473e6; }
.stream-img-prompt-actions { display: flex; gap: 8px; justify-content: flex-end; }
.stream-img-prompt-cancel {
  padding: 6px 14px; border-radius: 6px; border: 1px solid #ccc;
  background: #fff; cursor: pointer; font-size: 13px; color: #555;
}
.stream-img-prompt-cancel:hover { background: #f4f4f4; }
.stream-img-prompt-submit {
  padding: 6px 14px; border-radius: 6px; border: none;
  background: #1473e6; color: #fff; cursor: pointer; font-size: 13px; font-weight: 600;
}
.stream-img-prompt-submit:hover:not(:disabled) { background: #0d66d0; }
.stream-img-prompt-submit:disabled { background: #888; cursor: wait; }
`;

// eslint-disable-next-line no-unused-vars
function restoreRegenImages() {
  document.querySelectorAll('img[data-regen-src]').forEach((img) => {
    img.src = img.dataset.regenSrc;
    delete img.dataset.regenSrc;
    const picture = img.closest('picture');
    if (picture) {
      picture.querySelectorAll('source[data-regen-srcset]').forEach((src) => {
        src.srcset = src.dataset.regenSrcset;
        delete src.dataset.regenSrcset;
      });
    }
  });
}

function getImageRegenEndpoint() {
  return `${getMapperEnvEP()}/api/image-regeneration`;
}

const imgRegenState = {
  btn: null,
  overlay: null,
  target: null,
  hideTimer: null,
};

function hideImgRegenBtn() {
  imgRegenState.hideTimer = null;
  if (imgRegenState.btn) imgRegenState.btn.classList.remove('stream-img-regen-visible');
  if (!imgRegenState.overlay?.classList.contains('stream-img-prompt-visible')) {
    imgRegenState.target = null;
  }
}

function scheduleHideImgRegenBtn() {
  imgRegenState.hideTimer = setTimeout(hideImgRegenBtn, 200);
}

function cancelHideImgRegenBtn() {
  if (imgRegenState.hideTimer) {
    clearTimeout(imgRegenState.hideTimer);
    imgRegenState.hideTimer = null;
  }
}

function hideImgPromptOverlay() {
  if (imgRegenState.overlay) {
    imgRegenState.overlay.classList.remove('stream-img-prompt-visible');
    const input = imgRegenState.overlay.querySelector('.stream-img-prompt-input');
    if (input) input.value = '';
  }
  imgRegenState.target = null;
}

function positionOverlayNearImage(overlay, img) {
  const r = img.getBoundingClientRect();
  const ow = overlay.offsetWidth || 300;
  const oh = overlay.offsetHeight || 160;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = r.left + (r.width - ow) / 2;
  let top = r.top + (r.height - oh) / 2;

  left = Math.max(8, Math.min(left, vw - ow - 8));
  top = Math.max(8, Math.min(top, vh - oh - 8));

  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
}

function ensureImgRegenElements() {
  if (imgRegenState.btn) return;

  const style = document.createElement('style');
  style.id = 'stream-img-regen-styles';
  style.textContent = IMAGE_REGEN_STYLES;
  document.head.appendChild(style);

  // Floating icon button
  const btn = document.createElement('button');
  btn.className = 'stream-img-regen-btn';
  btn.title = 'Regenerate image';
  btn.setAttribute('aria-label', 'Regenerate image');
  // Sparkle / generate icon
  btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74Z"/>'
    + '<path d="M19 15l1.09 2.91L23 19l-2.91 1.09L19 23l-1.09-2.91L15 19l2.91-1.09Z"/>'
    + '</svg>';
  document.body.appendChild(btn);

  btn.addEventListener('mouseenter', cancelHideImgRegenBtn);
  btn.addEventListener('mouseleave', scheduleHideImgRegenBtn);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const img = imgRegenState.target;
    if (!img) return;
    btn.classList.remove('stream-img-regen-visible');
    // eslint-disable-next-line no-use-before-define
    openImgPromptOverlay(img);
  });

  // Prompt overlay
  const overlay = document.createElement('div');
  overlay.className = 'stream-img-prompt-overlay';
  overlay.innerHTML = '<label>Describe the new image</label>'
    + '<textarea class="stream-img-prompt-input" placeholder="e.g. a vibrant teal forest at dusk…" rows="3"></textarea>'
    + '<div class="stream-img-prompt-actions">'
    + '<button class="stream-img-prompt-cancel" type="button">Cancel</button>'
    + '<button class="stream-img-prompt-submit" type="button">Generate</button>'
    + '</div>';
  document.body.appendChild(overlay);

  overlay.querySelector('.stream-img-prompt-cancel').addEventListener('click', hideImgPromptOverlay);

  overlay.querySelector('.stream-img-prompt-submit').addEventListener('click', async () => {
    const img = imgRegenState.target;
    if (!img) return;
    const input = overlay.querySelector('.stream-img-prompt-input');
    const prompt = input.value.trim();
    if (!prompt) { input.focus(); return; }

    const submitBtn = overlay.querySelector('.stream-img-prompt-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating…';

    try {
      const token = (window.streamConfig && window.streamConfig.token) || '';
      const res = await fetch(getImageRegenEndpoint(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const newUrl = json?.response?.imageUrl || json?.response?.url || json.url || json.image_url || json.imageUrl || '';
      if (newUrl && img.isConnected) {
        await recordImageRegenAsLocalAsset(img, newUrl);
      }
    } catch (err) {
      console.error('[stream-html-review] image-generation failed', err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate';
      hideImgPromptOverlay();
    }
  });

  overlay.querySelector('.stream-img-prompt-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideImgPromptOverlay();
  });

  imgRegenState.btn = btn;
  imgRegenState.overlay = overlay;
}

function openImgPromptOverlay(img) {
  ensureImgRegenElements();
  imgRegenState.target = img;
  const overlay = imgRegenState.overlay;
  overlay.classList.add('stream-img-prompt-visible');
  // Position after making visible so offsetWidth/Height are available
  requestAnimationFrame(() => {
    positionOverlayNearImage(overlay, img);
    overlay.querySelector('.stream-img-prompt-input').focus();
  });
}

function showImgRegenBtn(img) {
  if (window.streamConfig.operation !== 'htmlRendererStandaloneAnnotation') return;
  if (!document.body.classList.contains('annotation-asset-select-mode')) return;
  ensureImgRegenElements();
  cancelHideImgRegenBtn();
  imgRegenState.target = img;
  const btn = imgRegenState.btn;
  const r = img.getBoundingClientRect();
  btn.style.top = `${Math.max(4, r.top + 6)}px`;
  btn.style.left = `${r.right - 38}px`;
  btn.classList.add('stream-img-regen-visible');
}

function attachImageRegenHandlers() {
  const main = document.querySelector('main');
  if (!main) return;

  main.addEventListener('mouseover', (e) => {
    const img = e.target.closest('img');
    if (!img) return;
    if (imgRegenState.overlay?.classList.contains('stream-img-prompt-visible')) return;
    showImgRegenBtn(img);
  });

  main.addEventListener('mouseout', (e) => {
    const to = e.relatedTarget;
    if (imgRegenState.overlay?.classList.contains('stream-img-prompt-visible')) return;
    if (imgRegenState.btn && (to === imgRegenState.btn || imgRegenState.btn.contains(to))) return;
    scheduleHideImgRegenBtn();
  });

  // Close overlay on outside click
  document.addEventListener('click', (e) => {
    if (!imgRegenState.overlay?.classList.contains('stream-img-prompt-visible')) return;
    if (!imgRegenState.overlay.contains(e.target)) hideImgPromptOverlay();
  }, true);

  window.addEventListener('scroll', () => {
    hideImgRegenBtn();
    hideImgPromptOverlay();
  }, { passive: true });
}

// ---------------------------------------------------------------------------

const state = {
  initialized: false,
  cleanMainHtml: '',
  annotationStarted: false,
};

function postToParent(msg) {
  if (!window.parent || window.parent === window) return;
  try {
    window.parent.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
}

/**
 * Inline minimum styles so the annotation panel is visible even before the full
 * stream-mapper stylesheet loads (or if the cross-origin link is blocked).
 */
/**
 * Layout note: the real `styles/styles.css` already handles gutter for the panel
 * by scaling `main` (`transform: scale(0.75)`) and switching to a 320px inset
 * on narrower viewports. We intentionally do NOT add `padding-right` to the
 * body here — doing so on top of the stylesheet creates a visible gap between
 * the page content and the panel (figma flow doesn't apply this fallback, so
 * the bug only shows up for HTML Review).
 */
const MINIMAL_PANEL_STYLES = `
.annotation-comments-panel {
  position: fixed; top: 0; right: 0; width: 25%; min-width: 320px;
  height: 100vh; box-sizing: border-box; padding: 12px;
  background: #eef5ff; border-left: 1px solid #cfe1ff; z-index: 2147483000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: flex; flex-direction: column; overflow: hidden;
}
.annotation-comments-panel-header { display: flex; justify-content: space-between; align-items: center; }
.annotation-comments-panel-header h3 { margin: 0; color: #1d4ed8; font-size: 16px; }
.annotation-comments-content { flex: 1 1 auto; overflow: auto; margin-top: 12px; }
.annotation-floating-layer { position: fixed; inset: 0 25% 0 0; pointer-events: none; z-index: 2147482000; }
`;

function ensureMapperStylesheet() {
  if (!document.getElementById('stream-html-review-inline-fallback')) {
    const inline = document.createElement('style');
    inline.id = 'stream-html-review-inline-fallback';
    inline.textContent = MINIMAL_PANEL_STYLES;
    document.head.appendChild(inline);
  }
  if (document.getElementById(STYLES_LINK_ID)) return;
  try {
    const origin = new URL(import.meta.url).origin;
    const link = document.createElement('link');
    link.id = STYLES_LINK_ID;
    link.rel = 'stylesheet';
    link.href = `${origin}/streamlibs/styles/styles.css`;
    link.crossOrigin = 'anonymous';
    link.onload = () => console.log('[stream-html-review] mapper stylesheet loaded', link.href);
    link.onerror = () => console.warn('[stream-html-review] mapper stylesheet failed to load', link.href);
    document.head.appendChild(link);
  } catch (err) {
    console.warn('[stream-html-review] could not attach stylesheet link', err);
  }
}

function readMainHtml() {
  const main = document.querySelector('main');
  if (main && main.innerHTML.trim()) return main.innerHTML;
  const roleMain = document.querySelector('[role="main"]');
  if (roleMain && roleMain.innerHTML.trim()) return roleMain.innerHTML;
  return '';
}

function captureCleanHtml() {
  const html = readMainHtml();
  if (html && html.trim()) {
    state.cleanMainHtml = html;
  }
}

/** Capture once content has actually rendered (DOMContentLoaded + small idle). */
function scheduleCleanHtmlCapture() {
  const tryCapture = () => {
    captureCleanHtml();
    // If still empty, retry briefly to handle late-rendered AEM/SPA content.
    if (!state.cleanMainHtml) {
      setTimeout(captureCleanHtml, 300);
      setTimeout(captureCleanHtml, 1200);
      setTimeout(captureCleanHtml, 2500);
    }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    requestAnimationFrame(tryCapture);
  } else {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(tryCapture), { once: true });
  }
}

function emitReady() {
  const storeId = new URLSearchParams(window.location.search).get('storeId') || '';
  postToParent({
    type: MESSAGE.ready,
    storeId: storeId || undefined,
    href: window.location.href,
  });
}

/** Re-emit READY a few times so we can't lose the race with the parent attaching its listener. */
function emitReadyWithRetries() {
  emitReady();
  const delays = [200, 600, 1500, 3000];
  delays.forEach((ms) => setTimeout(emitReady, ms));
}

function buildStreamConfigFromInit(payload) {
  const incoming = (payload && typeof payload === 'object') ? payload : {};
  const prev = window.streamConfig || {};
  const collabId = incoming.collabId || incoming.collab_id || prev.collabId || prev.collab_id || '';

  return {
    ...prev,
    ...incoming,
    operation: incoming.operation || prev.operation || 'htmlRendererStandaloneAnnotation',
    source: incoming.source || prev.source || 'da',
    collabId,
    collab_id: collabId,
    pageUrl: incoming.targetUrl,
    targetUrl: incoming.pageUrl,
    streamServiceEP: incoming.streamServiceEP || prev.streamServiceEP || '',
    token: incoming.token || prev.token || '',
    jiraId: incoming.jiraId || prev.jiraId || '',
    collabRole: incoming.collabRole || prev.collabRole || new URLSearchParams(window.location.search).get('collabRole') || 'reviewer',
  };
}

async function startAnnotationFromInit(payload) {
  const cfg = buildStreamConfigFromInit(payload);
  if (!cfg.collabId) {
    console.warn('[stream-html-review] INIT missing collabId; ignoring');
    return;
  }
  if (!cfg.pageUrl) {
    console.warn('[stream-html-review] INIT missing pageUrl; ignoring');
    return;
  }
  window.streamConfig = cfg;

  console.log('[stream-html-review] step:ensureMapperStylesheet');
  ensureMapperStylesheet();

  console.log('[stream-html-review] step:initMiloLibs');
  initMiloLibs();

  console.log('[stream-html-review] step:ensureStreamMapperForStandalone');
  try {
    await ensureStreamMapperForStandalone({ streamServiceEP: cfg.streamServiceEP });
  } catch (err) {
    console.error('[stream-html-review] ensureStreamMapperForStandalone failed', err);
    throw err;
  }

  if (cfg.token) {
    console.log('[stream-html-review] step:initializeTokens');
    try {
      await initializeTokens(cfg.token);
    } catch (err) {
      console.error('[stream-html-review] initializeTokens failed', err);
      throw err;
    }
  }

  if (!state.cleanMainHtml) captureCleanHtml();

  const mainEl = document.querySelector('main');
  console.log('[stream-html-review] pre-annotation <main> check', {
    found: !!mainEl,
    childCount: mainEl ? mainEl.children.length : 0,
    cleanHtmlLength: state.cleanMainHtml.length,
  });
  if (!mainEl) {
    console.error(
      '[stream-html-review] no <main> found on page. The bootstrap requires a top-level <main> element.',
    );
    return;
  }

  console.log('[stream-html-review] step:annotationOperationOnHostPage');
  try {
    await annotationOperationOnHostPage({
      refreshBaselineHtml: !state.annotationStarted,
      baselineHtml: state.cleanMainHtml || undefined,
    });
  } catch (err) {
    console.error('[stream-html-review] annotationOperationOnHostPage failed', err);
    throw err;
  }
  state.annotationStarted = true;

  const panelEl = document.querySelector('.annotation-comments-panel');
  console.log('[stream-html-review] annotation mounted', {
    hasPanel: !!panelEl,
    bodyHasMode: document.body.classList.contains('annotation-mode'),
  });

  postToParent({ type: MESSAGE.annotationReady });
  postToParent({ type: MESSAGE.previewInteractive, ready: true });
}

function attachMessageListener() {
  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === MESSAGE.getTargetHtml && data.requestId) {
      // Always prefer the captured baseline; fall back to live read if empty.
      const bodyHtml = state.cleanMainHtml || readMainHtml();
      postToParent({
        type: MESSAGE.targetHtml,
        requestId: data.requestId,
        bodyHtml,
        storeId: data.storeId,
      });
      return;
    }
    if (data.type === MESSAGE.init) {
      try {
        await startAnnotationFromInit(data.streamConfig || {});
      } catch (err) {
        console.error('[stream-html-review] INIT failed', err);
      }
      return;
    }

    if (data.type === MESSAGE.saveChanges) {
      try {
        await saveAnnotationChanges();
      } catch (err) {
        console.error('[stream-html-review] save failed', err);
      }
      return;
    }

    if (data.type === MESSAGE.pushToDa) {
      try {
        await persistAnnotationChangesToDA();
        postToParent({ type: MESSAGE.pushToDaResult, success: true, message: '' });
      } catch (err) {
        console.error('[stream-html-review] push to DA failed', err);
        postToParent({
          type: MESSAGE.pushToDaResult,
          success: false,
          message: err?.message ? String(err.message) : 'Push to DA failed',
        });
      }
      return;
    }

    if (data.type === MESSAGE.collabSnapshot) {
      try {
        applyRemoteCollabSnapshot(data.payload || {});
      } catch (err) {
        console.error('[stream-html-review] snapshot apply failed', err);
      }
    }
  });
}

if (!state.initialized) {
  state.initialized = true;

  const params = new URLSearchParams(window.location.search);
  if (params.get('streamHtmlReview') === '1') {
    console.log('[stream-html-review] bootstrap loaded', {
      href: window.location.href,
    });
    attachMessageListener();
    scheduleCleanHtmlCapture();
    emitReadyWithRetries();
    attachContentRegenHandlers();
    attachImageRegenHandlers();

    // Standalone self-test mode: opening the URL in a plain tab (no parent window)
    // auto-fires INIT with values from the URL so the annotation panel mounts.
    // Required: streamHtmlReviewAutoInit=1 + collabId; pageUrl defaults to the tenant pathname.
    if (params.get('streamHtmlReviewAutoInit') === '1') {
      const autoCollabId = params.get('collabId') || '';
      if (!autoCollabId) {
        console.warn(
          '[stream-html-review] streamHtmlReviewAutoInit=1 but no collabId param; skipping self-INIT',
        );
      } else {
        const autoPageUrl = (() => {
          const fromParam = (params.get('pageUrl') || '').trim();
          if (fromParam) return fromParam;
          const seg = window.location.pathname.replace(/^\/+|\/+$/g, '');
          return seg ? `adobecom/da-cc/${seg}` : '';
        })();
        const selfStreamConfig = {
          token: params.get('token') || '',
          streamServiceEP: params.get('streamServiceEP') || '',
          collabId: autoCollabId,
          collab_id: autoCollabId,
          jiraId: params.get('jiraId') || '',
          pageUrl: autoPageUrl,
          targetUrl: autoPageUrl,
          source: 'da',
          operation: 'htmlRendererStandaloneAnnotation',
          inlineEditingAllowed: params.get('inlineEditingAllowed') !== 'false',
          collabRole: params.get('collabRole') || 'reviewer',
        };
        console.log('[stream-html-review] self-INIT', selfStreamConfig);
        // Defer until after capture has started so cachedCleanHtml is populated.
        setTimeout(() => {
          startAnnotationFromInit(selfStreamConfig).catch((err) => {
            console.error('[stream-html-review] self-INIT failed', err);
          });
        }, 800);
      }
    }
  }
}
