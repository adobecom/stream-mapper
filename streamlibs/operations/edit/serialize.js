import { handleError } from '../../utils/error-handler.js';

export default function buildCombinedHtml(editState) {
  let html = '';
  const editChanges = document.querySelectorAll('.da-panel > div');

  try {
    editChanges.forEach((change) => {
      if (change.dataset.removed === 'true') return;

      const { source, sectionIndex } = change.dataset;
      if (source === 'figma') {
        html += editState.originalFigmaBlocks[sectionIndex].outerHTML;
      } else if (source === 'da') {
        html += editState.originalDABlocks[sectionIndex].outerHTML;
      }
    });
  } catch (error) {
    handleError(error, ' error creating a combined page from Figma and DA.');
    throw error;
  }

  return html;
}
