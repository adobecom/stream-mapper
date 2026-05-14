/* eslint-disable no-console */
/* eslint-disable function-paren-newline */
/* eslint-disable no-restricted-syntax */
import { fetchFigmaContent } from '../sources/figma.js';
import { fetchDAContent } from '../sources/da.js';
import { hydrateFragmentLinksInDaBlocks } from './edit/fragment-hydrate.js';
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
const regenReplacements = [];
let cachedPageMetadataHtml = null;
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

assetsPanel.setOnAssetsChanged(() => {
  commentsPanel.renderThreadMarkers({ resolveTargets: true });
  commentsPanel.renderCommentsPanel();
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
  const metadataEle = document.createElement('div');
  metadataEle.classList.add('page-metadata');
  if (cachedPageMetadataHtml !== null) {
    metadataEle.innerHTML = cachedPageMetadataHtml;
  } else {
    const metadataBlocks = htmlDom.querySelectorAll('div.metadata');
    if (metadataBlocks) {
      metadataBlocks.forEach((mb) => {
        metadataEle.innerHTML += mb.innerHTML;
      });
    }
  }
  if (htmlDom instanceof HTMLElement && htmlDom.tagName === 'MAIN') {
    mainEle.innerHTML = htmlDom.innerHTML;
  } else {
    mainEle.innerHTML = htmlDom;
  }
  document.body.append(metadataEle);
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

    const candidates = [];
    for (const img of allImages) {
      const src = img.getAttribute('src') || '';
      if (src && withoutParams && src.includes(withoutParams)) {
        candidates.push(img);
      }
    }
    if (candidates.length === 0 && filename) {
      for (const img of allImages) {
        const src = (img.getAttribute('src') || '').split('?')[0]?.split('#')[0] ?? '';
        if (src.split('/').pop() === filename) {
          candidates.push(img);
        }
      }
    }

    if (candidates.length === 1) {
      return candidates[0].closest('picture') || candidates[0];
    }

    if (candidates.length > 1 && elementProps) {
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
            const blockCandidate = candidates.find((img) => block.contains(img));
            if (blockCandidate) return blockCandidate.closest('picture') || blockCandidate;
          }
        }
      }
    }

    if (candidates.length > 0) {
      return candidates[0].closest('picture') || candidates[0];
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

function toDaMediaUrl(url) {
  if (!url) return url;
  try {
    const filename = new URL(url).pathname.split('/').pop();
    if (!filename) return url;
    return `./media_${filename}`;
  } catch {
    return url;
  }
}

function rewriteAttr(el, attr, origin) {
  const val = el.getAttribute(attr);
  if (!val) return;
  if (val.startsWith('data:')) {
    el.setAttribute('data-regen-src', val);
    return;
  }
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

function buildHtmlWithEditsAndAssets(assetReplacements) {
  const easyEdits = annotationState.store.easyEdits || [];
  const html = store.applyEasyEditsToHtmlString(cachedCleanHtml, easyEdits);

  const container = document.createElement('div');
  container.innerHTML = `<main>${html}</main>`;

  for (const asset of assetReplacements) {
    const element = findAssetElement(
      container, asset.elementPath, asset.elementProps, asset.originalSrc,
    );
    if (element) {
      replaceAssetUrl(element, asset.targetUrl);
      // eslint-disable-next-line no-continue
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

  // Apply image-src easyEdits — these drive regen replacements and take
  // priority over the assetReplacements pass above because they carry the
  // final promoted/uploaded URL and the reliable original src for matching.
  const imageSrcEdits = (annotationState.store.easyEdits || [])
    .filter((e) => e?.editType === 'image-src' && e.to);
  for (const edit of imageSrcEdits) {
    const element = findAssetElement(container, edit.elementPath, edit.elementProps, edit.from);
    if (element) replaceAssetUrl(element, edit.to);
  }

  for (const regen of regenReplacements) {
    const regenFilename = extractFilename(regen.originalSrc);
    const allImages = container.querySelectorAll('img');
    for (const img of allImages) {
      const src = (img.getAttribute('src') || '').split('?')[0]?.split('#')[0] ?? '';
      if (src === regen.originalSrc || (regenFilename && src.split('/').pop() === regenFilename)) {
        const relUrl = toDaMediaUrl(regen.targetUrl);
        img.setAttribute('src', relUrl);
        if (img.hasAttribute('srcset')) img.setAttribute('srcset', relUrl);
        const picture = img.closest('picture');
        if (picture) {
          picture.querySelectorAll('source').forEach((s) => s.setAttribute('srcset', relUrl));
        }
        break;
      }
    }
  }

  rewriteMediaUrls(container);
  const mainEl = container.querySelector('main');

  const pageMetadataDom = document.body.querySelector('main .page-metadata');
  if (pageMetadataDom) {
    cachedPageMetadataHtml = pageMetadataDom.innerHTML;
    mainEl.querySelectorAll('.metadata').forEach((el) => {
      const parentSection = el.parentElement;
      el.remove();
      if (parentSection.children.length === 0) parentSection.remove();
    });
    const metadataDiv = document.createElement('div');
    metadataDiv.className = 'metadata';
    metadataDiv.innerHTML = pageMetadataDom.innerHTML;
    metadataDiv.querySelectorAll('p').forEach((p) => {
      const ptag = p;
      [...ptag.attributes].forEach((attr) => {
        ptag.removeAttribute(attr.name);
      });
    });
    metadataDiv.querySelectorAll('img').forEach((img) => {
      const daSrc = img.getAttribute('data-stream-original-src');
      img.setAttribute('src', daSrc);
    });
    const divWrapper = document.createElement('div');
    divWrapper.append(metadataDiv);
    mainEl.appendChild(divWrapper);
  }

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
  const mainEl = document.querySelector('main');
  if (!mainEl) return;

  if (window.streamConfig?.source === 'da') {
    mainEl.querySelectorAll(':scope > div').forEach((div) => {
      if (!div.dataset.source) div.dataset.source = 'da';
    });
  }

  if (!cachedCleanHtml) {
    cachedCleanHtml = mainEl.innerHTML || '';
  }

  if (window.streamConfig?.source === 'da') {
    const insertedFragments = await hydrateFragmentLinksInDaBlocks(mainEl);
    for (const root of insertedFragments) {
      // eslint-disable-next-line no-await-in-loop
      await miloLoadArea(root);
    }
  }

  await miloLoadArea();

  // initialize page metadata
  const metadataDom = document.body.querySelector('.page-metadata');
  const metadataSeparator = document.createElement('div');
  metadataSeparator.classList.add('section');
  metadataSeparator.classList.add('stream-annotation-page-metadata');
  metadataSeparator.innerHTML = '<h3>Page Metadata</h3>';
  metadataSeparator.append(metadataDom);

  function addAndRegisterRow(row) {
    metadataDom.append(row);
    row.querySelectorAll('p').forEach((p) => {
      inlineEditing.registerNewEditableElement(p);
    });
  }

  const addTextBtn = document.createElement('button');
  addTextBtn.className = 'stream-annotation-add-metadata-row';
  addTextBtn.textContent = '+ Add text/link row';
  addTextBtn.addEventListener('click', () => {
    const row = document.createElement('div');
    row.innerHTML = '<div><p>add metadata key</p></div><div><p>add text or link value</p></div>';
    addAndRegisterRow(row);
  });

  const addImageBtn = document.createElement('button');
  addImageBtn.className = 'stream-annotation-add-metadata-row';
  addImageBtn.textContent = '+ Add image row';
  addImageBtn.addEventListener('click', () => {
    const row = document.createElement('div');
    row.innerHTML = '<div><p>key</p></div><div><picture><img src="https://main--stream-mapper--adobecom.aem.live/assets/media_1bf6f8fe5a340bb3f4e022b300d7013821fe5ff89.png"></picture></div>';
    addAndRegisterRow(row);
  });

  const metadataActions = document.createElement('div');
  metadataActions.className = 'stream-annotation-metadata-actions';
  metadataActions.append(addTextBtn);
  metadataActions.append(addImageBtn);
  metadataSeparator.append(metadataActions);
  mainEl.append(metadataSeparator);

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
    baselineHtml = null,
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
    cachedCleanHtml = mainEl.innerHTML || baselineHtml || '';
  }

  await finishAnnotationSession(mainEl, {
    preserveRemoteEditState,
    shouldRestoreInlineMode,
  });
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

export async function persistAnnotationChangesToDA() {
  await inlineEditing.syncInlineEditsBeforePersist();

  try {
    await assetsPanel.uploadLocalAssets();
  } catch (err) {
    console.error('[annotation] Upload of local assets failed before promote:', err);
  }

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

  // Update image-src easyEdits to use the final promoted DA URL so the
  // correct URL ends up in the pushed HTML.
  for (const asset of allAssets) {
    const finalUrl = asset.finalDaUrl || asset.daUrl;
    if (!asset.elementPath || !finalUrl) continue; // eslint-disable-line no-continue
    const existingEdit = store.getEasyEditByElement(
      asset.elementRef || '', asset.elementPath, asset.elementProps,
    );
    if (existingEdit?.editType === 'image-src') {
      store.upsertEasyEdit({ ...existingEdit, to: finalUrl, updatedAt: new Date().toISOString() });
    }
  }

  const { daCompatibleHtml } = buildHtmlWithEditsAndAssets(assetReplacements);

  const cfg = window.streamConfig || {};
  const rawPushUrl = `${cfg.pageUrl || cfg.targetUrl || ''}`.trim();
  if (!rawPushUrl) {
    throw new Error(
      'persistAnnotationChangesToDA: streamConfig.pageUrl is required (set via STREAM_HTML_REVIEW_INIT).',
    );
  }
  const pushUrl = normalizePersistUrlForDaApi(rawPushUrl) || rawPushUrl;

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

  const latestByPath = new Map();
  for (const asset of (annotationState.store.assets || [])) {
    // eslint-disable-next-line no-continue
    if (!asset.originalSrc || !asset.daUrl) continue;
    const existing = latestByPath.get(asset.elementPath);
    // eslint-disable-next-line max-len
    if (!existing || (asset.createdAt && new Date(asset.createdAt) > new Date(existing.createdAt || 0))) {
      latestByPath.set(asset.elementPath, asset);
    }
  }
  const assetReplacements = Array.from(latestByPath.values()).map((asset) => ({
    elementPath: asset.elementPath,
    elementProps: asset.elementProps,
    originalSrc: asset.originalSrc,
    daUrl: asset.daUrl,
    targetUrl: asset.daUrl,
  }));

  // Record each uploaded regen asset as an image-src easyEdit so the
  // change is tracked in history and drives reliable DOM replacement.
  for (const asset of latestByPath.values()) {
    if (!asset.elementPath || !asset.daUrl) continue; // eslint-disable-line no-continue
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
        to: asset.daUrl,
        fromHtml: '',
        toHtml: '',
        updatedAt: new Date().toISOString(),
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

export function recordTextRegenAsEdit(element, fromText, toText, fromHtml = '') {
  if (!(element instanceof HTMLElement) || !annotationUI.mainEl) return;

  const elementRef = store.ensureElementRef(element);
  const snapshot = annotationUI.inlineElementSnapshot.get(elementRef);
  const baselineText = snapshot?.originalText || fromText;
  const baselineHtml = snapshot?.originalHtml || fromHtml;

  const editAnchor = store.buildEditElementAnchor(element, annotationUI.mainEl);
  const segments = store.getChangedSegments(baselineText, toText);

  const existing = store.getEasyEditByElement(
    elementRef,
    editAnchor.elementPath,
    editAnchor.elementProps,
  );
  const editRecord = {
    id: existing?.id || store.generateId('easy-edit'),
    editType: 'text',
    attrName: '',
    elementPath: editAnchor.elementPath,
    elementProps: editAnchor.elementProps,
    elementRef,
    from: baselineText,
    to: toText,
    fromHtml: baselineHtml,
    toHtml: toText,
    changedFrom: segments.changedFrom,
    changedTo: segments.changedTo,
    updatedAt: new Date().toISOString(),
  };

  const persistedEdit = store.upsertEasyEdit(editRecord);

  const editThread = store.getEditThreadByElementPath(
    persistedEdit?.elementPath,
    persistedEdit?.elementProps,
  );
  if (editThread) {
    annotationState.activeThreadId = editThread.id;
    annotationState.activeMessageId = '';
    annotationState.activeEditId = '';
  }
  store.saveAnnotationStore();
  commentsPanel.renderThreadMarkers({ resolveTargets: true });
  commentsPanel.renderCommentsPanel();
}

export function registerRegenReplacement(originalSrc, newUrl) {
  const existing = regenReplacements.findIndex((r) => r.originalSrc === originalSrc);
  if (existing >= 0) regenReplacements[existing].targetUrl = newUrl;
  else regenReplacements.push({ originalSrc, targetUrl: newUrl });
}

/* eslint-disable no-console */
export async function recordImageRegenAsLocalAsset(imgEl, generatedUrl) {
  if (!(imgEl instanceof HTMLImageElement) || !generatedUrl) return;

  const cfg = await getConfig();
  const rawToken = cfg?.streamMapper?.daToken || window.streamConfig?.token || '';
  const authToken = rawToken && !rawToken.startsWith('Bearer ') ? `Bearer ${rawToken}` : rawToken;

  let blob;
  try {
    const fetchOpts = authToken ? { headers: { Authorization: authToken } } : {};
    const res = await fetch(generatedUrl, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    blob = await res.blob();
  } catch (err) {
    console.warn('[annotation] Could not fetch generated image', err);
    return;
  }

  const mimeType = blob.type || 'image/jpeg';
  const ext = mimeType.split('/')[1]?.split('+')[0] || 'jpg';
  const file = new File([blob], `generated-${Date.now()}.${ext}`, { type: mimeType });

  const base64Data = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
  if (!base64Data) return;

  await assetsPanel.registerLocalAssetFromRegen(imgEl, file, base64Data);
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
