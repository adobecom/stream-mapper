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

    // Don't set Content-Type for FormData — browser sets it with boundary
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

  /**
   * Upload an asset file for a specific page element.
   * @param {File} file - The image file to upload
   * @param {string} elementPath - CSS selector path
   * @param {string} elementRef - Session-scoped element ref (data-annotation-ref)
   * @param {Object} elementProps - Structural anchors (sectionDaaLh, blockDaaLh, etc.)
   * @param {string} [commentId] - Optional comment ID to link to
   * @param {string} [originalSrc] - Original image src before replacement
   * @returns {Promise<Object>} The created asset object
   */
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

  /**
   * Get asset content as base64 data URI for preview.
   * @param {string} assetId
   * @returns {Promise<{assetId: string, mimeType: string, encoding: string, data: string}>}
   */
  async function getAssetContent(assetId) {
    return assetServiceFetch(`/api/assets/${encodeURIComponent(assetId)}/content`);
  }

  /**
   * Batch decide: accept or reject multiple assets at once.
   * Used by Save Changes to accept all applied assets in one call.
   * @param {string[]} assetIds
   * @param {'accepted'|'rejected'} decision
   */
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

  /**
   * Batch promote: promote all accepted assets to production DA.
   * Used by Push to DA flow.
   */
  async function batchPromote() {
    return withSyncIndicator('Promoting assets to DA...', async () => {
      const collabId = getAnnotationCollabId();
      if (!collabId) throw new Error('No active collab');
      return assetServiceFetch(`/api/collabs/${encodeURIComponent(collabId)}/promote`, {
        method: 'POST',
      });
    });
  }

  /**
   * Delete a pending asset.
   * @param {string} assetId
   */
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
