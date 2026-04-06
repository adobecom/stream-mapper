export default function requestParentCollabRefresh(reason = '') {
  const collabId = `${window.streamConfig?.collabId || ''}`.trim();
  if (!collabId) return;
  if (!window.parent || window.parent === window) return;
  window.parent.postMessage({
    type: 'STREAM_REQUEST_COLLAB_REFRESH',
    collabId,
    reason,
  }, '*');
}
