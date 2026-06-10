/* eslint-disable no-console */
/* eslint-disable function-paren-newline */
/* eslint-disable no-restricted-syntax */
import { fetchFigmaContent } from '../sources/figma.js';
import {
  fetchDAContent,
  daPageExists,
  copyDaPage,
} from '../sources/da.js';
import { hydrateFragmentLinksInDaBlocks } from './edit/fragment-hydrate.js';
import { miloLoadArea } from '../utils/utils.js';
import { getDACompatibleHtml, postData } from '../target/da.js';
import { fetchImageAsBase64 } from './edit/dom.js';
import { createAnnotationState, createAnnotationUI } from './annotation/state.js';
import { createAnnotationStore } from './annotation/store.js';
import createCommentsPanelController from './annotation/comments-panel.js';
import createInlineEditingController from './annotation/inline-editing.js';
import createAnnotationServiceClient from './annotation/service.js';
import createAssetServiceClient from './annotation/asset-service.js';
import createAssetsPanelController from './annotation/assets-panel.js';
import requestParentCollabRefresh from './annotation/collab-sync.js';
import { handleError } from '../utils/error-handler.js';

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
const previewUrlCache = new Map();

async function resolvePreviewUrl(url) {
  if (!url || !url.includes('content.da.live')) return url;
  if (previewUrlCache.has(url)) return previewUrlCache.get(url);
  const b64 = await fetchImageAsBase64(url);
  if (b64) previewUrlCache.set(url, b64);
  return b64 || url;
}

export async function setupCollabSpace() {
  if (
    !window.streamConfig.draftLocation
    || (window.streamConfig.draftLocation
    && window.streamConfig.targetUrl
    && window.streamConfig.draftLocation === window.streamConfig.targetUrl)
  ) {
    const { collabId } = window.streamConfig;
    if (!collabId) handleError('error', ' with setting up the collab');
    const targetHierarchy = window.streamConfig.targetUrl.split('/');
    const collabUrl = `${targetHierarchy[0]}/${targetHierarchy[1]}/drafts/collab/${collabId}/${targetHierarchy[targetHierarchy.length - 1]}`;
    const collabSpaceExists = await daPageExists(collabUrl);
    if (!collabSpaceExists) {
      if (await copyDaPage(window.streamConfig.targetUrl, collabUrl)) {
        window.streamConfig.draftLocation = collabUrl;
        await new Promise((resolve) => { setTimeout(resolve, 15000); });
      }
    } else {
      window.streamConfig.draftLocation = collabUrl;
    }
  }
}

export async function recordImageRegenAsLocalAsset(imgEl, generatedUrl, pendingAlt = '') {
  if (!(imgEl instanceof HTMLImageElement) || !generatedUrl) return;

  const base64Data = await fetchImageAsBase64(generatedUrl);
  if (!base64Data) return;

  const mimeType = base64Data.split(';')[0].split(':')[1] || 'image/jpeg';
  const ext = mimeType.split('/')[1]?.split('+')[0] || 'jpg';
  const binaryStr = atob(base64Data.split(',')[1]);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i += 1) bytes[i] = binaryStr.charCodeAt(i);
  const file = new File([bytes], `generated-${Date.now()}.${ext}`, { type: mimeType });

  await assetsPanel.registerLocalAssetFromRegen(imgEl, file, base64Data, pendingAlt, generatedUrl);
}

const commentsPanel = createCommentsPanelController({
  annotationState,
  annotationUI,
  store,
  assetsPanel,
});
commentsPanel.setImageRegenHandler(recordImageRegenAsLocalAsset);

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

let cachedCleanHtml = '';
let cachedPageMetadataHtml = null;
let pageMetadataBaselineHtml = null;
const regenReplacements = [];

const PAGE_METADATA_EDIT_PATH = '__PAGE_METADATA__';
const PAGE_METADATA_EDIT_ID = 'easy-edit-page-metadata';
const METADATA_USER_ROW_ATTR = 'data-stream-user-added-row';

function getPageMetadataContainer() {
  return document.body.querySelector('main .page-metadata')
    || document.body.querySelector('main .metadata')
    || document.body.querySelector('.page-metadata');
}

