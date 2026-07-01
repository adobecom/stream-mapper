/* eslint-disable no-console */
/* eslint-disable function-paren-newline */
/* eslint-disable no-restricted-syntax */
import { createAnnotationState, createAnnotationUI } from './annotation/state.js';
import { createAnnotationStore } from './annotation/store.js';
import createCommentsPanelController from './annotation/comments-panel.js';
import createAnnotationServiceClient from './annotation/service.js';
import createAssetServiceClient from './annotation/asset-service.js';
import createAssetsPanelController from './annotation/assets-panel.js';
import requestParentCollabRefresh from './annotation/collab-sync.js';

// ── Module singletons ────────────────────────────────────────────────────────

const annotationState = createAnnotationState();
const annotationUI = createAnnotationUI();
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

assetsPanel.setOnAssetsChanged(() => {
  commentsPanel.renderThreadMarkers({ resolveTargets: true });
  commentsPanel.renderCommentsPanel();
});

let cachedCleanHtml = '';
let cachedPageMetadataHtml = null;

// ── Preview DOM helpers (annotationOperation only) ───────────────────────────

async function initializePreview() {
  document.body.querySelectorAll(':scope > header, :scope > main').forEach((el) => el.remove());
  const htmlDom = null;
  const headerEle = document.createElement('header');
  const mainEle = document.createElement('main');
  const metadataEle = document.createElement('div');
  metadataEle.classList.add('metadata', 'page-metadata');
  if (cachedPageMetadataHtml !== null) {
    metadataEle.innerHTML = cachedPageMetadataHtml;
  } else {
    htmlDom.querySelectorAll('div.metadata').forEach((mb) => {
      metadataEle.innerHTML += mb.innerHTML;
    });
  }
  mainEle.innerHTML = (htmlDom instanceof HTMLElement && htmlDom.tagName === 'MAIN')
    ? htmlDom.innerHTML
    : htmlDom;
  document.body.append(metadataEle);
  document.body.prepend(mainEle);
  document.body.prepend(headerEle);
}

// ── URL / HTML helpers ────────────────────────────────────────────────────────

function extractFilename(url) {
  if (!url) return '';
  return (url.split('?')[0]?.split('#')[0] ?? '').split('/').pop() || '';
}

function rewriteAttr(el, attr, origin) {
  const val = el.getAttribute(attr);
  if (!val) return;
  if (val.startsWith('data:')) { el.setAttribute('data-regen-src', val); return; }
  if (!origin) return;
  if (val.startsWith('./media')) {
    el.setAttribute(attr, `${origin}/${val.slice(2)}`);
  } else if (val.startsWith('/') && !val.startsWith('//')) {
    el.setAttribute(attr, `${origin}${val}`);
  }
}

function rewriteMediaUrls(container) {
  const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
  container.querySelectorAll('img').forEach((img) => {
    rewriteAttr(img, 'src', origin);
    if (img.hasAttribute('srcset')) rewriteAttr(img, 'srcset', origin);
  });
  container.querySelectorAll('source').forEach((source) => {
    rewriteAttr(source, 'srcset', origin);
  });
}

// ── Asset element resolution ──────────────────────────────────────────────────

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

function resolveBlockInSection(section, blockClass, blockIndex) {
  if (blockClass) {
    const matching = Array.from(section.querySelectorAll(`:scope > div.${blockClass}`));
    const block = matching[blockIndex] ?? matching[0] ?? null;
    if (block) return block;
  }
  const divs = Array.from(section.children).filter((el) => el.tagName === 'DIV');
  return divs[blockIndex] ?? null;
}

function findBlockByGlobalIndex(main, blockClass, blockGlobalIndex) {
  if (!blockClass || !(blockGlobalIndex >= 0)) return null;
  const allSimilarBlocks = Array.from(main.children).flatMap((section) => (
    Array.from(section.children).filter(
      (child) => child instanceof HTMLElement
        && Array.from(child.classList || []).find(Boolean) === blockClass,
    )
  ));
  return allSimilarBlocks[blockGlobalIndex] || null;
}

