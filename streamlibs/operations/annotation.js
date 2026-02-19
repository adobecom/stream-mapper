import { fetchFigmaContent } from '../sources/figma.js';
import { fetchDAContent } from '../sources/da.js';
import { transformImages } from '../utils/utils.js';
import { getLibs } from '../utils/utils.js';

const ANNOTATION_STORE_KEY = 'stream-annotation-comments';
const DEFAULT_USERNAME = 'stream';
const COMMENT_STATUSES = ['Open', 'Complete', 'Resolved', 'Closed'];
const MEDIUM_EDITOR_CSS_URL = 'https://cdn.jsdelivr.net/npm/medium-editor@5.23.3/dist/css/medium-editor.min.css';
const MEDIUM_EDITOR_JS_URL = 'https://cdn.jsdelivr.net/npm/medium-editor@5.23.3/dist/js/medium-editor.min.js';

let annotationStore = { threads: [], easyEdits: [] };
let selectedElement = null;
let selectedElementPath = '';
let selectedElementRef = '';
let activeThreadId = '';
let activeMessageId = '';
let activeEditId = '';
let mediumEditorLoadPromise = null;

const annotationUI = {
  mainEl: null,
  layerEl: null,
  popupEl: null,
  panelEl: null,
  panelListEl: null,
  inlineToggleEl: null,
  inlineCommentsToggleEl: null,
  inlineMode: false,
  mediumEditorInstance: null,
  editableElements: [],
  editableImages: [],
  inlineElementSnapshot: new Map(),
  inlineImageAltSnapshot: new Map(),
  inlineBlurHandlers: new Map(),
  inlineSelectedImageEl: null,
  inlineImageSelectHandler: null,
  inlineAltPopupEl: null,
  inlineAltOutsideClickHandler: null,
};

async function getDADom() {
  const { source } = window.streamConfig;
  if (source === 'figma') {
    const { htmlDom: html } = await fetchFigmaContent();
    return html;
  } if (source === 'da') {
    const { htmlDom: html } = await fetchDAContent();
    return html;
  }
  return '';
}

export async function miloLoadArea() {
  await transformImages();
  window['page-load-ok-milo']?.remove();
  const { loadArea } = await import(`${getLibs()}/utils/utils.js`);
  await loadArea();
}