function setupPageMetadataUI(mainEl) {
  if (!(mainEl instanceof HTMLElement)) return;
  if (mainEl.querySelector('.stream-annotation-page-metadata')) return;

  let metadataDom = getPageMetadataContainer();
  if (!metadataDom) {
    metadataDom = document.createElement('div');
    metadataDom.classList.add('metadata', 'page-metadata');
  } else {
    metadataDom.classList.add('metadata', 'page-metadata');
  }

  const hostSection = (
    metadataDom.parentElement instanceof HTMLElement
    && metadataDom.parentElement.classList.contains('section')
    && metadataDom.parentElement.parentElement === mainEl
    && !metadataDom.parentElement.classList.contains('stream-annotation-page-metadata')
  ) ? metadataDom.parentElement : null;

  const metadataSeparator = document.createElement('div');
  metadataSeparator.classList.add('section', 'stream-annotation-page-metadata');
  metadataSeparator.innerHTML = '<h3>Page Metadata</h3>';
  metadataSeparator.append(metadataDom);

  const addAndRegisterRow = (row) => {
    row.setAttribute(METADATA_USER_ROW_ATTR, 'true');
    metadataDom.append(row);
    row.querySelectorAll('p').forEach((p) => inlineEditing.registerNewEditableElement(p));
    ensureUserMetadataRowDeleteButton(row);
  };

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
  metadataActions.append(addTextBtn, addImageBtn);
  metadataSeparator.append(metadataActions);

  if (hostSection) {
    hostSection.replaceWith(metadataSeparator);
  } else {
    mainEl.append(metadataSeparator);
  }
}

function stripMetadataFromMainHtml(html) {
  const container = document.createElement('div');
  container.innerHTML = `<main>${html}</main>`;
  const main = container.querySelector('main');
  if (!main) return html;
  main.querySelectorAll('.metadata').forEach((el) => {
    const parentSection = el.parentElement;
    el.remove();
    if (parentSection && parentSection.children.length === 0) parentSection.remove();
  });
  return main.innerHTML;
}

function resolveMetadataPersistedUrl(el) {
  if (!(el instanceof HTMLElement)) return '';
  return el.getAttribute('data-stream-original-src')
    || el.getAttribute('data-original-src')
    || '';
}

function isBase64MediaValue(value = '') {
  const normalized = `${value}`.trim();
  return normalized.includes('base64') || normalized.startsWith('data:');
}

function normalizeMetadataMediaInRoot(root) {
  if (!(root instanceof HTMLElement)) return;

  root.querySelectorAll('img').forEach((img) => {
    const daSrc = resolveMetadataPersistedUrl(img);
    const src = img.getAttribute('src') || '';
    if (daSrc && isBase64MediaValue(src)) {
      img.setAttribute('src', daSrc);
    }
    const srcset = img.getAttribute('srcset') || '';
    if (isBase64MediaValue(srcset)) {
      const resolvedSrc = img.getAttribute('src') || '';
      const replacement = daSrc || (!isBase64MediaValue(resolvedSrc) ? resolvedSrc : '');
      if (replacement) img.setAttribute('srcset', replacement);
      else img.removeAttribute('srcset');
    }
  });

  root.querySelectorAll('source').forEach((source) => {
    const pictureImg = source.closest('picture')?.querySelector('img');
    const daSrc = resolveMetadataPersistedUrl(source) || resolveMetadataPersistedUrl(pictureImg);
    const srcset = source.getAttribute('srcset') || '';
    if (isBase64MediaValue(srcset)) {
      if (daSrc) source.setAttribute('srcset', daSrc);
      else source.removeAttribute('srcset');
    }
  });
}

