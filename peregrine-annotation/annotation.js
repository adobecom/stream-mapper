/* eslint-disable no-console */
/* eslint-disable function-paren-newline */
/* eslint-disable no-restricted-syntax */
import { createAnnotationState, createAnnotationUI } from './annotation/state.js';
import { createAnnotationStore } from './annotation/store.js';
import createCommentsPanelController from './annotation/comments-panel.js';
import createAnnotationServiceClient from './annotation/service.js';
import requestParentCollabRefresh from './annotation/collab-sync.js';

// ── Module singletons ────────────────────────────────────────────────────────

const annotationState = createAnnotationState();
const annotationUI = createAnnotationUI();
const store = createAnnotationStore({ annotationState, annotationUI });
const annotationService = createAnnotationServiceClient();
const commentsPanel = createCommentsPanelController({
  annotationState,
  annotationUI,
  store,
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

// ── HTML export ───────────────────────────────────────────────────────────────

function buildHtmlWithEdits() {
  const easyEdits = annotationState.store.easyEdits || [];
  const html = store.applyEasyEditsToHtmlString(cachedCleanHtml, easyEdits);
  const container = document.createElement('div');
  container.innerHTML = `<main>${html}</main>`;

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
  buildHtmlWithEdits();

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
