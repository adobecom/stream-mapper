import { ANNOTATION_MESSAGES } from '../../utils/constants.js';

const HINT_CLASS = 'annotation-fragment-readonly-hint';

/**
 * True when this fragment is nested inside another fragment root (banner only on the outer wrapper).
 */
function isNestedFragmentRoot(fragmentEl) {
  const parent = fragmentEl.parentElement;
  if (!parent) return false;
  return Boolean(parent.closest('[data-class="fragment"]'));
}

/**
 * Keeps fragment “editing disabled” banners in sync: one hint per outermost fragment, only while the Edits tab is active.
 */
export function syncFragmentEditDisabledHints(mainEl, showHints) {
  if (!(mainEl instanceof HTMLElement)) return;

  mainEl.querySelectorAll(`.${HINT_CLASS}`).forEach((hint) => hint.remove());
  if (!showHints) return;

  mainEl.querySelectorAll('[data-class="fragment"]').forEach((fragmentEl) => {
    if (!(fragmentEl instanceof HTMLElement)) return;
    if (isNestedFragmentRoot(fragmentEl)) return;

    const hint = document.createElement('div');
    hint.className = HINT_CLASS;
    hint.setAttribute('role', 'note');
    hint.textContent = ANNOTATION_MESSAGES.fragmentEditDisabledHint;
    fragmentEl.insertBefore(hint, fragmentEl.firstChild);
  });
}
