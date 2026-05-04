import { miloLoadArea, fixRelativeLinks } from '../../utils/utils.js';
import { fetchDAContent } from '../../sources/da.js';
import { fetchFigmaContent } from '../../sources/figma.js';
import { pushPreviewHtmlToStore, pushTargetHtmlToStore } from '../../store/store.js';
import { targetCompatibleHtml } from '../../target/da.js';
import { appendBlockActionButton, elevateBlockFragmentControls } from '../../utils/block-action-button.js';
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
 *
 * IMPORTANT: We splice a **lightweight fragment pointer** (`<div data-class="fragment"><div><div>
 * <a href="..."/></div></div></div>`) into originalDABlocks, NOT a clone of the inlined `fragmentEl`.
 * The inlined element holds Milo-decorated section markup; using it as the "raw" original would
 * cause Push to DA (and applyEditChanges) to persist rendered DOM instead of the simple link form
 * that DA expects.
 */
export function syncEditStateAfterFragmentReplace({
  minIdx,
  removeCount,
  fragmentEl,
  pointerHtml,
}) {
  let originalEntry;
  if (typeof pointerHtml === 'string' && pointerHtml.trim()) {
    const tmp = document.createElement('div');
    tmp.innerHTML = pointerHtml.trim();
    originalEntry = tmp.firstElementChild;
  }
  if (!originalEntry) {
    const clone = fragmentEl.cloneNode(true);
    clone.querySelectorAll('.broken-placeholder-fragment, [data-failed="true"]').forEach((n) => n.remove());
    clone.querySelectorAll('.block-action-btn, .edit-fragment-btn').forEach((b) => b.remove());
    clone.classList.remove('has-block-action', 'has-edit-fragment', 'block-selected');
    clone.querySelectorAll('.block-selected').forEach((n) => n.classList.remove('block-selected'));
    clone.removeAttribute('id');
    originalEntry = clone;
  }
  editState.originalDABlocks.splice(minIdx, removeCount, originalEntry);

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

/**
 * Strip editor chrome (action buttons, selection/highlight classes, deletion markers, ids/dataset
 * keys we own) without replacing block content, so already-decorated/hydrated DOM survives.
 */
function stripEditorChromeOnBlock(block) {
  if (!(block instanceof Element)) return;
  block.querySelectorAll('.block-action-btn, .da-section-delete, .edit-fragment-btn, .block-selection-bar')
    .forEach((b) => b.remove());
  block.classList.remove('has-block-action', 'has-edit-fragment', 'block-selected', 'da-section-removed');
  delete block.dataset.deleteEnabled;
  delete block.dataset.removed;
  delete block.dataset.reorderEnabled;
}

/**
 * Mirror `.da-panel`'s ordered, already-decorated rows into `main` for the post-Apply preview.
 *
 * Cloning (rather than moving) preserves the panels intact so `BACK_TO_EDIT` can simply un-hide
 * them. We deliberately do NOT re-set `main.innerHTML = html` and re-run `hydrateFragmentLinksInDaBlocks`
 * + `miloLoadArea` here — `editStreamOperation` already hydrated/decorated the DOM, and re-hydrating
 * against just-published fragment URLs (CDN propagation lag) shows a flash of "Fragment could not
 * be loaded." next to already-rendered content.
 */
function commitEditedDomToMain(editState) {
  const main = editState.mainEl?.isConnected
    ? editState.mainEl
    : document.querySelector('main');
  if (!main) return;

  const daPanel = editState.daPanelEl?.isConnected
    ? editState.daPanelEl
    : document.querySelector('.da-panel');

  main.innerHTML = '';
  if (!daPanel) return;

  const blocks = Array.from(daPanel.querySelectorAll(':scope > div'));
  blocks.forEach((block) => {
    if (block.dataset.removed === 'true') return;
    const clone = block.cloneNode(true);
    stripEditorChromeOnBlock(clone);
    main.appendChild(clone);
  });
}

export async function applyEditChanges() {
  const html = buildCombinedHtml(editState);
  const previewHtml = fixRelativeLinks(html);
  pushPreviewHtmlToStore(previewHtml);
  pushTargetHtmlToStore(targetCompatibleHtml(previewHtml));

  exitEditorMode(editState);
  commitEditedDomToMain(editState);
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
  elevateBlockFragmentControls(editState.daPanelEl);
  elevateBlockFragmentControls(editState.figmaPanelEl);
  rebuildTargetStoreFromEditor();
}