function sanitizeMetadataInnerHtml(innerHtml, { forDaPush = false, forPersist = false } = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = innerHtml || '';
  wrapper.querySelectorAll('.stream-annotation-delete-metadata-row').forEach((el) => el.remove());
  wrapper.querySelectorAll('.stream-metadata-user-row-inner').forEach((inner) => {
    const plain = document.createElement('div');
    while (inner.firstChild) plain.appendChild(inner.firstChild);
    inner.replaceWith(plain);
  });
  wrapper.querySelectorAll('[class*="stream-metadata"], [class*="stream-annotation"]').forEach((el) => {
    el.classList.remove('stream-metadata-user-row', 'stream-metadata-user-row-inner');
    [...el.classList].forEach((cls) => {
      if (cls.startsWith('stream-metadata-') || cls.startsWith('stream-annotation-')) {
        el.classList.remove(cls);
      }
    });
  });
  wrapper.querySelectorAll('[data-stream-user-added-metadata-row]').forEach((el) => {
    delete el.dataset.streamUserAddedMetadataRow;
  });

  if (forPersist || forDaPush) {
    normalizeMetadataMediaInRoot(wrapper);
  }
  if (forDaPush) {
    wrapper.querySelectorAll(`[${METADATA_USER_ROW_ATTR}]`).forEach((el) => {
      el.removeAttribute(METADATA_USER_ROW_ATTR);
    });
  }
  if (forPersist || forDaPush) {
    wrapper.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        if (attr.name.startsWith('data-stream-')) el.removeAttribute(attr.name);
      });
    });
  }
  return wrapper.innerHTML;
}

function resolveMetadataUrlsForPush(metadataInnerHtml) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = metadataInnerHtml || '';
  const assets = annotationState.store.assets || [];

  const findPromotedUrl = (mediaUrl = '') => {
    const normalized = `${mediaUrl}`.trim();
    if (!normalized) return '';
    const filename = extractFilename(normalized);
    const match = assets.find((asset) => {
      const finalUrl = `${asset.finalDaUrl || ''}`.trim();
      if (!finalUrl) return false;
      const draftUrl = `${asset.daUrl || ''}`.trim();
      const originalSrc = `${asset.originalSrc || ''}`.trim();
      return normalized === draftUrl
        || normalized === originalSrc
        || (filename && filename === extractFilename(draftUrl))
        || (filename && filename === extractFilename(finalUrl));
    });
    return match?.finalDaUrl || '';
  };

  wrapper.querySelectorAll('img').forEach((img) => {
    const promotedSrc = findPromotedUrl(img.getAttribute('src') || '');
    if (promotedSrc) {
      img.setAttribute('src', promotedSrc);
      if (img.hasAttribute('srcset')) img.setAttribute('srcset', promotedSrc);
    }
  });
  wrapper.querySelectorAll('source').forEach((source) => {
    const promotedSrcset = findPromotedUrl(source.getAttribute('srcset') || '');
    if (promotedSrcset) source.setAttribute('srcset', promotedSrcset);
  });
  return wrapper.innerHTML;
}

function appendMetadataToMainHtml(mainInnerHtml, metadataInnerHtml) {
  const cleanMetadataInner = sanitizeMetadataInnerHtml(metadataInnerHtml, { forDaPush: true });
  const metaContainer = document.createElement('div');
  metaContainer.innerHTML = `<main>${mainInnerHtml}</main>`;
  const metaMain = metaContainer.querySelector('main');
  metaMain.querySelectorAll('.metadata').forEach((el) => {
    const parentSection = el.parentElement;
    el.remove();
    if (parentSection && parentSection.children.length === 0) parentSection.remove();
  });
  const metadataDiv = document.createElement('div');
  metadataDiv.className = 'metadata';
  metadataDiv.innerHTML = cleanMetadataInner;
  metadataDiv.querySelectorAll('p').forEach((p) => {
    [...p.attributes].forEach((attr) => p.removeAttribute(attr.name));
  });
  metadataDiv.querySelectorAll('img').forEach((img) => {
    [...img.attributes].forEach((attr) => {
      if (attr.name.startsWith('data-')) img.removeAttribute(attr.name);
    });
  });
  const divWrapper = document.createElement('div');
  divWrapper.append(metadataDiv);
  metaMain.appendChild(divWrapper);
  return getDACompatibleHtml(metaMain.innerHTML);
}

function syncCachedPageMetadataFromDom() {
  const pageMetadataDom = getPageMetadataContainer();
  if (pageMetadataDom) {
    cachedPageMetadataHtml = pageMetadataDom.innerHTML;
  }
}

function getPageMetadataEdit() {
  return (annotationState.store.easyEdits || []).find(
    (edit) => edit?.editType === 'page-metadata'
      || edit?.elementPath === PAGE_METADATA_EDIT_PATH,
  ) || null;
}

