import { fetchFigmaContent } from '../sources/figma.js';
import { fetchDAContent } from '../sources/da.js';
import { miloLoadArea, getConfig } from '../utils/utils.js';
import { getDACompatibleHtml, postData } from '../target/da.js';
import { createAnnotationState, createAnnotationUI } from './annotation/state.js';
import { createAnnotationStore } from './annotation/store.js';
import createCommentsPanelController from './annotation/comments-panel.js';
import createInlineEditingController from './annotation/inline-editing.js';
import createAnnotationServiceClient from './annotation/service.js';
import createAssetServiceClient from './annotation/asset-service.js';
import createAssetsPanelController from './annotation/assets-panel.js';
import requestParentCollabRefresh from './annotation/collab-sync.js';

const annotationState = createAnnotationState();
const annotationUI = createAnnotationUI();
let cachedCleanHtml = '';
const store = createAnnotationStore({ annotationState, annotationUI });
const annotationService = createAnnotationServiceClient();
const assetService = createAssetServiceClient();
const assetsPanel = createAssetsPanelController({
  annotationState,
  annotationUI,
  store,
  assetService,
});
const commentsPanel = createCommentsPanelController({
  annotationState,
  annotationUI,
  store,
  assetsPanel,
});
const inlineEditing = createInlineEditingController({
  annotationState,
  annotationUI,
  store,
  renderThreadMarkers: commentsPanel.renderThreadMarkers,
  renderCommentsPanel: commentsPanel.renderCommentsPanel,
  removePopup: commentsPanel.removePopup,
});

commentsPanel.setInlineModeHandlers({
  enableInlineEditMode: inlineEditing.enableInlineEditMode,
  disableInlineEditMode: inlineEditing.disableInlineEditMode,
});

function normalizeDAImages(root) {
  root.querySelectorAll('img').forEach((img) => {
    if (img.src.includes('content.da.live') && img.parentElement.tagName !== 'PICTURE') {
      const pic = document.createElement('picture');
      img.parentElement.replaceWith(pic);
      pic.appendChild(img);
    }
  });
}

async function getDADom() {
  const { source } = window.streamConfig;
  if (source === 'figma') {
    const { htmlDom: html } = await fetchFigmaContent();
    return html;
  }
  if (source === 'da') {
    const html = await fetchDAContent(window.streamConfig.contentUrl);
    normalizeDAImages(html);
    return html;
  }
  return null;
}

async function initializePreview() {
  document.body.querySelectorAll(':scope > header, :scope > main').forEach((element) => {
    element.remove();
  });
  const htmlDom = await getDADom();
  const headerEle = document.createElement('header');
  const mainEle = document.createElement('main');
  if (htmlDom instanceof HTMLElement && htmlDom.tagName === 'MAIN') {
    mainEle.innerHTML = htmlDom.innerHTML;
  } else {
    mainEle.innerHTML = htmlDom;
  }
  document.body.prepend(mainEle);
  document.body.prepend(headerEle);
}

function findAssetElement(doc, elementPath, elementProps, originalSrc) {
  const main = doc.querySelector('main');
  if (!main) return null;

  if (elementPath) {
    const selector = elementPath.startsWith('main > ')
      ? elementPath.slice('main > '.length) : elementPath;
    try {
      const el = main.querySelector(selector);
      if (el) return el;
    } catch { /* invalid selector */ }
  }

  if (elementProps) {
    const sectionIndex = typeof elementProps.sectionIndex === 'number' ? elementProps.sectionIndex : -1;
    const blockClass = typeof elementProps.blockClass === 'string' ? elementProps.blockClass : '';
    const blockIndex = typeof elementProps.blockIndex === 'number' ? elementProps.blockIndex : 0;

    if (sectionIndex >= 0) {
      const sections = Array.from(main.children).filter((el) => el.tagName === 'DIV');
      const section = sections[sectionIndex];
      if (section) {
        let block = null;
        if (blockClass) {
          const matching = Array.from(section.querySelectorAll(`:scope > div.${blockClass}`));
          block = matching[blockIndex] ?? matching[0] ?? null;
        }
        if (!block) {
          const divs = Array.from(section.children).filter((el) => el.tagName === 'DIV');
          block = divs[blockIndex] ?? null;
        }
        if (block) {
          const pic = block.querySelector('picture');
          if (pic && pic.querySelector('img')) return pic;
          const img = block.querySelector('img');
          if (img) return img;
        }
      }
    }
  }

  if (originalSrc) {
    const allImages = main.querySelectorAll('img');
    const withoutParams = originalSrc.split('?')[0]?.split('#')[0] ?? '';
    const filename = withoutParams.split('/').pop() || '';

    for (const img of allImages) {
      const src = img.getAttribute('src') || '';
      if (src && withoutParams && src.includes(withoutParams)) {
        return img.closest('picture') || img;
      }
    }
    if (filename) {
      for (const img of allImages) {
        const src = (img.getAttribute('src') || '').split('?')[0]?.split('#')[0] ?? '';
        if (src.split('/').pop() === filename) {
          return img.closest('picture') || img;
        }
      }
    }
  }

  return null;
}