async function initializePreview() {
  const htmlDom = await getDADom();
  const headerEle = document.createElement('header');
  const mainEle = document.createElement('main');
  mainEle.innerHTML = htmlDom;
  document.body.prepend(mainEle);
  document.body.prepend(headerEle);
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getReviewId() {
  const streamConfigReviewId = window.streamConfig?.reviewId;
  if (streamConfigReviewId !== null && streamConfigReviewId !== undefined && `${streamConfigReviewId}`.trim()) {
    return `${streamConfigReviewId}`.trim();
  }

  const params = new URLSearchParams(window.location.search);
  const urlReviewId = params.get('reviewId') || params.get('reviewid');
  if (urlReviewId && urlReviewId.trim()) return urlReviewId.trim();

  return 'default-review';
}

function parseAnnotationPayload(parsed) {
  const easyEditsPayload = parsed?.easyEdits || parsed?.['easy-edits'];
  const easyEdits = Array.isArray(easyEditsPayload)
    ? easyEditsPayload
      .filter((edit) => edit && typeof edit === 'object')
      .map((edit) => ({
        id: edit.id || generateId('easy-edit'),
        editType: edit.editType || 'text',
        attrName: edit.attrName || '',
        elementPath: edit.elementPath || '',
        elementRef: edit.elementRef || '',
        from: `${edit.from || ''}`,
        to: `${edit.to || ''}`,
        fromHtml: `${edit.fromHtml || ''}`,
        toHtml: `${edit.toHtml || ''}`,
        changedFrom: `${edit.changedFrom || ''}`,
        changedTo: `${edit.changedTo || ''}`,
        updatedAt: edit.updatedAt || new Date().toISOString(),
      }))
    : [];

  if (Array.isArray(parsed?.threads)) {
    return { threads: parsed.threads, easyEdits };
  }

  if (Array.isArray(parsed?.comments)) {
    return {
      threads: parsed.comments.map((comment) => {
        const rootMessage = {
          id: generateId('message'),
          username: comment.username || DEFAULT_USERNAME,
          text: comment.comment || '',
          kind: 'comment',
        };
        const replyMessages = Array.isArray(comment.replies)
          ? comment.replies.map((reply) => ({
            id: generateId('message'),
            username: reply.username || DEFAULT_USERNAME,
            text: reply.text || '',
            kind: 'reply',
          }))
          : [];

        return {
          id: comment.id || generateId('thread'),
          threadType: 'comment',
          elementPath: comment.elementPath || '',
          elementRef: comment.elementRef || '',
          status: comment.status || COMMENT_STATUSES[0],
          username: comment.username || DEFAULT_USERNAME,
          messages: [rootMessage, ...replyMessages],
        };
      }),
      easyEdits,
    };
  }

  return { threads: [], easyEdits: [] };
}

function loadAnnotationStore() {
  try {
    const reviewId = getReviewId();
    const raw = window.localStorage.getItem(ANNOTATION_STORE_KEY)
      || window.sessionStorage.getItem(ANNOTATION_STORE_KEY);
    if (!raw) {
      annotationStore = { threads: [], easyEdits: [] };
      return;
    }
    const parsed = JSON.parse(raw) || {};

    // New shape: stream-annotation-comments => { [reviewId]: payload }
    if (reviewId && typeof parsed === 'object' && !Array.isArray(parsed) && parsed[reviewId]) {
      annotationStore = parseAnnotationPayload(parsed[reviewId]);
      return;
    }

    // Legacy fallback: key held payload directly.
    annotationStore = parseAnnotationPayload(parsed);
  } catch (error) {
    annotationStore = { threads: [], easyEdits: [] };
  }
}

function toLegacyCommentShape() {
  return annotationStore.threads.map((thread) => {
    const [first, ...rest] = thread.messages || [];
    return {
      id: thread.id,
      elementPath: thread.elementPath,
      elementRef: thread.elementRef,
      comment: first?.text || '',
      status: thread.status,
      username: thread.username || DEFAULT_USERNAME,
      replies: rest.map((message) => ({
        username: message.username,
        text: message.text,
      })),
    };
  });
}

function saveAnnotationStore() {
  const payload = {
    threads: annotationStore.threads,
    easyEdits: annotationStore.easyEdits,
    'easy-edits': annotationStore.easyEdits,
    comments: toLegacyCommentShape(),
  };
  const reviewId = getReviewId();
  let existingMap = {};
  try {
    existingMap = JSON.parse(window.localStorage.getItem(ANNOTATION_STORE_KEY) || '{}') || {};
    if (Array.isArray(existingMap) || typeof existingMap !== 'object') existingMap = {};
  } catch (error) {
    existingMap = {};
  }
  existingMap[reviewId] = payload;

  const serialized = JSON.stringify(existingMap);
  window.localStorage.setItem(ANNOTATION_STORE_KEY, serialized);
  window.sessionStorage.setItem(ANNOTATION_STORE_KEY, serialized);
  window.streamAnnotationComments = existingMap;
}

function getThreadType(thread) {
  return thread?.threadType || 'comment';
}

function buildElementPath(element, root) {
  const segments = [];
  let current = element;

  while (current && current !== root) {
    if (!current.parentElement) break;
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(current.parentElement.children)
      .filter((el) => el.tagName === current.tagName);
    const index = siblings.indexOf(current);
    segments.unshift(`${tag}:nth-of-type(${index + 1})`);
    current = current.parentElement;
  }

  return `main > ${segments.join(' > ')}`;
}

function ensureElementRef(element) {
  if (!element.dataset.annotationRef) {
    element.dataset.annotationRef = generateId('el');
  }
  return element.dataset.annotationRef;
}

function getElementByRef(elementRef) {
  if (!annotationUI.mainEl || !elementRef) return null;
  return annotationUI.mainEl.querySelector(`[data-annotation-ref="${elementRef}"]`);
}

function rebindThreadsToCurrentDom() {
  if (!annotationUI.mainEl) return;

  annotationStore.threads.forEach((thread) => {
    // If ref already resolves in current DOM, keep it.
    const existingByRef = getElementByRef(thread.elementRef);
    if (existingByRef) return;

    // Runtime refs are ephemeral; recover via stable selector path.
    if (!thread.elementPath) return;
    const target = annotationUI.mainEl.querySelector(thread.elementPath);
    if (!(target instanceof HTMLElement)) return;
    thread.elementRef = ensureElementRef(target);
  });
}

function getThreadByElementRef(elementRef, threadType = null) {
  return annotationStore.threads.find((thread) => thread.elementRef === elementRef
    && (!threadType || getThreadType(thread) === threadType));
}

function getThreadById(threadId) {
  return annotationStore.threads.find((thread) => thread.id === threadId);
}

function clearSelectedElement() {
  if (selectedElement) selectedElement.classList.remove('annotation-selected-element');
  selectedElement = null;
  selectedElementPath = '';
  selectedElementRef = '';
}

function getEasyEditByElement(elementRef, elementPath) {
  return annotationStore.easyEdits.find((edit) => (
    (elementRef && edit.elementRef === elementRef)
    || (elementPath && edit.elementPath === elementPath)
  ));
}

function upsertEasyEdit(editRecord) {
  const index = annotationStore.easyEdits.findIndex((edit) => (
    edit.elementRef === editRecord.elementRef
      || (edit.elementPath && edit.elementPath === editRecord.elementPath)
  ));
  if (index > -1) {
    annotationStore.easyEdits[index] = {
      ...annotationStore.easyEdits[index],
      ...editRecord,
    };
    return;
  }
  annotationStore.easyEdits.push(editRecord);
}

function getChangedSegments(fromText, toText) {
  const fromValue = `${fromText || ''}`;
  const toValue = `${toText || ''}`;
  let prefix = 0;
  while (
    prefix < fromValue.length
    && prefix < toValue.length
    && fromValue[prefix] === toValue[prefix]
  ) {
    prefix += 1;
  }

  let fromSuffixIndex = fromValue.length - 1;
  let toSuffixIndex = toValue.length - 1;
  while (
    fromSuffixIndex >= prefix
    && toSuffixIndex >= prefix
    && fromValue[fromSuffixIndex] === toValue[toSuffixIndex]
  ) {
    fromSuffixIndex -= 1;
    toSuffixIndex -= 1;
  }

  return {
    changedFrom: fromValue.slice(prefix, fromSuffixIndex + 1),
    changedTo: toValue.slice(prefix, toSuffixIndex + 1),
  };
}

function removeEasyEditHighlights(root = annotationUI.mainEl) {
  if (!(root instanceof HTMLElement)) return;
  root.querySelectorAll('.annotation-easy-edit-changed').forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    element.classList.remove('annotation-easy-edit-changed');
  });
}

function truncateInlineEditText(text, max = 80) {
  const value = `${text || ''}`.replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value || '""';
  return `${value.slice(0, max)}...`;
}

function getEditPanelMessage(edit) {
  if (edit.editType === 'image-alt') {
    return `${DEFAULT_USERNAME} changed alt "${truncateInlineEditText(edit.from, 40)}" -> "${truncateInlineEditText(edit.to, 40)}"`;
  }
  return `${DEFAULT_USERNAME} changed "${truncateInlineEditText(edit.from)}" -> "${truncateInlineEditText(edit.to)}"`;
}

function recordEditMessage(elementRef, elementPath, text) {
  let thread = getThreadByElementRef(elementRef, 'edit');
  if (!thread) {
    thread = {
      id: generateId('thread'),
      threadType: 'edit',
      elementRef,
      elementPath,
      status: COMMENT_STATUSES[0],
      username: DEFAULT_USERNAME,
      messages: [],
    };
    annotationStore.threads.push(thread);
  }

  const existingMessages = thread.messages || [];
  const kind = existingMessages.length ? 'reply' : 'comment';
  pushThreadMessage(thread, text, kind);
  activeThreadId = thread.id;
  activeMessageId = '';
  activeEditId = '';
}

function getElementForEdit(edit) {
  if (!annotationUI.mainEl) return null;
  if (edit.elementRef) {
    const byRef = getElementByRef(edit.elementRef);
    if (byRef) return byRef;
  }
  if (!edit.elementPath) return null;
  const byPath = annotationUI.mainEl.querySelector(edit.elementPath);
  return byPath instanceof HTMLElement ? byPath : null;
}

function rebindEasyEditsToCurrentDom() {
  if (!annotationUI.mainEl) return;
  annotationStore.easyEdits.forEach((edit) => {
    const target = getElementForEdit(edit);
    if (!(target instanceof HTMLElement)) return;
    edit.elementRef = ensureElementRef(target);
    if (!edit.elementPath) {
      edit.elementPath = buildElementPath(target, annotationUI.mainEl);
    }
  });
}

