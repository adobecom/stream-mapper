import { getConfig } from '../../utils/utils.js';
import { hideGlobalSyncIndicator, showGlobalSyncIndicator } from '../../utils/snackbar.js';

function normalizeToken(token) {
  const value = `${token || ''}`.trim();
  if (!value) return '';
  return value.startsWith('Bearer ') ? value : `Bearer ${value}`;
}

function getAnnotationCollabId() {
  const collabId = window.streamConfig?.collabId;
  return `${collabId || ''}`.trim();
}

export default function createAssetServiceClient() {
  async function assetServiceFetch(path, options = {}) {
    const resolvedServiceEndpoint = `${(await getConfig())?.streamMapper?.serviceEP || ''}`.trim();
    if (!resolvedServiceEndpoint) return null;

    const headers = {
      ...(options.headers || {}),
    };
    const token = normalizeToken(window.streamConfig?.token);
    if (token) headers.Authorization = token;

    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${resolvedServiceEndpoint}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`[asset-service] Request failed: ${response.status} ${path}`, errorBody);
      throw new Error(`Asset service request failed: ${response.status} — ${errorBody}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async function withSyncIndicator(message, callback) {
    showGlobalSyncIndicator(message);
    try {
      return await callback();
    } finally {
      hideGlobalSyncIndicator();
    }
  }

  async function uploadAsset(file, elementPath, elementRef, elementProps, commentId, originalSrc) {
    return withSyncIndicator('Uploading asset...', async () => {
      const collabId = getAnnotationCollabId();
      if (!collabId) throw new Error('No active collab');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('element_path', elementPath);
      if (elementRef) formData.append('element_ref', elementRef);
      if (elementProps) formData.append('element_props', JSON.stringify(elementProps));
      if (commentId) formData.append('comment_id', commentId);
      if (originalSrc) formData.append('original_src', originalSrc);

      return assetServiceFetch(`/api/collabs/${encodeURIComponent(collabId)}/assets`, {
        method: 'POST',
        body: formData,
      });
    });
  }

  async function getAssetContent(assetId) {
    return assetServiceFetch(`/api/assets/${encodeURIComponent(assetId)}/content`);
  }

  async function batchDecideAssets(assetIds, decision) {
    return withSyncIndicator('Saving asset changes...', async () => {
      const collabId = getAnnotationCollabId();
      if (!collabId) throw new Error('No active collab');
      return assetServiceFetch(`/api/collabs/${encodeURIComponent(collabId)}/assets/decide`, {
        method: 'POST',
        body: JSON.stringify({ assetIds, decision }),
      });
    });
  }

  async function batchPromote() {
    return withSyncIndicator('Promoting assets to DA...', async () => {
      const collabId = getAnnotationCollabId();
      if (!collabId) throw new Error('No active collab');
      return assetServiceFetch(`/api/collabs/${encodeURIComponent(collabId)}/promote`, {
        method: 'POST',
      });
    });
  }

  async function deleteAsset(assetId) {
    return assetServiceFetch(`/api/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
    });
  }

  return {
    batchDecideAssets,
    batchPromote,
    deleteAsset,
    getAssetContent,
    uploadAsset,
  };
}
