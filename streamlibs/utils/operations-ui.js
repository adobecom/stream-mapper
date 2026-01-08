/* eslint-disable import/prefer-default-export */
/* eslint-disable no-use-before-define */
import {
  getFigmaBlocks,
  getDABlocks,
  initializeBlocksState,
  resetBlocksToOriginal,
  moveFigmaBlockToDA,
  reorderDABlocks,
  toggleBlockRemoved,
  duplicateBlock,
  fetchFigmaBlocks,
  fetchDABlocks,
  prepareChangesForStore,
} from './operations-state.js';
import { getConfig } from './utils.js';
import { handleError } from './error-handler.js';
import { previewDAPage } from '../sources/da.js';
import { ackCodeGeneration } from './utils.js';

const FIGMA_ICON = `
<svg class="svg" width="38" height="57" viewBox="0 0 38 57"><path d="M19 28.5c0-5.247 4.253-9.5 9.5-9.5 5.247 0 9.5 4.253 9.5 9.5 0 5.247-4.253 9.5-9.5 9.5-5.247 0-9.5-4.253-9.5-9.5z" fill-rule="nonzero" fill-opacity="1" fill="#1abcfe" stroke="none"></path><path d="M0 47.5C0 42.253 4.253 38 9.5 38H19v9.5c0 5.247-4.253 9.5-9.5 9.5C4.253 57 0 52.747 0 47.5z" fill-rule="nonzero" fill-opacity="1" fill="#0acf83" stroke="none"></path><path d="M19 0v19h9.5c5.247 0 9.5-4.253 9.5-9.5C38 4.253 33.747 0 28.5 0H19z" fill-rule="nonzero" fill-opacity="1" fill="#ff7262" stroke="none"></path><path d="M0 9.5C0 14.747 4.253 19 9.5 19H19V0H9.5C4.253 0 0 4.253 0 9.5z" fill-rule="nonzero" fill-opacity="1" fill="#f24e1e" stroke="none"></path><path d="M0 28.5C0 33.747 4.253 38 9.5 38H19V19H9.5C4.253 19 0 23.253 0 28.5z" fill-rule="nonzero" fill-opacity="1" fill="#a259ff" stroke="none"></path></svg>
`;
const ADOBE_ICON = `
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2"><path d="M302.562 477.27L266.27 376.206h-91.166l76.604-192.875 116.25 293.937h138.04L321.729 34.73H191.604L6 477.269h296.562z" fill="#eb1000" fill-rule="nonzero"/></svg>
`;

let draggedCard = null;
let draggedFromDeck = null;
let onApplyChangesCallback = null;

function createBlockCard(block, deckType) {
  const card = document.createElement('div');
  card.className = `block-card ${block.removed ? 'removed' : ''}`;
  card.dataset.id = block.dataId;
  card.dataset.deck = deckType;
  card.draggable = true;
  const blockName = block.name || block.id || 'Block';
  const blockTitle = (block.title ? `Block title: ${block.title}` : '');
  let buttonHtml = '';
  if (deckType === 'da') {
    buttonHtml = '<div class="button-wrapper">';
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
      if (toggleBlockRemoved(id)) {
        renderDADeck();
      }
    });
    card.querySelector('.card-duplicate-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (duplicateBlock(dataId)) {
        renderDADeck();
      }
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

function handleDropOnDeck(e) {
  e.preventDefault();
  if (draggedFromDeck === 'figma') {
    moveFigmaBlockToDA(e.dataTransfer.getData('text/plain'));
    renderFigmaDeck();
    renderDADeck();
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
    renderFigmaDeck();
    renderDADeck();
  } else if (draggedFromDeck === 'da') {
    if (reorderDABlocks(draggedDataId, targetDataId)) {
      renderDADeck();
    }
  }
  targetCard.classList.remove('drag-over');
}

function renderFigmaDeck() {
  const container = document.querySelector('.figma-deck .deck-cards');
  if (!container) return;
  const figmaBlocks = getFigmaBlocks();
  container.innerHTML = figmaBlocks.length
    ? '' : '<div class="deck-empty">No Figma blocks found</div>';
  figmaBlocks.forEach((block) => container.appendChild(createBlockCard(block, 'figma')));
}

