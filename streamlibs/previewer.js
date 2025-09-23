import { fetchFigmaContent } from './sources/figma.js';
import {
  persistOnTarget,
  targetCompatibleHtml
} from './target.js';
import { fetchDAContent } from './sources/da.js';
import { pushTargetHtmlToSTore } from './store.js';
import {
  getLibs,
  getQueryParam,
  fixRelativeLinks,
  wrapDivs,
  initializeTokens,
  getIdNameMap
} from './utils.js';

async function initiatePreviewer() {
    let html = '';
    let blockMapping = '';

    if (window.streamConfig.source === 'figma') {
        const pageComponents = await fetchFigmaContent();
        html = pageComponents.html;
        html.forEach((h, idx) => {
            if (typeof h == 'object') {
                h.id = `block-${idx}`;
            }
        });
        blockMapping = pageComponents.blockMapping;
    } else if (window.streamConfig.source === 'da') {
        html = await fetchDAContent();
    }
    html = html.map((h) => h.outerHTML).join('');
    html = fixRelativeLinks(html);
    html = wrapDivs(html);
    targetCompatibleHtml(html);
    pushTargetHtmlToSTore(html);
    await startHTMLPainting(html);
    document.querySelector("#loader-container").remove();
}

async function startHTMLPainting(html) {
    paintHtmlOnPage(html);
    window["page-load-ok-milo"]?.remove();
    const { loadArea } = await import(`${getLibs()}/utils/utils.js`);
    await loadArea();
}

async function paintHtmlOnPage(html) {
    const mainEle = document.createElement('main');
    mainEle.innerHTML = html;
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
  // Clear all storage items
  window.sessionStorage.clear();
  
  window.streamConfig = {
      source: getQueryParam('source'),
      contentUrl: getQueryParam('contentUrl'),
      target: getQueryParam('target'),
      targetUrl: getQueryParam('targetUrl'),
      token: getQueryParam('token')
  };
  
  await initializeTokens(window.streamConfig.token);
  if (!window.streamConfig.source || !window.streamConfig.contentUrl || !window.streamConfig.target || !window.streamConfig.targetUrl) {
      throw new Error("Source, content Url, target url or target cannot be empty! Stoppping all processing!");
  }
  await initiatePreviewer();
}

export async function persist() {
  await persistOnTarget();
  console.log('Successfully persisted on DA');
}
