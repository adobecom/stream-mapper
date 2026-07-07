import { handleError } from '../../utils/error-handler.js';
import { buildFragmentBlockEntry } from './fragment-hydrate.js';

/**
 * Concatenates per-row markup from edits. Rows use `dataset.sectionIndex` into
 * editState originals; those clones must remain source-ish DA/Figma markup
 * (not re-cloned from Milo-decorated `main`), or Push to DA would persist decorated HTML.
 */
export default function buildCombinedHtml(editState) {
  let html = '';
  const daPanel = document.querySelector('.da-panel');
  const editChanges = daPanel
    ? daPanel.querySelectorAll(':scope > [data-source="da"], :scope > [data-source="figma"]')
    : [];

  try {
    editChanges.forEach((change) => {
      if (change.dataset.removed === 'true') return;

      const { source, sectionIndex } = change.dataset;
      const idx = parseInt(sectionIndex, 10);
      if (Number.isNaN(idx)) return;

      if (source === 'figma') {
        const block = editState.originalFigmaBlocks[idx];
        if (block) html += block.outerHTML;
      } else if (source === 'da') {
        const block = editState.originalDABlocks[idx];
        if (block) {
          html += block.outerHTML;
        } else {
          const repoPath = change.getAttribute('data-fragment-repo-path')
            || change.querySelector('[data-fragment-repo-path]')?.getAttribute('data-fragment-repo-path');
          if (repoPath) {
            const fallback = buildFragmentBlockEntry(repoPath, null);
            if (fallback) html += fallback.outerHTML;
          }
        }
      }
    });
  } catch (error) {
    handleError(error, ' error creating a combined page from Figma and DA.');
    throw error;
  }

  return html;
}
