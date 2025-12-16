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
  fetchTargetHtmlFromStore,
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
  preflightOperation,
} from './utils/operations.js';
import { LOADER_MSG_LIST } from './utils/constants.js';

const LOADER_MESSAGE_AREA = document.querySelector('#loader-content');
const LOADER = document.querySelector('#loader-container');
const EDIT_MAPPER = document.querySelector('#edit-operation-container');
let BUTTON_CONTAINER = null;

function handleLoader(displayLoader = true) {
  if (!displayLoader) return;
  const loaderMessage = LOADER_MSG_LIST[Math.floor(Math.random() * LOADER_MSG_LIST.length)];
  LOADER_MESSAGE_AREA.textContent = loaderMessage;
  LOADER.style.display = 'flex';
  LOADER.classList.add('is-visible');
}

function hideDOMElements(eles = []) {
  if (!eles.length) return;
  eles.forEach((ele) => {
    ele.style.display = 'none';
    ele.classList.remove('is-visible');
  });
}

function showDOMElements(eles = []) {
  if (!eles.length) return;
  eles.forEach((ele) => {
    ele.style.display = 'block';
  });
}

export async function initiatePreviewer(forceOperation = null) {
  let html = '';
  switch (forceOperation || window.streamConfig.operation) {
    case 'create':
      handleLoader();
      hideDOMElements([EDIT_MAPPER]);
      html = await createStreamOperation();
      break;
    case 'edit':
      hideDOMElements([LOADER]);
      showDOMElements([EDIT_MAPPER]);
      await editStreamOperation(async () => {
        await initiatePreviewer('create');
      });
      return;
    default:
      break;
  }
  html = fixRelativeLinks(html);
  pushPreviewHtmlToStore(html);
  await startHTMLPainting();
  html = targetCompatibleHtml(html);
  pushTargetHtmlToStore(html);
  hideDOMElements([LOADER]);
}

async function startHTMLPainting() {
  paintHtmlOnPage();
  window['page-load-ok-milo']?.remove();
  const { loadArea } = await import(`${getLibs()}/utils/utils.js`);
  await loadArea();
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
  } else {
    BUTTON_CONTAINER.style.display = 'flex';
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
  document.querySelector('#edit-operation-container').style.display = 'block';
  document.querySelector('header').remove();
  document.querySelector('main').remove();
}

async function handlePreflightClick(event) {
  await preflightOperation();
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

window.addEventListener('beforeunload', function (event) {
  event.preventDefault();
  const targetExists = fetchTargetHtmlFromStore();
  if (targetExists) {
    
  } else {
    event.returnValue = '';
  }
});