function replaceAssetUrl(element, assetUrl) {
  const img = element.tagName === 'IMG' ? element : element.querySelector('img');
  if (img) {
    img.setAttribute('src', assetUrl);
    if (img.hasAttribute('srcset')) img.setAttribute('srcset', assetUrl);
  }
  element.querySelectorAll('source').forEach((source) => {
    source.setAttribute('srcset', assetUrl);
  });
}

function extractFilename(url) {
  if (!url) return '';
  return (url.split('?')[0]?.split('#')[0] ?? '').split('/').pop() || '';
}

function buildHtmlWithEditsAndAssets(assetReplacements) {
  const payload = store.getStoredAnnotationPayload() || annotationState.store;
  const easyEdits = payload?.easyEdits || annotationState.store.easyEdits || [];
  const html = store.applyEasyEditsToHtmlString(cachedCleanHtml, easyEdits);

  const container = document.createElement('div');
  container.innerHTML = `<main>${html}</main>`;

  for (const asset of assetReplacements) {
    const element = findAssetElement(
      container, asset.elementPath, asset.elementProps, asset.originalSrc,
    );
    if (element) {
      replaceAssetUrl(element, asset.targetUrl);
      continue;
    }

    const filenameCandidates = [
      extractFilename(asset.originalSrc),
      extractFilename(asset.daUrl),
    ].filter(Boolean);

    let matched = false;
    if (filenameCandidates.length > 0) {
      const allImages = container.querySelectorAll('img');
      for (const img of allImages) {
        const imgFilename = extractFilename(img.getAttribute('src') || '');
        if (filenameCandidates.includes(imgFilename)) {
          img.setAttribute('src', asset.targetUrl);
          if (img.hasAttribute('srcset')) img.setAttribute('srcset', asset.targetUrl);
          matched = true;
          break;
        }
      }
    }

    if (!matched && asset.daUrl) {
      const allImages = container.querySelectorAll('img');
      for (const img of allImages) {
        const src = img.getAttribute('src') || '';
        if (src && src === asset.daUrl) {
          img.setAttribute('src', asset.targetUrl);
          if (img.hasAttribute('srcset')) img.setAttribute('srcset', asset.targetUrl);
          break;
        }
      }
    }
  }

  const mainEl = container.querySelector('main');
  return { easyEdits, daCompatibleHtml: getDACompatibleHtml(mainEl.innerHTML) };
}

async function finishAnnotationSession(mainEl, {
  preserveRemoteEditState,
  shouldRestoreInlineMode,
}) {
  await commentsPanel.setupAnnotationUI(mainEl, {
    preserveRemoteEditState,
  });
  if (annotationState.latestRemoteCollabSnapshot) {
    commentsPanel.applyRemoteCollabSnapshot(annotationState.latestRemoteCollabSnapshot, {
      includeEdits: false,
    });
  }
  store.rebindEasyEditsToCurrentDom();
  store.applyEasyEditsToDom();
  store.saveAnnotationStore();
  if (shouldRestoreInlineMode) {
    const didEnableInlineMode = await inlineEditing.enableInlineEditMode();
    if (!didEnableInlineMode) {
      commentsPanel.renderThreadMarkers({ resolveTargets: true });
      commentsPanel.renderCommentsPanel();
    }
  } else {
    commentsPanel.renderThreadMarkers({ resolveTargets: true });
    commentsPanel.renderCommentsPanel();
  }
}