function ensurePageMetadataBaseline() {
  if (pageMetadataBaselineHtml !== null) return;
  const container = getPageMetadataContainer();
  if (!container) return;
  pageMetadataBaselineHtml = sanitizeMetadataInnerHtml(container.innerHTML, { forDaPush: true });
}

function syncPageMetadataEdit() {
  const container = getPageMetadataContainer();
  if (!container) return;
  const toHtml = sanitizeMetadataInnerHtml(container.innerHTML, { forPersist: true });
  store.upsertEasyEdit({
    id: PAGE_METADATA_EDIT_ID,
    editType: 'page-metadata',
    elementPath: PAGE_METADATA_EDIT_PATH,
    elementProps: {},
    elementRef: '',
    from: '',
    to: '',
    fromHtml: pageMetadataBaselineHtml || toHtml,
    toHtml,
    updatedAt: new Date().toISOString(),
  });
  store.saveAnnotationStore();
}

function applyPageMetadataFromEasyEdits() {
  const edit = getPageMetadataEdit();
  if (!edit?.toHtml) return;
  const container = getPageMetadataContainer();
  if (!container) return;
  container.innerHTML = edit.toHtml;
  cachedPageMetadataHtml = edit.toHtml;
  if (edit.fromHtml && pageMetadataBaselineHtml === null) {
    pageMetadataBaselineHtml = edit.fromHtml;
  }
}

function ensureUserMetadataRowDeleteButton(row) {
  if (!(row instanceof HTMLElement)) return;
  if (!row.hasAttribute(METADATA_USER_ROW_ATTR)) return;
  if (row.querySelector(':scope > .stream-annotation-delete-metadata-row')) return;
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'stream-annotation-delete-metadata-row';
  deleteBtn.setAttribute('aria-label', 'Delete metadata row');
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeUserMetadataRow(row);
  });
  row.append(deleteBtn);
}

function refreshPageMetadataDeleteButtons() {
  const container = getPageMetadataContainer();
  if (!container) return;
  container.querySelectorAll(':scope > div').forEach((row) => {
    row.querySelectorAll('.stream-annotation-delete-metadata-row').forEach((btn) => btn.remove());
    if (row.hasAttribute(METADATA_USER_ROW_ATTR)) {
      ensureUserMetadataRowDeleteButton(row);
    }
  });
}

function removeUserMetadataRow(row) {
  if (!(row instanceof HTMLElement) || !row.hasAttribute(METADATA_USER_ROW_ATTR)) return;
  row.remove();
}

function commitMetadataRowsAfterSave() {
  const container = getPageMetadataContainer();
  if (!container) return;
  container.querySelectorAll(`[${METADATA_USER_ROW_ATTR}]`).forEach((row) => {
    row.removeAttribute(METADATA_USER_ROW_ATTR);
    row.querySelectorAll('.stream-annotation-delete-metadata-row').forEach((btn) => btn.remove());
  });
  syncCachedPageMetadataFromDom();
}

commentsPanel.setOnEditsAppliedBefore(() => {
  applyPageMetadataFromEasyEdits();
  refreshPageMetadataDeleteButtons();
});

commentsPanel.setOnEditsApplied(() => {
  syncCachedPageMetadataFromDom();
});

// ── Preview DOM helpers (annotationOperation only) ───────────────────────────

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
    const cfg = window.streamConfig;
    const html = await fetchDAContent(cfg.draftLocation || cfg.contentUrl);
    normalizeDAImages(html);
    return html;
  }
  return null;
}

async function initializePreview() {
  document.body.querySelectorAll(':scope > header, :scope > main').forEach((el) => el.remove());
  const htmlDom = await getDADom();
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
  const rawMainHtml = (htmlDom instanceof HTMLElement && htmlDom.tagName === 'MAIN')
    ? htmlDom.innerHTML
    : htmlDom;
  mainEle.innerHTML = stripMetadataFromMainHtml(rawMainHtml);
  document.body.append(metadataEle);
  document.body.prepend(mainEle);
  document.body.prepend(headerEle);
}

