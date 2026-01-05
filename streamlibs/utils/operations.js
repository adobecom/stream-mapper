/* eslint-disable no-use-before-define */
/* eslint-disable no-console */
import { fetchFigmaContent } from '../sources/figma.js';
import { fetchDAContent } from '../sources/da.js';
import { getConfig, getQueryParam } from './utils.js';
import { handleError, safeFetch } from './error-handler.js';
import { COMPONENTS_NAMES } from './constants.js';
import {
  pushEditChangesToStore,
  resetEditChangesInStore,
} from '../store/store.js';

const FIGMA_ICON = `
<svg class="svg" width="38" height="57" viewBox="0 0 38 57"><path d="M19 28.5c0-5.247 4.253-9.5 9.5-9.5 5.247 0 9.5 4.253 9.5 9.5 0 5.247-4.253 9.5-9.5 9.5-5.247 0-9.5-4.253-9.5-9.5z" fill-rule="nonzero" fill-opacity="1" fill="#1abcfe" stroke="none"></path><path d="M0 47.5C0 42.253 4.253 38 9.5 38H19v9.5c0 5.247-4.253 9.5-9.5 9.5C4.253 57 0 52.747 0 47.5z" fill-rule="nonzero" fill-opacity="1" fill="#0acf83" stroke="none"></path><path d="M19 0v19h9.5c5.247 0 9.5-4.253 9.5-9.5C38 4.253 33.747 0 28.5 0H19z" fill-rule="nonzero" fill-opacity="1" fill="#ff7262" stroke="none"></path><path d="M0 9.5C0 14.747 4.253 19 9.5 19H19V0H9.5C4.253 0 0 4.253 0 9.5z" fill-rule="nonzero" fill-opacity="1" fill="#f24e1e" stroke="none"></path><path d="M0 28.5C0 33.747 4.253 38 9.5 38H19V19H9.5C4.253 19 0 23.253 0 28.5z" fill-rule="nonzero" fill-opacity="1" fill="#a259ff" stroke="none"></path></svg>
`;
const ADOBE_ICON = `
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2"><path d="M302.562 477.27L266.27 376.206h-91.166l76.604-192.875 116.25 293.937h138.04L321.729 34.73H191.604L6 477.269h296.562z" fill="#eb1000" fill-rule="nonzero"/></svg>
`;
let figmaBlocks = [];
let daBlocks = [];
let originalFigmaBlocks = [];
let originalDABlocks = [];
let draggedCard = null;
let draggedFromDeck = null;

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
    const response = await safeFetch(config.streamMapper.figmaMappingUrl, {
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

function resetToOriginal() {
  resetEditChangesInStore();
  figmaBlocks = deepCloneBlocks(originalFigmaBlocks, 'figma');
  daBlocks = deepCloneBlocks(originalDABlocks, 'da');
  renderFigmaDeck();
  renderDADeck();
}

function createBlockCard(block, deckType) {
  const card = document.createElement('div');
  card.className = `block-card ${block.removed ? 'removed' : ''}`;
  card.dataset.id = block.dataId;
  card.dataset.deck = deckType;
  card.draggable = true;
  const blockName = block.name || block.id || 'Block';
  const blockTitle = (block.title ? `Block title: ${block.title}` : '');

  // Build button HTML for DA deck
  let buttonHtml = '';
  if (deckType === 'da') {
    buttonHtml = '<div class=\'button-wrapper\'>';
    buttonHtml += '<button class="card-duplicate-btn" title="Duplicate block">+</button>';
    buttonHtml += `<button class="card-remove-btn ${block.removed ? 'restore' : ''}" title="${block.removed ? 'Restore block' : 'Remove block'}">${block.removed ? '↩' : '×'}</button>`;
    buttonHtml += '</div>';
  }

  card.innerHTML = `
    <div class="card-content">
      <div class="card-body">
        <div class="card-thumbnail">
         ${block.source === 'figma' ? FIGMA_ICON : ADOBE_ICON}
        </div>
        <div class="card-description">  
    <div class="card-title">${blockName}</div>
    <div class="card-subtitle">${
  block.source === 'figma'
    ? `Milo Tag: ${block.tag}`
    : blockTitle
}     
   </div>
  </div>
  </div>
      
      </div>
    
    </div>
    ${buttonHtml}
  `;
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragend', handleDragEnd);
  if (deckType === 'da') {
    const { dataId, id } = block;
    card.querySelector('.card-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBlockRemoved(id);
    });
    card.querySelector('.card-duplicate-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      duplicateBlock(dataId);
    });
  }
  return card;
}

function handleDragStart(e) {
  draggedCard = e.target;
  draggedFromDeck = e.target.dataset.deck;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.target.dataset.id);
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedCard = null;
  draggedFromDeck = null;
  document.querySelectorAll('.block-card.drag-over').forEach((c) => c.classList.remove('drag-over'));
}

function handleDragOver(e) {
  e.preventDefault();
}

