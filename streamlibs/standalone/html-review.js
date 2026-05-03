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
} from '../utils/utils.js';
import {
  annotationOperationOnHostPage,
  saveAnnotationChanges,
  persistAnnotationChangesToDA,
  applyRemoteCollabSnapshot,
} from '../operations/annotation.js';

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

function ensureMapperStylesheet() {
  if (document.getElementById(STYLES_LINK_ID)) return;
  try {
    const origin = new URL(import.meta.url).origin;
    const link = document.createElement('link');
    link.id = STYLES_LINK_ID;
    link.rel = 'stylesheet';
    link.href = `${origin}/streamlibs/styles/styles.css`;
    document.head.appendChild(link);
  } catch {
    /* ignore */
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

  ensureMapperStylesheet();
  await ensureStreamMapperForStandalone({ streamServiceEP: cfg.streamServiceEP });
  await initializeTokens(cfg.token);

  // Make sure baseline HTML is captured before annotation rewrites <main>.
  if (!state.cleanMainHtml) captureCleanHtml();

  await annotationOperationOnHostPage({ refreshBaselineHtml: !state.annotationStarted });
  state.annotationStarted = true;

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
    attachMessageListener();
    scheduleCleanHtmlCapture();
    emitReady();
  }
}