function applyEasyEditsToDom() {
  if (!annotationUI.mainEl) return;
  removeEasyEditHighlights(annotationUI.mainEl);

  annotationStore.easyEdits.forEach((edit) => {
    const target = getElementForEdit(edit);
    if (!(target instanceof HTMLElement)) return;

    if (edit.editType === 'image-alt') {
      target.setAttribute('alt', edit.to || '');
    } else {
      if (edit.toHtml) {
        if (target.innerHTML !== edit.toHtml) {
          target.innerHTML = edit.toHtml;
        }
      } else {
        const currentText = target.textContent || '';
        if (edit.from && currentText.includes(edit.from)) {
          target.textContent = currentText.replace(edit.from, edit.to);
        } else if (edit.to) {
          target.textContent = edit.to;
        }
      }
    }

    const diff = getChangedSegments(edit.from, edit.to);
    const hasChange = Boolean((edit.changedTo || diff.changedTo || '').trim()) || edit.to !== edit.from;
    if (!hasChange) return;
  });
}

async function loadMediumEditor() {
  if (window.MediumEditor) return;
  if (mediumEditorLoadPromise) {
    await mediumEditorLoadPromise;
    return;
  }

  if (!document.querySelector('link[data-medium-editor="css"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = MEDIUM_EDITOR_CSS_URL;
    css.dataset.mediumEditor = 'css';
    document.head.appendChild(css);
  }

  mediumEditorLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-medium-editor="js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load MediumEditor')), { once: true });
      if (window.MediumEditor) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = MEDIUM_EDITOR_JS_URL;
    script.dataset.mediumEditor = 'js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load MediumEditor'));
    document.head.appendChild(script);
  });

  await mediumEditorLoadPromise;
}

function setCommentsPanelDisabled(disabled) {
  if (!annotationUI.panelEl) return;
  annotationUI.panelEl.classList.toggle('annotation-comments-panel-disabled', Boolean(disabled));
  annotationUI.panelEl.querySelectorAll('input, textarea, select, button').forEach((control) => {
    if (!(control instanceof HTMLElement)) return;
    if (control.classList.contains('annotation-inline-mode-radio')) return;
    if (disabled) {
      control.setAttribute('disabled', 'disabled');
    } else {
      control.removeAttribute('disabled');
    }
  });
}

function getInlineEditableElements() {
  if (!annotationUI.mainEl) return [];
  const selectors = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'li', 'blockquote', 'figcaption',
    '[class*="heading"]', '[class*="title"]', '[class*="description"]',
  ];
  return Array.from(annotationUI.mainEl.querySelectorAll(selectors.join(', ')))
    .filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (!el.textContent || !el.textContent.trim()) return false;
      if (el.closest('.annotation-comments-panel') || el.closest('.annotation-floating-popup')) return false;
      return true;
    });
}

function getInlineEditableImages() {
  if (!annotationUI.mainEl) return [];
  return Array.from(annotationUI.mainEl.querySelectorAll('img'))
    .filter((el) => {
      if (!(el instanceof HTMLImageElement)) return false;
      if (el.closest('.annotation-comments-panel') || el.closest('.annotation-floating-popup')) return false;
      return true;
    });
}

function trackInlineEditChange(element) {
  if (!(element instanceof HTMLElement)) return;
  if (!annotationUI.mainEl) return;
  const elementRef = ensureElementRef(element);
  const snapshot = annotationUI.inlineElementSnapshot.get(elementRef);
  if (!snapshot) return;

  const currentHtml = element.innerHTML;
  const currentText = element.textContent || '';
  if (currentHtml === snapshot.originalHtml && currentText.trim() === snapshot.originalText.trim()) return;

  const elementPath = buildElementPath(element, annotationUI.mainEl);
  const segments = getChangedSegments(snapshot.originalText, currentText);

  const existing = getEasyEditByElement(elementRef, elementPath);
  const editRecord = {
    id: existing?.id || generateId('easy-edit'),
    editType: 'text',
    attrName: '',
    elementPath,
    elementRef,
    from: snapshot.originalText,
    to: currentText,
    fromHtml: snapshot.originalHtml,
    toHtml: currentHtml,
    changedFrom: segments.changedFrom,
    changedTo: segments.changedTo,
    updatedAt: new Date().toISOString(),
  };
  upsertEasyEdit(editRecord);
  recordEditMessage(elementRef, elementPath, getEditPanelMessage(editRecord));
  saveAnnotationStore();
  renderThreadMarkers();
  renderCommentsPanel();

  annotationUI.inlineElementSnapshot.set(elementRef, {
    originalHtml: currentHtml,
    originalText: currentText,
  });
}

function getSelectedImageForMediumEditor() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const candidateNodes = [selection.anchorNode, selection.focusNode, range.commonAncestorContainer];

  for (let idx = 0; idx < candidateNodes.length; idx += 1) {
    const node = candidateNodes[idx];
    if (!node) continue;
    if (node instanceof HTMLImageElement) return node;
    if (!(node instanceof Element) && !(node instanceof HTMLElement) && !(node.parentElement instanceof HTMLElement)) continue;
    const element = node instanceof HTMLElement ? node : node.parentElement;
    if (!element) continue;
    const img = element.closest('img');
    if (img instanceof HTMLImageElement) return img;
  }
  return null;
}

function closeInlineAltPopup() {
  if (annotationUI.inlineAltOutsideClickHandler) {
    document.removeEventListener('click', annotationUI.inlineAltOutsideClickHandler, true);
    annotationUI.inlineAltOutsideClickHandler = null;
  }
  if (annotationUI.inlineAltPopupEl) {
    annotationUI.inlineAltPopupEl.remove();
    annotationUI.inlineAltPopupEl = null;
  }
}

function persistSingleImageAltChange(imageElement) {
  if (!(imageElement instanceof HTMLImageElement)) return;
  if (!annotationUI.mainEl) return;

  const elementRef = ensureElementRef(imageElement);
  const elementPath = buildElementPath(imageElement, annotationUI.mainEl);
  const snapshotAlt = annotationUI.inlineImageAltSnapshot.get(elementRef);
  const originalAlt = snapshotAlt !== undefined ? `${snapshotAlt}` : (imageElement.getAttribute('alt') || '');
  const currentAlt = `${imageElement.getAttribute('alt') || ''}`;
  if (originalAlt === currentAlt) return;

  const existing = getEasyEditByElement(elementRef, elementPath);
  const editRecord = {
    id: existing?.id || generateId('easy-edit'),
    editType: 'image-alt',
    attrName: 'alt',
    elementPath,
    elementRef,
    from: originalAlt,
    to: currentAlt,
    fromHtml: '',
    toHtml: '',
    changedFrom: originalAlt,
    changedTo: currentAlt,
    updatedAt: new Date().toISOString(),
  };
  upsertEasyEdit(editRecord);
  annotationUI.inlineImageAltSnapshot.set(elementRef, currentAlt);
  saveAnnotationStore();
  renderCommentsPanel();
}

