/* eslint-disable no-underscore-dangle */
/* eslint-disable no-console */
/* eslint-disable no-use-before-define */
/* eslint-disable no-restricted-syntax */
import { showGlobalSnackbar } from '../../utils/snackbar.js';

const ASSET_INDICATOR_CLASS = 'annotation-asset-pending-indicator';
const ASSET_INDICATOR_BADGE_CLASS = 'annotation-asset-pending-badge';

const ALLOWED_MIME_TYPES = [
  'image/png', 'image/jpeg',
];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

export default function createAssetsPanelController({
  annotationState,
  annotationUI,
  store,
  assetService,
}) {
  let fileInputEl = null;
  let pendingUploadTarget = null;
  let onAssetsChanged = null;

  function setOnAssetsChanged(handler) {
    onAssetsChanged = typeof handler === 'function' ? handler : null;
  }

  function notifyAssetsChanged() {
    if (typeof onAssetsChanged === 'function') {
      onAssetsChanged();
    }
  }

  function getFileInput() {
    if (!fileInputEl) {
      fileInputEl = document.createElement('input');
      fileInputEl.type = 'file';
      fileInputEl.accept = 'image/png,image/jpeg';
      fileInputEl.style.display = 'none';
      document.body.appendChild(fileInputEl);
      // eslint-disable-next-line no-use-before-define
      fileInputEl.addEventListener('change', handleFileSelected);
    }
    return fileInputEl;
  }

  function isCurrentUserCollabOwner() {
    const normalizedRole = `${window.streamConfig?.collabRole || ''}`
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ');
    if (!normalizedRole) {
      return window.streamConfig?.inlineEditingAllowed === true;
    }
    return normalizedRole === 'owner' || normalizedRole === 'collab owner';
  }

  function renderAssetsPanel() {
    if (!annotationUI.panelListEl) return;
    annotationUI.panelListEl.innerHTML = '';

    const isOwner = isCurrentUserCollabOwner();

    if (isOwner && annotationUI.annotationMode === 'assets') {
      // eslint-disable-next-line no-use-before-define
      if (!annotationUI.assetSelectMode) enterSelectMode();
    }

    if (isOwner && annotationUI.assetSelectMode) {
      const hint = document.createElement('p');
      hint.className = 'annotation-assets-select-hint';
      hint.textContent = 'Click an image on the page to upload a replacement.';
      annotationUI.panelListEl.appendChild(hint);
    }

    const localAssets = annotationState.store.localAssets || [];
    const remoteAssets = annotationState.store.assets || [];

    if (localAssets.length === 0 && remoteAssets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'annotation-comments-empty';
      empty.textContent = 'No assets uploaded yet.';
      annotationUI.panelListEl.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'annotation-assets-list';

    for (const localAsset of localAssets) {
      list.appendChild(buildLocalAssetCard(localAsset));
    }

    const sorted = [...remoteAssets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    for (const asset of sorted) {
      list.appendChild(buildRemoteAssetCard(asset));
    }

    annotationUI.panelListEl.appendChild(list);

    renderAssetMarkers();
  }

  function buildLocalAssetCard(localAsset) {
    const card = document.createElement('article');
    card.className = 'annotation-panel-comment annotation-panel-asset-item annotation-asset-card-local';
    card.dataset.localAssetId = localAsset.localId;
    if (localAsset.createdAt) card.dataset.createdAt = localAsset.createdAt;

    const username = document.createElement('p');
    username.className = 'annotation-panel-comment-user';
    username.textContent = window.streamConfig?.username || 'You';
    card.appendChild(username);

    const text = document.createElement('p');
    text.className = 'annotation-panel-comment-text';
    text.textContent = `replaced image "${truncateSrc(localAsset.originalSrc)}" → "${localAsset.filename}"`;
    card.appendChild(text);

    const statusBadge = document.createElement('span');
    statusBadge.className = 'annotation-asset-status annotation-asset-status-unsaved';
    statusBadge.textContent = 'unsaved';
    card.appendChild(statusBadge);

    const actions = document.createElement('div');
    actions.className = 'annotation-asset-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'annotation-asset-action-btn annotation-asset-action-delete';
    deleteBtn.textContent = 'Remove';
    deleteBtn.addEventListener('click', () => removeLocalAsset(localAsset.localId));
    actions.appendChild(deleteBtn);
    card.appendChild(actions);

    return card;
  }

  function buildRemoteAssetCard(asset) {
    const card = document.createElement('article');
    card.className = 'annotation-panel-comment annotation-panel-asset-item';
    card.dataset.assetId = asset.id;
    if (asset.createdAt) card.dataset.createdAt = asset.createdAt;

    const isApplied = annotationUI.appliedAssets.has(asset.id);

    const username = document.createElement('p');
    username.className = 'annotation-panel-comment-user';
    username.textContent = asset.username || 'Collaborator';
    card.appendChild(username);

    const text = document.createElement('p');
    text.className = 'annotation-panel-comment-text';
    const fromLabel = truncateSrc(asset.originalSrc || '(none)');
    const toLabel = truncateSrc(asset.daUrl || asset.filename || '(none)');
    text.textContent = `replaced image "${fromLabel}" → "${toLabel}"`;
    card.appendChild(text);

    const statusBadge = document.createElement('span');
    statusBadge.className = `annotation-asset-status annotation-asset-status-${asset.status}`;
    statusBadge.textContent = asset.status;
    if (isApplied && asset.status === 'pending') {
      statusBadge.textContent = 'applied';
      statusBadge.className = 'annotation-asset-status annotation-asset-status-applied';
    }
    card.appendChild(statusBadge);

    const actions = document.createElement('div');
    actions.className = 'annotation-asset-actions';

    if (asset.status === 'pending' && !isApplied && isCurrentUserCollabOwner()) {
      const applyBtn = document.createElement('button');
      applyBtn.className = 'annotation-asset-action-btn';
      applyBtn.textContent = 'Apply';
      applyBtn.title = 'Preview this asset on the page';
      applyBtn.addEventListener('click', () => applyAssetToPage(asset));
      actions.appendChild(applyBtn);
    }

    if (asset.status === 'pending') {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'annotation-asset-action-btn annotation-asset-action-delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => handleDeleteAsset(asset));
      actions.appendChild(deleteBtn);
    }

    card.appendChild(actions);

    return card;
  }

  function truncateSrc(src) {
    if (!src || src.length <= 50) return src;
    // Show last 47 chars
    return `...${src.slice(-47)}`;
  }

  function enterSelectMode() {
    if (!isCurrentUserCollabOwner()) return;

    annotationUI.assetSelectMode = true;
    document.body.classList.add('annotation-asset-select-mode');

    annotationUI.assetSelectHandler = (event) => {
      const img = event.target.closest('img');
      if (!img) return;
      if (img.closest('.annotation-comments-panel') || img.closest('.annotation-asset-pending-badge')) return;

      event.preventDefault();
      event.stopPropagation();

      pendingUploadTarget = img;
      getFileInput().click();
    };

    if (annotationUI.mainEl) {
      annotationUI.mainEl.addEventListener('click', annotationUI.assetSelectHandler, true);
    }
  }

  function exitSelectMode() {
    annotationUI.assetSelectMode = false;
    document.body.classList.remove('annotation-asset-select-mode');

    if (annotationUI.assetSelectHandler && annotationUI.mainEl) {
      annotationUI.mainEl.removeEventListener('click', annotationUI.assetSelectHandler, true);
      annotationUI.assetSelectHandler = null;
    }
  }

  function validateFile(file) {
    const ext = `.${(file.name || '').split('.').pop() || ''}`.toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      const friendlyTypes = ALLOWED_EXTENSIONS.join(', ');
      return `Unsupported file type "${ext}". Allowed types: ${friendlyTypes}`;
    }
    return null;
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // reset for re-use
    if (!file || !pendingUploadTarget) return;

    const validationError = validateFile(file);
    if (validationError) {
      showGlobalSnackbar(validationError, { variant: 'error', duration: 5000 });
      return;
    }

    const targetImg = pendingUploadTarget;
    pendingUploadTarget = null;

    const anchorTarget = targetImg.closest('picture') || targetImg;
    const { elementPath, elementProps } = store.buildEditElementAnchor(anchorTarget);
    const elementRef = store.ensureElementRef(anchorTarget);

    if (!elementPath) {
      console.warn('[assets-panel] Could not determine element path for upload target');
      return;
    }

    const originalSrc = targetImg.dataset.originalSrc || elementProps?.src || targetImg.src || '';

    const base64Data = await readFileAsDataUrl(file);
    if (!base64Data) {
      console.warn('[assets-panel] Could not read file as data URL');
      return;
    }

    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const localAsset = {
      localId,
      file, // raw File object — sent to BE on Save Changes
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      elementPath,
      elementRef,
      elementProps,
      originalSrc,
      base64Data,
      targetImg,
      createdAt: new Date().toISOString(),
    };

    // eslint-disable-next-line max-len
    const supersededLocal = annotationState.store.localAssets.filter((a) => a.elementPath === elementPath);
    annotationState.store.localAssets = annotationState.store.localAssets
      .filter((a) => a.elementPath !== elementPath);
    for (const old of supersededLocal) {
      annotationUI.appliedAssets.delete(old.localId);
    }
    // eslint-disable-next-line max-len
    const supersededRemote = (annotationState.store.assets || []).filter((a) => a.elementPath === elementPath);
    annotationState.store.assets = (annotationState.store.assets || [])
      .filter((a) => a.elementPath !== elementPath);
    for (const old of supersededRemote) {
      annotationUI.appliedAssets.delete(old.id);
    }

    annotationState.store.localAssets.push(localAsset);

    applyAssetPreviewToImg(targetImg, base64Data, localAsset);

    notifyAssetsChanged();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  function removeLocalAsset(localId) {
    const idx = annotationState.store.localAssets.findIndex((a) => a.localId === localId);
    if (idx === -1) return;

    const localAsset = annotationState.store.localAssets[idx];
    if (localAsset.targetImg) {
      revertAssetPreview(localAsset.targetImg);
    }
    annotationUI.appliedAssets.delete(localId);

    annotationState.store.localAssets.splice(idx, 1);
    notifyAssetsChanged();
  }

  function applyAssetPreviewToImg(targetImg, base64Data, asset) {
    if (!targetImg || !base64Data) return;

    if (!targetImg.dataset.originalSrc) {
      targetImg.dataset.originalSrc = targetImg.src;
    }

    targetImg.src = base64Data;
    if (targetImg.srcset) targetImg.srcset = base64Data;

    const pictureEl = targetImg.closest('picture');
    if (pictureEl) {
      pictureEl.querySelectorAll('source').forEach((source) => {
        if (!source.dataset.originalSrcset) {
          source.dataset.originalSrcset = source.srcset;
        }
        source.srcset = base64Data;
      });
    }

    const trackingId = asset.localId || asset.id;
    annotationUI.appliedAssets.set(trackingId, {
      assetId: trackingId,
      elementPath: asset.elementPath,
      targetImg,
    });

    addPendingIndicator(targetImg);
  }

  async function applyAssetToPage(asset, targetImgOverride) {
    if (!isCurrentUserCollabOwner()) return;

    try {
      // eslint-disable-next-line no-underscore-dangle
      let base64Data = asset._base64Data;
      if (!base64Data) {
        const content = await assetService.getAssetContent(asset.id);
        if (!content?.data) {
          // eslint-disable-next-line no-console
          console.warn('[assets-panel] Could not fetch asset content for', asset.id);
          return;
        }
        base64Data = content.data;
        // eslint-disable-next-line no-underscore-dangle
        asset._base64Data = base64Data;
      }

      let targetImg = targetImgOverride;
      if (!targetImg && annotationUI.mainEl) {
        const element = annotationUI.mainEl.querySelector(asset.elementPath);
        if (!element) {
          console.warn(`[assets-panel] Element not found: ${asset.elementPath}`);
          return;
        }
        targetImg = element.tagName === 'IMG'
          ? element
          : element.querySelector('img');
      }

      if (!targetImg) {
        console.warn('[assets-panel] No target img found for asset', asset.id);
        return;
      }

      applyAssetPreviewToImg(targetImg, base64Data, asset);
      notifyAssetsChanged();
    } catch (err) {
      console.error('[assets-panel] Apply asset failed:', err);
    }
  }

  function renderAssetMarkers() {
    if (!annotationUI.layerEl || !annotationUI.mainEl) return;

    annotationUI.layerEl.querySelectorAll('.annotation-asset-marker')
      .forEach((m) => m.remove());

    const assetsByPath = new Map();
    for (const asset of (annotationState.store.assets || [])) {
      if (asset.elementPath) assetsByPath.set(asset.elementPath, asset);
    }
    for (const asset of (annotationState.store.localAssets || [])) {
      if (asset.elementPath) assetsByPath.set(asset.elementPath, asset);
    }
    const allAssets = [...assetsByPath.values()];

    const occupiedSlots = new Set();
    const MARKER_STEP = 28;
    const MIN_LEFT = 8;

    allAssets.forEach((asset) => {
      if (!asset.elementPath) return;
      const el = annotationUI.mainEl.querySelector(asset.elementPath);
      if (!el) return;

      const targetImg = el.tagName === 'IMG' ? el : el.querySelector('img');
      const targetEl = targetImg || el;
      const rect = targetEl.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;

      const top = Math.max(0, Math.round(rect.top - 8));
      let left = Math.max(MIN_LEFT, Math.round(rect.right - 8));
      let slotKey = `${top}:${left}`;
      while (occupiedSlots.has(slotKey) && left > MIN_LEFT) {
        left = Math.max(MIN_LEFT, left - MARKER_STEP);
        slotKey = `${top}:${left}`;
      }
      occupiedSlots.add(slotKey);

      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'annotation-asset-marker';
      marker.title = `Asset: ${asset.filename || 'image'}`;
      marker.setAttribute('aria-label', `Asset replacement: ${asset.filename || 'image'}`);
      marker.innerHTML = `
        <svg class="annotation-asset-marker-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"></path>
        </svg>
      `;
      marker.style.top = `${top}px`;
      marker.style.left = `${left}px`;
      annotationUI.layerEl.appendChild(marker);
    });
  }

  function addPendingIndicator(imgEl) {
    removePendingIndicator(imgEl);

    const container = imgEl.closest('picture') || imgEl.parentElement;
    if (!container) return;

    const computedPosition = getComputedStyle(container).position;
    if (computedPosition === 'static') {
      container.style.position = 'relative';
    }

    imgEl.classList.add(ASSET_INDICATOR_CLASS);

    const badge = document.createElement('span');
    badge.className = ASSET_INDICATOR_BADGE_CLASS;
    badge.textContent = 'Pending';
    container.appendChild(badge);
  }

  function removePendingIndicator(imgEl) {
    imgEl.classList.remove(ASSET_INDICATOR_CLASS);
    const container = imgEl.closest('picture') || imgEl.parentElement;
    if (!container) return;
    const existingBadge = container.querySelector(`.${ASSET_INDICATOR_BADGE_CLASS}`);
    if (existingBadge) existingBadge.remove();
  }

  function removeAllPendingIndicators() {
    document.querySelectorAll(`.${ASSET_INDICATOR_CLASS}`).forEach((img) => {
      img.classList.remove(ASSET_INDICATOR_CLASS);
    });
    document.querySelectorAll(`.${ASSET_INDICATOR_BADGE_CLASS}`).forEach((badge) => {
      badge.remove();
    });
  }

  async function handleDeleteAsset(asset) {
    try {
      await assetService.deleteAsset(asset.id);

      const applied = annotationUI.appliedAssets.get(asset.id);
      if (applied?.targetImg) {
        revertAssetPreview(applied.targetImg);
        annotationUI.appliedAssets.delete(asset.id);
      }

      annotationState.store.assets = annotationState.store.assets.filter((a) => a.id !== asset.id);
      notifyAssetsChanged();
    } catch (err) {
      console.error('[assets-panel] Delete failed:', err);
    }
  }

  function revertAssetPreview(imgEl) {
    if (imgEl.dataset.originalSrc) {
      imgEl.src = imgEl.dataset.originalSrc;
      delete imgEl.dataset.originalSrc;
    }
    if (imgEl.dataset.originalSrcset) {
      imgEl.srcset = imgEl.dataset.originalSrcset;
      delete imgEl.dataset.originalSrcset;
    }
    const pictureEl = imgEl.closest('picture');
    if (pictureEl) {
      pictureEl.querySelectorAll('source').forEach((source) => {
        if (source.dataset.originalSrcset) {
          source.srcset = source.dataset.originalSrcset;
          delete source.dataset.originalSrcset;
        }
      });
    }
    removePendingIndicator(imgEl);
  }

  async function uploadLocalAssets() {
    const localAssets = annotationState.store.localAssets || [];
    if (localAssets.length === 0) return [];

    const uploadedIds = [];

    for (const localAsset of localAssets) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const asset = await assetService.uploadAsset(
          localAsset.file,
          localAsset.elementPath,
          localAsset.elementRef,
          localAsset.elementProps,
          null, // commentId
          localAsset.originalSrc,
        );
        if (!asset) {
          console.warn('[assets-panel] Upload returned null for local asset:', localAsset.localId);
          // eslint-disable-next-line no-continue
          continue;
        }

        asset._base64Data = localAsset.base64Data;
        annotationState.store.assets.push(asset);

        const applied = annotationUI.appliedAssets.get(localAsset.localId);
        if (applied) {
          annotationUI.appliedAssets.delete(localAsset.localId);
          annotationUI.appliedAssets.set(asset.id, {
            assetId: asset.id,
            elementPath: asset.elementPath,
            targetImg: applied.targetImg,
          });
        }

        uploadedIds.push(asset.id);
      } catch (err) {
        console.error('[assets-panel] Upload failed for local asset:', localAsset.localId, err);
        showGlobalSnackbar(
          `Upload failed for "${localAsset.filename}": ${err.message || 'Unknown error'}`,
          { variant: 'error', duration: 5000 },
        );
      }
    }

    annotationState.store.localAssets = [];

    return uploadedIds;
  }

  function getAppliedAssetIds() {
    return Array.from(annotationUI.appliedAssets.keys())
      .filter((id) => !String(id).startsWith('local-'));
  }

  function updateAssetsFromSnapshot(remoteAssets) {
    if (!Array.isArray(remoteAssets)) return;

    const localMap = new Map(annotationState.store.assets.map((a) => [a.id, a]));
    const merged = remoteAssets.map((remote) => {
      const local = localMap.get(remote.id);
      return {
        ...remote,
        _base64Data: local?._base64Data || null,
      };
    });
    annotationState.store.assets = merged;

    for (const [assetId, applied] of annotationUI.appliedAssets) {
      // eslint-disable-next-line no-continue
      if (String(assetId).startsWith('local-')) continue;
      const asset = merged.find((a) => a.id === assetId);
      if (!asset || asset.status !== 'pending') {
        if (applied.targetImg) removePendingIndicator(applied.targetImg);
        annotationUI.appliedAssets.delete(assetId);
      }
    }
  }

  function clearAppliedAssets() {
    removeAllPendingIndicators();
    annotationUI.appliedAssets.clear();
  }

  function cleanup() {
    exitSelectMode();
    removeAllPendingIndicators();
    annotationUI.appliedAssets.clear();
    annotationState.store.localAssets = [];
    if (fileInputEl) {
      fileInputEl.removeEventListener('change', handleFileSelected);
      fileInputEl.remove();
      fileInputEl = null;
    }
    pendingUploadTarget = null;
  }

  function getAssetTimestamp(asset) {
    if (!asset) return 0;
    const value = asset.updatedAt || asset.createdAt || 0;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  return {
    applyAssetToPage,
    buildLocalAssetCard,
    buildRemoteAssetCard,
    cleanup,
    clearAppliedAssets,
    enterSelectMode,
    exitSelectMode,
    getAppliedAssetIds,
    getAssetTimestamp,
    renderAssetMarkers,
    renderAssetsPanel,
    setOnAssetsChanged,
    updateAssetsFromSnapshot,
    uploadLocalAssets,
  };
}
