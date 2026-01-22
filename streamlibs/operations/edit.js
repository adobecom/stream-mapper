/* eslint-disable import/prefer-default-export */
/* eslint-disable no-use-before-define */
import { miloLoadArea, fixRelativeLinks } from '../utils/utils.js';
import { fetchDAContent } from '../sources/da.js';
import { fetchFigmaContent } from '../sources/figma.js';
import { pushPreviewHtmlToStore, pushTargetHtmlToStore } from '../store/store.js';
import { targetCompatibleHtml } from '../target/da.js';
import { handleError } from '../utils/error-handler.js';

const FIGMA_ICON = `
<svg class="svg" width="38" height="57" viewBox="0 0 38 57"><path d="M19 28.5c0-5.247 4.253-9.5 9.5-9.5 5.247 0 9.5 4.253 9.5 9.5 0 5.247-4.253 9.5-9.5 9.5-5.247 0-9.5-4.253-9.5-9.5z" fill-rule="nonzero" fill-opacity="1" fill="#1abcfe" stroke="none"></path><path d="M0 47.5C0 42.253 4.253 38 9.5 38H19v9.5c0 5.247-4.253 9.5-9.5 9.5C4.253 57 0 52.747 0 47.5z" fill-rule="nonzero" fill-opacity="1" fill="#0acf83" stroke="none"></path><path d="M19 0v19h9.5c5.247 0 9.5-4.253 9.5-9.5C38 4.253 33.747 0 28.5 0H19z" fill-rule="nonzero" fill-opacity="1" fill="#ff7262" stroke="none"></path><path d="M0 9.5C0 14.747 4.253 19 9.5 19H19V0H9.5C4.253 0 0 4.253 0 9.5z" fill-rule="nonzero" fill-opacity="1" fill="#f24e1e" stroke="none"></path><path d="M0 28.5C0 33.747 4.253 38 9.5 38H19V19H9.5C4.253 19 0 23.253 0 28.5z" fill-rule="nonzero" fill-opacity="1" fill="#a259ff" stroke="none"></path></svg>
`;
const ADOBE_ICON = `
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2"><path d="M302.562 477.27L266.27 376.206h-91.166l76.604-192.875 116.25 293.937h138.04L321.729 34.73H191.604L6 477.269h296.562z" fill="#eb1000" fill-rule="nonzero"/></svg>
`;

let draggedPanelBlock = null;
let draggedMainBlock = null;
let dropPlaceholder = null;
let dragPreviewEl = null;
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
      const source = change.dataset.source;
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
  let previewHtml = fixRelativeLinks(html);
  pushPreviewHtmlToStore(previewHtml);
  const targetHtml = targetCompatibleHtml(previewHtml);
  pushTargetHtmlToStore(targetHtml);
  exitEditorMode();
  document.querySelector('main').innerHTML = html;
  await miloLoadArea();
}