export async function annotationOperation(options = {}) {
  const {
    preserveRemoteEditState = false,
  } = options;
  const previousAnnotationMode = annotationUI.annotationMode || 'comments';
  const shouldRestoreInlineMode = annotationUI.inlineMode
    && window.streamConfig?.inlineEditingAllowed !== false;

  inlineEditing.resetInlineEditModeState();
  annotationUI.annotationMode = shouldRestoreInlineMode ? 'edit' : previousAnnotationMode;
  document.body.classList.add('annotation-mode');
  if (!preserveRemoteEditState) {
    annotationState.latestSavedEditsUpdatedAt = null;
    annotationState.pendingRemoteEditsSnapshot = null;
    annotationState.hasLoadedInitialEditsSnapshot = false;
  }
  await initializePreview();
  if (!cachedCleanHtml) {
    const preDecorMainEl = document.querySelector('main');
    cachedCleanHtml = preDecorMainEl?.innerHTML || '';
  }
  await miloLoadArea();
  const mainEl = document.querySelector('main');
  if (!mainEl) return;

  await finishAnnotationSession(mainEl, {
    preserveRemoteEditState,
    shouldRestoreInlineMode,
  });
}

/**
 * Annotation on an existing decorated page (tenant AEM): uses current <main>, no miloLoadArea / preview replacement.
 */
export async function annotationOperationOnHostPage(options = {}) {
  const {
    preserveRemoteEditState = false,
    refreshBaselineHtml = false,
  } = options;
  const previousAnnotationMode = annotationUI.annotationMode || 'comments';
  const shouldRestoreInlineMode = annotationUI.inlineMode
    && window.streamConfig?.inlineEditingAllowed !== false;

  inlineEditing.resetInlineEditModeState();
  annotationUI.annotationMode = shouldRestoreInlineMode ? 'edit' : previousAnnotationMode;
  document.body.classList.add('annotation-mode');
  if (!preserveRemoteEditState) {
    annotationState.latestSavedEditsUpdatedAt = null;
    annotationState.pendingRemoteEditsSnapshot = null;
    annotationState.hasLoadedInitialEditsSnapshot = false;
  }

  const mainEl = document.querySelector('main');
  if (!mainEl) {
    throw new Error('annotationOperationOnHostPage: no <main> found on page');
  }

  if (!cachedCleanHtml || refreshBaselineHtml) {
    cachedCleanHtml = mainEl.innerHTML || '';
  }

  await finishAnnotationSession(mainEl, {
    preserveRemoteEditState,
    shouldRestoreInlineMode,
  });
}

function firstNonEmptyPersistUrl(...vals) {
  for (const v of vals) {
    const s = `${v ?? ''}`.trim();
    if (s) return s;
  }
  return '';
}

