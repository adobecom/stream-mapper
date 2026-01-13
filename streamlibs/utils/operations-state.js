/* eslint-disable no-use-before-define */
/* eslint-disable no-console */
import { fetchFigmaContent } from '../sources/figma.js';
import { fetchDAContent } from '../sources/da.js';
import { getConfig } from './utils.js';
import { handleError, safeFetch } from './error-handler.js';
import { COMPONENTS_NAMES } from './constants.js';
import {
  pushEditChangesToStore,
  resetEditChangesInStore,
} from '../store/store.js';

// State variables (closure)
let figmaBlocks = [];
let daBlocks = [];
let originalFigmaBlocks = [];
let originalDABlocks = [];

export async function createStreamOperation() {
  // eslint-disable-next-line prefer-const
  let { htmlDom: html, html: htmlArray } = await fetchFigmaContent();
  if (window.streamConfig.operation === 'edit') {
    html = '';
    const editChanges = JSON.parse(window.sessionStorage.getItem('stream-edit'));
    try {
      const daPlainhtml = await fetchDAContent();
      const daConsonantBlocks = daPlainhtml.querySelectorAll(':scope > div');
      editChanges.forEach((change) => {
        const { source, idx } = change;
        if (source === 'figma') {
          html += htmlArray[idx].outerHTML;
        } else if (source === 'da') {
          html += daConsonantBlocks[idx].outerHTML;
        }
      });
    } catch (error) {
      handleError(error, ' fetching da content. Please check that the da page is accessible.');
      throw error;
    }
  }
  return html;
}

