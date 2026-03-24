import { fetchFigmaContent } from '../sources/figma.js';
import { fetchDAContent } from '../sources/da.js';
import { transformImages, getLibs } from '../utils/utils.js';
import { getDACompatibleHtml, postData } from '../target/da.js';
import { createAnnotationState, createAnnotationUI } from './annotation/state.js';
import { createAnnotationStore } from './annotation/store.js';
import createCommentsPanelController from './annotation/comments-panel.js';
import createInlineEditingController from './annotation/inline-editing.js';
import createAnnotationServiceClient from './annotation/service.js';

const annotationState = createAnnotationState();
const annotationUI = createAnnotationUI();
const store = createAnnotationStore({ annotationState, annotationUI });
const annotationService = createAnnotationServiceClient();
const commentsPanel = createCommentsPanelController({
  annotationState,
  annotationUI,
  store,
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

async function miloLoadArea() {
  await transformImages();
  window['page-load-ok-milo']?.remove();
  const { loadArea } = await import(`${getLibs()}/utils/utils.js`);
  await loadArea();
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

async function hydrateAnnotationEditsFromService() {
  if (!annotationService.isAvailable()) return;

  try {
    const persistedEditSnapshot = await annotationService.getEditsSnapshot();
    if (!persistedEditSnapshot) return;
    store.replaceEasyEdits(persistedEditSnapshot.editRecord);
    annotationState.latestSavedEditsCreatedAt = persistedEditSnapshot.createdAt || null;
    annotationState.pendingRemoteEditsSnapshot = null;
    annotationState.hasLoadedInitialEditsSnapshot = true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Could not load annotation edits from service', error);
  }
}

async function buildPersistedAnnotationPayload() {
  await inlineEditing.syncInlineEditsBeforePersist();
  const payload = store.getStoredAnnotationPayload() || annotationState.store;
  const easyEdits = payload?.easyEdits || annotationState.store.easyEdits || [];
  const htmlMainEl = await fetchDAContent(window.streamConfig.contentUrl);
  const originalHtml = htmlMainEl?.innerHTML || '';
  const rebuiltHtml = store.applyEasyEditsToHtmlString(originalHtml, easyEdits);

  return {
    easyEdits,
    daCompatibleHtml: getDACompatibleHtml(rebuiltHtml),
  };
}

export async function annotationOperation() {
  const previousAnnotationMode = annotationUI.annotationMode || 'comments';
  const shouldRestoreInlineMode = annotationUI.inlineMode
    && window.streamConfig?.inlineEditingAllowed !== false;

  inlineEditing.resetInlineEditModeState();
  annotationUI.annotationMode = shouldRestoreInlineMode ? 'edit' : previousAnnotationMode;
  document.body.classList.add('annotation-mode');
  annotationState.latestSavedEditsCreatedAt = null;
  annotationState.pendingRemoteEditsSnapshot = null;
  annotationState.hasLoadedInitialEditsSnapshot = false;
  await initializePreview();
  await miloLoadArea();
  const mainEl = document.querySelector('main');
  if (!mainEl) return;

  await commentsPanel.setupAnnotationUI(mainEl);
  await hydrateAnnotationEditsFromService();
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
  commentsPanel.startEditPolling();
}

export async function persistAnnotationChangesToDA() {
  const { daCompatibleHtml } = await buildPersistedAnnotationPayload();
  await postData(window.streamConfig.targetUrl, daCompatibleHtml);
}

export async function saveAnnotationChanges(reportProgress = () => {}) {
  const { easyEdits, daCompatibleHtml } = await buildPersistedAnnotationPayload();
  await postData(window.streamConfig.targetUrl, daCompatibleHtml);
  reportProgress('htmlSaved');

  if (annotationService.isAvailable()) {
    const persistedEditSnapshot = await annotationService.saveEdits(easyEdits);
    if (persistedEditSnapshot) {
      store.replaceEasyEdits(persistedEditSnapshot.editRecord);
      annotationState.latestSavedEditsCreatedAt = persistedEditSnapshot.createdAt || null;
      annotationState.pendingRemoteEditsSnapshot = null;
      annotationState.hasLoadedInitialEditsSnapshot = true;
    }
  }
  reportProgress('editsSaved');
  store.saveAnnotationStore();
}

export async function refreshAnnotationFloatingUI() {
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
  commentsPanel.renderThreadMarkers({ resolveTargets: true });
}