function handleDragEnter(e) {
  e.preventDefault();
  const card = e.target.closest('.block-card');
  if (card && card !== draggedCard) card.classList.add('drag-over');
}

function handleDragLeave(e) {
  const card = e.target.closest('.block-card');
  if (card) card.classList.remove('drag-over');
}

function moveFigmaBlockToDA(figmaDataId, targetDataId = null) {
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
  renderFigmaDeck();
  renderDADeck();
}

function handleDropOnDeck(e) {
  e.preventDefault();
  if (draggedFromDeck === 'figma') {
    moveFigmaBlockToDA(e.dataTransfer.getData('text/plain'));
  }
}

function handleDropOnCard(e) {
  e.preventDefault();
  e.stopPropagation();
  const targetCard = e.target.closest('.block-card');
  if (!targetCard || targetCard === draggedCard || targetCard.dataset.deck !== 'da') return;

  const targetDataId = targetCard.dataset.id;
  const draggedDataId = draggedCard.dataset.id;

  if (draggedFromDeck === 'figma') {
    moveFigmaBlockToDA(draggedDataId, targetDataId);
  } else if (draggedFromDeck === 'da') {
    const draggedIndex = daBlocks.findIndex((b) => b.dataId === draggedDataId);
    const targetIndex = daBlocks.findIndex((b) => b.dataId === targetDataId);
    if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
      const [movedBlock] = daBlocks.splice(draggedIndex, 1);
      daBlocks.splice(targetIndex, 0, movedBlock);
      renderDADeck();
    }
  }
  targetCard.classList.remove('drag-over');
}

function toggleBlockRemoved(id) {
  const block = daBlocks.find((b) => b.id === id);
  if (block) {
    block.removed = !block.removed;
    renderDADeck();
  }
}

function duplicateBlock(dataId) {
  const blockIndex = daBlocks.findIndex((b) => b.dataId === dataId);
  if (blockIndex === -1) return;

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
  renderDADeck();
}

function renderFigmaDeck() {
  const container = document.querySelector('.figma-deck .deck-cards');
  if (!container) return;
  container.innerHTML = figmaBlocks.length
    ? '' : '<div class="deck-empty">No Figma blocks found</div>';
  figmaBlocks.forEach((block) => container.appendChild(createBlockCard(block, 'figma')));
}

function renderDADeck() {
  const container = document.querySelector('.da-deck .deck-cards');
  if (!container) return;
  container.innerHTML = daBlocks.length
    ? '' : '<div class="deck-empty">No DA blocks. Drag blocks from Figma deck.</div>';
  daBlocks.forEach((block) => {
    const card = createBlockCard(block, 'da');
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('dragenter', handleDragEnter);
    card.addEventListener('dragleave', handleDragLeave);
    card.addEventListener('drop', handleDropOnCard);
    container.appendChild(card);
  });
  updateDeckCounts();
}

function updateDeckCounts() {
  const figmaCount = document.querySelector('.figma-deck .deck-count');
  const daCount = document.querySelector('.da-deck .deck-count');
  if (figmaCount) figmaCount.textContent = `${figmaBlocks.length} blocks`;
  if (daCount) daCount.textContent = `${daBlocks.filter((b) => !b.removed).length} active, ${daBlocks.filter((b) => b.removed).length} removed`;
}

function createEditUI() {
  const container = document.querySelector('.edit-operation-container');
  container.style.display = 'block';
  container.querySelector('.da-deck').addEventListener('dragover', handleDragOver);
  container.querySelector('.da-deck').addEventListener('drop', handleDropOnDeck);
  return container;
}

export function getDABlocksState() {
  return [...daBlocks];
}

export function getActiveDABlocks() {
  return daBlocks.filter((b) => !b.removed);
}

async function handleApplyChanges() {
  const changes = [];
  daBlocks.forEach((b) => {
    const [source, idx] = b.dataId.split('-');
    if (!b.removed) changes.push({ source, idx });
  });
  pushEditChangesToStore(JSON.stringify(changes));
  const { initiatePreviewer } = await import('../previewer.js');
  await initiatePreviewer('create');
}

export async function handleApplyChangesEvent() {
  await handleApplyChanges();
}

export async function editStreamOperation() {
  const [fetchedFigma, fetchedDA] = await Promise.all([fetchFigmaBlocks(), fetchDABlocks()]);
  originalFigmaBlocks = fetchedFigma;
  originalDABlocks = fetchedDA;
  figmaBlocks = deepCloneBlocks(originalFigmaBlocks, 'figma');
  daBlocks = deepCloneBlocks(originalDABlocks, 'da');
  const editUI = createEditUI();
  renderFigmaDeck();
  renderDADeck();
  document.getElementById('apply-changes-btn')?.addEventListener('click', async () => {
    await handleApplyChanges();
  });
  document.getElementById('reset-changes-btn')?.addEventListener('click', () => {
    resetToOriginal();
  });
  return editUI;
}
