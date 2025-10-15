/* eslint-disable no-use-before-define */
import { fetchFigmaContent } from './sources/figma.js';
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

async function initiatePreviewer() {
  let html = '';
  const pageComponents = await fetchFigmaContent();
  html = pageComponents.html;
  html.forEach((h, idx) => {
    if (typeof h === 'object') {
      h.id = `block-${idx}`;
    }
  });
  html = html.map((h) => h.outerHTML).join('');
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
  await persist();
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
  try {
    window.sessionStorage.clear();
    window.streamConfig = {
      source: getQueryParam('source'),
      contentUrl: getQueryParam('contentUrl'),
      target: getQueryParam('target'),
      targetUrl: getQueryParam('targetUrl'),
      token: getQueryParam('token'),
    };
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
  } catch (error) {
    handleError(error, 'initializing previewer');
    throw error;
  }
}

export async function persist() {
  try {
    await persistOnTarget();
  } catch (error) {
    handleError(error, 'persisting content');
    throw error;
  }
}
