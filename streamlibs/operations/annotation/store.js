const ANNOTATION_STORE_KEY = 'stream-annotation-comments';

export const DEFAULT_USERNAME = 'stream';
export const COMMENT_STATUSES = ['Open', 'Complete', 'Resolved', 'Closed'];

export function createAnnotationStore({ annotationState, annotationUI }) {
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
      return {
        threads: parsed.threads,
        easyEdits,
      };
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

    return {
      threads: [],
      easyEdits: [],
    };
  }

  function loadAnnotationStore() {
    try {
      const reviewId = getReviewId();
      const raw = window.localStorage.getItem(ANNOTATION_STORE_KEY);
      if (!raw) {
        annotationState.store = { threads: [], easyEdits: [] };
        return;
      }
      const parsed = JSON.parse(raw) || {};

      if (reviewId && typeof parsed === 'object' && !Array.isArray(parsed) && parsed[reviewId]) {
        annotationState.store = parseAnnotationPayload(parsed[reviewId]);
        return;
      }

      annotationState.store = parseAnnotationPayload(parsed);
    } catch (error) {
      annotationState.store = { threads: [], easyEdits: [] };
    }
  }

  function toLegacyCommentShape() {
    return annotationState.store.threads.map((thread) => {
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
      threads: annotationState.store.threads,
      easyEdits: annotationState.store.easyEdits,
      'easy-edits': annotationState.store.easyEdits,
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
    window.streamAnnotationComments = existingMap;
  }

  function replaceFirstOccurrence(source, fromValue, toValue) {
    const haystack = `${source || ''}`;
    const needle = `${fromValue || ''}`;
    if (!needle) return haystack;
    const index = haystack.indexOf(needle);
    if (index === -1) return haystack;
    return `${haystack.slice(0, index)}${toValue || ''}${haystack.slice(index + needle.length)}`;
  }

  function escapeRegExp(value) {
    return `${value || ''}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function applyEasyEditsToHtmlString(html, easyEdits = []) {
    let updatedHtml = `${html || ''}`;
    easyEdits.forEach((edit) => {
      if (!edit || typeof edit !== 'object') return;

      if (edit.editType === 'image-alt') {
        const fromAlt = `${edit.from || ''}`;
        const toAlt = `${edit.to || ''}`;
        if (!fromAlt) return;
        const escapedFromAlt = escapeRegExp(fromAlt);
        const doubleQuoteAlt = new RegExp(`alt="${escapedFromAlt}"`);
        const singleQuoteAlt = new RegExp(`alt='${escapedFromAlt}'`);
        if (doubleQuoteAlt.test(updatedHtml)) {
          updatedHtml = updatedHtml.replace(doubleQuoteAlt, `alt="${toAlt}"`);
        } else if (singleQuoteAlt.test(updatedHtml)) {
          updatedHtml = updatedHtml.replace(singleQuoteAlt, `alt='${toAlt}'`);
        }
        return;
      }

      const fromHtml = `${edit.fromHtml || ''}`;
      const toHtml = `${edit.toHtml || ''}`;
      const fromText = `${edit.from || ''}`;
      const toText = `${edit.to || ''}`;

      if (fromHtml) {
        updatedHtml = replaceFirstOccurrence(updatedHtml, fromHtml, toHtml || fromHtml);
        return;
      }
      if (fromText) {
        updatedHtml = replaceFirstOccurrence(updatedHtml, fromText, toText);
      }
    });
    return updatedHtml;
  }

  function getStoredAnnotationPayload() {
    try {
      const reviewId = getReviewId();
      const raw = window.localStorage.getItem(ANNOTATION_STORE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) || {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed[reviewId]) {
        return parseAnnotationPayload(parsed[reviewId]);
      }
      return parseAnnotationPayload(parsed);
    } catch {
      return null;
    }
  }

  function getThreadType(thread) {
    return thread?.threadType || 'comment';
  }

  function buildElementPath(element, root = annotationUI.mainEl) {
    const segments = [];
    let current = element;

    while (current && current !== root) {
      if (!current.parentElement) break;
      const tag = current.tagName.toLowerCase();
      const siblings = [];
      const currentTagName = current.tagName;
      const children = Array.from(current.parentElement.children);
      for (let idx = 0; idx < children.length; idx += 1) {
        const child = children[idx];
        if (child.tagName === currentTagName) siblings.push(child);
      }
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

    annotationState.store.threads.forEach((thread) => {
      const existingByRef = getElementByRef(thread.elementRef);
      if (existingByRef) return;

      if (!thread.elementPath) return;
      const target = annotationUI.mainEl.querySelector(thread.elementPath);
      if (!(target instanceof HTMLElement)) return;
      thread.elementRef = ensureElementRef(target);
    });
  }

  function getThreadByElementRef(elementRef, threadType = null) {
    return annotationState.store.threads.find((thread) => thread.elementRef === elementRef
      && (!threadType || getThreadType(thread) === threadType));
  }

  function getThreadById(threadId) {
    return annotationState.store.threads.find((thread) => thread.id === threadId);
  }

  function clearSelectedElement() {
    if (annotationState.selectedElement) {
      annotationState.selectedElement.classList.remove('annotation-selected-element');
    }
    annotationState.selectedElement = null;
    annotationState.selectedElementPath = '';
    annotationState.selectedElementRef = '';
  }

  function getEasyEditByElement(elementRef, elementPath) {
    return annotationState.store.easyEdits.find((edit) => (
      (elementRef && edit.elementRef === elementRef)
      || (elementPath && edit.elementPath === elementPath)
    ));
  }

  function upsertEasyEdit(editRecord) {
    const index = annotationState.store.easyEdits.findIndex((edit) => (
      edit.elementRef === editRecord.elementRef
        || (edit.elementPath && edit.elementPath === editRecord.elementPath)
    ));
    if (index > -1) {
      annotationState.store.easyEdits[index] = {
        ...annotationState.store.easyEdits[index],
        ...editRecord,
      };
      return;
    }
    annotationState.store.easyEdits.push(editRecord);
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

  function pushThreadMessage(thread, text, kind = 'reply') {
    thread.messages = thread.messages || [];
    thread.messages.push({
      id: generateId('message'),
      username: DEFAULT_USERNAME,
      text,
      kind,
    });
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
      annotationState.store.threads.push(thread);
    }

    const existingMessages = thread.messages || [];
    const kind = existingMessages.length ? 'reply' : 'comment';
    pushThreadMessage(thread, text, kind);
    annotationState.activeThreadId = thread.id;
    annotationState.activeMessageId = '';
    annotationState.activeEditId = '';
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
    annotationState.store.easyEdits.forEach((edit) => {
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

    annotationState.store.easyEdits.forEach((edit) => {
      const target = getElementForEdit(edit);
      if (!(target instanceof HTMLElement)) return;

      if (edit.editType === 'image-alt') {
        target.setAttribute('alt', edit.to || '');
        return;
      }

      if (edit.toHtml) {
        if (target.innerHTML !== edit.toHtml) {
          target.innerHTML = edit.toHtml;
        }
        return;
      }

      const currentText = target.textContent || '';
      if (edit.from && currentText.includes(edit.from)) {
        target.textContent = currentText.replace(edit.from, edit.to);
      } else if (edit.to) {
        target.textContent = edit.to;
      }
    });
  }

  return {
    applyEasyEditsToDom,
    applyEasyEditsToHtmlString,
    buildElementPath,
    clearSelectedElement,
    ensureElementRef,
    generateId,
    getChangedSegments,
    getEditPanelMessage,
    getEasyEditByElement,
    getElementByRef,
    getStoredAnnotationPayload,
    getThreadByElementRef,
    getThreadById,
    getThreadType,
    loadAnnotationStore,
    pushThreadMessage,
    recordEditMessage,
    rebindEasyEditsToCurrentDom,
    rebindThreadsToCurrentDom,
    removeEasyEditHighlights,
    saveAnnotationStore,
    upsertEasyEdit,
  };
}