function renderDADeck() {
  const container = document.querySelector('.da-deck .deck-cards');
  if (!container) return;
  const daBlocks = getDABlocks();
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
  const figmaBlocks = getFigmaBlocks();
  const daBlocks = getDABlocks();
  if (figmaCount) figmaCount.textContent = `${figmaBlocks.length} blocks`;
  if (daCount) daCount.textContent = `${daBlocks.filter((b) => !b.removed).length} active, ${daBlocks.filter((b) => b.removed).length} removed`;
}

function resetToOriginal() {
  resetBlocksToOriginal();
  renderFigmaDeck();
  renderDADeck();
}

function createEditUI() {
  const container = document.querySelector('.edit-operation-container');
  container.style.display = 'block';
  container.querySelector('.da-deck').addEventListener('dragover', handleDragOver);
  container.querySelector('.da-deck').addEventListener('drop', handleDropOnDeck);
  return container;
}

export async function handleApplyChanges() {
  prepareChangesForStore();
  if (onApplyChangesCallback) {
    await onApplyChangesCallback();
  }
}

export async function editStreamOperation(applyChangesCallback) {
  onApplyChangesCallback = applyChangesCallback;
  const [fetchedFigma, fetchedDA] = await Promise.all([fetchFigmaBlocks(), fetchDABlocks()]);
  initializeBlocksState(fetchedFigma, fetchedDA);
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

async function isSidekickLoginRequired(url) {
  if (new URL(url).host.includes('aem.live')) return false;
  try {
    const response = await fetch(url, { mode: 'no-cors' });
    return response.status !== 200;
  } catch (error) {
    return true;
  }
}

async function getPreviewUrl() {
  try {
    const response = await previewDAPage(window.streamConfig.targetUrl);
    return response.preview.url;
  } catch (error) {
    handleError(error, ' executing preview operation');
    throw error;
  }
}

async function loadPreflightController(origin, previewUrl) {
  const config = await getConfig();
  window.location.href = `${origin}${config.streamMapper.preflightUrl}&url=${encodeURIComponent(previewUrl)}`;
}

async function startSidekickLogin(origin, previewUrl) {
  const config = await getConfig();
  const redirectRef = encodeURIComponent(window.location.origin);
  const ackCode = ackCodeGeneration();
  const loginUrl = config.streamMapper.sidekickLoginUrl;
  // Try to open and attach opener
  document.querySelector('#retry-preflight-check-btn').addEventListener('click', () => {
    window.location.reload();
  });
  document.querySelector('#login-with-sidekick-btn').addEventListener('click', () => {
    window.open(`${origin}${loginUrl}&redirectRef=${redirectRef}&ackCode=${ackCode}`, '_blank');
  });
  window.open(`${origin}${loginUrl}&redirectRef=${redirectRef}&ackCode=${ackCode}`, '_blank');
  const handler = async (event) => {
    console.log(event.data)
    if (
      (event.origin === origin)
      && (event.data.source === 'stream-preflight')
      && (event.data.code === ackCode)) {
      window.removeEventListener('message', handler);
      await loadPreflightController(origin, previewUrl);
    }
  };
  window.addEventListener('message', handler);
}

// eslint-disable-next-line consistent-return
export async function preflightOperation() {
  let previewUrl = window.streamConfig.operation === 'preflight' && window.streamConfig.preflightUrl ? window.streamConfig.preflightUrl : null;
  if (!previewUrl) previewUrl = await getPreviewUrl();
  const { origin } = new URL(previewUrl);
  if (origin.includes('aem.page')) {
    const isLoginRequired = await isSidekickLoginRequired(origin);
    if (isLoginRequired) {
      document.querySelector('#preflight-operation-container').style.display = 'flex';
      setTimeout(async () => {
        await startSidekickLogin(origin, previewUrl);
      }, 2000);
      return;
    }
  }
  await loadPreflightController(origin, previewUrl);
}
