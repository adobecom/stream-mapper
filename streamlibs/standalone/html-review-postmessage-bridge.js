/**
 * Lightweight postMessage bridge for tenant HTML review (no ES modules).
 *
 * Include when the preview URL has streamHtmlReview=1, e.g.:
 *   <script src="https://<stream-mapper-host>/streamlibs/standalone/html-review-postmessage-bridge.js" defer></script>
 *
 * Handles STREAM_GET_TARGET_HTML (for collab create-page) and signals STREAM_HTML_REVIEW_READY.
 * For PUSH_TO_DA, responds with failure unless html-review-bootstrap.js is also loaded (that script performs the persist).
 * For full annotation after collab, still use html-review-bootstrap.js (module) or load it after this bridge.
 */
(function streamHtmlReviewPostMessageBridge() {
  if (window.__streamHtmlReviewPostMessageBridge) return;
  window.__streamHtmlReviewPostMessageBridge = true;

  var searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('streamHtmlReview') !== '1') return;

  function readTargetHtml() {
    var main = document.querySelector('main');
    if (main) return main.innerHTML;
    var roleMain = document.querySelector('[role="main"]');
    if (roleMain) return roleMain.innerHTML;
    if (document.body) return document.body.innerHTML;
    return '';
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'STREAM_GET_TARGET_HTML' && data.requestId) {
      try {
        window.parent.postMessage(
          {
            type: 'STREAM_TARGET_HTML',
            requestId: data.requestId,
            bodyHtml: readTargetHtml(),
            storeId: data.storeId,
          },
          '*',
        );
      } catch (e) {
        /* ignore */
      }
      return;
    }

    if (data.type === 'PUSH_TO_DA') {
      if (window.__streamHtmlReviewBootstrapInit) return;
      try {
        window.parent.postMessage(
          {
            type: 'PUSH_TO_DA_RESULT',
            success: false,
            message:
              'Push to DA requires html-review-bootstrap.js (annotation) on this page; bridge-only mode cannot persist.',
          },
          '*',
        );
      } catch (e) {
        /* ignore */
      }
    }
  });

  var storeId = searchParams.get('storeId') || '';
  function emitReady() {
    try {
      window.parent.postMessage(
        { type: 'STREAM_HTML_REVIEW_READY', storeId: storeId || undefined },
        '*',
      );
    } catch (e) {
      /* ignore */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', emitReady);
  } else {
    emitReady();
  }
})();