function openInlineAltPopup(imageElement) {
  if (!(imageElement instanceof HTMLImageElement)) return;
  closeInlineAltPopup();

  const popup = document.createElement('div');
  popup.className = 'annotation-inline-alt-popup';
  const currentAlt = imageElement.getAttribute('alt') || '';
  popup.innerHTML = `
    <div class="annotation-inline-alt-popup__header">
      <h4>Edit image alt text</h4>
      <button type="button" class="annotation-inline-alt-popup__close" data-action="close" aria-label="Close">x</button>
    </div>
    <textarea class="annotation-inline-alt-popup__input" data-input="alt" placeholder="Describe the image for accessibility...">${currentAlt}</textarea>
    <div class="annotation-inline-alt-popup__actions">
      <button type="button" class="annotation-inline-alt-popup__btn" data-action="cancel">Cancel</button>
      <button type="button" class="annotation-inline-alt-popup__btn annotation-inline-alt-popup__btn--primary" data-action="save">Save</button>
    </div>
  `;
  document.body.appendChild(popup);
  annotationUI.inlineAltPopupEl = popup;

  const rect = imageElement.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  let top = rect.bottom + 10;
  let left = rect.left;
  if (top + popupRect.height > window.innerHeight - 20) {
    top = Math.max(10, rect.top - popupRect.height - 10);
  }
  if (left + popupRect.width > window.innerWidth - 20) {
    left = window.innerWidth - popupRect.width - 20;
  }
  popup.style.top = `${top}px`;
  popup.style.left = `${Math.max(10, left)}px`;

  const input = popup.querySelector('[data-input="alt"]');
  if (input instanceof HTMLTextAreaElement) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeInlineAltPopup();
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        imageElement.setAttribute('alt', input.value.trim());
        persistSingleImageAltChange(imageElement);
        closeInlineAltPopup();
      }
    });
  }

  popup.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.getAttribute('data-action');
    if (!action) return;
    if (action === 'close' || action === 'cancel') {
      closeInlineAltPopup();
      return;
    }
    if (action === 'save') {
      const textArea = popup.querySelector('[data-input="alt"]');
      if (textArea instanceof HTMLTextAreaElement) {
        imageElement.setAttribute('alt', textArea.value.trim());
        persistSingleImageAltChange(imageElement);
      }
      closeInlineAltPopup();
    }
  });

  annotationUI.inlineAltOutsideClickHandler = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (popup.contains(target)) return;
    closeInlineAltPopup();
  };
  window.setTimeout(() => {
    if (annotationUI.inlineAltOutsideClickHandler) {
      document.addEventListener('click', annotationUI.inlineAltOutsideClickHandler, true);
    }
  }, 0);
}

function attachInlineImageSelectionHandler() {
  if (!annotationUI.mainEl || annotationUI.inlineImageSelectHandler) return;
  annotationUI.inlineImageSelectHandler = (event) => {
    if (!annotationUI.inlineMode) return;
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    annotationUI.inlineSelectedImageEl = target;
    openInlineAltPopup(target);
  };
  annotationUI.mainEl.addEventListener('click', annotationUI.inlineImageSelectHandler, true);
}

function detachInlineImageSelectionHandler() {
  if (!annotationUI.mainEl || !annotationUI.inlineImageSelectHandler) return;
  annotationUI.mainEl.removeEventListener('click', annotationUI.inlineImageSelectHandler, true);
  annotationUI.inlineImageSelectHandler = null;
  annotationUI.inlineSelectedImageEl = null;
}

function createMediumEditorImageAltExtension() {
  if (!window.MediumEditor?.extensions?.button) return null;
  const ButtonExtension = window.MediumEditor.extensions.button.extend({
    name: 'imageAlt',
    action: 'imageAlt',
    aria: 'Edit image alt text',
    contentDefault: 'ALT',
    contentFA: '<i>ALT</i>',
    init() {
      this.button = this.createButton();
      this.on(this.button, 'click', this.handleClick.bind(this));
    },
    getButton() {
      return this.button;
    },
    handleClick(event) {
      event.preventDefault();
      event.stopPropagation();
      const imageElement = getSelectedImageForMediumEditor() || annotationUI.inlineSelectedImageEl;
      if (!(imageElement instanceof HTMLImageElement)) return;
      openInlineAltPopup(imageElement);
    },
  });
  return new ButtonExtension();
}

function createMediumEditorInstance(elements) {
  if (!window.MediumEditor || !elements.length) return null;
  const imageAltExtension = createMediumEditorImageAltExtension();
  const toolbarButtons = ['bold', 'italic', 'underline', 'anchor', 'h2', 'h3', 'quote'];
  if (imageAltExtension) toolbarButtons.push('imageAlt');
  return new window.MediumEditor(elements, {
    toolbar: {
      buttons: toolbarButtons,
    },
    extensions: imageAltExtension ? { imageAlt: imageAltExtension } : {},
    placeholder: {
      text: 'Click to edit...',
      hideOnClick: true,
    },
    targetBlank: true,
    autoLink: true,
    paste: {
      cleanPastedHTML: true,
      cleanAttrs: ['style', 'dir'],
      cleanTags: ['label', 'meta', 'script', 'style'],
    },
  });
}

function syncImageAltChanges() {
  if (!annotationUI.mainEl) return;
  annotationUI.editableImages.forEach((imageElement) => {
    if (!(imageElement instanceof HTMLImageElement)) return;
    const elementRef = ensureElementRef(imageElement);
    const elementPath = buildElementPath(imageElement, annotationUI.mainEl);
    const snapshotAlt = annotationUI.inlineImageAltSnapshot.get(elementRef);
    const originalAlt = snapshotAlt !== undefined ? `${snapshotAlt}` : (imageElement.getAttribute('alt') || '');
    const currentAlt = `${imageElement.getAttribute('alt') || ''}`;
    if (originalAlt === currentAlt) return;

    const existing = getEasyEditByElement(elementRef, elementPath);
    const editRecord = {
      id: existing?.id || generateId('easy-edit'),
      editType: 'image-alt',
      attrName: 'alt',
      elementPath,
      elementRef,
      from: originalAlt,
      to: currentAlt,
      fromHtml: '',
      toHtml: '',
      changedFrom: originalAlt,
      changedTo: currentAlt,
      updatedAt: new Date().toISOString(),
    };
    upsertEasyEdit(editRecord);
    recordEditMessage(elementRef, elementPath, getEditPanelMessage(editRecord));
    annotationUI.inlineImageAltSnapshot.set(elementRef, currentAlt);
  });
}

