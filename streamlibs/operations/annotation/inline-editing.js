import createAnnotationServiceClient from './service.js';

const MEDIUM_EDITOR_CSS_URL = 'https://cdn.jsdelivr.net/npm/medium-editor@5.23.3/dist/css/medium-editor.min.css';
const MEDIUM_EDITOR_JS_URL = 'https://cdn.jsdelivr.net/npm/medium-editor@5.23.3/dist/js/medium-editor.min.js';

export default function createInlineEditingController({
  annotationState,
  annotationUI,
  store,
  renderThreadMarkers,
  renderCommentsPanel,
  removePopup,
}) {
  const annotationService = createAnnotationServiceClient();

  async function persistEditThreadMessage(element, threadElementPath, text) {
    if (!(element instanceof HTMLElement) || !threadElementPath || !text) return;

    let thread = store.getEditThreadByElement(element);

    try {
      const remoteThread = thread
        ? await annotationService.createReply(thread.id, text)
        : await annotationService.createThread({
          elementPath: threadElementPath,
          body: text,
          quotedText: null,
          threadType: 'edit',
        });

      if (remoteThread) {
        store.upsertThread(remoteThread);
        thread = store.getThreadById(remoteThread.id) || remoteThread;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Could not save edit thread to service', error);
    }

    if (!thread) return;
    annotationState.activeThreadId = thread.id;
    annotationState.activeMessageId = '';
    annotationState.activeEditId = '';
  }

  async function loadMediumEditor() {
    if (window.MediumEditor) return;
    if (annotationState.mediumEditorLoadPromise) {
      await annotationState.mediumEditorLoadPromise;
      return;
    }

    if (!document.querySelector('link[data-medium-editor="css"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = MEDIUM_EDITOR_CSS_URL;
      css.dataset.mediumEditor = 'css';
      document.head.appendChild(css);
    }

    annotationState.mediumEditorLoadPromise = new Promise((resolve, reject) => {
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

    await annotationState.mediumEditorLoadPromise;
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

  async function trackInlineEditChange(element) {
    if (!(element instanceof HTMLElement) || !annotationUI.mainEl) return;
    const elementRef = store.ensureElementRef(element);
    const snapshot = annotationUI.inlineElementSnapshot.get(elementRef);
    if (!snapshot) return;

    const currentHtml = element.innerHTML;
    const currentText = element.textContent || '';
    if (
      currentHtml === snapshot.originalHtml
      && currentText.trim() === snapshot.originalText.trim()
    ) return;

    const easyEditElementPath = store.buildElementPath(element, annotationUI.mainEl);
    const threadElementPath = store.buildThreadElementPath(element, annotationUI.mainEl);
    const segments = store.getChangedSegments(snapshot.originalText, currentText);
    const existing = store.getEasyEditByElement(elementRef, easyEditElementPath);
    const editRecord = {
      id: existing?.id || store.generateId('easy-edit'),
      editType: 'text',
      attrName: '',
      elementPath: easyEditElementPath,
      elementRef,
      from: snapshot.originalText,
      to: currentText,
      fromHtml: snapshot.originalHtml,
      toHtml: currentHtml,
      changedFrom: segments.changedFrom,
      changedTo: segments.changedTo,
      updatedAt: new Date().toISOString(),
    };

    store.upsertEasyEdit(editRecord);
    await persistEditThreadMessage(
      element,
      threadElementPath,
      store.getEditPanelMessage(editRecord),
    );
    store.saveAnnotationStore();
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
    const candidateNodes = [
      selection.anchorNode,
      selection.focusNode,
      range.commonAncestorContainer,
    ];

    for (let idx = 0; idx < candidateNodes.length; idx += 1) {
      const node = candidateNodes[idx];
      if (node instanceof HTMLImageElement) return node;
      if (node instanceof Element || node?.parentElement instanceof HTMLElement) {
        const element = node instanceof HTMLElement ? node : node?.parentElement;
        const img = element?.closest('img');
        if (img instanceof HTMLImageElement) return img;
      }
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

  async function persistSingleImageAltChange(imageElement) {
    if (!(imageElement instanceof HTMLImageElement) || !annotationUI.mainEl) return;

    const elementRef = store.ensureElementRef(imageElement);
    const easyEditElementPath = store.buildElementPath(imageElement, annotationUI.mainEl);
    const threadElementPath = store.buildThreadElementPath(imageElement, annotationUI.mainEl);
    const snapshotAlt = annotationUI.inlineImageAltSnapshot.get(elementRef);
    const originalAlt = snapshotAlt !== undefined ? `${snapshotAlt}` : (imageElement.getAttribute('alt') || '');
    const currentAlt = `${imageElement.getAttribute('alt') || ''}`;
    if (originalAlt === currentAlt) return;

    const existing = store.getEasyEditByElement(elementRef, easyEditElementPath);
    const editRecord = {
      id: existing?.id || store.generateId('easy-edit'),
      editType: 'image-alt',
      attrName: 'alt',
      elementPath: easyEditElementPath,
      elementRef,
      from: originalAlt,
      to: currentAlt,
      fromHtml: '',
      toHtml: '',
      changedFrom: originalAlt,
      changedTo: currentAlt,
      updatedAt: new Date().toISOString(),
    };
    store.upsertEasyEdit(editRecord);
    annotationUI.inlineImageAltSnapshot.set(elementRef, currentAlt);
    await persistEditThreadMessage(
      imageElement,
      threadElementPath,
      store.getEditPanelMessage(editRecord),
    );
    store.saveAnnotationStore();
    renderThreadMarkers();
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
    let { left } = rect;
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
      const { target } = event;
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
      const { target } = event;
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
        const imageElement = getSelectedImageForMediumEditor()
          || annotationUI.inlineSelectedImageEl;
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

  async function syncImageAltChanges() {
    if (!annotationUI.mainEl) return;
    const pendingUpdates = annotationUI.editableImages
      .filter((imageElement) => imageElement instanceof HTMLImageElement)
      .map(async (imageElement) => {
        const elementRef = store.ensureElementRef(imageElement);
        const easyEditElementPath = store.buildElementPath(imageElement, annotationUI.mainEl);
        const threadElementPath = store.buildThreadElementPath(imageElement, annotationUI.mainEl);
        const snapshotAlt = annotationUI.inlineImageAltSnapshot.get(elementRef);
        const originalAlt = snapshotAlt !== undefined
          ? `${snapshotAlt}`
          : (imageElement.getAttribute('alt') || '');
        const currentAlt = `${imageElement.getAttribute('alt') || ''}`;
        if (originalAlt === currentAlt) return;

        const existing = store.getEasyEditByElement(elementRef, easyEditElementPath);
        const editRecord = {
          id: existing?.id || store.generateId('easy-edit'),
          editType: 'image-alt',
          attrName: 'alt',
          elementPath: easyEditElementPath,
          elementRef,
          from: originalAlt,
          to: currentAlt,
          fromHtml: '',
          toHtml: '',
          changedFrom: originalAlt,
          changedTo: currentAlt,
          updatedAt: new Date().toISOString(),
        };
        store.upsertEasyEdit(editRecord);
        await persistEditThreadMessage(
          imageElement,
          threadElementPath,
          store.getEditPanelMessage(editRecord),
        );
        annotationUI.inlineImageAltSnapshot.set(elementRef, currentAlt);
      });

    await Promise.all(pendingUpdates);
  }

  async function enableInlineEditMode() {
    if (!annotationUI.mainEl || annotationUI.inlineMode) return;
    await loadMediumEditor();
    annotationUI.inlineMode = true;
    document.body.classList.add('annotation-inline-edit-mode');
    removePopup();
    store.clearSelectedElement();
    store.removeEasyEditHighlights(annotationUI.mainEl);

    annotationUI.editableElements = getInlineEditableElements();
    annotationUI.editableImages = getInlineEditableImages();
    annotationUI.mediumEditorInstance = createMediumEditorInstance(annotationUI.editableElements);
    attachInlineImageSelectionHandler();

    annotationUI.editableElements.forEach((element) => {
      const elementRef = store.ensureElementRef(element);
      annotationUI.inlineElementSnapshot.set(elementRef, {
        originalHtml: element.innerHTML,
        originalText: element.textContent || '',
      });
      element.classList.add('annotation-inline-editable');
      const blurHandler = () => {
        trackInlineEditChange(element);
      };
      annotationUI.inlineBlurHandlers.set(elementRef, blurHandler);
      element.addEventListener('blur', blurHandler, true);
    });

    annotationUI.editableImages.forEach((imageElement) => {
      const elementRef = store.ensureElementRef(imageElement);
      annotationUI.inlineImageAltSnapshot.set(elementRef, imageElement.getAttribute('alt') || '');
      imageElement.classList.add('annotation-inline-editable-image');
    });

    renderThreadMarkers();
    renderCommentsPanel();
  }

  async function disableInlineEditMode() {
    if (!annotationUI.inlineMode) return;
    annotationUI.inlineMode = false;
    document.body.classList.remove('annotation-inline-edit-mode');

    await Promise.all(
      annotationUI.editableElements.map((element) => trackInlineEditChange(element)),
    );
    await syncImageAltChanges();

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

    store.applyEasyEditsToDom();
    store.saveAnnotationStore();
    renderThreadMarkers();
    renderCommentsPanel();
  }

  async function syncInlineEditsBeforePersist() {
    if (!annotationUI.inlineMode) return;
    await Promise.all(
      annotationUI.editableElements.map((element) => trackInlineEditChange(element)),
    );
    await syncImageAltChanges();
    store.saveAnnotationStore();
  }

  return {
    disableInlineEditMode,
    enableInlineEditMode,
    syncInlineEditsBeforePersist,
  };
}