function findImgInBlock(block) {
  const pic = block.querySelector('picture');
  if (pic && pic.querySelector('img')) return pic;
  return block.querySelector('img');
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

  const sectionIndex = typeof elementProps?.sectionIndex === 'number'
    ? elementProps.sectionIndex : -1;
  const blockClass = typeof elementProps?.blockClass === 'string' ? elementProps.blockClass : '';
  const blockIndex = typeof elementProps?.blockIndex === 'number' ? elementProps.blockIndex : 0;
  const blockGlobalIndex = typeof elementProps?.blockGlobalIndex === 'number'
    ? elementProps.blockGlobalIndex : -1;

  if (blockClass && blockGlobalIndex >= 0) {
    const block = findBlockByGlobalIndex(main, blockClass, blockGlobalIndex);
    if (block) {
      const el = findImgInBlock(block);
      if (el) return el;
    }
  }

  if (elementProps && sectionIndex >= 0) {
    const sections = Array.from(main.children).filter((el) => el.tagName === 'DIV');
    const section = sections[sectionIndex];
    if (section) {
      const block = resolveBlockInSection(section, blockClass, blockIndex);
      if (block) {
        const pic = block.querySelector('picture');
        if (pic && pic.querySelector('img')) return pic;
        const img = block.querySelector('img');
        if (img) return img;
      }
    }
  }

  if (originalSrc) {
    const allImages = main.querySelectorAll('img');
    const withoutParams = originalSrc.split('?')[0]?.split('#')[0] ?? '';
    const filename = withoutParams.split('/').pop() || '';
    const candidates = [];

    for (const img of allImages) {
      const src = img.getAttribute('src') || '';
      if (src && withoutParams && src.includes(withoutParams)) candidates.push(img);
    }
    if (candidates.length === 0 && filename) {
      for (const img of allImages) {
        const src = (img.getAttribute('src') || '').split('?')[0]?.split('#')[0] ?? '';
        if (src.split('/').pop() === filename) candidates.push(img);
      }
    }

    if (candidates.length === 1) return candidates[0].closest('picture') || candidates[0];

    if (candidates.length > 1 && sectionIndex >= 0) {
      const sections = Array.from(main.children).filter((el) => el.tagName === 'DIV');
      const section = sections[sectionIndex];
      if (section) {
        const block = resolveBlockInSection(section, blockClass, blockIndex);
        if (block) {
          const blockCandidate = candidates.find((img) => block.contains(img));
          if (blockCandidate) return blockCandidate.closest('picture') || blockCandidate;
        }
      }
    }

    if (candidates.length > 0) return candidates[0].closest('picture') || candidates[0];
  }

  return null;
}

// ── HTML export ───────────────────────────────────────────────────────────────

