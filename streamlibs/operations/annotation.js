import { fetchFigmaContent } from '../sources/figma.js';
import { fetchDAContent } from '../sources/da.js';
import { transformImages, getLibs } from '../utils/utils.js';
import { getDACompatibleHtml, postData } from '../target/da.js';
import { createAnnotationState, createAnnotationUI } from './annotation/state.js';
import { createAnnotationStore } from './annotation/store.js';
import createCommentsPanelController from './annotation/comments-panel.js';
import createInlineEditingController from './annotation/inline-editing.js';

const START_REVIEW_DA_PATH = 'adobecom/da-cc-sandbox/drafts/mathuria';

const annotationState = createAnnotationState();
const annotationUI = createAnnotationUI();
const store = createAnnotationStore({ annotationState, annotationUI });
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
  return mainEle.cloneNode(true);
}

function shouldAutoStartReview() {
  const startReview = window.streamConfig?.startReview;
  return startReview !== false && startReview !== 'false';
}

async function pushAnnotationHtmlToDA(mainEl) {
  if (!(mainEl instanceof HTMLElement)) return;
  const daCompatibleHtml = getDACompatibleHtml(mainEl.innerHTML);
  await postData(`${START_REVIEW_DA_PATH}/${window.streamConfig.reviewId.toLowerCase()}`, daCompatibleHtml);
}

export async function annotationOperation() {
  document.body.classList.add('annotation-mode');
  const originalHtml = await initializePreview();
  await miloLoadArea();
  const mainEl = document.querySelector('main');
  if (!mainEl) return;

  commentsPanel.setupAnnotationUI(mainEl);
  store.rebindEasyEditsToCurrentDom();
  store.applyEasyEditsToDom();
  store.saveAnnotationStore();
  commentsPanel.renderThreadMarkers();
  commentsPanel.renderCommentsPanel();

  if (shouldAutoStartReview()) {
    await pushAnnotationHtmlToDA(originalHtml);
  }
}

export async function persistAnnotationChangesToDA() {
  inlineEditing.syncInlineEditsBeforePersist();
  const payload = store.getStoredAnnotationPayload() || annotationState.store;
  const easyEdits = payload?.easyEdits || annotationState.store.easyEdits || [];
  const htmlMainEl = await fetchDAContent(window.streamConfig.contentUrl);
  const originalHtml = htmlMainEl?.innerHTML || '';
  const rebuiltHtml = store.applyEasyEditsToHtmlString(originalHtml, easyEdits);
  const daCompatibleHtml = getDACompatibleHtml(rebuiltHtml);
  await postData(window.streamConfig.targetUrl, daCompatibleHtml);
}
