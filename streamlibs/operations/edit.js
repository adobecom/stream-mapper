/* eslint-disable import/prefer-default-export */
/* eslint-disable no-use-before-define */
import { miloLoadArea, fixRelativeLinks } from '../utils/utils.js';
import { fetchDAContent } from '../sources/da.js';
import { fetchFigmaContent } from '../sources/figma.js';
import { pushPreviewHtmlToStore, pushTargetHtmlToStore } from '../store/store.js';
import { targetCompatibleHtml } from '../target/da.js';
import { handleError } from '../utils/error-handler.js';

let draggedPanelBlock = null;
let draggedMainBlock = null;
let dropPlaceholder = null;
let currentDropContainer = null;
let originalFigmaBlocks = [];
let originalDABlocks = [];

function attachSectionDeleteControls(mainEl) {
  const sections = Array.from(
    mainEl.querySelectorAll(':scope > [data-source="figma"], :scope > [data-source="da"]'),
  );

  sections.forEach((section) => {
    if (section.dataset.deleteEnabled === 'true') return;
    section.dataset.deleteEnabled = 'true';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'da-section-delete';
    btn.setAttribute('aria-label', 'Remove section');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isRemoved = section.classList.toggle('da-section-removed');
      btn.classList.toggle('is-removed', isRemoved);
      section.dataset.removed = String(isRemoved);
      btn.setAttribute('aria-label', isRemoved ? 'Undo remove section' : 'Remove section');
    });

    section.appendChild(btn);
  });
}

function startEditorMode() {
  document.body.classList.add('editor-mode');
  if (document.querySelector('.da-panel')) document.querySelector('.da-panel').classList.remove('hidden');
  if (document.querySelector('.figma-panel')) document.querySelector('.figma-panel').classList.remove('hidden');
}

function exitEditorMode() {
  document.body.classList.remove('editor-mode');
  if (document.querySelector('.da-panel'))document.querySelector('.da-panel').classList.add('hidden');
  if (document.querySelector('.figma-panel'))document.querySelector('.figma-panel').classList.add('hidden');
}

export async function handleBackToEditor() {
  if (document.querySelector('main')) document.querySelector('main').innerHTML = '';
  startEditorMode();
}

export async function applyEditChanges() {
  let html = '';
  const editChanges = document.querySelectorAll('.da-panel > div');
  try {
    editChanges.forEach((change) => {
      if (change.dataset.removed === 'true') return;
      const { source } = change.dataset;
      const idx = change.dataset.sectionIndex;
      if (source === 'figma') {
        html += originalFigmaBlocks[idx].outerHTML;
      } else if (source === 'da') {
        html += originalDABlocks[idx].outerHTML;
      }
    });
  } catch (error) {
    handleError(error, ' error creating a combined page from Figma and DA.');
    throw error;
  }
  const previewHtml = fixRelativeLinks(html);
  pushPreviewHtmlToStore(previewHtml);
  const targetHtml = targetCompatibleHtml(previewHtml);
  pushTargetHtmlToStore(targetHtml);
  exitEditorMode();
  document.querySelector('main').innerHTML = html;
  await miloLoadArea();
}

function handlePointerMove(e) {
  if (!draggedPanelBlock && !draggedMainBlock) return;
  const container = currentDropContainer;
  if (!container) return;

  e.preventDefault();
  container.classList.add('da-drop-active');

  if (!dropPlaceholder) {
    dropPlaceholder = document.createElement('div');
    dropPlaceholder.classList.add('da-drop-placeholder');
  }

  const pointEl = document.elementFromPoint(e.clientX, e.clientY);
  let targetBlock = pointEl && pointEl.closest('[data-source="da"], [data-source="figma"]');
  while (targetBlock && targetBlock.parentNode !== container) {
    targetBlock = targetBlock.parentNode;
  }

  if (!targetBlock || !container.contains(targetBlock)) {
    if (dropPlaceholder.parentNode !== container) {
      container.appendChild(dropPlaceholder);
    }
  } else {
    const rect = targetBlock.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (before) {
      if (targetBlock.previousSibling !== dropPlaceholder) {
        container.insertBefore(dropPlaceholder, targetBlock);
      }
    } else if (targetBlock.nextSibling !== dropPlaceholder) {
      container.insertBefore(dropPlaceholder, targetBlock.nextSibling);
    }
  }
}

