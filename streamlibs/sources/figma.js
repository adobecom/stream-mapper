import { handleError, safeFetch } from '../utils/error-handler.js';

async function fetchFigmaMapping(figmaUrl) {
  try {
    const config = await import('../utils/utils.js').then((m) => m.getConfig());
    const response = await safeFetch(`${config.streamMapper.serviceEP}${config.streamMapper.figmaMappingUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.streamMapper.figmaAuthToken,
      },
      body: JSON.stringify({ figmaUrl }),
    });
    return await response.json();
  } catch (error) {
    handleError(error, 'getting figma mapping');
    throw error;
  }
}

const SPECIAL_OVERRIDES = {
  'icon-action-gallery': ({ doc }) => doc.querySelector('div'),
};

function getHtml(resp, miloId, variant) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(resp, 'text/html');
  const overrideFunction = SPECIAL_OVERRIDES[miloId];
  if (overrideFunction) {
    return overrideFunction({
      doc, miloId, variant,
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
    sectionWrapper.append(blockContent);
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

async function processBlock(block, figmaUrl) {
  if (!block.id || !block.path) return '';
  const [doc, figContent] = await Promise.all([
    fetchContent(block.path),
    fetchBlockContent(block.figId, block.id, figmaUrl),
  ]);
  let blockContent = getHtml(doc, block.miloId, block.variant);
  figContent.details.properties.miloTag = block.tag;
  blockContent = await mapFigmaContent(blockContent, block, figContent);
  block.blockDomEl = blockContent;
  return blockContent || '';
}

async function createHTML(blockMapping, figmaUrl) {
  const blocks = blockMapping.details.components;
  const htmlParts = await Promise.all(
    blocks.map((block) => processBlock(block, figmaUrl)),
  );
  return htmlParts.filter(Boolean);
}

async function getFigmaContent(figmaUrl) {
  const blockMapping = await fetchFigmaMapping(figmaUrl);
  if (!blockMapping?.details?.components) {
    return { html: [], blockMapping };
  }
  const html = await createHTML(blockMapping, figmaUrl);
  return { html, blockMapping };
}

// eslint-disable-next-line import/prefer-default-export
export async function fetchFigmaContent() {
  // eslint-disable-next-line no-return-await
  const pageComponents = await getFigmaContent(window.streamConfig.contentUrl);
  let htmlDom = '';
  pageComponents.html.forEach((h, idx) => {
    if (Array.isArray(h)) {
      h.forEach((hdash, idxx) => {
        hdash.id = `block-${idx}-${idxx}`;
        htmlDom += hdash.outerHTML;
      });
    } else if (typeof h === 'object') {
      h.id = `block-${idx}`;
      htmlDom += h.outerHTML;
    }
  });
  pageComponents.htmlDom = htmlDom;
  return { htmlDom: pageComponents.htmlDom, html: pageComponents.html };
}
