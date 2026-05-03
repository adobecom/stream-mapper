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
  const pageUrl = `${incoming.pageUrl || incoming.targetUrl || prev.pageUrl || prev.targetUrl || ''}`.trim();

  return {
    ...prev,
    ...incoming,
    operation: incoming.operation || prev.operation || 'htmlRendererStandaloneAnnotation',
    source: incoming.source || prev.source || 'da',
    collabId,
    collab_id: collabId,
    pageUrl,
    targetUrl: pageUrl,
    streamServiceEP: incoming.streamServiceEP || prev.streamServiceEP || '',
    token: incoming.token || prev.token || '',
    jiraId: incoming.jiraId || prev.jiraId || '',
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
    await annotationOperationOnHostPage({ refreshBaselineHtml: !state.annotationStarted });
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
