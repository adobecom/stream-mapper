/* eslint-disable no-console */
/* eslint-disable no-use-before-define */
import {
  persistOnTarget,
  targetCompatibleHtml,
} from './target/da.js';
import {
  pushTargetHtmlToStore,
  fetchPreviewHtmlFromStore,
  pushPreviewHtmlToStore,
  resetTargetHtmlInStore,
  resetPreviewHtmlInStore,
} from './store/store.js';
import {
  getQueryParam,
  fixRelativeLinks,
  initializeTokens,
  getConfig,
  miloLoadArea,
} from './utils/utils.js';
import { handleError } from './utils/error-handler.js';
import {
  createStreamOperation,
  editStreamOperation,
  applyEditChanges,
  handleBackToEditor,
  preflightOperation,
} from './utils/operations.js';
import { LOADER_MSG_LIST } from './utils/constants.js';

const LOADER_MESSAGE_AREA = document.querySelector('#loader-content');
const LOADER = document.querySelector('#loader-container');
let BUTTON_CONTAINER = null;

function handleLoader(displayLoader = true, message = null) {
  if (!displayLoader) return;
  const loadermsg = LOADER_MSG_LIST[Math.floor(Math.random() * LOADER_MSG_LIST.length)];
  const loaderMessage = message || loadermsg;
  LOADER_MESSAGE_AREA.textContent = loaderMessage;
  LOADER.style.display = 'flex';
  LOADER.classList.add('is-visible');
}

function hideDOMElements(eles = []) {
  if (!eles.length) return;
  eles.forEach((ele) => {
    if (!ele) return;
    ele.style.display = 'none';
    ele.classList.remove('is-visible');
  });
}

function showDOMElements(eles = []) {
  if (!eles.length) return;
  eles.forEach((ele) => {
    if (!ele) return;
    ele.style.display = 'block';
  });
}

async function postOperationProcessing(rawhtml) {
  let html = fixRelativeLinks(rawhtml);
  pushPreviewHtmlToStore(html);
  await startHTMLPainting();
  html = targetCompatibleHtml(html);
  pushTargetHtmlToStore(html);
  hideDOMElements([LOADER]);
}

export async function initiatePreviewer(forceOperation = null) {
  let html = '';
  switch (forceOperation || window.streamConfig.operation) {
    case 'create':
      handleLoader();
      html = await createStreamOperation();
      await postOperationProcessing(html);
      break;
    case 'edit':
      handleLoader(true, 'Preparing the editor. Please wait');
      await editStreamOperation();
      hideDOMElements([LOADER]);
      return;
    case 'preflight':
      handleLoader();
      await preflightOperation();
      hideDOMElements([LOADER]);
      break;
    default:
      break;
  }
}

async function startHTMLPainting() {
  paintHtmlOnPage();
  await miloLoadArea();
}

async function paintHtmlOnPage() {
  const headerEle = document.createElement('header');
  const mainEle = document.createElement('main');
  mainEle.innerHTML = fetchPreviewHtmlFromStore();
  document.body.prepend(mainEle);
  document.body.prepend(headerEle);
  if (!BUTTON_CONTAINER) {
    const div = document.createElement('div');
    div.classList.add('button-container');
    const pushToDABtn = createPushButton();
    const openInDABtn = createOpenButton();
    const backToEditBtn = createBackToEditButton();
    const preflightBtn = createPreflightButton();
    div.append(...[pushToDABtn, openInDABtn, preflightBtn]);
    document.body.append(div);
    pushToDABtn.addEventListener('click', handlePushClick);
    if (backToEditBtn) {
      div.prepend(backToEditBtn);
      backToEditBtn.addEventListener('click', handleBackToEditClick);
    }
    preflightBtn.addEventListener('click', handlePreflightClick);
    BUTTON_CONTAINER = div;
  }
}

function createPushButton() {
  const button = document.createElement('a');
  button.href = '#';
  button.classList.add('cta-button');
  button.innerHTML = '<span class="da-push-icon"></span><span class="text">Push to DA</span>';
  return button;
}

function createOpenButton() {
  const button = document.createElement('a');
  const targetUrl = `https://da.live/edit#${window.streamConfig.targetUrl.startsWith('/') ? window.streamConfig.targetUrl : `/${window.streamConfig.targetUrl}`}`;
  button.href = targetUrl;
  button.target = '_blank';
  button.classList.add('cta-button');
  button.id = 'open-in-da-button';
  button.innerHTML = '<span class="da-open-icon"></span><span class="text">Open in DA</span>';
  if (window.streamConfig.operation === 'create') button.classList.add('disabled');
  return button;
}

function createBackToEditButton() {
  if (window.streamConfig.operation !== 'edit') return;
  const button = document.createElement('a');
  button.href = '#';
  button.classList.add('cta-button');
  button.id = 'back-to-edit-button';
  button.innerHTML = '<span class="da-edit-icon"></span><span class="text">Back to Editor</span>';
  // eslint-disable-next-line consistent-return
  return button;
}