async function enableInlineEditMode() {
  if (!annotationUI.mainEl || annotationUI.inlineMode) return;
  await loadMediumEditor();
  annotationUI.inlineMode = true;
  document.body.classList.add('annotation-inline-edit-mode');
  removePopup();
  clearSelectedElement();
  removeEasyEditHighlights(annotationUI.mainEl);

  annotationUI.editableElements = getInlineEditableElements();
  annotationUI.editableImages = getInlineEditableImages();
  annotationUI.mediumEditorInstance = createMediumEditorInstance(annotationUI.editableElements);
  attachInlineImageSelectionHandler();

  annotationUI.editableElements.forEach((element) => {
    const elementRef = ensureElementRef(element);
    annotationUI.inlineElementSnapshot.set(elementRef, {
      originalHtml: element.innerHTML,
      originalText: element.textContent || '',
    });
    element.classList.add('annotation-inline-editable');
    const blurHandler = () => trackInlineEditChange(element);
    annotationUI.inlineBlurHandlers.set(elementRef, blurHandler);
    element.addEventListener('blur', blurHandler, true);
  });

  annotationUI.editableImages.forEach((imageElement) => {
    const elementRef = ensureElementRef(imageElement);
    annotationUI.inlineImageAltSnapshot.set(elementRef, imageElement.getAttribute('alt') || '');
    imageElement.classList.add('annotation-inline-editable-image');
  });

  renderThreadMarkers();
  renderCommentsPanel();
}

function disableInlineEditMode() {
  if (!annotationUI.inlineMode) return;
  annotationUI.inlineMode = false;
  document.body.classList.remove('annotation-inline-edit-mode');

  annotationUI.editableElements.forEach((element) => {
    trackInlineEditChange(element);
  });
  syncImageAltChanges();

  if (annotationUI.mediumEditorInstance) {
    annotationUI.mediumEditorInstance.destroy();
    annotationUI.mediumEditorInstance = null;
  }

  annotationUI.editableElements.forEach((element) => {
    const elementRef = element.dataset.annotationRef;
    const handler = elementRef ? annotationUI.inlineBlurHandlers.get(elementRef) : null;
    if (handler) {
      element.removeEventListener('blur', handler, true);
      annotationUI.inlineBlurHandlers.delete(elementRef);
    }
    element.classList.remove('annotation-inline-editable');
  });
  annotationUI.editableElements = [];
  annotationUI.editableImages.forEach((imageElement) => {
    imageElement.classList.remove('annotation-inline-editable-image');
  });
  annotationUI.editableImages = [];
  annotationUI.inlineElementSnapshot.clear();
  annotationUI.inlineImageAltSnapshot.clear();
  detachInlineImageSelectionHandler();
  closeInlineAltPopup();

  applyEasyEditsToDom();
  saveAnnotationStore();
  renderThreadMarkers();
  renderCommentsPanel();
}

function setSelectedElement(element) {
  clearSelectedElement();
  selectedElement = element;
  selectedElement.classList.add('annotation-selected-element');
  selectedElementRef = ensureElementRef(selectedElement);
  selectedElementPath = buildElementPath(selectedElement, annotationUI.mainEl);
}

function ensureFloatingLayer() {
  const existing = document.querySelector('.annotation-floating-layer');
  if (existing) existing.remove();

  const layer = document.createElement('div');
  layer.className = 'annotation-floating-layer';
  document.body.appendChild(layer);
  annotationUI.layerEl = layer;
}

function ensureCommentsPanel() {
  const existing = document.querySelector('.annotation-comments-panel');
  if (existing) existing.remove();

  const panel = document.createElement('aside');
  panel.className = 'annotation-comments-panel';
  panel.innerHTML = `
    <div class="annotation-comments-panel-header">
      <h3>Comments</h3>
      <div class="annotation-inline-edit-switcher">
        <div class="annotation-inline-radio-group" role="radiogroup" aria-label="Annotation mode">
          <input type="radio" id="annotation-inline-mode-comments" name="annotation-inline-mode" class="annotation-inline-mode-radio" value="comments" checked />
          <label for="annotation-inline-mode-comments">Comments</label>
          <input type="radio" id="annotation-inline-mode-edit" name="annotation-inline-mode" class="annotation-inline-mode-radio" value="edit" />
          <label for="annotation-inline-mode-edit">Edit</label>
        </div>
      </div>
    </div>
    <div class="annotation-comments-content">
      <div class="annotation-comments-list"></div>
      <div class="annotation-comments-disabled-overlay">Edit mode is on. Switch it off to add comments.</div>
    </div>
  `;
  document.body.appendChild(panel);
  annotationUI.panelEl = panel;
  annotationUI.panelListEl = panel.querySelector('.annotation-comments-list');
  annotationUI.inlineToggleEl = panel.querySelector('#annotation-inline-mode-edit');
  annotationUI.inlineCommentsToggleEl = panel.querySelector('#annotation-inline-mode-comments');
}

function buildCommentGroups(thread) {
  const groups = [];
  const byCommentId = new Map();
  let currentGroup = null;

  (thread.messages || []).forEach((message) => {
    const isComment = message.kind === 'comment' || !currentGroup;
    if (isComment) {
      const group = {
        comment: message,
        replies: [],
      };
      groups.push(group);
      byCommentId.set(message.id, group);
      currentGroup = group;
      return;
    }

    const parentGroup = message.replyToCommentId
      ? byCommentId.get(message.replyToCommentId)
      : currentGroup;
    if (parentGroup) parentGroup.replies.push(message);
  });

  return groups;
}

