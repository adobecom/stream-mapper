/* eslint-disable no-console */
import { pushBlockFragmentToDa, extractRepoPath, fragmentExistsOnDa } from '../target/da.js';
import { previewDAPage } from '../sources/da.js';
import { fetchTargetHtmlFromStore, pushTargetHtmlToStore } from '../store/store.js';
import { mountBlockActionUi } from './block-action-modal-ui.js';
import { appendBlockActionButton } from './block-action-button.js';
import { attachSectionDeleteControls } from '../operations/edit/dom.js';
import {
  getEditBlockHtmlForFragmentFromOriginals,
  rebuildTargetStoreFromEditor,
  syncEditStateAfterFragmentReplace,
} from '../operations/edit/edit.js';
import { fillFragmentWrapperFromRepo } from '../operations/edit/fragment-hydrate.js';
import { miloLoadArea } from './utils.js';

const MODAL_ID = 'block-action-modal';

export const STREAM_BLOCK_FRAGMENT_EVENT = 'stream-block-fragment';

let selectedBlockIds = [];
let createdFragmentPath = '';
/** True when next replace uses fetched fragment HTML ("Use existing"); false for Create (clone selection). */
let pendingFragmentHydrateRemote = false;
/** Message shown on final "replaced" screen (create vs use-existing set this before replace). */
let pendingReplacedMessage = '';
let lastFocusedElement = null;
let toastTimer = null;
let pendingDisableActionButtons = [];

/* ------------------------------------------------------------------ */
/*  Selection state                                                    */
/* ------------------------------------------------------------------ */

function getSelectionColumn(blockId) {
  const el = document.getElementById(blockId);
  if (!el) return 'main';
  if (el.closest('.da-panel')) return 'da';
  if (el.closest('.figma-panel')) return 'figma';
  return 'main';
}

function getPanelOrderedBlockIds(blockId) {
  const col = getSelectionColumn(blockId);
  if (col === 'da') {
    // Includes block-da-* (DA) and block-*, block-*-* (Figma dragged into the right panel)
    return [...document.querySelectorAll('.da-panel > [id^="block-"]')].map((el) => el.id);
  }
  if (col === 'figma') {
    return [...document.querySelectorAll('.figma-panel > [id^="block-"]')]
      .map((el) => el.id)
      .filter((id) => !id.startsWith('block-da-'));
  }
  return [...document.querySelectorAll('main [id^="block-"]')].map((el) => el.id);
}

function isConsecutiveWith(blockId) {
  if (selectedBlockIds.length === 0) return true;
  if (getSelectionColumn(blockId) !== getSelectionColumn(selectedBlockIds[0])) return false;
  const allIds = getPanelOrderedBlockIds(blockId);
  const candidateSet = [...selectedBlockIds, blockId];
  const indices = candidateSet.map((id) => allIds.indexOf(id)).filter((i) => i !== -1);
  if (indices.length !== candidateSet.length) return false;
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  return max - min + 1 === indices.length;
}

