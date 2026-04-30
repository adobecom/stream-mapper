import { miloLoadArea, fixRelativeLinks } from '../../utils/utils.js';
import { fetchDAContent } from '../../sources/da.js';
import { fetchFigmaContent } from '../../sources/figma.js';
import { pushPreviewHtmlToStore, pushTargetHtmlToStore } from '../../store/store.js';
import { targetCompatibleHtml } from '../../target/da.js';
import { appendBlockActionButton } from '../../utils/block-action-button.js';
import createEditState from './state.js';
import {
  attachSectionDeleteControls,
  createDAPanel,
  createFigmaPanel,
  ensureSingleEditorMain,
  exitEditorMode,
  getIdxFromId,
  handleBackToEditor as showEditorShell,
  hasModified,
  normalizeDAImages,
  startEditorMode,
} from './dom.js';
import createEditDragDropController from './drag-drop.js';
import buildCombinedHtml from './serialize.js';
import { hydrateFragmentLinksInDaBlocks } from './fragment-hydrate.js';

const editState = createEditState();
const dragDropController = createEditDragDropController({
  editState,
  attachSectionDeleteControls,
});

function getNormalizedFigmaBlocks(figmaBlocks = []) {
  return figmaBlocks.flatMap((block) => (
    Array.isArray(block) ? block : [block]
  )).filter((block) => block?.nodeType === Node.ELEMENT_NODE);
}

function cacheOriginalBlocks(figmaResult, daMain) {
  const figmaBlocks = getNormalizedFigmaBlocks(figmaResult?.html);
  editState.originalFigmaBlocks = figmaBlocks.map((element) => element.cloneNode(true));
  editState.originalDABlocks = Array.from(daMain.querySelectorAll(':scope > div'))
    .map((element) => element.cloneNode(true));
}

function appendFigmaBlocks(main, figmaResult) {
  const figmaBlocks = getNormalizedFigmaBlocks(figmaResult?.html);
  figmaBlocks.forEach((html, index) => {
    const blockIndex = getIdxFromId(html?.id);
    const isModified = hasModified(
      figmaResult?.blockMapping?.details?.components[blockIndex]?.tag,
    );

    html.dataset.source = 'figma';
    html.dataset.sectionIndex = index;
    if (isModified) html.dataset.modified = 'true';
    main.appendChild(html);
  });
}

function appendDABlocks(main, daMain) {
  normalizeDAImages(daMain);
  const breadcrumbs = daMain.querySelector('.breadcrumbs');
  if (breadcrumbs) breadcrumbs.remove();
  daMain.querySelectorAll(':scope > div').forEach((div, index) => {
    div.dataset.source = 'da';
    div.dataset.sectionIndex = String(index);
    div.id = `block-da-${index}`;
    appendBlockActionButton(div);
    main.appendChild(div);
  });
}

function refreshOriginalDABlocksFromMain() {
  const main = editState.mainEl?.isConnected ? editState.mainEl : document.querySelector('main');
  if (!main) return;
  editState.originalDABlocks = Array.from(main.querySelectorAll(':scope > div[data-source="da"]')).map(
    (el) => el.cloneNode(true),
  );
}

/**
 * Pre–loadArea block HTML for fragment push (andPush): uses cached originals, not live decorated DOM.
 */
export function getEditBlockHtmlForFragmentFromOriginals(orderedBlockIds) {
  if (!Array.isArray(orderedBlockIds) || orderedBlockIds.length === 0) return null;
  const parts = [];
  for (const id of orderedBlockIds) {
    const el = document.getElementById(id);
    if (!el) return null;
    const src = el.dataset?.source;
    const si = parseInt(el.dataset.sectionIndex, 10);
    if (Number.isNaN(si)) return null;
    if (src === 'da' && editState.originalDABlocks[si]) {
      parts.push(editState.originalDABlocks[si].cloneNode(true).outerHTML.trim());
    } else if (src === 'figma' && editState.originalFigmaBlocks[si]) {
      parts.push(editState.originalFigmaBlocks[si].cloneNode(true).outerHTML.trim());
    } else {
      return null;
    }
  }
  return parts.length ? parts.join('') : null;
}

/**
 * Pushes merged target HTML for current editor state (same as apply, for fragment / push flows).
 */
export function rebuildTargetStoreFromEditor() {
  const html = buildCombinedHtml(editState);
  pushTargetHtmlToStore(targetCompatibleHtml(fixRelativeLinks(html)));
}

/**
 * After a fragment replaces N consecutive DA blocks, sync originalDABlocks and sectionIndex on rows.
 */
export function syncEditStateAfterFragmentReplace({
  minIdx,
  removeCount,
  fragmentEl,
}) {
  const clone = fragmentEl.cloneNode(true);
  clone.querySelectorAll('.block-action-btn, .edit-fragment-btn').forEach((b) => b.remove());
  clone.classList.remove('has-block-action', 'has-edit-fragment', 'block-selected');
  clone.querySelectorAll('.block-selected').forEach((n) => n.classList.remove('block-selected'));
  clone.removeAttribute('id');
  editState.originalDABlocks.splice(minIdx, removeCount, clone);

  document.querySelectorAll('.da-panel > div[data-source="da"]').forEach((row) => {
    const si = parseInt(row.dataset.sectionIndex, 10);
    if (Number.isNaN(si) || row === fragmentEl) return;
    if (si > minIdx + removeCount - 1) {
      row.dataset.sectionIndex = String(si - (removeCount - 1));
    }
  });
}

export function handleBackToEditor() {
  showEditorShell(editState);
}

export async function applyEditChanges() {
  const html = buildCombinedHtml(editState);
  const previewHtml = fixRelativeLinks(html);
  pushPreviewHtmlToStore(previewHtml);
  pushTargetHtmlToStore(targetCompatibleHtml(previewHtml));

  exitEditorMode(editState);
  const main = editState.mainEl || document.querySelector('main');
  if (!main) return;

  main.innerHTML = html;

  const insertedFragments = await hydrateFragmentLinksInDaBlocks(main);
  refreshOriginalDABlocksFromMain();

  for (const root of insertedFragments) {
    // eslint-disable-next-line no-await-in-loop
    await miloLoadArea(root);
  }

  await miloLoadArea();
}

export async function editStreamOperation() {
  const [figmaResult, daMain] = await Promise.all([
    fetchFigmaContent(),
    fetchDAContent(),
  ]);

  cacheOriginalBlocks(figmaResult, daMain);
  startEditorMode(editState);

  const main = ensureSingleEditorMain(editState);
  appendFigmaBlocks(main, figmaResult);
  appendDABlocks(main, daMain);

  const insertedFragments = await hydrateFragmentLinksInDaBlocks(main);
  refreshOriginalDABlocksFromMain();

  for (const root of insertedFragments) {
    // eslint-disable-next-line no-await-in-loop
    await miloLoadArea(root);
  }

  await miloLoadArea();

  editState.figmaPanelEl = createFigmaPanel();
  editState.daPanelEl = createDAPanel();
  dragDropController.enablePanelDragAndDrop(editState.figmaPanelEl, editState.daPanelEl);
  dragDropController.enableMainReorder(editState.daPanelEl);
  attachSectionDeleteControls(editState.daPanelEl);
  rebuildTargetStoreFromEditor();
}
