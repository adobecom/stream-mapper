export default function requestParentCollabRefresh(reason = '') {
  const cfg = window.streamConfig || {};
  const collabId = `${cfg.collabId || cfg.collab_id || ''}`.trim();
  if (!collabId) return;
  if (!window.parent || window.parent === window) return;
  window.parent.postMessage({
    type: 'STREAM_REQUEST_COLLAB_REFRESH',
    collabId,
    reason,
  }, '*');
}