function renderCommentsPanel() {
  if (!annotationUI.panelListEl) return;
  annotationUI.panelListEl.innerHTML = '';
  const panelTitle = annotationUI.panelEl?.querySelector('.annotation-comments-panel-header h3');
  if (panelTitle instanceof HTMLElement) {
    panelTitle.textContent = annotationUI.inlineMode ? 'Edits' : 'Comments';
  }

  const visibleThreadType = annotationUI.inlineMode ? 'edit' : 'comment';
  const visibleThreads = annotationStore.threads.filter((thread) => getThreadType(thread) === visibleThreadType);
  const hasVisibleThreads = visibleThreads.length > 0;
  const showComments = !annotationUI.inlineMode;
  const showEdits = annotationUI.inlineMode;

  if (!hasVisibleThreads) {
    const empty = document.createElement('p');
    empty.className = 'annotation-comments-empty';
    empty.textContent = showComments
      ? 'No comments yet. Click an element to add one.'
      : 'No edits yet. Start editing text or image alt.';
    annotationUI.panelListEl.appendChild(empty);
    return;
  }

  visibleThreads.forEach((thread) => {
    const groups = buildCommentGroups(thread);
    groups.forEach((group, idx) => {
      const isLatestInThread = idx === groups.length - 1;
      const card = document.createElement('article');
      card.className = 'annotation-panel-comment';
      card.dataset.threadId = thread.id;
      card.dataset.messageId = group.comment.id || '';
      const isActiveMessage = Boolean(activeMessageId) && group.comment.id === activeMessageId;
      if (isActiveMessage || (!activeMessageId && thread.id === activeThreadId && isLatestInThread)) {
        card.classList.add('is-active');
      }

      if (showComments) {
        const statusControls = document.createElement('div');
        statusControls.className = 'annotation-panel-status-controls';
        const statusSelect = document.createElement('select');
        statusSelect.className = 'annotation-panel-status-select';
        statusSelect.dataset.threadId = thread.id;
        statusSelect.dataset.messageId = group.comment.id || '';
        COMMENT_STATUSES.forEach((status) => {
          const option = document.createElement('option');
          option.value = status;
          option.textContent = status;
          option.selected = thread.status === status;
          statusSelect.appendChild(option);
        });
        statusControls.appendChild(statusSelect);
        card.append(statusControls);
      }

      const username = document.createElement('p');
      username.className = 'annotation-panel-comment-user';
      username.textContent = group.comment.username || thread.username || DEFAULT_USERNAME;

      const text = document.createElement('p');
      text.className = 'annotation-panel-comment-text';
      text.textContent = group.comment.text || '';

      const repliesWrap = document.createElement('div');
      repliesWrap.className = 'annotation-panel-replies-list';
      group.replies.forEach((reply) => {
        const replyText = document.createElement('p');
        replyText.className = 'annotation-panel-reply-text';
        replyText.innerHTML = `<span class="annotation-panel-reply-user">${reply.username || DEFAULT_USERNAME}</span>${reply.text || ''}`;
        repliesWrap.appendChild(replyText);
      });

      card.append(username, text, repliesWrap);

      if (showComments) {
        const replyComposer = document.createElement('div');
        replyComposer.className = 'annotation-panel-reply-composer';
        replyComposer.innerHTML = `
          <input type="text" class="annotation-panel-reply-input" data-thread-id="${thread.id}" data-comment-id="${group.comment.id || ''}" placeholder="Reply..." />
          <button type="button" class="annotation-panel-reply-btn" data-thread-id="${thread.id}" data-comment-id="${group.comment.id || ''}" aria-label="Send reply">
            <span aria-hidden="true">➤</span>
          </button>
        `;
        card.append(replyComposer);
      }

      annotationUI.panelListEl.appendChild(card);
    });
  });
}

function getCommentsScrollContainer() {
  if (!annotationUI.panelEl) return null;
  return annotationUI.panelEl.querySelector('.annotation-comments-content');
}

function scrollThreadInPanel(threadId, messageId = '', commentIndex = 0) {
  if (!annotationUI.panelEl || !annotationUI.panelListEl || !threadId) return;
  const thread = getThreadById(threadId);
  if (!thread) return;
  const firstCommentId = buildCommentGroups(thread)[0]?.comment?.id || '';
  activeThreadId = threadId;
  activeMessageId = messageId || firstCommentId;
  activeEditId = '';
  renderCommentsPanel();

  const runScroll = () => {
    const scrollContainer = getCommentsScrollContainer();
    let target = null;
    if (activeMessageId) {
      target = annotationUI.panelListEl.querySelector(`[data-message-id="${activeMessageId}"]`);
    }
    if (!(target instanceof HTMLElement)) {
      const sameThreadCards = annotationUI.panelListEl.querySelectorAll(`[data-thread-id="${threadId}"]`);
      target = sameThreadCards[commentIndex] || sameThreadCards[0] || null;
    }
    if (!(target instanceof HTMLElement)) return;

    const targetTop = target.offsetTop + annotationUI.panelListEl.offsetTop - 16;
    if (!scrollContainer) return;
    scrollContainer.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });

    // Explicit focus/highlight on the matched comment card.
    annotationUI.panelListEl.querySelectorAll('.annotation-panel-comment-focus')
      .forEach((el) => el.classList.remove('annotation-panel-comment-focus'));
    target.classList.add('annotation-panel-comment-focus');
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    window.setTimeout(() => {
      target.classList.remove('annotation-panel-comment-focus');
    }, 1200);
  };

  window.requestAnimationFrame(runScroll);
  window.setTimeout(runScroll, 60);
}

function scrollEditInPanel(editId) {
  if (!annotationUI.panelListEl || !editId) return;
  activeThreadId = '';
  activeMessageId = '';
  activeEditId = editId;
  renderCommentsPanel();

  const runScroll = () => {
    const scrollContainer = getCommentsScrollContainer();
    const target = annotationUI.panelListEl.querySelector(`[data-edit-id="${editId}"]`);
    if (!(target instanceof HTMLElement) || !scrollContainer) return;
    const targetTop = target.offsetTop + annotationUI.panelListEl.offsetTop - 16;
    scrollContainer.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
    annotationUI.panelListEl.querySelectorAll('.annotation-panel-comment-focus')
      .forEach((el) => el.classList.remove('annotation-panel-comment-focus'));
    target.classList.add('annotation-panel-comment-focus');
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    window.setTimeout(() => {
      target.classList.remove('annotation-panel-comment-focus');
    }, 1200);
  };

  window.requestAnimationFrame(runScroll);
  window.setTimeout(runScroll, 60);
}

function clearMarkers() {
  if (!annotationUI.layerEl) return;
  annotationUI.layerEl.querySelectorAll('.annotation-thread-marker, .annotation-edit-marker').forEach((marker) => marker.remove());
}

function scrollCommentsPanelToBottom() {
  const scrollContainer = getCommentsScrollContainer();
  if (!scrollContainer) return;
  window.requestAnimationFrame(() => {
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth',
    });
  });
}