function buildHtmlWithEditsAndAssets(assetReplacements, { excludeBlockClasses = [] } = {}) {
  const isExcluded = (bc) => excludeBlockClasses.includes(bc);
  const allEasyEdits = annotationState.store.easyEdits || [];
  const easyEdits = excludeBlockClasses.length
    ? allEasyEdits.filter((e) => !isExcluded(e?.blockClass || e?.elementProps?.blockClass))
    : allEasyEdits;
  const html = store.applyEasyEditsToHtmlString(cachedCleanHtml, easyEdits);
  const container = document.createElement('div');
  container.innerHTML = `<main>${html}</main>`;

  for (const asset of assetReplacements) {
    // Assets with block+globalIndex were already applied viewport-aware in the string phase
    const assetBc = asset.elementProps?.blockClass;
    const assetBgi = asset.elementProps?.blockGlobalIndex;
    if (isExcluded(assetBc)) continue; // eslint-disable-line no-continue
    if (assetBc && assetBgi != null) continue; // eslint-disable-line no-continue
    const element = findAssetElement(
      container, asset.elementPath, asset.elementProps, asset.originalSrc,
    );
    if (element) {
      replaceAssetUrl(element, asset.targetUrl);
    } else {
      const filenameCandidates = [
        extractFilename(asset.originalSrc),
        extractFilename(asset.daUrl),
      ].filter(Boolean);
      let matched = false;
      if (filenameCandidates.length > 0) {
        for (const img of container.querySelectorAll('img')) {
          if (filenameCandidates.includes(extractFilename(img.getAttribute('src') || ''))) {
            img.setAttribute('src', asset.targetUrl);
            if (img.hasAttribute('srcset')) img.setAttribute('srcset', asset.targetUrl);
            const picture = img.closest('picture');
            if (picture) {
              picture.querySelectorAll('source').forEach((s) => s.setAttribute('srcset', asset.targetUrl));
            }
            matched = true;
          }
        }
      }
      if (!matched && asset.daUrl) {
        for (const img of container.querySelectorAll('img')) {
          if ((img.getAttribute('src') || '') === asset.daUrl) {
            img.setAttribute('src', asset.targetUrl);
            if (img.hasAttribute('srcset')) img.setAttribute('srcset', asset.targetUrl);
            const picture = img.closest('picture');
            if (picture) {
              picture.querySelectorAll('source').forEach((s) => s.setAttribute('srcset', asset.targetUrl));
            }
          }
        }
      }
    }
  }

  // image-src easyEdits take priority — they carry the final promoted URL and
  // reliable original src, so they overwrite the assetReplacements pass above.
  const imageSrcEdits = (annotationState.store.easyEdits || [])
    .filter((e) => e?.editType === 'image-src' && e.to)
    .filter((e) => !isExcluded(e?.blockClass || e?.elementProps?.blockClass));
  // Edits with blockClass+blockGlobalIndex were already applied viewport-aware in the string phase
  imageSrcEdits
    .filter((edit) => {
      const bc = edit.blockClass || edit.elementProps?.blockClass;
      const bgi = edit.blockGlobalIndex ?? edit.elementProps?.blockGlobalIndex;
      return !(bc && bgi != null);
    })
    .forEach((edit) => {
      const mergedProps = {
        ...edit.elementProps,
        ...(edit.blockClass ? { blockClass: edit.blockClass } : {}),
        ...(edit.blockGlobalIndex != null ? { blockGlobalIndex: edit.blockGlobalIndex } : {}),
      };
      const element = findAssetElement(container, edit.elementPath, mergedProps, edit.from);
      if (element) replaceAssetUrl(element, edit.to);
    });

  rewriteMediaUrls(container);
  const mainEl = container.querySelector('main');

  return { easyEdits, daCompatibleHtml: mainEl.innerHTML };
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

function prepareAnnotationSession({ preserveRemoteEditState = false } = {}) {
  document.body.classList.add('annotation-mode');
  if (!preserveRemoteEditState) {
    annotationState.latestSavedEditsUpdatedAt = null;
    annotationState.pendingRemoteEditsSnapshot = null;
    annotationState.hasLoadedInitialEditsSnapshot = false;
  }
}

async function finishAnnotationSession(mainEl, { preserveRemoteEditState }) {
  await commentsPanel.setupAnnotationUI(mainEl, { preserveRemoteEditState });
  if (annotationState.latestRemoteCollabSnapshot) {
    commentsPanel.applyRemoteCollabSnapshot(annotationState.latestRemoteCollabSnapshot, {
      includeEdits: false,
    });
  }
  store.rebindEasyEditsToCurrentDom();
  await store.applyEasyEditsToDom();
  store.saveAnnotationStore();
  commentsPanel.renderThreadMarkers({ resolveTargets: true });
  commentsPanel.renderCommentsPanel();
  await store.applyEasyEditsToDom();
}

// ── Asset / edit processing (shared by persist and save) ──────────────────────

async function uploadAndDecideAssets() {
  let newlyUploadedIds = [];
  try {
    newlyUploadedIds = await assetsPanel.uploadLocalAssets();
  } catch (err) {
    console.error('[annotation] Upload of local assets failed:', err);
  }
  const appliedAssetIds = [...new Set([...assetsPanel.getAppliedAssetIds(), ...newlyUploadedIds])];
  if (appliedAssetIds.length > 0) {
    try {
      await assetService.batchDecideAssets(appliedAssetIds, 'accepted');
      assetsPanel.clearAppliedAssets();
    } catch (err) {
      console.error('[annotation] Batch decide failed:', err);
    }
  }
  return newlyUploadedIds;
}

function buildAssetReplacementsAndEdits(resolveTargetUrl) {
  const latestByPath = new Map();
  for (const asset of (annotationState.store.assets || [])) {
    // eslint-disable-next-line no-continue
    if (!asset.originalSrc || !asset.daUrl) continue;
    const existing = latestByPath.get(asset.elementPath);
    const isNewer = existing && asset.createdAt
      && new Date(asset.createdAt) > new Date(existing.createdAt || 0);
    if (!existing || isNewer) {
      latestByPath.set(asset.elementPath, asset);
    }
  }

  const assetReplacements = Array.from(latestByPath.values()).map((asset) => ({
    elementPath: asset.elementPath,
    elementProps: asset.elementProps,
    originalSrc: asset.originalSrc,
    daUrl: asset.daUrl,
    targetUrl: resolveTargetUrl(asset),
  }));

  for (const asset of latestByPath.values()) {
    const finalUrl = resolveTargetUrl(asset);
    if (!asset.elementPath || !finalUrl) continue; // eslint-disable-line no-continue
    const existingEdit = store.getEasyEditByElement(
      asset.elementRef || '', asset.elementPath, asset.elementProps,
    );
    if (!existingEdit || existingEdit.editType === 'image-src') {
      store.upsertEasyEdit({
        ...(existingEdit || {}),
        editType: 'image-src',
        elementPath: asset.elementPath,
        elementProps: asset.elementProps || {},
        elementRef: asset.elementRef || '',
        from: existingEdit?.from || asset.originalSrc,
        to: finalUrl,
        fromHtml: '',
        toHtml: '',
        // Keep the original replacement time so panel ordering stays chronological.
        updatedAt: existingEdit?.updatedAt || new Date().toISOString(),
      });
    }
  }

  return assetReplacements;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function annotationOperation(options = {}) {
  const { preserveRemoteEditState = false } = options;
  prepareAnnotationSession({ preserveRemoteEditState });

  await initializePreview();
  const mainEl = document.querySelector('main');
  if (!mainEl) return;

  if (window.streamConfig?.source === 'da') {
    mainEl.querySelectorAll(':scope > div').forEach((div) => {
      if (!div.dataset.source) div.dataset.source = 'da';
    });
  }

  if (!cachedCleanHtml) cachedCleanHtml = mainEl.innerHTML || '';

  const metadataDom = document.body.querySelector('.page-metadata');
  const metadataSeparator = document.createElement('div');
  metadataSeparator.classList.add('section', 'stream-annotation-page-metadata');
  metadataSeparator.innerHTML = '<h3>Page Metadata</h3>';
  metadataSeparator.append(metadataDom);
  mainEl.append(metadataSeparator);

  await finishAnnotationSession(mainEl, { preserveRemoteEditState });
}

export async function annotationOperationOnHostPage(options = {}) {
  const {
    preserveRemoteEditState = false,
    refreshBaselineHtml = false,
    baselineHtml = null,
  } = options;

  await new Promise((resolve) => {
    if (document.getElementById('page-load-ok-milo')) { resolve(); return; }
    const observer = new MutationObserver(() => {
      if (!document.getElementById('page-load-ok-milo')) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  prepareAnnotationSession({ preserveRemoteEditState });

  const mainEl = document.querySelector('main');
  if (!mainEl) throw new Error('annotationOperationOnHostPage: no <main> found on page');

  if (!cachedCleanHtml || refreshBaselineHtml) {
    cachedCleanHtml = baselineHtml || mainEl.innerHTML || '';
  }

  await finishAnnotationSession(mainEl, { preserveRemoteEditState });

  const stripBase64QueryParam = (el) => {
    const attr = el.tagName === 'SOURCE' ? 'srcset' : 'src';
    const val = el[attr];
    if (!val?.includes('base64')) return;
    const queryIdx = val.indexOf('?');
    if (queryIdx === -1) return;
    el[attr] = val.substring(0, queryIdx);
  };

  const mergedElements = [...document.querySelectorAll('main img, main source')];
  if (mergedElements.length) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => stripBase64QueryParam(m.target));
    });
    mergedElements.forEach((el) => {
      stripBase64QueryParam(el);
      observer.observe(el, { attributes: true, attributeFilter: ['src', 'srcset'] });
    });
  }
}

async function persistEditsToDb() {
  const savePayload = store.buildSavePayload();
  const savedEditIds = savePayload.map((edit) => edit.id).filter(Boolean);

  if (annotationService.isAvailable()) {
    const persistedEditSnapshot = await annotationService.saveEdits(savePayload);
    if (persistedEditSnapshot) {
      store.clearChangeHistoryAfterSave(savedEditIds);
      annotationState.latestSavedEditsUpdatedAt = persistedEditSnapshot.updatedAt
        || persistedEditSnapshot.createdAt
        || null;
      commentsPanel.markSelfSavedEditsSnapshot(persistedEditSnapshot.editRecord);
      annotationState.pendingRemoteEditsSnapshot = null;
      annotationState.hasLoadedInitialEditsSnapshot = true;
    }
  }
  store.saveAnnotationStore();
}

export async function saveAnnotationChanges(reportProgress = () => {}) {
  await uploadAndDecideAssets();
  // Save assigns each image edit its content.da.live URL (no DA push here).
  const assetReplacements = buildAssetReplacementsAndEdits((asset) => asset.daUrl);
  buildHtmlWithEditsAndAssets(assetReplacements);

  // Keep the cached page-metadata display in sync with the live DOM.
  const pageMetadataDom = document.body.querySelector('main .page-metadata');
  if (pageMetadataDom && pageMetadataDom.children.length) {
    cachedPageMetadataHtml = pageMetadataDom.innerHTML;
  }

  await persistEditsToDb();
  reportProgress('editsSaved');
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
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
  commentsPanel.renderThreadMarkers({ resolveTargets: true });
}