// ── URL / HTML helpers ────────────────────────────────────────────────────────

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

  for (const regen of regenReplacements) {
    const regenFilename = extractFilename(regen.originalSrc);
    for (const img of container.querySelectorAll('img')) {
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

  return { easyEdits, daCompatibleHtml: getDACompatibleHtml(mainEl.innerHTML) };
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

function prepareAnnotationSession({ preserveRemoteEditState = false } = {}) {
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
  return { shouldRestoreInlineMode };
}

async function finishAnnotationSession(mainEl, {
  preserveRemoteEditState,
  shouldRestoreInlineMode,
}) {
  await commentsPanel.setupAnnotationUI(mainEl, { preserveRemoteEditState });
  if (annotationState.latestRemoteCollabSnapshot) {
    commentsPanel.applyRemoteCollabSnapshot(annotationState.latestRemoteCollabSnapshot, {
      includeEdits: false,
    });
  }
  store.setPreviewUrlResolver(resolvePreviewUrl);
  store.rebindEasyEditsToCurrentDom();
  applyPageMetadataFromEasyEdits();
  refreshPageMetadataDeleteButtons();
  await store.applyEasyEditsToDom();
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
  await store.applyEasyEditsToDom();
  syncCachedPageMetadataFromDom();
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

// ── da.live URL normalizer ────────────────────────────────────────────────────

/** da.live edit URL → repo path (e.g. adobecom/...); leaves plain paths unchanged. */
function normalizePersistUrlForDaApi(raw) {
  const s = `${raw || ''}`.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) return s.replace(/^\/+/, '');
  try {
    const u = new URL(s);
    if (u.hash?.startsWith('#/')) return decodeURIComponent(u.hash.slice(2)).replace(/^\/+/, '');
    if (u.hostname.includes('da.live') && u.pathname && u.pathname !== '/') {
      return decodeURIComponent(u.pathname).replace(/^\/+/, '');
    }
  } catch { /* ignore */ }
  return s;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function annotationOperation(options = {}) {
  const { preserveRemoteEditState = false } = options;
  const { shouldRestoreInlineMode } = prepareAnnotationSession({ preserveRemoteEditState });

  await initializePreview();
  const mainEl = document.querySelector('main');
  if (!mainEl) return;

  if (window.streamConfig?.source === 'da') {
    mainEl.querySelectorAll(':scope > div').forEach((div) => {
      if (!div.dataset.source) div.dataset.source = 'da';
    });
  }

  if (!cachedCleanHtml) cachedCleanHtml = stripMetadataFromMainHtml(mainEl.innerHTML || '');

  if (window.streamConfig?.source === 'da') {
    const insertedFragments = await hydrateFragmentLinksInDaBlocks(mainEl);
    for (const root of insertedFragments) {
      // eslint-disable-next-line no-await-in-loop
      await miloLoadArea(root);
    }
  }

  await miloLoadArea();

  setupPageMetadataUI(mainEl);

  await finishAnnotationSession(mainEl, { preserveRemoteEditState, shouldRestoreInlineMode });

  ensurePageMetadataBaseline();
}

export async function annotationOperationOnHostPage(options = {}) {
  const {
    preserveRemoteEditState = false,
    refreshBaselineHtml = false,
    baselineHtml = null,
  } = options;

  await new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.getElementById('page-load-ok-milo')) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.body, { childList: true });
  });

  const { shouldRestoreInlineMode } = prepareAnnotationSession({ preserveRemoteEditState });

  const mainEl = document.querySelector('main');
  if (!mainEl) throw new Error('annotationOperationOnHostPage: no <main> found on page');

  if (!cachedCleanHtml || refreshBaselineHtml) {
    if (window.streamConfig?.source === 'da') {
      try {
        const cfg = window.streamConfig;
        const daMain = await fetchDAContent(cfg.draftLocation || cfg.contentUrl);
        cachedCleanHtml = stripMetadataFromMainHtml(daMain?.innerHTML || '');
      } catch (err) {
        console.warn('[annotation] Failed to fetch DA baseline HTML, falling back to live DOM:', err);
        cachedCleanHtml = stripMetadataFromMainHtml(mainEl.innerHTML || '');
      }
    } else {
      cachedCleanHtml = stripMetadataFromMainHtml(baselineHtml || mainEl.innerHTML || '');
    }
  }

  setupPageMetadataUI(mainEl);

  await finishAnnotationSession(mainEl, { preserveRemoteEditState, shouldRestoreInlineMode });

  ensurePageMetadataBaseline();

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

