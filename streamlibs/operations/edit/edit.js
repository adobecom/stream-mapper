import { miloLoadArea, fixRelativeLinks } from '../../utils/utils.js';
import { fetchDAContent } from '../../sources/da.js';
import { fetchFigmaContent } from '../../sources/figma.js';
import { pushPreviewHtmlToStore, pushTargetHtmlToStore } from '../../store/store.js';
import { targetCompatibleHtml } from '../../target/da.js';
import createEditState from './state.js';
import {
  attachSectionDeleteControls,
  createDAPanel,
  createFigmaPanel,
  exitEditorMode,
  getIdxFromId,
  handleBackToEditor,
  hasModified,
  normalizeDAImages,
  startEditorMode,
} from './dom.js';
import createEditDragDropController from './drag-drop.js';
import buildCombinedHtml from './serialize.js';

const editState = createEditState();
const dragDropController = createEditDragDropController({
  editState,
  attachSectionDeleteControls,
});

function createEditorMain() {
  const main = document.createElement('main');
  document.body.appendChild(main);
  return main;
}

function cacheOriginalBlocks(figmaResult, daMain) {
  editState.originalFigmaBlocks = figmaResult.html.map((element) => element.cloneNode(true));
  editState.originalDABlocks = Array.from(daMain.querySelectorAll(':scope > div'))
    .map((element) => element.cloneNode(true));
}

function appendFigmaBlocks(main, figmaResult) {
  figmaResult.html.forEach((html, index) => {
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
  daMain.querySelectorAll(':scope > div').forEach((div, index) => {
    div.dataset.source = 'da';
    div.dataset.sectionIndex = index;
    main.appendChild(div);
  });
}

export { handleBackToEditor };

export async function applyEditChanges() {
  const html = buildCombinedHtml(editState);
  const previewHtml = fixRelativeLinks(html);
  pushPreviewHtmlToStore(previewHtml);
  pushTargetHtmlToStore(targetCompatibleHtml(previewHtml));

  exitEditorMode();
  document.querySelector('main').innerHTML = html;
  await miloLoadArea();
}

export async function editStreamOperation() {
  const [figmaResult, daMain] = await Promise.all([
    fetchFigmaContent(),
    fetchDAContent(),
  ]);

  cacheOriginalBlocks(figmaResult, daMain);
  startEditorMode();

  const main = createEditorMain();
  appendFigmaBlocks(main, figmaResult);
  appendDABlocks(main, daMain);

  await miloLoadArea();

  const figmaPanel = createFigmaPanel();
  const daPanel = createDAPanel();
  dragDropController.enablePanelDragAndDrop(figmaPanel, daPanel);
  dragDropController.enableMainReorder(daPanel);
  attachSectionDeleteControls(daPanel);
}