function handlePointerUp() {
  if (!draggedPanelBlock && !draggedMainBlock) {
    currentDropContainer?.classList.remove('da-drop-active');
    window.removeEventListener('pointermove', handlePointerMove);
    return;
  }

  const container = currentDropContainer;
  let blockToInsert = null;

  if (draggedPanelBlock) {
    const clonedBlock = draggedPanelBlock.cloneNode(true);
    clonedBlock.classList.remove('figma-panel-block', 'is-dragging');
    blockToInsert = clonedBlock;
  } else if (draggedMainBlock) {
    blockToInsert = draggedMainBlock;
  }

  if (blockToInsert && container) {
    if (dropPlaceholder && dropPlaceholder.parentNode === container) {
      container.insertBefore(blockToInsert, dropPlaceholder);
      container.removeChild(dropPlaceholder);
      dropPlaceholder = null;
    } else {
      container.appendChild(blockToInsert);
    }
  }

  if (draggedPanelBlock) draggedPanelBlock.classList.remove('is-dragging');
  if (draggedMainBlock) draggedMainBlock.classList.remove('is-dragging');

  draggedPanelBlock = null;
  draggedMainBlock = null;
  container?.classList.remove('da-drop-active');

  // Make sure newly inserted blocks are draggable/removable too
  if (container) {
    enableMainReorder(container);
    attachSectionDeleteControls(container);
  }

  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', handlePointerUp);
}

function enablePanelDragAndDrop(sourcePanel, targetPanel) {
  sourcePanel.querySelectorAll('div[data-source="figma"]').forEach((block) => {
    block.classList.add('figma-panel-block');
    block.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      draggedPanelBlock = block;
      draggedMainBlock = null;
      currentDropContainer = targetPanel;
      block.classList.add('is-dragging');

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    });
  });
}

function enableMainReorder(container) {
  const figmaInMain = Array.from(container.querySelectorAll(':scope > [data-source="figma"]'));
  figmaInMain.forEach((block) => {
    if (block.dataset.reorderEnabled === 'true') return;
    block.dataset.reorderEnabled = 'true';

    block.addEventListener('pointerdown', (e) => {
      // Ignore clicks on the delete/undo button so delete works properly
      if (e.button !== 0 || e.target.closest('.da-section-delete')) return;
      e.preventDefault();
      draggedMainBlock = block;
      draggedPanelBlock = null;
      currentDropContainer = container;
      block.classList.add('is-dragging');

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    });
  });
}

function createFigmaPanel() {
  const panel = document.createElement('div');
  panel.classList.add('figma-panel');
  const figmaBlocks = document.body.querySelectorAll('main > div[data-source="figma"]');
  figmaBlocks.forEach((block) => {
    panel.appendChild(block);
  });
  document.body.prepend(panel);
  return panel;
}

function createDAPanel() {
  const panel = document.createElement('div');
  panel.classList.add('da-panel');
  const daBlocks = document.body.querySelectorAll('main > div[data-source="da"]');
  daBlocks.forEach((block) => {
    panel.appendChild(block);
  });
  document.body.prepend(panel);
  return panel;
}

function getIdxFromId(id) {
  if (!id) return null;

  const parts = id.split('-');
  return parts.length > 1 ? parts[1] : null;
}

function hasModified(tag) {
  if (tag?.includes('-modified')) {
    return true;
  }
  return false;
}

export async function editStreamOperation() {
  const [figmaResult, daMain] = await Promise.all([
    fetchFigmaContent(),
    fetchDAContent(),
  ]);
  originalFigmaBlocks = figmaResult.html.map((el) => el.cloneNode(true));
  originalDABlocks = Array.from(daMain.querySelectorAll(':scope > div')).map((el) => el.cloneNode(true));
  startEditorMode();
  const mainEl = document.createElement('main');
  document.body.appendChild(mainEl);
  figmaResult.html.forEach((html, idx) => {
    const blockIndex = getIdxFromId(html?.id);
    const isModified = hasModified(figmaResult?.blockMapping?.details?.components[blockIndex]?.tag);
    html.dataset.source = 'figma';
    html.dataset.sectionIndex = idx;
    if (isModified) html.dataset.modified = 'true';
    mainEl.appendChild(html);
  });
  daMain.querySelectorAll(':scope > div').forEach((div, idx) => {
    div.dataset.source = 'da';
    div.dataset.sectionIndex = idx;
    mainEl.appendChild(div);
  });
  await miloLoadArea();
  const figmaPanel = createFigmaPanel();
  const daPanel = createDAPanel();
  enablePanelDragAndDrop(figmaPanel, daPanel);
  enableMainReorder(daPanel);
  attachSectionDeleteControls(daPanel);
}