export async function fetchFigmaBlocks() {
  try {
    const config = await getConfig();
    const response = await safeFetch(`${config.streamMapper.serviceEP}${config.streamMapper.figmaMappingUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.streamMapper.figmaAuthToken,
      },
      body: JSON.stringify({ figmaUrl: window.streamConfig.contentUrl }),
    });
    const data = await response.json();
    console.log(data);
    return data?.details?.components || [];
  } catch (error) {
    handleError(error, ' fetching figma blocks');
    throw error;
  }
}

function getSectionMetadataProps(sectionMetadata) {
  if (!sectionMetadata) return {};
  const divs = sectionMetadata.querySelectorAll(':scope > div');
  const properties = Array.from(divs).reduce((acc, div) => {
    const keyDiv = div.querySelector(':scope > div')?.textContent;
    const valueDiv = div.querySelector(':scope > div:nth-child(2)')?.textContent;
    acc[keyDiv] = valueDiv;
    return acc;
  }, {});
  return properties;
}

const VARIANT_RESOLVERS = [
  (config, ctx) => Object.keys(config).find((variantKey) => {
    const variantConfig = config[variantKey];
    return (
      variantConfig?.hasBlockClass
        && ctx.div.classList.contains(variantConfig.hasBlockClass)
    );
  }),

  (config, ctx) => (ctx.sectionMetadata?.style?.includes('up') && config.up ? 'up' : null),

  (config, ctx) => (ctx.isUniformType && config.multiple?.hasMultiple ? 'multiple' : null),
];

function resolveComponentConfig(div, blockDivs, sectionMetadata) {
  const className = div.classList[0];
  const config = COMPONENTS_NAMES[className];
  if (!config) return null;

  const context = {
    div,
    sectionMetadata,
    isUniformType: blockDivs.every((d) => d.classList[0] === className),
  };

  const variantKey = VARIANT_RESOLVERS.reduce((acc, resolver) => {
    if (acc) return acc;
    return resolver(config, context);
  }, null) || 'default';

  return config[variantKey] || config.default;
}

export function getComponentName(block, sectionMetadataProperties) {
  const blockDivs = Array.from(block?.children || [])
    .filter((div) => !div.classList.contains('section-metadata'));

  if (!blockDivs.length) return '';

  const resolvedBlocks = blockDivs
    .map((div) => ({
      div,
      config: resolveComponentConfig(div, blockDivs, sectionMetadataProperties),
    }))
    .filter((item) => item.config);

  if (resolvedBlocks.length === 0) return '';

  const compositeBlock = resolvedBlocks.find((item) => item.config.composite);
  if (compositeBlock) return compositeBlock.config.name;

  return resolvedBlocks[0].config.name || '';
}

export async function fetchDABlocks() {
  try {
    const daContent = await fetchDAContent();
    if (!daContent) return [];
    const blocks = [...daContent.querySelectorAll(':scope > div')];
    // Assign unique IDs to each block
    return blocks.map((block, index) => {
      const sectionMetadata = block.querySelector(':scope > .section-metadata');
      const sectionMetadataProperties = getSectionMetadataProps(sectionMetadata);
      const textHeading = block.querySelector(':scope h1, h2, h3, h4')?.textContent ?? '';
      const name = getComponentName(block, sectionMetadataProperties);

      return {
        id: `da-block-${index}-${Date.now()}`,
        name,
        type: block.classList[0],
        element: block,
        removed: false,
        title: textHeading,
      };
    });
  } catch (error) {
    handleError(error, ' fetching da blocks');
    throw error;
  }
}

function deepCloneBlocks(blocks, prefix) {
  return blocks.map((b, index) => ({
    ...b, dataId: b.dataId || `${prefix}-${index}`, source: b.source || prefix, removed: false,
  }));
}

export function initializeBlocksState(fetchedFigma, fetchedDA) {
  originalFigmaBlocks = fetchedFigma;
  originalDABlocks = fetchedDA;
  figmaBlocks = deepCloneBlocks(originalFigmaBlocks, 'figma');
  daBlocks = deepCloneBlocks(originalDABlocks, 'da');
}

export function resetBlocksToOriginal() {
  resetEditChangesInStore();
  figmaBlocks = deepCloneBlocks(originalFigmaBlocks, 'figma');
  daBlocks = deepCloneBlocks(originalDABlocks, 'da');
}

export function getFigmaBlocks() {
  return figmaBlocks;
}

export function getDABlocks() {
  return daBlocks;
}

export function getActiveDABlocks() {
  return daBlocks.filter((b) => !b.removed);
}

export function getDABlocksState() {
  return [...daBlocks];
}

export function moveFigmaBlockToDA(figmaDataId, targetDataId = null) {
  const figmaIndex = figmaBlocks.findIndex((b) => b.dataId === figmaDataId);
  if (figmaIndex === -1) return;

  const [movedBlock] = figmaBlocks.splice(figmaIndex, 1);
  movedBlock.removed = false;

  if (targetDataId) {
    const targetIndex = daBlocks.findIndex((b) => b.dataId === targetDataId);
    if (targetIndex >= 0) daBlocks.splice(targetIndex, 0, movedBlock);
    else daBlocks.push(movedBlock);
  } else {
    daBlocks.push(movedBlock);
  }
}

export function reorderDABlocks(draggedDataId, targetDataId) {
  const draggedIndex = daBlocks.findIndex((b) => b.dataId === draggedDataId);
  const targetIndex = daBlocks.findIndex((b) => b.dataId === targetDataId);
  if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
    const [movedBlock] = daBlocks.splice(draggedIndex, 1);
    daBlocks.splice(targetIndex, 0, movedBlock);
    return true;
  }
  return false;
}

export function toggleBlockRemoved(id) {
  const block = daBlocks.find((b) => b.id === id);
  if (block) {
    block.removed = !block.removed;
    return true;
  }
  return false;
}

export function duplicateBlock(dataId) {
  const blockIndex = daBlocks.findIndex((b) => b.dataId === dataId);
  if (blockIndex === -1) return false;
  const originalBlock = daBlocks[blockIndex];
  const duplicatedBlock = {
    ...originalBlock,
    dataId: originalBlock.dataId, // Keep the same DA ID
    id: `${originalBlock.id}-duplicate-${Date.now()}`, // Unique ID for this instance
    isDuplicate: true, // Mark as duplicate so it can be removed
    removed: false, // Reset removed state
  };
  // Insert the duplicate right after the original block
  daBlocks.splice(blockIndex + 1, 0, duplicatedBlock);
  return true;
}

export function prepareChangesForStore() {
  const changes = [];
  daBlocks.forEach((b) => {
    const [source, idx] = b.dataId.split('-');
    if (!b.removed) changes.push({ source, idx });
  });
  pushEditChangesToStore(JSON.stringify(changes));
}
