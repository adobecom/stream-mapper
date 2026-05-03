/**
 * Tenant-hosted HTML review + annotation (load from stream-mapper origin).
 *
 * If dynamic `import()` is blocked or fails on the tenant, use the classic script
 * `html-review-postmessage-bridge.js` first (postMessage + READY + GET_TARGET_HTML), then load
 * this module for annotation after collab, or rely on STREAM_HTML_REVIEW_INIT only.
 *
 * Tenant page must include this module when `streamHtmlReview=1` is present, e.g.:
 *   if (new URLSearchParams(location.search).has('streamHtmlReview')) {
 *     import('https://<stream-mapper-host>/streamlibs/standalone/html-review-bootstrap.js');
 *   }
 *
 * Flow: iframe loads tenant URL (?storeId=…&streamHtmlReview=1&martech=off). Parent posts
 * STREAM_HTML_REVIEW_INIT with streamConfig (token, collabId, paths). Child starts annotation on <main>.
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

const STYLES_LINK_ID = 'stream-mapper-html-review-styles';
const PUSH_TO_DA_RESULT = 'PUSH_TO_DA_RESULT';

/** First non-empty string among candidates (treats "", null, undefined as empty). */
function firstNonEmpty(...vals) {
  for (const v of vals) {
    const s = `${v ?? ''}`.trim();
    if (s) return s;
  }
  return '';
}

function persistUrlFromCollab(collab) {
  if (!collab || typeof collab !== 'object') return '';
  return firstNonEmpty(
    collab.pageUrl,
    collab.page_url,
    collab.draftLocation,
    collab.draft_location,
    collab.draftPageUrl,
    collab.draft_page_url,
    collab.daPath,
    collab.da_path,
    collab.metadata?.pageUrl,
    collab.metadata?.page_url,
  );
}

function ensureMapperStylesheet() {
  if (document.getElementById(STYLES_LINK_ID)) return;
  const origin = new URL(import.meta.url).origin;
  const link = document.createElement('link');
  link.id = STYLES_LINK_ID;
  link.rel = 'stylesheet';
  link.href = `${origin}/streamlibs/styles/styles.css`;
  document.head.appendChild(link);
}

function postToParent(msg) {
  try {
    window.parent?.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
}

function notifyParentPushToDaResult(success, detailMessage) {
  if (!window.parent || window.parent === window) return;
  postToParent({
    type: PUSH_TO_DA_RESULT,
    success: !!success,
    message: detailMessage ? String(detailMessage) : '',
  });
}

export async function startHtmlReviewStandalone(streamConfig = {}) {
  ensureMapperStylesheet();

  const prev = window.streamConfig || {};
  const incoming =
    streamConfig && typeof streamConfig === 'object' ? streamConfig : {};
  const merged = {
    ...prev,
    ...incoming,
    operation:
      incoming.operation
      || prev.operation
      || 'htmlRendererStandaloneAnnotation',
  };

  const persistUrl = firstNonEmpty(
    incoming.pageUrl,
    incoming.targetUrl,
    incoming.page_url,
    incoming.target_url,
    incoming.daPath,
    incoming.da_path,
    merged.pageUrl,
    merged.targetUrl,
    merged.page_url,
    merged.daPath,
  );
  if (persistUrl) {
    merged.pageUrl = firstNonEmpty(merged.pageUrl, persistUrl);
    merged.targetUrl = firstNonEmpty(
      merged.targetUrl,
      merged.pageUrl,
      persistUrl,
    );
    window.__streamHtmlReviewPersistUrl = persistUrl;
  }

  window.streamConfig = merged;

  await ensureStreamMapperForStandalone({
    streamServiceEP: window.streamConfig.streamServiceEP,
  });
  await initializeTokens(window.streamConfig.token);

  await annotationOperationOnHostPage();

  postToParent({ type: 'STREAM_ANNOTATION_READY' });
  postToParent({ type: 'STREAM_PREVIEW_INTERACTIVE', ready: true });
}

function attachMessageBridge() {
  window.addEventListener('message', async (event) => {
    const { data } = event;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'STREAM_GET_TARGET_HTML' && data.requestId) {
      const main = document.querySelector('main');
      const bodyHtml = main ? main.innerHTML : '';
      postToParent({
        type: 'STREAM_TARGET_HTML',
        requestId: data.requestId,
        bodyHtml,
        storeId: data.storeId,
      });
      return;
    }

    if (data.type === 'STREAM_HTML_REVIEW_INIT') {
      try {
        await startHtmlReviewStandalone(data.streamConfig || {});
      } catch (err) {
        console.error('[stream-html-review] start failed', err);
      }
      return;
    }

    if (data.type === 'SAVE_ANNOTATION_CHANGES') {
      try {
        await saveAnnotationChanges();
      } catch (err) {
        console.error('[stream-html-review] save failed', err);
      }
      return;
    }

    if (data.type === 'PUSH_TO_DA') {
      try {
        await persistAnnotationChangesToDA();
        notifyParentPushToDaResult(true);
      } catch (err) {
        console.error('[stream-html-review] persist to DA failed', err);
        const detail = err?.message ? String(err.message) : '';
        notifyParentPushToDaResult(false, detail);
      }
      return;
    }

    if (data.type === 'STREAM_COLLAB_SNAPSHOT') {
      const payload = data.payload || {};
      const collabPageUrl = persistUrlFromCollab(payload.collab);
      if (collabPageUrl) {
        window.__streamHtmlReviewPersistUrl = collabPageUrl;
        const prevCfg = window.streamConfig || {};
        window.streamConfig = {
          ...prevCfg,
          pageUrl: firstNonEmpty(prevCfg.pageUrl, collabPageUrl),
          targetUrl: firstNonEmpty(
            prevCfg.targetUrl,
            prevCfg.pageUrl,
            collabPageUrl,
          ),
        };
      }
      applyRemoteCollabSnapshot(payload);
      return;
    }
  });
}

if (!window.__streamHtmlReviewBootstrapInit) {
  window.__streamHtmlReviewBootstrapInit = true;
  attachMessageBridge();

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('streamHtmlReview') === '1') {
    const storeId = searchParams.get('storeId') || '';
    postToParent({
      type: 'STREAM_HTML_REVIEW_READY',
      storeId: storeId || undefined,
    });
  }
}