function submitPanelReply(threadId, commentId, rawValue) {
  const value = (rawValue || '').trim();
  if (!value) return;
  const thread = getThreadById(threadId);
  if (!thread) return;
  pushThreadMessage(thread, value, 'reply');
  const latest = thread.messages[thread.messages.length - 1];
  if (latest) latest.replyToCommentId = commentId || '';
  activeThreadId = thread.id;
  activeMessageId = commentId || '';
  saveAnnotationStore();
  renderThreadMarkers();
  renderCommentsPanel();
  scrollCommentsPanelToBottom();
}

function pushThreadMessage(thread, text, kind = 'reply') {
  thread.messages = thread.messages || [];
  thread.messages.push({
    id: generateId('message'),
    username: DEFAULT_USERNAME,
    text,
    kind,
  });
}

function renderThreadMarkers() {
  if (!annotationUI.layerEl) return;
  const occupiedMarkerSlots = new Set();
  const MARKER_STEP = 28;
  const MIN_MARKER_LEFT = 8;
  const markerThreadType = annotationUI.inlineMode ? 'edit' : 'comment';

  annotationUI.mainEl.querySelectorAll('[data-annotation-count]').forEach((el) => {
    el.classList.remove('annotation-has-comments');
    el.removeAttribute('data-annotation-count');
  });
  clearMarkers();

  const resolveMarkerPosition = (baseTop, baseLeft) => {
    const row = Math.max(0, Math.round(baseTop));
    let nextLeft = Math.max(MIN_MARKER_LEFT, Math.round(baseLeft));
    let slotKey = `${row}:${nextLeft}`;
    while (occupiedMarkerSlots.has(slotKey) && nextLeft > MIN_MARKER_LEFT) {
      nextLeft = Math.max(MIN_MARKER_LEFT, nextLeft - MARKER_STEP);
      slotKey = `${row}:${nextLeft}`;
    }
    occupiedMarkerSlots.add(slotKey);
    return {
      top: row,
      left: nextLeft,
    };
  };

  annotationStore.threads
    .filter((thread) => getThreadType(thread) === markerThreadType)
    .forEach((thread) => {
      const targetEl = getElementByRef(thread.elementRef);
      if (!targetEl) return;
      if (!annotationUI.inlineMode) {
        targetEl.classList.add('annotation-has-comments');
        targetEl.setAttribute('data-annotation-count', String((thread.messages || []).length || 1));
      }

      const rect = targetEl.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      const groups = buildCommentGroups(thread);
      groups.forEach((group, idx) => {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = annotationUI.inlineMode ? 'annotation-edit-marker' : 'annotation-thread-marker';
        marker.dataset.threadId = thread.id;
        marker.dataset.messageId = group.comment.id || '';
        marker.dataset.commentIndex = String(idx);
        marker.title = annotationUI.inlineMode ? `Edit ${idx + 1}` : `Comment ${idx + 1}`;
        marker.setAttribute('aria-label', annotationUI.inlineMode ? `Open edit ${idx + 1}` : `Open comment ${idx + 1}`);
        marker.innerHTML = annotationUI.inlineMode
          ? `
        <svg class="annotation-edit-marker-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 17.25V21h3.75L19.81 7.94l-3.75-3.75z"></path>
        </svg>
      `
          : `
        <svg class="annotation-thread-marker-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h16v11H7l-3 3z"></path>
        </svg>
      `;

        const position = resolveMarkerPosition(rect.top - 8, rect.right - 8 - (idx * MARKER_STEP));
        marker.style.top = `${position.top}px`;
        marker.style.left = `${position.left}px`;
        annotationUI.layerEl.appendChild(marker);
      });
    });
}

function removePopup() {
  if (!annotationUI.popupEl) return;
  annotationUI.popupEl.remove();
  annotationUI.popupEl = null;
}

function submitPopupMessage() {
  if (!annotationUI.popupEl || !selectedElement || !selectedElementRef) return;
  const input = annotationUI.popupEl.querySelector('.annotation-reply-input');
  if (!(input instanceof HTMLTextAreaElement)) return;

  const value = input.value.trim();
  if (!value) return;

  let thread = getThreadByElementRef(selectedElementRef, 'comment');
  if (!thread) {
    thread = {
      id: generateId('thread'),
      elementRef: selectedElementRef,
      elementPath: selectedElementPath,
      status: COMMENT_STATUSES[0],
      username: DEFAULT_USERNAME,
      messages: [],
    };
    annotationStore.threads.push(thread);
  }

  pushThreadMessage(thread, value, 'comment');
  const latest = thread.messages[thread.messages.length - 1];
  activeMessageId = latest?.id || '';
  activeThreadId = thread.id;
  saveAnnotationStore();
  renderThreadMarkers();
  renderCommentsPanel();
  scrollCommentsPanelToBottom();
  closePopupAndSelection();
}

function attachPopupEvents() {
  if (!annotationUI.popupEl) return;
  const input = annotationUI.popupEl.querySelector('.annotation-reply-input');
  const sendBtn = annotationUI.popupEl.querySelector('.annotation-reply-btn');

  if (sendBtn) {
    sendBtn.addEventListener('click', (event) => {
      event.preventDefault();
      submitPopupMessage();
    });
  }

  if (input) {
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      submitPopupMessage();
    });
  }
}

function positionPopup(anchorElement) {
  if (!annotationUI.popupEl) return;
  const rect = anchorElement.getBoundingClientRect();
  const popupWidth = annotationUI.popupEl.offsetWidth || 320;
  const popupHeight = annotationUI.popupEl.offsetHeight || 260;

  let left = rect.right + 12;
  if (left + popupWidth > window.innerWidth - 12) {
    left = rect.left - popupWidth - 12;
  }
  left = Math.max(12, Math.min(left, window.innerWidth - popupWidth - 12));

  let top = rect.top;
  top = Math.max(12, Math.min(top, window.innerHeight - popupHeight - 12));

  annotationUI.popupEl.style.left = `${left}px`;
  annotationUI.popupEl.style.top = `${top}px`;
}

