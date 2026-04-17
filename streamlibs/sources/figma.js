import { handleError, safeFetch } from '../utils/error-handler.js';
import { createFigmaLoaderReporter } from '../utils/loader.js';

const PLACEHOLDER_URL = 'https://main--stream-mapper--adobecom.aem.live/fragments/stream-block-placeholder';
const METADATA_KEYS = new Set(['colorTheme', 'miloTag','layout']);

function isEmptyBlockContent(properties) {
  if (!properties || typeof properties !== 'object') return true;
  const entries = Object.entries(properties);
  if (entries.length === 0) return true;
  return entries.every(([key, value]) => {
    if (METADATA_KEYS.has(key)) return true;
    if (value === false || value === '' || value == null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  });
}

function createPlaceholder() {
  const div = document.createElement('div');
  div.classList.add('stream-placeholder');
  div.dataset.placeholder = 'true';
  div.innerHTML = `<p><a href='${PLACEHOLDER_URL}'>${PLACEHOLDER_URL}</a></p>`;
  return div;
}

async function fetchFigmaMapping(figmaUrl) {
  try {
    const config = await import('../utils/utils.js').then((m) => m.getConfig());
    const pagePath = window.streamConfig.targetUrl.startsWith('/') ? window.streamConfig.targetUrl.slice(1) : window.streamConfig.targetUrl;
    const response = await safeFetch(`${config.streamMapper.serviceEP}${config.streamMapper.figmaMappingUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.streamMapper.figmaAuthToken,
      },
      body: JSON.stringify({
        figmaUrl,
        pagePath,
      }),
    });
    return await response.json();
  } catch (error) {
    handleError(error, 'getting figma mapping');
    throw error;
  }
}

const SPECIAL_OVERRIDES = {
  'icon-action-gallery': ({ doc }) => doc.querySelector('div'),
  carousel: ({ doc }) => doc.body.querySelectorAll(':scope > div'),
};

function getHtml(resp, miloId, variant, figContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(resp, 'text/html');
  const overrideFunction = SPECIAL_OVERRIDES[miloId];
  if (overrideFunction) {
    return overrideFunction({
      doc, miloId, variant, figContent,
    });
  }
  return doc.querySelectorAll(`.${miloId}`)[variant];
}

// eslint-disable-next-line consistent-return
async function fetchWithRetry(url, retries = 1) {
  for (let i = 0; i <= retries; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await safeFetch(url);
      // eslint-disable-next-line no-await-in-loop
      return await response.text();
    } catch (error) {
      if (i === retries) throw error;
    }
  }
}

async function fetchContent(contentUrl) {
  try {
    return await fetchWithRetry(contentUrl);
  } catch (error) {
    handleError(error, 'fetching content');
    return null;
  }
}

async function fetchBlockContent(figId, id, figmaUrl) {
  try {
    const config = await import('../utils/utils.js').then((m) => m.getConfig());
    const response = await safeFetch(`${config.streamMapper.serviceEP}${config.streamMapper.figmaBlockContentUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.streamMapper.figmaAuthToken,
      },
      body: JSON.stringify({ figmaUrl, figId, id }),
    });
    return await response.json();
  } catch (error) {
    handleError(error, 'getting block content');
    return {};
  }
}

async function mapFigmaContent(blockContent, block, figContent) {
  try {
    const { default: mapBlockContent } = await import(`../blocks/${block.id}.js`);
    const sectionWrapper = document.createElement('div');
    if (!(blockContent instanceof NodeList)) {
      sectionWrapper.append(blockContent);
    }
    const res = await mapBlockContent(sectionWrapper, blockContent, figContent);
    if (Array.isArray(res)) {
      return res;
    // eslint-disable-next-line no-else-return
    } else {
      return sectionWrapper;
    }
  } catch (error) {
    return '<div></div>';
  }
}

async function processBlock(block, figmaUrl, onDetailResponse = () => {}) {
  if (!block.id || !block.path) return '';
  const [doc, figContent] = await Promise.all([
    fetchContent(block.path),
    fetchBlockContent(block.figId, block.id, figmaUrl).finally(() => onDetailResponse()),
  ]);

  const properties = figContent?.details?.properties;
  if (figContent?.success && isEmptyBlockContent(properties)) {
    const placeholder = createPlaceholder();
    block.blockDomEl = placeholder;
    return placeholder;
  }

  let blockContent = getHtml(doc, block.miloId, block.variant);
  figContent.details.properties.miloTag = block.tag;
  blockContent = await mapFigmaContent(blockContent, block, figContent);
  block.blockDomEl = blockContent;
  return blockContent || '';
}

async function createHTML(blockMapping, figmaUrl, tracker) {
  const blocks = blockMapping.details.components;
  const htmlParts = await Promise.all(
    blocks.map((block) => processBlock(block, figmaUrl, () => tracker.markDetailResponse())),
  );
  return htmlParts.filter(Boolean);
}

async function getFigmaContent(figmaUrl) {
  const loaderReporter = createFigmaLoaderReporter();
  loaderReporter.startDesignLoading();

  let blockMapping = null;
  try {
    blockMapping = await fetchFigmaMapping(figmaUrl);
  } finally {
    loaderReporter.completeDesignLoading();
  }
  if (!blockMapping?.details?.components) {
    loaderReporter.markNoComponents();
    return { html: [], blockMapping };
  }
  const validBlocksCount = blockMapping.details.components
    .filter((block) => block.id && block.path).length;
  if (!validBlocksCount) {
    loaderReporter.markNoBlocks();
    return { html: [], blockMapping };
  }

  const tracker = loaderReporter.createBlocksTracker(validBlocksCount);
  const html = await createHTML(blockMapping, figmaUrl, tracker);
  return { html, blockMapping };
}

function appendBlockActionButton(blockEl) {
  if (!blockEl || typeof blockEl.classList === 'undefined') return;
  blockEl.classList.add('has-block-action');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'block-action-btn';
  btn.setAttribute('aria-label', 'Create fragment');
  btn.setAttribute('aria-pressed', 'false');
  const icon = document.createElement('span');
  icon.className = 'block-action-btn-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg class="block-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
  btn.appendChild(icon);
  blockEl.appendChild(btn);
}

// eslint-disable-next-line import/prefer-default-export
export async function fetchFigmaContent() {
  // eslint-disable-next-line no-return-await
  const pageComponents = await getFigmaContent(window.streamConfig.contentUrl);
  let htmlDom = '';
  pageComponents.html.forEach((h, idx) => {
    if (Array.isArray(h)) {
      h.forEach((hdash, idxx) => {
        appendBlockActionButton(hdash);
        hdash.id = `block-${idx}-${idxx}`;
        htmlDom += hdash.outerHTML;
      });
    } else if (typeof h === 'object') {
      appendBlockActionButton(h);
      h.id = `block-${idx}`;
      htmlDom += h.outerHTML;
    }
  });
  pageComponents.htmlDom = htmlDom;
  return {
    htmlDom: pageComponents.htmlDom,
    html: pageComponents.html,
    blockMapping: pageComponents?.blockMapping,
  };
}