function createPreflightButton() {
  const button = document.createElement('a');
  button.href = '#';
  button.classList.add('cta-button');
  button.innerHTML = '<span class="da-preflight-icon"></span><span class="text">Preview and Preflight</span>';
  return button;
}

async function handlePushClick(event) {
  const button = event.target.closest('.cta-button');
  const buttonIcon = button.querySelector('span.da-push-icon');
  buttonIcon.classList.add('sending');
  try {
    await persist();
  } catch (error) {
    console.log('Error persisting content', error);
  }
  buttonIcon.classList.remove('sending');
  document.querySelector('#open-in-da-button').classList.remove('disabled');
}

// eslint-disable-next-line no-unused-vars
async function handleBackToEditClick(event) {
  BUTTON_CONTAINER.style.display = 'none';
  resetTargetHtmlInStore();
  resetPreviewHtmlInStore();
  document.querySelector('header').remove();
  document.querySelector('main').remove();
  await handleBackToEditor();
}

async function handlePreflightClick() {
  await preflightOperation();
}

async function requestStreamConfigFromParent() {
  const storeId = getQueryParam('storeId');

  // If there is no parent window or no storeId, fall back to query params (legacy behavior)
  if (!window.parent || window.parent === window || !storeId) {
    return {
      source: getQueryParam('source'),
      contentUrl: getQueryParam('contentUrl'),
      target: getQueryParam('target'),
      targetUrl: getQueryParam('targetUrl'),
      token: getQueryParam('token'),
      operation: getQueryParam('operation') || 'create',
      preflightUrl: getQueryParam('preflightUrl'),
      selectedPageBlocks: getQueryParam('selectedPageBlock') ? getQueryParam('selectedPageBlock').split(',') : [],
      selectedPageBlockIndices: getQueryParam('selectedPageBlockIndex') ? getQueryParam('selectedPageBlockIndex').split(',') : [],
    };
  }

  const config = await getConfig();
  const allowedOrigins = config.streamMapper.allowMessagesFromDomains || [];

  // Ask parent for preview parameters using storeId
  return new Promise((resolve) => {
    const handler = (event) => {
      const isOriginAllowed = allowedOrigins.some((pattern) => {
        const regex = new RegExp(`^${pattern.replace('*', '.*')}$`);
        return regex.test(event.origin);
      });
      if (!isOriginAllowed) return;

      const data = event.data || {};
      if (data.type !== 'STREAM_PREVIEW_PARAMS') return;
      if (data.storeId && data.storeId !== storeId) return;

      window.removeEventListener('message', handler);
      resolve(data.params);
    };

    window.addEventListener('message', handler);

    window.parent.postMessage({
      type: 'STREAM_PREVIEW_PARAMS',
      storeId,
    }, '*');
  });
}

async function setupMessageListener() {
  window.addEventListener('message', async (event) => {
    const config = await getConfig();
    const allowedOrigins = config.streamMapper.allowMessagesFromDomains;
    const isOriginAllowed = allowedOrigins.some((pattern) => {
      const regex = new RegExp(`^${pattern.replace('*', '.*')}$`);
      return regex.test(event.origin);
    });
    if (!isOriginAllowed) return;

    if (event.data.type === 'PUSH_TO_DA') {
      await persist();
    }
    if (event.data.type === 'RUN_PREFLIGHT') {
      const url = new URL(window.location.href);
      url.searchParams.set('forceOperation', 'preflight');
      window.location.href = url.toString();
    }
    if (event.data.type === 'EDIT_APPLY_CHANGES') {
      await applyEditChanges();
    }
    if (event.data.type === 'BACK_TO_EDIT') {
      await handleBackToEditor();
    }
    if (event.data.type === 'RESET') {
      window.location.reload();
    }
  });
}

export default async function initPreviewer() {
  window.sessionStorage.clear();
  const previewParams = await requestStreamConfigFromParent();
  if (getQueryParam('forceOperation')) previewParams.operation = getQueryParam('forceOperation');
  window.streamConfig = {
    source: previewParams.source,
    contentUrl: previewParams.contentUrl,
    target: previewParams.target,
    targetUrl: previewParams.targetUrl,
    token: previewParams.token,
    operation: previewParams.operation || 'create',
    preflightUrl: previewParams.preflightUrl,
    selectedPageBlocks: previewParams.selectedPageBlocks || [],
    selectedPageBlockIndices: previewParams.selectedPageBlockIndices || [],
  };
  await initializeTokens(window.streamConfig.token);
  await initiatePreviewer();
  await setupMessageListener();
}

export async function persist() {
  try {
    handleLoader(true, 'Pushing content to DA');
    hideDOMElements([document.querySelector('main')]);
    await persistOnTarget();
    hideDOMElements([LOADER]);
    showDOMElements([document.querySelector('main')]);
  } catch (error) {
    hideDOMElements([LOADER]);
    showDOMElements([document.querySelector('main')]);
    handleError(error, 'persisting content');
    throw error;
  }
}
