/* eslint-disable no-console */
import { fetchFigmaContent } from '../sources/figma.js';
import { fetchDAContent } from '../sources/da.js';
import { getConfig } from './utils.js';
import { handleError, safeFetch } from './error-handler.js';


const FIGMA_ICON = `
<svg class="svg" width="38" height="57" viewBox="0 0 38 57"><path d="M19 28.5c0-5.247 4.253-9.5 9.5-9.5 5.247 0 9.5 4.253 9.5 9.5 0 5.247-4.253 9.5-9.5 9.5-5.247 0-9.5-4.253-9.5-9.5z" fill-rule="nonzero" fill-opacity="1" fill="#1abcfe" stroke="none"></path><path d="M0 47.5C0 42.253 4.253 38 9.5 38H19v9.5c0 5.247-4.253 9.5-9.5 9.5C4.253 57 0 52.747 0 47.5z" fill-rule="nonzero" fill-opacity="1" fill="#0acf83" stroke="none"></path><path d="M19 0v19h9.5c5.247 0 9.5-4.253 9.5-9.5C38 4.253 33.747 0 28.5 0H19z" fill-rule="nonzero" fill-opacity="1" fill="#ff7262" stroke="none"></path><path d="M0 9.5C0 14.747 4.253 19 9.5 19H19V0H9.5C4.253 0 0 4.253 0 9.5z" fill-rule="nonzero" fill-opacity="1" fill="#f24e1e" stroke="none"></path><path d="M0 28.5C0 33.747 4.253 38 9.5 38H19V19H9.5C4.253 19 0 23.253 0 28.5z" fill-rule="nonzero" fill-opacity="1" fill="#a259ff" stroke="none"></path></svg>
`;
const ADOBE_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" id="Layer_1" data-name="Layer 1" viewBox="0 0 240 234"><defs><style>.cls-1{fill:#fff;}.cls-2{fill:#fa0f00;}</style></defs><title>advertising_cloud_appicon_noshadow_Artboard 1</title><rect class="cls-1" width="240" height="234" rx="42.5"/><path id="_256" data-name="256" class="cls-2" d="M186.617,175.95037H158.11058a6.24325,6.24325,0,0,1-5.84652-3.76911L121.31715,99.82211a1.36371,1.36371,0,0,0-2.61145-.034l-19.286,45.94252A1.63479,1.63479,0,0,0,100.92626,148h21.1992a3.26957,3.26957,0,0,1,3.01052,1.99409l9.2814,20.65452a3.81249,3.81249,0,0,1-3.5078,5.30176H53.734a3.51828,3.51828,0,0,1-3.2129-4.90437L99.61068,54.14376A6.639,6.639,0,0,1,105.843,50h28.31354a6.6281,6.6281,0,0,1,6.23289,4.14376L189.81885,171.046A3.51717,3.51717,0,0,1,186.617,175.95037Z"/></svg>
`;

export async function createStreamOperation() {
  let { htmlDom: html, html: htmlArray } = await fetchFigmaContent();
  const hasEditUid = new URL(window.location.href).searchParams.get('streamEditUid');
  if (hasEditUid) {
    html = ""
    try {
      if (window.localStorage.getItem(`stream-edit-${hasEditUid}`)) {
        window.sessionStorage.setItem(`stream-edit`, window.localStorage.getItem(`stream-edit-${hasEditUid}`));
        window.localStorage.removeItem(`stream-edit-${hasEditUid}`);
      }
    } catch (error) {
      handleError(error, ' parsing edit changes. Pleaser run the editor flow again.');
      throw error;
    }
    const editChanges = JSON.parse(window.sessionStorage.getItem(`stream-edit`));
    try {
      const daPlainhtml = await fetchDAContent();
      const daConsonantBlocks = daPlainhtml.querySelectorAll('div[class]');
      editChanges.forEach((change) => {
        const { source, idx } = change;
        if (source === 'figma') {
          const d = document.createElement('div');
          d.innerHTML = htmlArray[idx].innerHTML;
          html += d.outerHTML;
        } else if (source === 'da') {
          const d = document.createElement('div');
          d.innerHTML = daConsonantBlocks[idx].outerHTML;
          html += d.outerHTML;
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

export async function fetchDABlocks() {
  try {
    const daContent = await fetchDAContent();
    if (!daContent) return [];
    const blocks = [...daContent.querySelectorAll('div[class]')];
    // Assign unique IDs to each block
    return blocks.map((block, index) => ({
      id: `da-block-${index}-${Date.now()}`,
      name: block.classList[0],
      type: block.classList[0],
      element: block,
      removed: false,
    }));
  } catch (error) {
    handleError(error, ' fetching da blocks');
    throw error;
  }
}

let figmaBlocks = [];
let daBlocks = [];
let originalFigmaBlocks = [];
let originalDABlocks = [];
let draggedCard = null;
let draggedFromDeck = null;

function deepCloneBlocks(blocks, prefix) {
  return blocks.map((b, index) => ({ ...b, dataId: b.dataId || `${prefix}-${index}`, source: b.source || prefix, removed: false }));
}

function resetToOriginal() {
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
  card.innerHTML = `
    <div class="card-content">
      <div class="card-thumbnail">
        ${block.source === 'figma' ? FIGMA_ICON : ADOBE_ICON}
      </div>
      <div class="card-title">${blockName}</div>
    </div>
    ${deckType === 'da' ? `<button class="card-remove-btn ${block.removed ? 'restore' : 'remove'}">${block.removed ? '↩' : '×'}</button>` : ''}
  `;
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragend', handleDragEnd);
  if (deckType === 'da') {
    const dataId = block.dataId;
    card.querySelector('.card-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBlockRemoved(dataId);
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

function toggleBlockRemoved(dataId) {
  const block = daBlocks.find((b) => b.dataId === dataId);
  if (block) {
    block.removed = !block.removed;
    renderDADeck();
  }
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

function generateUniqueId() {
  // Return 5 random lowercase alphabets and numbers
  let result = '';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 5; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function handleApplyChanges() {
  const changes = [];
  daBlocks.forEach((b) => {
    const [source, idx] = b.dataId.split('-');
    if (!b.removed) changes.push({source, idx});
  });
  const uid = generateUniqueId();
  window.localStorage.setItem(`stream-edit-${uid}`, JSON.stringify(changes));
  const url = new URL(window.location.href);
  url.searchParams.delete('operation');
  url.searchParams.set('streamEditUid', uid);
  window.location.href = url.toString();
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
  document.getElementById('apply-changes-btn')?.addEventListener('click', () => {
    handleApplyChanges();
  });
  document.getElementById('reset-changes-btn')?.addEventListener('click', () => {
    resetToOriginal();
  });
  return editUI;
}