/** Validates full current selection (e.g. after toggling off the middle block). */
function selectionIsConsecutive() {
  if (selectedBlockIds.length <= 1) return true;
  const col = getSelectionColumn(selectedBlockIds[0]);
  if (!selectedBlockIds.every((id) => getSelectionColumn(id) === col)) return false;
  const allIds = getPanelOrderedBlockIds(selectedBlockIds[0]);
  const indices = selectedBlockIds.map((id) => allIds.indexOf(id));
  if (indices.some((i) => i === -1)) return false;
  const sorted = [...indices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return max - min + 1 === sorted.length;
}

function applySelectionHighlight(blockId, selected) {
  const el = document.getElementById(blockId);
  if (!el) return;
  const target = el.classList.contains('section')
    ? (el.querySelector('[data-block-status]') || el)
    : el;
  if (selected) target.classList.add('block-selected');
  else target.classList.remove('block-selected');

  const actionBtn = el.querySelector(':scope > .block-action-btn') || el.querySelector('.block-action-btn');
  if (actionBtn) {
    actionBtn.classList.toggle('block-action-btn--selected', selected);
    actionBtn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
}

function isFragmentEditorHintContext() {
  return document.body.classList.contains('editor-mode')
    && window.streamConfig?.operation === 'edit';
}

function updateSelectionBar() {
  const bar = document.getElementById('block-selection-bar');
  const countEl = document.getElementById('block-selection-count');
  const subline = document.getElementById('block-selection-subline');
  const actions = bar?.querySelector('.block-selection-bar-actions');
  if (!bar) return;

  if (selectedBlockIds.length === 0) {
    if (isFragmentEditorHintContext()) {
      bar.hidden = false;
      bar.classList.add('block-selection-bar--hint');
      if (countEl) countEl.textContent = 'Create a fragment from DA blocks';
      if (subline) {
        subline.hidden = false;
        subline.textContent =
          'In the DA column on the right, use the stacked-pages (+) control at the corner of each block row to toggle selection '
          + '(highlighted outline). Rows must be next to each other in the list. When at least one block is chosen, '
          + 'buttons appear below to Create fragment.';
      }
      if (actions) actions.hidden = true;
    } else {
      bar.hidden = true;
      bar.classList.remove('block-selection-bar--hint');
      if (subline) subline.hidden = true;
      if (actions) actions.hidden = false;
    }
    return;
  }

  bar.classList.remove('block-selection-bar--hint');
  if (actions) actions.hidden = false;
  bar.hidden = false;
  const n = selectedBlockIds.length;
  if (countEl) countEl.textContent = `${n} block${n > 1 ? 's' : ''} selected`;
  if (subline) {
    subline.hidden = false;
    subline.textContent = 'Press Create fragment to publish to DA and replace this range, or Clear (Esc).';
  }
}

/** Call after the edit UI mounts (or returning to editor) so the empty-selection hint stays accurate. */
export function syncBlockSelectionChrome() {
  updateSelectionBar();
}

function showSelectionToast(message) {
  const toast = document.getElementById('block-selection-toast');
  if (!toast) return;
  if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = null; }
  toast.textContent = message;
  toast.hidden = false;
  toast.style.animation = 'none';
  // eslint-disable-next-line no-void
  void toast.offsetWidth;
  toast.style.animation = '';
  toastTimer = window.setTimeout(() => { toast.hidden = true; toastTimer = null; }, 2500);
}

function toggleBlockSelection(blockId) {
  if (!blockId) return;
  const idx = selectedBlockIds.indexOf(blockId);
  if (idx !== -1) {
    selectedBlockIds.splice(idx, 1);
    applySelectionHighlight(blockId, false);
    if (selectedBlockIds.length > 1 && !selectionIsConsecutive()) {
      showSelectionToast('Only consecutive blocks can be selected.');
      clearBlockSelection();
      return;
    }
  } else {
    if (selectedBlockIds.length > 0
      && getSelectionColumn(blockId) !== getSelectionColumn(selectedBlockIds[0])) {
      showSelectionToast('Select blocks in one column at a time.');
      return;
    }
    if (!isConsecutiveWith(blockId)) {
      showSelectionToast('Only consecutive blocks can be selected.');
      return;
    }
    selectedBlockIds.push(blockId);
    applySelectionHighlight(blockId, true);
  }
  updateSelectionBar();
}

function clearBlockSelection() {
  selectedBlockIds.forEach((id) => applySelectionHighlight(id, false));
  selectedBlockIds = [];
  updateSelectionBar();
}

function getSelectedIdsInDomOrder() {
  if (selectedBlockIds.length <= 1) return [...selectedBlockIds];
  const allIds = getPanelOrderedBlockIds(selectedBlockIds[0]);
  return [...selectedBlockIds].sort((a, b) => allIds.indexOf(a) - allIds.indexOf(b));
}

/* ------------------------------------------------------------------ */
/*  Modal helpers                                                      */
/* ------------------------------------------------------------------ */

function getModalElements() {
  const container = document.getElementById(MODAL_ID);
  if (!container) return null;
  return {
    container,
    backdrop: document.getElementById('block-action-modal-backdrop'),
    closeBtn: document.getElementById('block-action-modal-close'),
    pathInput: document.getElementById('block-action-modal-path'),
    nameInput: document.getElementById('block-action-modal-name'),
    errorEl: document.getElementById('block-action-modal-error'),
    createBtn: document.getElementById('block-action-modal-create'),
    useExistingBtn: document.getElementById('block-action-modal-use-existing'),
    formState: document.getElementById('block-action-modal-body'),
    progressState: document.getElementById('block-action-modal-progress'),
    progressFill: document.getElementById('block-action-modal-progress-fill'),
    progressText: container.querySelector('.block-action-modal-progress-text'),
    replacedState: document.getElementById('block-action-modal-replaced'),
    replacedCloseBtn: document.getElementById('block-action-modal-close-replaced'),
  };
}

function showState(stateName) {
  const els = getModalElements();
  if (!els) return;
  const states = [
    els.formState, els.progressState, els.replacedState,
  ];
  states.forEach((s) => {
    if (!s) return;
    s.hidden = s.dataset.state !== stateName;
  });
}

function setProgress(pct) {
  const { progressFill } = getModalElements() || {};
  if (progressFill) progressFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

function setProgressText(text) {
  const { progressText } = getModalElements() || {};
  if (progressText) progressText.textContent = text;
}

function getFragmentPath() {
  const { pathInput, nameInput } = getModalElements() || {};
  const folder = (pathInput?.value || '').trim().replace(/\/+$/, '');
  const name = (nameInput?.value || '').trim();
  if (!folder || !name) return '';
  return `${folder}/${name}`;
}

function clearError() {
  const { pathInput, nameInput, errorEl } = getModalElements() || {};
  if (errorEl) { errorEl.textContent = ''; errorEl.hidden = true; }
  pathInput?.classList.remove('is-invalid');
  nameInput?.classList.remove('is-invalid');
}

function showError(message, field) {
  const { pathInput, nameInput, errorEl } = getModalElements() || {};
  if (errorEl) { errorEl.textContent = message; errorEl.hidden = false; }
  if (!field || field === 'path') pathInput?.classList.add('is-invalid');
  if (!field || field === 'name') nameInput?.classList.add('is-invalid');
}

/* ------------------------------------------------------------------ */
/*  Block HTML extraction (multi-block)                                */
/* ------------------------------------------------------------------ */

function extractBlocksHtmlFromDom(blockIds) {
  const parts = blockIds.map((id) => {
    const el = document.getElementById(id);
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('.block-action-btn, .edit-fragment-btn').forEach((b) => b.remove());
    c.classList.remove('has-block-action', 'has-edit-fragment', 'block-selected');
    c.querySelectorAll('.block-selected').forEach((n) => n.classList.remove('block-selected'));
    c.removeAttribute('id');
    return c.outerHTML.trim();
  });
  const combined = parts.filter(Boolean).join('');
  return combined || null;
}

function extractBlocksHtml(blockIds) {
  if (window.streamConfig?.operation === 'edit') {
    const fromOriginals = getEditBlockHtmlForFragmentFromOriginals(blockIds);
    if (fromOriginals) return fromOriginals;
    return extractBlocksHtmlFromDom(blockIds);
  }
  const targetHtml = fetchTargetHtmlFromStore();
  if (!targetHtml) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${targetHtml}</div>`, 'text/html');
  const parts = blockIds.map((id) => {
    const el = doc.getElementById(id);
    if (!el) return '';
    el.querySelectorAll('.block-action-btn, .edit-fragment-btn').forEach((b) => b.remove());
    el.classList.remove('has-block-action', 'has-edit-fragment');
    el.removeAttribute('id');
    return el.outerHTML.trim();
  });
  const combined = parts.filter(Boolean).join('');
  return combined || null;
}

/* ------------------------------------------------------------------ */
/*  Path / fragment helpers                                            */
/* ------------------------------------------------------------------ */

function parseRepoPath(repoPath) {
  let path = repoPath;
  if (path.endsWith('.html')) path = path.slice(0, -5);
  if (path.startsWith('/')) path = path.slice(1);
  const parts = path.split('/');
  return {
    org: parts[0] || '',
    repo: parts[1] || '',
    pagePath: `/${parts.slice(2).join('/')}`,
  };
}

function getFragmentPagePath(repoPath) {
  return parseRepoPath(repoPath).pagePath;
}

function getFragmentPreviewUrl(repoPath) {
  const { org, repo, pagePath } = parseRepoPath(repoPath);
  return `https://main--${repo}--${org}.aem.page${pagePath}`;
}

function buildFragmentBlockHtml(fragmentPath) {
  const previewUrl = getFragmentPreviewUrl(fragmentPath);
  return `<div data-class='fragment'><div><div><a href='${previewUrl}'>${previewUrl}</a></div></div></div>`;
}

/* ------------------------------------------------------------------ */
/*  DOM replacement (multi-block)                                      */
/* ------------------------------------------------------------------ */

function findActualBlock(blockEl) {
  if (!blockEl.classList.contains('section')) return blockEl;
  const actionBtn = blockEl.querySelector('.block-action-btn, .edit-fragment-btn');
  if (actionBtn) {
    const inner = actionBtn.closest('[data-block-status]');
    if (inner && blockEl.contains(inner)) return inner;
  }
  return blockEl.querySelector('[data-block-status]') || blockEl;
}

function getCreateFragmentButton(blockEl) {
  if (!blockEl) return null;
  return blockEl.querySelector(':scope > .block-action-btn') || blockEl.querySelector('.block-action-btn');
}

function disableCreateFragmentButton(buttonEl) {
  if (!buttonEl) return;
  buttonEl.disabled = true;
  buttonEl.setAttribute('aria-disabled', 'true');
  buttonEl.setAttribute('aria-pressed', 'false');
  buttonEl.classList.remove('block-action-btn--selected');
  buttonEl.classList.add('block-action-btn--disabled');
}

function captureButtonsForDisable(blockIds) {
  pendingDisableActionButtons = blockIds
    .map((id) => getCreateFragmentButton(document.getElementById(id)))
    .filter(Boolean);
}

function applyPendingButtonDisable() {
  pendingDisableActionButtons.forEach((btn) => disableCreateFragmentButton(btn));
  pendingDisableActionButtons = [];
}

async function replaceBlocksInPreview(fragmentPath, options = {}) {
  const hydrateRemote = options.hydrateRemote === true;
  const orderedIds = getSelectedIdsInDomOrder();
  const firstRow = document.getElementById(orderedIds[0]);
  const sectionIndices = orderedIds.map((id) => {
    const r = document.getElementById(id);
    return r ? parseInt(r.dataset.sectionIndex, 10) : NaN;
  }).filter((n) => !Number.isNaN(n));
  const minSectionIdx = sectionIndices.length ? Math.min(...sectionIndices) : 0;
  const pagePath = getFragmentPagePath(fragmentPath);

  const attachEditDaFragmentMeta = (fragmentEl) => {
    const isEditDa = window.streamConfig?.operation === 'edit'
      && firstRow?.dataset?.source === 'da'
      && firstRow?.closest?.('.da-panel');
    if (isEditDa) {
      fragmentEl.dataset.source = 'da';
      fragmentEl.dataset.sectionIndex = String(minSectionIdx);
      fragmentEl.id = `block-da-frag-${minSectionIdx}-${Date.now()}`;
      appendBlockActionButton(fragmentEl);
      const daPanel = document.querySelector('.da-panel');
      if (daPanel) attachSectionDeleteControls(daPanel);
      return { fragmentEl, minIdx: minSectionIdx, removeCount: orderedIds.length };
    }
    return null;
  };

  const stripBlockChromeAndDetachIds = (idEl, targetEl) => {
    targetEl.querySelectorAll('.block-action-btn, .edit-fragment-btn').forEach((b) => b.remove());
    targetEl.classList.remove('has-block-action', 'has-edit-fragment', 'block-selected');
    targetEl.removeAttribute('id');
    idEl.removeAttribute('id');
  };

  if (hydrateRemote) {
    let firstEl = null;
    orderedIds.forEach((id, idx) => {
      const idEl = document.getElementById(id);
      if (!idEl) return;
      const targetEl = findActualBlock(idEl);
      stripBlockChromeAndDetachIds(idEl, targetEl);
      if (idx === 0) firstEl = targetEl;
      else targetEl.remove();
    });

    const fragmentEl = document.createElement('div');
    fragmentEl.style.display = 'block';
    if (firstEl) firstEl.replaceWith(fragmentEl);

    await fillFragmentWrapperFromRepo(fragmentEl, fragmentPath);
    await miloLoadArea(fragmentEl);
    await miloLoadArea();

    return attachEditDaFragmentMeta(fragmentEl);
  }

  const fragmentEl = document.createElement('div');
  fragmentEl.setAttribute('data-class', 'fragment');
  fragmentEl.setAttribute('data-path', pagePath);
  fragmentEl.setAttribute('data-block-status', 'loaded');
  fragmentEl.style.display = 'block';

  const sectionEl = document.createElement('div');
  sectionEl.className = 'section';

  let firstEl = null;

  orderedIds.forEach((id) => {
    const idEl = document.getElementById(id);
    if (!idEl) return;
    const targetEl = findActualBlock(idEl);
    stripBlockChromeAndDetachIds(idEl, targetEl);

    sectionEl.appendChild(targetEl.cloneNode(true));

    if (!firstEl) firstEl = targetEl;
    else targetEl.remove();
  });

  fragmentEl.appendChild(sectionEl);
  if (firstEl) {
    firstEl.replaceWith(fragmentEl);
  }

  return attachEditDaFragmentMeta(fragmentEl);
}

function updateTargetHtmlWithFragments(blockIds, fragmentPath) {
  const targetHtml = fetchTargetHtmlFromStore();
  if (!targetHtml) return;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${targetHtml}</div>`, 'text/html');

  const orderedIds = getSelectedIdsInDomOrder();
  const firstEl = doc.getElementById(orderedIds[0]);
  if (!firstEl) return;

  const fragmentHtml = buildFragmentBlockHtml(fragmentPath);
  const tempDiv = doc.createElement('div');
  tempDiv.innerHTML = fragmentHtml;
  firstEl.replaceWith(tempDiv.firstElementChild);

  orderedIds.slice(1).forEach((id) => {
    const el = doc.getElementById(id);
    if (el) el.remove();
  });

  pushTargetHtmlToStore(doc.body.querySelector('div').innerHTML);
}

/* ------------------------------------------------------------------ */
/*  Event dispatch                                                     */
/* ------------------------------------------------------------------ */

function dispatchFragmentAction(action, extra = {}) {
  window.dispatchEvent(new CustomEvent(STREAM_BLOCK_FRAGMENT_EVENT, {
    detail: { action, blockIds: [...selectedBlockIds], path: getFragmentPath(), ...extra },
  }));
}

/* ------------------------------------------------------------------ */
/*  Progress animation                                                 */
/* ------------------------------------------------------------------ */

function runProgressAnimation() {
  return window.setInterval(() => {
    const { progressFill } = getModalElements() || {};
    if (!progressFill) return;
    const current = parseFloat(progressFill.style.width) || 10;
    if (current < 85) setProgress(current + 5);
  }, 400);
}

/* ------------------------------------------------------------------ */
/*  Form validation                                                    */
/* ------------------------------------------------------------------ */

function validateFormInputs() {
  const { pathInput, nameInput } = getModalElements() || {};
  const folder = (pathInput?.value || '').trim();
  const name = (nameInput?.value || '').trim();

  if (!folder) { showError('Enter a fragment folder path.', 'path'); return null; }
  if (!name) { showError('Enter a fragment name.', 'name'); return null; }
  if (/[/\\]/.test(name)) { showError('Fragment name must not contain slashes.', 'name'); return null; }
  if (selectedBlockIds.length === 0) { showError('No blocks selected.'); return null; }
  if (!selectionIsConsecutive()) {
    showError('Only consecutive blocks can be selected.');
    return null;
  }
  return `${folder.replace(/\/+$/, '')}/${name}`;
}

function setReplacedMessage(text) {
  const el = document.querySelector('#block-action-modal-replaced .block-action-modal-success-text');
  if (el) el.textContent = text;
}

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

async function handleCreateFragment() {
  clearError();
  const combinedPath = validateFormInputs();
  if (!combinedPath) return;

  const orderedIds = getSelectedIdsInDomOrder();
  const blockHtml = extractBlocksHtml(orderedIds);
  if (!blockHtml) { showError('Could not read block content from the page.'); return; }

  setProgressText('Checking path\u2026');
  showState('progress');
  setProgress(5);
  const progressInterval = runProgressAnimation();

  try {
    const exists = await fragmentExistsOnDa(combinedPath);
    if (exists) {
      window.clearInterval(progressInterval);
      showState('form');
      showError('A fragment already exists at this path. Change the name or use "Use Existing Fragment".', 'name');
      return;
    }

    setProgress(20);
    setProgressText('Creating fragment\u2026');
    await pushBlockFragmentToDa(combinedPath, blockHtml);
    setProgress(70);
    setProgressText('Previewing fragment\u2026');
    createdFragmentPath = extractRepoPath(combinedPath);
    await previewDAPage(createdFragmentPath);
    window.clearInterval(progressInterval);
    setProgress(100);
    dispatchFragmentAction('create', { success: true });
    pendingFragmentHydrateRemote = false;
    pendingReplacedMessage = 'Fragment created successfully.';
    const replacedOk = await handleProceed();
    if (!replacedOk) showState('form');
  } catch (e) {
    window.clearInterval(progressInterval);
    console.error('Fragment creation failed', e);
    showState('form');
    showError(e?.message || 'Could not create the document. Try again.');
  }
}

async function handleUseExisting() {
  clearError();
  const combinedPath = validateFormInputs();
  if (!combinedPath) return;

  setProgressText('Checking fragment\u2026');
  showState('progress');
  setProgress(10);
  const progressInterval = runProgressAnimation();

  try {
    const exists = await fragmentExistsOnDa(combinedPath);
    if (!exists) {
      window.clearInterval(progressInterval);
      showState('form');
      showError('No fragment found at this path. Check the path and name, or create a new fragment.', 'name');
      return;
    }

    setProgress(50);
    setProgressText('Previewing fragment\u2026');
    createdFragmentPath = extractRepoPath(combinedPath);
    await previewDAPage(createdFragmentPath);
    window.clearInterval(progressInterval);
    setProgress(100);
    dispatchFragmentAction('use-existing', { success: true });
    pendingFragmentHydrateRemote = true;
    pendingReplacedMessage = 'Fragment replaced.';
    const replacedOk = await handleProceed();
    if (!replacedOk) showState('form');
  } catch (e) {
    window.clearInterval(progressInterval);
    console.error('Use existing fragment failed', e);
    showState('form');
    showError(e?.message || 'Could not verify the fragment. Try again.');
  }
}

async function handleProceed() {
  if (selectedBlockIds.length === 0 || !createdFragmentPath) {
    showSelectionToast('Select blocks again before proceeding.');
    return false;
  }
  if (!selectionIsConsecutive()) {
    showSelectionToast('Only consecutive blocks can be selected.');
    return false;
  }
  if (window.streamConfig?.operation === 'edit') {
    const first = document.getElementById(getSelectedIdsInDomOrder()[0]);
    if (!first?.closest?.('.da-panel')) {
      showSelectionToast('In editor preview, select blocks in the right (DA) column only.');
      return false;
    }
  }

  const hydrateRemote = pendingFragmentHydrateRemote;
  pendingFragmentHydrateRemote = false;

  captureButtonsForDisable(selectedBlockIds);
  let editMeta;
  try {
    editMeta = await replaceBlocksInPreview(createdFragmentPath, { hydrateRemote });
  } catch (err) {
    console.error('Fragment replace failed', err);
    showSelectionToast(err?.message || 'Could not replace blocks with fragment.');
    return false;
  }

  if (window.streamConfig?.operation === 'edit' && editMeta) {
    const { fragmentEl, minIdx, removeCount } = editMeta;
    syncEditStateAfterFragmentReplace({
      minIdx,
      removeCount,
      fragmentEl,
      // Persist the lightweight "<a href=…>" pointer in originalDABlocks so Push to DA
      // and applyEditChanges serialize the fragment link form, not the inlined Milo DOM.
      pointerHtml: buildFragmentBlockHtml(createdFragmentPath),
    });
    rebuildTargetStoreFromEditor();
  } else if (hydrateRemote && window.streamConfig?.operation === 'edit') {
    rebuildTargetStoreFromEditor();
  } else {
    updateTargetHtmlWithFragments(selectedBlockIds, createdFragmentPath);
  }
  dispatchFragmentAction('replace', { fragmentPath: createdFragmentPath });
  applyPendingButtonDisable();
  const msg = pendingReplacedMessage || 'Fragment replaced.';
  pendingReplacedMessage = '';
  setReplacedMessage(msg);
  showState('replaced');
  return true;
}

/* ------------------------------------------------------------------ */
/*  Modal open / close                                                 */
/* ------------------------------------------------------------------ */

function resetFormInputs() {
  const { pathInput, nameInput } = getModalElements() || {};
  if (pathInput) pathInput.value = '';
  if (nameInput) nameInput.value = '';
}

function openBlockActionModal() {
  const els = getModalElements();
  if (!els || selectedBlockIds.length === 0) return;
  if (!selectionIsConsecutive()) {
    showSelectionToast('Only consecutive blocks can be selected.');
    clearBlockSelection();
    return;
  }
  const { container, pathInput } = els;
  createdFragmentPath = '';
  pendingFragmentHydrateRemote = false;
  pendingReplacedMessage = '';
  lastFocusedElement = document.activeElement;
  clearError();
  resetFormInputs();
  setProgress(0);
  showState('form');
  container.hidden = false;
  container.classList.add('is-open');
  pathInput?.focus();
}

function closeBlockActionModal() {
  const els = getModalElements();
  if (!els) return;
  const { container } = els;
  if (!container.classList.contains('is-open')) return;
  container.classList.remove('is-open');
  container.hidden = true;
  clearError();
  resetFormInputs();
  setProgress(0);
  showState('form');
  createdFragmentPath = '';
  pendingFragmentHydrateRemote = false;
  pendingReplacedMessage = '';
  pendingDisableActionButtons = [];
  clearBlockSelection();
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

function isModalOpen() {
  const els = getModalElements();
  return els?.container.classList.contains('is-open') ?? false;
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

export function setupBlockActionModal() {
  if (window.streamConfig?.operation === 'annotation') return;
  mountBlockActionUi();
  const els = getModalElements();
  if (!els || els.container.dataset.bound === 'true') return;
  els.container.dataset.bound = 'true';

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.block-action-btn');
    if (!btn) return;
    const block = btn.closest('[id^="block-"]');
    if (block?.id) toggleBlockSelection(block.id);
    e.preventDefault();
    e.stopPropagation();
  });

  const selCreateBtn = document.getElementById('block-selection-create');
  const selClearBtn = document.getElementById('block-selection-clear');
  selCreateBtn?.addEventListener('click', () => openBlockActionModal());
  selClearBtn?.addEventListener('click', () => clearBlockSelection());

  els.backdrop?.addEventListener('click', () => closeBlockActionModal());
  els.closeBtn?.addEventListener('click', () => closeBlockActionModal());

  els.createBtn?.addEventListener('click', () => handleCreateFragment());

  els.useExistingBtn?.addEventListener('click', () => handleUseExisting());

  els.replacedCloseBtn?.addEventListener('click', () => closeBlockActionModal());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isModalOpen()) closeBlockActionModal();
      else if (selectedBlockIds.length > 0) clearBlockSelection();
    }
  });
}
