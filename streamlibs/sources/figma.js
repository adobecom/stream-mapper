import { handleError, safeFetch } from '../utils/error-handler.js';

async function fetchFigmaMapping(figmaUrl) {
  try {
    const config = await import('../utils/utils.js').then((m) => m.getConfig());
    const response = await safeFetch(config.streamMapper.figmaMappingUrl, {
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

function getHtml(resp, id, variant) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(resp, 'text/html');
  if (id === 'editorial-card') {
    return doc.querySelector('div');
  }
  return doc.querySelectorAll(`.${id}`)[variant];
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
    const response = await safeFetch(config.streamMapper.figmaBlockContentUrl, {
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
  const { default: mapBlockContent } = await import(`../blocks/${block.id}.js`);
  await mapBlockContent(blockContent, figContent);
  return blockContent;
}

async function processBlock(block, figmaUrl) {
  if (!block.id || !block.path) return '';
  const [doc, figContent] = await Promise.all([
    fetchContent(block.path),
    fetchBlockContent(block.figId, block.id, figmaUrl),
  ]);
  let blockContent = getHtml(doc, block.id, block.variant);
  figContent.details.properties.miloTag = block.tag;
  blockContent = mapFigmaContent(blockContent, block, figContent);
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
  return await getFigmaContent(window.streamConfig.contentUrl);
}