function collabPersistUrl(collab) {
  if (!collab || typeof collab !== 'object') return '';
  return firstNonEmptyPersistUrl(
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

/** da.live edit URL → repo path (e.g. adobecom/...); leaves plain paths unchanged. */
function normalizePersistUrlForDaApi(raw) {
  const s = `${raw || ''}`.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    return s.replace(/^\/+/, '');
  }
  try {
    const u = new URL(s);
    if (u.hash?.startsWith('#/')) {
      return decodeURIComponent(u.hash.slice(2)).replace(/^\/+/, '');
    }
    if (u.hostname.includes('da.live') && u.pathname && u.pathname !== '/') {
      return decodeURIComponent(u.pathname).replace(/^\/+/, '');
    }
  } catch {
    /* ignore */
  }
  return s;
}

async function fetchCollabPersistUrlFromService(cfg) {
  const collabId = `${cfg.collabId || cfg.collab_id || ''}`.trim();
  if (!collabId) return '';
  const tokenRaw = `${cfg.token || ''}`.trim();
  if (!tokenRaw) return '';
  const auth = tokenRaw.startsWith('Bearer ') ? tokenRaw : `Bearer ${tokenRaw}`;

  let ep = `${cfg.streamServiceEP || ''}`.trim().replace(/\/$/, '');
  if (!ep) {
    try {
      const c = await getConfig();
      ep = `${c?.streamMapper?.serviceEP || ''}`.trim().replace(/\/$/, '');
    } catch {
      return '';
    }
  }
  if (!ep) return '';

  try {
    const res = await fetch(
      `${ep}/collabs/${encodeURIComponent(collabId)}`,
      { headers: { Authorization: auth } },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return '';
    return firstNonEmptyPersistUrl(
      collabPersistUrl(data),
      data.pageUrl,
      data.page_url,
      data.targetUrl,
      data.daPath,
      data.da_path,
      data.draftLocation,
      data.draft_location,
    );
  } catch {
    return '';
  }
}

export async function persistAnnotationChangesToDA() {
  await inlineEditing.syncInlineEditsBeforePersist();

  let promotedAssets = [];
  try {
    const result = await assetService.batchPromote();
    promotedAssets = result?.promoted || [];
  } catch (err) {
    console.error('[annotation] Batch promote failed:', err);
  }

  const allAssets = [...(annotationState.store.assets || [])];
  for (const promoted of promotedAssets) {
    const existing = allAssets.find((a) => a.id === promoted.id);
    if (existing) Object.assign(existing, promoted);
    else allAssets.push(promoted);
  }
  const assetReplacements = [];
  for (const asset of allAssets) {
    const finalUrl = asset.finalDaUrl || asset.daUrl;
    if (asset.originalSrc && finalUrl) {
      assetReplacements.push({
        elementPath: asset.elementPath,
        elementProps: asset.elementProps,
        originalSrc: asset.originalSrc,
        daUrl: asset.daUrl,
        targetUrl: finalUrl,
      });
    }
  }

  const { daCompatibleHtml } = buildHtmlWithEditsAndAssets(assetReplacements);

  const cfg = window.streamConfig || {};
  const c = annotationState.latestRemoteCollabSnapshot?.collab;
  let pushUrl = firstNonEmptyPersistUrl(
    cfg.pageUrl,
    cfg.targetUrl,
    cfg.page_url,
    cfg.target_url,
    cfg.daPath,
    cfg.da_path,
    collabPersistUrl(c),
    typeof window !== 'undefined'
      ? window.__streamHtmlReviewPersistUrl
      : '',
  );
  if (!pushUrl) {
    pushUrl = await fetchCollabPersistUrlFromService(cfg);
  }
  if (pushUrl) {
    const normalized = normalizePersistUrlForDaApi(pushUrl);
    pushUrl = normalized || pushUrl;
  }
  if (!pushUrl) {
    throw new Error(
      'persistAnnotationChangesToDA: set streamConfig.pageUrl or targetUrl (e.g. from STREAM_HTML_REVIEW_INIT).',
    );
  }

  await postData(pushUrl, daCompatibleHtml, {
    suppressErrorPage: true,
  });
}

export async function saveAnnotationChanges(reportProgress = () => {}) {
  await inlineEditing.syncInlineEditsBeforePersist();

  let newlyUploadedIds = [];
  try {
    newlyUploadedIds = await assetsPanel.uploadLocalAssets();
  } catch (err) {
    console.error('[annotation] Bulk upload of local assets failed:', err);
  }

  const fromApplied = assetsPanel.getAppliedAssetIds();
  const appliedAssetIds = [...new Set([...fromApplied, ...newlyUploadedIds])];
  if (appliedAssetIds.length > 0) {
    try {
      await assetService.batchDecideAssets(appliedAssetIds, 'accepted');
      assetsPanel.clearAppliedAssets();
    } catch (err) {
      console.error('[annotation] Batch decide failed:', err);
    }
  }

  const assetReplacements = [];
  for (const asset of (annotationState.store.assets || [])) {
    if (asset.originalSrc && asset.daUrl) {
      assetReplacements.push({
        elementPath: asset.elementPath,
        elementProps: asset.elementProps,
        originalSrc: asset.originalSrc,
        daUrl: asset.daUrl,
        targetUrl: asset.daUrl,
      });
    }
  }

  const { easyEdits, daCompatibleHtml } = buildHtmlWithEditsAndAssets(assetReplacements);


  await postData(window.streamConfig.targetUrl, daCompatibleHtml, {
    suppressErrorPage: true,
  });
  reportProgress('htmlSaved');

  if (annotationService.isAvailable()) {
    const persistedEditSnapshot = await annotationService.saveEdits(easyEdits);
    if (persistedEditSnapshot) {
      store.replaceEasyEdits(persistedEditSnapshot.editRecord);
      annotationState.latestSavedEditsUpdatedAt = persistedEditSnapshot.updatedAt
        || persistedEditSnapshot.createdAt
        || null;
      commentsPanel.markSelfSavedEditsSnapshot(persistedEditSnapshot.editRecord);
      annotationState.pendingRemoteEditsSnapshot = null;
      annotationState.hasLoadedInitialEditsSnapshot = true;
    }
  }
  reportProgress('editsSaved');
  store.saveAnnotationStore();
  requestParentCollabRefresh('edits-saved');
}

export function applyRemoteCollabSnapshot(snapshot) {
  commentsPanel.applyRemoteCollabSnapshot(snapshot);
}

export function preparePendingRemoteEditsRefresh() {
  return commentsPanel.applyPendingRemoteEditsSnapshot();
}

export async function refreshAnnotationFloatingUI() {
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
  commentsPanel.renderThreadMarkers({ resolveTargets: true });
}