export async function persistAnnotationChangesToDA(versionLabel = null) {
  await inlineEditing.syncInlineEditsBeforePersist();
  await uploadAndDecideAssets();

  let promotedAssets = [];
  try {
    const result = await assetService.batchPromote();
    promotedAssets = result?.promoted || [];
  } catch (err) {
    console.error('[annotation] Batch promote failed:', err);
  }

  for (const promoted of promotedAssets) {
    const existing = (annotationState.store.assets || []).find((a) => a.id === promoted.id);
    if (existing) Object.assign(existing, promoted);
    else annotationState.store.assets.push(promoted);
  }

  const assetReplacements = buildAssetReplacementsAndEdits(
    (asset) => asset.finalDaUrl || asset.daUrl,
  );
  let { daCompatibleHtml } = buildHtmlWithEditsAndAssets(assetReplacements, {
    excludeBlockClasses: ['metadata'],
  });

  const metaEdit = getPageMetadataEdit();
  let metadataInner = metaEdit?.toHtml || pageMetadataBaselineHtml || '';
  if (metadataInner) {
    metadataInner = resolveMetadataUrlsForPush(metadataInner);
    daCompatibleHtml = appendMetadataToMainHtml(daCompatibleHtml, metadataInner);
  }

  const cfg = window.streamConfig || {};
  const rawPushUrl = `${cfg.pageUrl || ''}`.trim();
  if (!rawPushUrl) {
    throw new Error(
      'persistAnnotationChangesToDA: streamConfig.pageUrl is required (set via STREAM_HTML_REVIEW_INIT).',
    );
  }
  await postData(normalizePersistUrlForDaApi(rawPushUrl) || rawPushUrl, daCompatibleHtml, {
    suppressErrorPage: true,
    ...(versionLabel ? { versionLabel } : {}),
  });
  // eslint-disable-next-line no-use-before-define
  await persistEditsToDb();
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
  await inlineEditing.syncInlineEditsBeforePersist();
  await uploadAndDecideAssets();
  // Save assigns each image edit its content.da.live URL (no DA push here).
  buildAssetReplacementsAndEdits((asset) => asset.daUrl);
  syncPageMetadataEdit();

  await persistEditsToDb();
  commitMetadataRowsAfterSave();
  reportProgress('editsSaved');
  requestParentCollabRefresh('edits-saved');
}

export function applyRemoteCollabSnapshot(snapshot) {
  commentsPanel.applyRemoteCollabSnapshot(snapshot);
}

export function recordTextRegenAsEdit(element, fromText, toText, fromHtml = '') {
  if (!(element instanceof HTMLElement) || !annotationUI.mainEl) return;

  const elementRef = store.ensureElementRef(element);
  const snapshot = annotationUI.inlineElementSnapshot.get(elementRef);

  const editAnchor = store.buildEditElementAnchor(element, annotationUI.mainEl);
  const existing = store.getEasyEditByElement(
    elementRef, editAnchor.elementPath, editAnchor.elementProps,
  );
  const stampedOriginal = store.getEasyEditOriginalForElement(element);
  // eslint-disable-next-line max-len
  const baselineText = existing?.from ?? stampedOriginal?.from ?? snapshot?.originalText ?? fromText;
  // eslint-disable-next-line max-len
  const baselineHtml = existing?.fromHtml ?? stampedOriginal?.fromHtml ?? snapshot?.originalHtml ?? fromHtml;
  const segments = store.getChangedSegments(baselineText, toText);

  const persistedEdit = store.upsertEasyEdit({
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
  });

  const editThread = store.getEditThreadByElementPath(
    persistedEdit?.elementPath, persistedEdit?.elementProps,
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

export function preparePendingRemoteEditsRefresh() {
  return commentsPanel.applyPendingRemoteEditsSnapshot();
}

export async function refreshAnnotationFloatingUI() {
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
  commentsPanel.renderThreadMarkers({ resolveTargets: true });
}