function openPopupForElement(element, shouldScroll = false) {
  if (!annotationUI.layerEl) return;
  setSelectedElement(element);
  const thread = getThreadByElementRef(selectedElementRef, 'comment');
  activeThreadId = thread?.id || '';
  activeMessageId = '';
  renderCommentsPanel();
  if (shouldScroll) {
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  removePopup();
  const popup = document.createElement('section');
  popup.className = 'annotation-floating-popup';
  popup.dataset.threadId = thread?.id || '';

  const header = document.createElement('div');
  header.className = 'annotation-popup-header';

  const title = document.createElement('h3');
  title.className = 'annotation-popup-title';
  title.textContent = 'Comment';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'annotation-popup-close';
  closeBtn.setAttribute('aria-label', 'Close comment');
  closeBtn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6L18 18M18 6L6 18"></path>
    </svg>
  `;

  const rightControls = document.createElement('div');
  rightControls.className = 'annotation-popup-header-controls';
  rightControls.append(closeBtn);

  header.append(title, rightControls);

  const composer = document.createElement('div');
  composer.className = 'annotation-reply-composer';
  composer.innerHTML = `
    <textarea class="annotation-reply-input" placeholder="Write a comment..."></textarea>
    <button type="button" class="annotation-reply-btn" aria-label="Send comment">
      <span aria-hidden="true">➤</span>
    </button>
  `;

  popup.append(header, composer);
  annotationUI.layerEl.appendChild(popup);
  annotationUI.popupEl = popup;
  positionPopup(element);
  attachPopupEvents();

  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    closePopupAndSelection();
  });

  const input = popup.querySelector('.annotation-reply-input');
  if (input instanceof HTMLTextAreaElement) input.focus();
}

function closePopupAndSelection() {
  clearSelectedElement();
  removePopup();
}

function syncFloatingUI() {
  if (!annotationUI.mainEl) return;
  renderThreadMarkers();
  if (annotationUI.popupEl && selectedElement) {
    positionPopup(selectedElement);
  }
}

function setupAnnotationUI(mainEl) {
  annotationUI.mainEl = mainEl;
  ensureFloatingLayer();
  ensureCommentsPanel();
  loadAnnotationStore();
  rebindThreadsToCurrentDom();
  saveAnnotationStore();
  renderThreadMarkers();
  renderCommentsPanel();

  mainEl.addEventListener('click', (event) => {
    if (annotationUI.inlineMode) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target === mainEl) return;
    if (target.closest('a')) event.preventDefault();
    event.stopPropagation();
    openPopupForElement(target);
  }, true);

  annotationUI.layerEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const editMarker = target.closest('.annotation-edit-marker');
    if (editMarker instanceof HTMLButtonElement) {
      scrollThreadInPanel(
        editMarker.dataset.threadId,
        editMarker.dataset.messageId,
        Number.parseInt(editMarker.dataset.commentIndex || '0', 10),
      );
      return;
    }
    const marker = target.closest('.annotation-thread-marker');
    if (!(marker instanceof HTMLButtonElement)) return;
    scrollThreadInPanel(
      marker.dataset.threadId,
      marker.dataset.messageId,
      Number.parseInt(marker.dataset.commentIndex || '0', 10),
    );
  });

  annotationUI.panelEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('.annotation-inline-edit-switcher')) return;
    const card = target.closest('.annotation-panel-comment');
    if (annotationUI.inlineMode) {
      if (!(card instanceof HTMLElement)) return;
      const thread = getThreadById(card.dataset.threadId);
      if (!thread) return;
      const targetEl = getElementByRef(thread.elementRef);
      if (targetEl) targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      activeThreadId = thread.id;
      activeMessageId = card.dataset.messageId || '';
      renderCommentsPanel();
      return;
    }
    if (target.closest('.annotation-panel-reply-btn')) {
      const replyBtn = target.closest('.annotation-panel-reply-btn');
      if (!(replyBtn instanceof HTMLButtonElement)) return;
      const threadId = replyBtn.dataset.threadId;
      const commentId = replyBtn.dataset.commentId;
      if (!threadId) return;
      const input = annotationUI.panelEl.querySelector(`.annotation-panel-reply-input[data-thread-id="${threadId}"][data-comment-id="${commentId}"]`);
      if (!(input instanceof HTMLInputElement)) return;
      submitPanelReply(threadId, commentId, input.value);
      return;
    }

    if (target.closest('.annotation-panel-reply-input')) return;
    if (target.closest('.annotation-panel-status-select')) return;
    if (!(card instanceof HTMLElement)) return;
    const thread = getThreadById(card.dataset.threadId);
    if (!thread) return;
    activeEditId = '';
    activeMessageId = card.dataset.messageId || '';
    const targetEl = getElementByRef(thread.elementRef);
    if (!targetEl) return;
    openPopupForElement(targetEl, true);
  });

  annotationUI.panelEl.addEventListener('keydown', (event) => {
    if (annotationUI.inlineMode) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains('annotation-panel-reply-input')) return;
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitPanelReply(target.dataset.threadId, target.dataset.commentId, target.value);
  });

  annotationUI.panelEl.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.classList.contains('annotation-inline-mode-radio')) return;
    if (annotationUI.inlineMode) return;
    if (!(target instanceof HTMLSelectElement)) return;
    if (!target.classList.contains('annotation-panel-status-select')) return;
    const threadId = target.dataset.threadId;
    if (!threadId) return;
    const thread = getThreadById(threadId);
    if (!thread) return;
    thread.status = target.value;
    activeThreadId = thread.id;
    activeMessageId = '';
    saveAnnotationStore();
    renderThreadMarkers();
    renderCommentsPanel();
  });

  document.addEventListener('click', (event) => {
    if (annotationUI.inlineMode) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('.annotation-floating-popup')) return;
    if (target.closest('.annotation-thread-marker')) return;
    if (target.closest('.annotation-comments-panel')) return;
    if (target.closest('main')) return;
    closePopupAndSelection();
  });

  mainEl.addEventListener('scroll', syncFloatingUI);
  window.addEventListener('resize', syncFloatingUI);

  if (annotationUI.inlineToggleEl) {
    annotationUI.inlineToggleEl.addEventListener('change', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.checked) return;
      target.disabled = true;
      try {
        await enableInlineEditMode();
      } catch {
        target.checked = false;
        if (annotationUI.inlineCommentsToggleEl) annotationUI.inlineCommentsToggleEl.checked = true;
      } finally {
        target.disabled = false;
      }
    });
  }

  if (annotationUI.inlineCommentsToggleEl) {
    annotationUI.inlineCommentsToggleEl.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.checked) return;
      disableInlineEditMode();
      if (annotationUI.inlineToggleEl) annotationUI.inlineToggleEl.checked = false;
    });
  }
}

export async function annotationOperation() {
  document.body.classList.add('annotation-mode');
  await initializePreview();
  await miloLoadArea();
  const mainEl = document.querySelector('main');
  if (!mainEl) return;
  setupAnnotationUI(mainEl);
  rebindEasyEditsToCurrentDom();
  applyEasyEditsToDom();
  saveAnnotationStore();
  renderThreadMarkers();
  renderCommentsPanel();
}