function enablePanelDragAndDrop(sourcePanel, targetPanel) {
  // Make Figma blocks in the source panel draggable
  sourcePanel.querySelectorAll('div[data-source="figma"]').forEach((block) => {
    block.classList.add('figma-panel-block');
    block.draggable = true;
    block.addEventListener('dragstart', (e) => {
      draggedPanelBlock = block;
      block.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', block.dataset.sectionIndex || '');

      // Use a small custom drag image so the ghost preview isn't huge
      if (!dragPreviewEl) {
        dragPreviewEl = document.createElement('div');
        dragPreviewEl.style.width = '80px';
        dragPreviewEl.style.height = '32px';
        dragPreviewEl.style.background = 'rgba(107, 114, 128, 0.4)';
        dragPreviewEl.style.border = '1px solid rgba(31, 41, 55, 0.5)';
        dragPreviewEl.style.borderRadius = '4px';
        dragPreviewEl.style.position = 'absolute';
        dragPreviewEl.style.top = '-9999px';
        dragPreviewEl.style.left = '-9999px';
        dragPreviewEl.style.boxSizing = 'border-box';
        document.body.appendChild(dragPreviewEl);
      }
      try {
        e.dataTransfer.setDragImage(dragPreviewEl, 40, 16);
      } catch (err) {
        // Ignore if the browser doesn't support custom drag images
      }
    });

    block.addEventListener('dragend', () => {
      if (draggedPanelBlock) {
        draggedPanelBlock.classList.remove('is-dragging');
      }
      draggedPanelBlock = null;
      targetPanel.classList.remove('da-drop-active');
    });
  });

  // Allow dropping into the DA panel
  targetPanel.addEventListener('dragover', (e) => {
    if (!draggedPanelBlock && !draggedMainBlock) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    targetPanel.classList.add('da-drop-active');

    // Create a green drop placeholder if it doesn't exist
    if (!dropPlaceholder) {
      dropPlaceholder = document.createElement('div');
      dropPlaceholder.classList.add('da-drop-placeholder');
    }

    const rawTarget = e.target.closest('[data-source="da"], [data-source="figma"]');
    // Find the closest ancestor that is a direct child of the target panel
    let targetBlock = rawTarget;
    while (targetBlock && targetBlock.parentNode !== targetPanel) {
      targetBlock = targetBlock.parentNode;
    }

    if (!targetBlock || !targetPanel.contains(targetBlock)) {
      // No specific target – show placeholder at the end
      if (dropPlaceholder.parentNode !== targetPanel) {
        targetPanel.appendChild(dropPlaceholder);
      }
    } else {
      const rect = targetBlock.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) {
        if (targetBlock.previousSibling !== dropPlaceholder) {
          targetPanel.insertBefore(dropPlaceholder, targetBlock);
        }
      } else if (targetBlock.nextSibling !== dropPlaceholder) {
        targetPanel.insertBefore(dropPlaceholder, targetBlock.nextSibling);
      }
    }
  });

  targetPanel.addEventListener('drop', (e) => {
    if (!draggedPanelBlock && !draggedMainBlock) return;
    e.preventDefault();

    let blockToInsert = null;

    if (draggedPanelBlock) {
      // Clone the Figma block so the original stays in the panel
      const clonedBlock = draggedPanelBlock.cloneNode(true);
      clonedBlock.classList.remove('figma-panel-block', 'is-dragging');
      clonedBlock.removeAttribute('draggable');
      blockToInsert = clonedBlock;
    } else if (draggedMainBlock) {
      blockToInsert = draggedMainBlock;
    }

    if (!blockToInsert) return;

    if (dropPlaceholder && dropPlaceholder.parentNode === targetPanel) {
      targetPanel.insertBefore(blockToInsert, dropPlaceholder);
      targetPanel.removeChild(dropPlaceholder);
      dropPlaceholder = null;
    } else {
      // Fallback – append at the end of DA panel
      targetPanel.appendChild(blockToInsert);
    }

    if (draggedPanelBlock) {
      draggedPanelBlock.classList.remove('is-dragging');
    }
    if (draggedMainBlock) {
      draggedMainBlock.classList.remove('is-dragging');
    }
    draggedPanelBlock = null;
    draggedMainBlock = null;
    targetPanel.classList.remove('da-drop-active');

    // Ensure any newly inserted Figma blocks in DA panel are reorderable and have delete controls
    enableMainReorder(targetPanel);
    attachSectionDeleteControls(targetPanel);
  });
}

function enableMainReorder(container) {
  const figmaInMain = Array.from(container.querySelectorAll(':scope > [data-source="figma"]'));
  figmaInMain.forEach((block) => {
    // Enable drag only once
    if (block.dataset.reorderEnabled === 'true') return;
    // eslint-disable-next-line no-param-reassign
    block.draggable = true;
    block.dataset.reorderEnabled = 'true';

    block.addEventListener('dragstart', (e) => {
      draggedMainBlock = block;
      block.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', block.dataset.sectionIndex || '');

      // Use same small drag preview as panel blocks
      if (!dragPreviewEl) {
        dragPreviewEl = document.createElement('div');
        dragPreviewEl.style.width = '80px';
        dragPreviewEl.style.height = '32px';
        dragPreviewEl.style.background = 'rgba(107, 114, 128, 0.4)';
        dragPreviewEl.style.border = '1px solid rgba(31, 41, 55, 0.5)';
        dragPreviewEl.style.borderRadius = '4px';
        dragPreviewEl.style.position = 'absolute';
        dragPreviewEl.style.top = '-9999px';
        dragPreviewEl.style.left = '-9999px';
        dragPreviewEl.style.boxSizing = 'border-box';
        document.body.appendChild(dragPreviewEl);
      }
      try {
        e.dataTransfer.setDragImage(dragPreviewEl, 40, 16);
      } catch (err) {
        // Ignore if the browser doesn't support custom drag images
      }
    });

    block.addEventListener('dragend', () => {
      if (draggedMainBlock === block) {
        block.classList.remove('is-dragging');
        draggedMainBlock = null;
      }
      if (dropPlaceholder && dropPlaceholder.parentNode === container) {
        container.removeChild(dropPlaceholder);
        dropPlaceholder = null;
      }
      container.classList.remove('da-drop-active');
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

export async function editStreamOperation() {
  const [figmaResult, daMain] = await Promise.all([
    fetchFigmaContent(),
    fetchDAContent(),
  ]);
  originalFigmaBlocks = figmaResult.html.map(el => el.cloneNode(true));
  originalDABlocks = Array.from(daMain.querySelectorAll(":scope > div")).map(el => el.cloneNode(true));
  startEditorMode();
  const mainEl = document.createElement('main');
  document.body.appendChild(mainEl);
  figmaResult.html.forEach((html, idx) => {
    html.dataset.source = 'figma';
    html.dataset.sectionIndex = idx;
    mainEl.appendChild(html);
  });
  daMain.querySelectorAll(":scope > div").forEach((div, idx) => {
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
