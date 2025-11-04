/* eslint-disable no-use-before-define */
import {
  persistOnTarget,
  targetCompatibleHtml,
} from './target/da.js';
import {
  pushTargetHtmlToStore,
  fetchPreviewHtmlFromStore,
  pushPreviewHtmlToStore,
} from './store/store.js';
import {
  getLibs,
  getQueryParam,
  fixRelativeLinks,
  initializeTokens,
} from './utils/utils.js';
import { handleError } from './utils/error-handler.js';
import {
  createStreamOperation,
  editStreamOperation,
  addStreamOperation
} from './utils/operations.js';

async function initiatePreviewer() {
  let html = '';
  switch (window.streamConfig.operation) {
    case 'create':
      html = await createStreamOperation();
      break;
    case 'edit-add':
      html = await addStreamOperation();
      break;
    case 'edit':
      html = await editStreamOperation();
      break;
    default:
      break;
  }
  html = fixRelativeLinks(html);
  pushPreviewHtmlToStore(html);
  await startHTMLPainting();
  html = targetCompatibleHtml(html);
  pushTargetHtmlToStore(html);
  document.querySelector('#loader-container').remove();
}

async function startHTMLPainting() {
  paintHtmlOnPage();
  window['page-load-ok-milo']?.remove();
  const { loadArea } = await import(`${getLibs()}/utils/utils.js`);
  await loadArea();
}

async function paintHtmlOnPage() {
  const headerEle = document.createElement('header');
  document.body.appendChild(headerEle);
  const mainEle = document.createElement('main');
  mainEle.innerHTML = fetchPreviewHtmlFromStore();
  document.body.appendChild(mainEle);
  const pushToDABtn = createPushButton();
  document.body.append(pushToDABtn);
  updateButtonState(pushToDABtn, 'not-sending');
  pushToDABtn.addEventListener('click', handlePushClick);
}

function createPushButton() {
  const button = document.createElement('a');
  button.href = '#';
  button.classList.add('cta-button');
  button.innerHTML = '<span class="da-push-icon loader"></span>Push to DA';
  return button;
}

function updateButtonState(button, state) {
  const icon = button.querySelector('span.da-push-icon');
  icon.classList.remove('loader', 'not-sending');
  icon.classList.add(state);
}

async function handlePushClick(event) {
  const button = event.target.closest('.cta-button');
  updateButtonState(button, 'loader');
  await persist();
  updateButtonState(button, 'not-sending');
}

export default async function initPreviewer() {
  window.sessionStorage.clear();
  window.streamConfig = {
    source: getQueryParam('source'),
    contentUrl: getQueryParam('contentUrl'),
    target: getQueryParam('target'),
    targetUrl: getQueryParam('targetUrl'),
    token: getQueryParam('token'),
    operation: getQueryParam('operation') ? getQueryParam('operation') : 'create',
    selectedPageBlocks: getQueryParam('selectedPageBlock') ? getQueryParam('selectedPageBlock').split(',') : [],
    selectedPageBlockIndices: getQueryParam('selectedPageBlockIndex') ? getQueryParam('selectedPageBlockIndex').split(',') : [],
  };
  if (getQueryParam('editAction')) window.streamConfig.operation = `${window.streamConfig.operation}-${getQueryParam('editAction')}`;
  await initializeTokens(window.streamConfig.token);
  if (
    !window.streamConfig.source
    || !window.streamConfig.contentUrl
    || !window.streamConfig.target
    || !window.streamConfig.targetUrl
  ) {
    throw new Error(
      'Source, content Url, target url or target cannot be empty! Stoppping all processing!',
    );
  }
  await initiatePreviewer();
}

export async function persist() {
  try {
    await persistOnTarget();
  } catch (error) {
    handleError(error, 'persisting content');
    throw error;
  }
}
