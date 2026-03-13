import { COMMENT_STATUSES, DEFAULT_USERNAME } from './store.js';

export default function createCommentsPanelController({
  annotationState,
  annotationUI,
  store,
}) {
  let enableInlineEditMode = async () => {};
  let disableInlineEditMode = () => {};

  function setInlineModeHandlers(handlers) {
    enableInlineEditMode = handlers.enableInlineEditMode;
    disableInlineEditMode = handlers.disableInlineEditMode;
  }

  function setSelectedElement(element) {
    store.clearSelectedElement();
    annotationState.selectedElement = element;
    annotationState.selectedElement.classList.add('annotation-selected-element');
    annotationState.selectedElementRef = store.ensureElementRef(annotationState.selectedElement);
    annotationState.selectedElementPath = store.buildElementPath(
      annotationState.selectedElement,
      annotationUI.mainEl,
    );
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
            <input type="radio" id="annotation-inline-mode-assets" name="annotation-inline-mode" class="annotation-inline-mode-radio" value="assets" />
            <label for="annotation-inline-mode-assets">Assets</label>
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
    annotationUI.inlineAssetsToggleEl = panel.querySelector('#annotation-inline-mode-assets');
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
      const mode = annotationUI.annotationMode || (annotationUI.inlineMode ? 'edit' : 'comments');
      let title = 'Comments';
      if (mode === 'edit') title = 'Edits';
      if (mode === 'assets') title = 'Assets';
      panelTitle.textContent = title;
    }

    if (annotationUI.annotationMode === 'assets') {
      const empty = document.createElement('p');
      empty.className = 'annotation-comments-empty';
      empty.textContent = 'No assets yet.';
      annotationUI.panelListEl.appendChild(empty);
      return;
    }

    const visibleThreadType = annotationUI.inlineMode ? 'edit' : 'comment';
    const visibleThreads = annotationState.store.threads
      .filter((thread) => store.getThreadType(thread) === visibleThreadType);
    const showComments = !annotationUI.inlineMode;

    if (!visibleThreads.length) {
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
        const isActiveMessage = Boolean(annotationState.activeMessageId)
          && group.comment.id === annotationState.activeMessageId;
        if (isActiveMessage
          || (!annotationState.activeMessageId
            && thread.id === annotationState.activeThreadId
            && isLatestInThread)) {
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
    const thread = store.getThreadById(threadId);
    if (!thread) return;

    const firstCommentId = buildCommentGroups(thread)[0]?.comment?.id || '';
    annotationState.activeThreadId = threadId;
    annotationState.activeMessageId = messageId || firstCommentId;
    annotationState.activeEditId = '';
    renderCommentsPanel();

    const runScroll = () => {
      const scrollContainer = getCommentsScrollContainer();
      let target = null;
      if (annotationState.activeMessageId) {
        target = annotationUI.panelListEl.querySelector(`[data-message-id="${annotationState.activeMessageId}"]`);
      }
      if (!(target instanceof HTMLElement)) {
        const sameThreadCards = annotationUI.panelListEl.querySelectorAll(`[data-thread-id="${threadId}"]`);
        target = sameThreadCards[commentIndex] || sameThreadCards[0] || null;
      }
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
    annotationUI.layerEl.querySelectorAll('.annotation-thread-marker, .annotation-edit-marker')
      .forEach((marker) => marker.remove());
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

  function renderThreadMarkers() {
    if (!annotationUI.layerEl || !annotationUI.mainEl) return;
    const occupiedMarkerSlots = new Set();
    const markerThreadType = annotationUI.inlineMode ? 'edit' : 'comment';
    const MARKER_STEP = 28;
    const MIN_MARKER_LEFT = 8;

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

    annotationState.store.threads
      .filter((thread) => store.getThreadType(thread) === markerThreadType)
      .forEach((thread) => {
        const targetEl = store.getElementByRef(thread.elementRef);
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
          marker.setAttribute(
            'aria-label',
            annotationUI.inlineMode ? `Open edit ${idx + 1}` : `Open comment ${idx + 1}`,
          );
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

          const position = resolveMarkerPosition(
            rect.top - 8,
            rect.right - 8 - (idx * MARKER_STEP),
          );
          marker.style.top = `${position.top}px`;
          marker.style.left = `${position.left}px`;
          annotationUI.layerEl.appendChild(marker);
        });
      });
  }

  function submitPanelReply(threadId, commentId, rawValue) {
    const value = (rawValue || '').trim();
    if (!value) return;
    const thread = store.getThreadById(threadId);
    if (!thread) return;

    store.pushThreadMessage(thread, value, 'reply');
    const latest = thread.messages[thread.messages.length - 1];
    if (latest) latest.replyToCommentId = commentId || '';
    annotationState.activeThreadId = thread.id;
    annotationState.activeMessageId = commentId || '';
    store.saveAnnotationStore();
    renderThreadMarkers();
    renderCommentsPanel();
    scrollCommentsPanelToBottom();
  }

  function removePopup() {
    if (!annotationUI.popupEl) return;
    annotationUI.popupEl.remove();
    annotationUI.popupEl = null;
  }

  function closePopupAndSelection() {
    store.clearSelectedElement();
    removePopup();
  }

  function submitPopupMessage() {
    if (
      !annotationUI.popupEl
      || !annotationState.selectedElement
      || !annotationState.selectedElementRef
    ) return;
    const input = annotationUI.popupEl.querySelector('.annotation-reply-input');
    if (!(input instanceof HTMLTextAreaElement)) return;

    const value = input.value.trim();
    if (!value) return;

    let thread = store.getThreadByElementRef(annotationState.selectedElementRef, 'comment');
    if (!thread) {
      thread = {
        id: store.generateId('thread'),
        elementRef: annotationState.selectedElementRef,
        elementPath: annotationState.selectedElementPath,
        status: COMMENT_STATUSES[0],
        username: DEFAULT_USERNAME,
        messages: [],
      };
      annotationState.store.threads.push(thread);
    }

    store.pushThreadMessage(thread, value, 'comment');
    const latest = thread.messages[thread.messages.length - 1];
    annotationState.activeMessageId = latest?.id || '';
    annotationState.activeThreadId = thread.id;
    store.saveAnnotationStore();
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

    let { top } = rect;
    top = Math.max(12, Math.min(top, window.innerHeight - popupHeight - 12));

    annotationUI.popupEl.style.left = `${left}px`;
    annotationUI.popupEl.style.top = `${top}px`;
  }

  function openPopupForElement(element, shouldScroll = false) {
    if (!annotationUI.layerEl) return;
    setSelectedElement(element);
    const thread = store.getThreadByElementRef(annotationState.selectedElementRef, 'comment');
    annotationState.activeThreadId = thread?.id || '';
    annotationState.activeMessageId = '';
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

  function syncFloatingUI() {
    if (!annotationUI.mainEl) return;
    renderThreadMarkers();
    if (annotationUI.popupEl && annotationState.selectedElement) {
      positionPopup(annotationState.selectedElement);
    }
  }

  function setupAnnotationUI(mainEl) {
    annotationUI.mainEl = mainEl;
    ensureFloatingLayer();
    ensureCommentsPanel();
    store.loadAnnotationStore();
    store.rebindThreadsToCurrentDom();
    store.saveAnnotationStore();
    renderThreadMarkers();
    renderCommentsPanel();

    mainEl.addEventListener('click', (event) => {
      if (annotationUI.inlineMode) return;
      const { target } = event;
      if (!(target instanceof HTMLElement)) return;
      if (target === mainEl) return;
      if (target.closest('a')) event.preventDefault();
      event.stopPropagation();
      openPopupForElement(target);
    }, true);

    annotationUI.layerEl.addEventListener('click', (event) => {
      const { target } = event;
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
      const { target } = event;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('.annotation-inline-edit-switcher')) return;
      const card = target.closest('.annotation-panel-comment');

      if (annotationUI.inlineMode) {
        if (!(card instanceof HTMLElement)) return;
        const thread = store.getThreadById(card.dataset.threadId);
        if (!thread) return;
        const targetEl = store.getElementByRef(thread.elementRef);
        if (targetEl) targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        annotationState.activeThreadId = thread.id;
        annotationState.activeMessageId = card.dataset.messageId || '';
        renderCommentsPanel();
        return;
      }

      if (target.closest('.annotation-panel-reply-btn')) {
        const replyBtn = target.closest('.annotation-panel-reply-btn');
        if (!(replyBtn instanceof HTMLButtonElement)) return;
        const { threadId, commentId } = replyBtn.dataset;
        if (!threadId) return;
        const input = annotationUI.panelEl.querySelector(
          `.annotation-panel-reply-input[data-thread-id="${threadId}"][data-comment-id="${commentId}"]`,
        );
        if (!(input instanceof HTMLInputElement)) return;
        submitPanelReply(threadId, commentId, input.value);
        return;
      }

      if (target.closest('.annotation-panel-reply-input')) return;
      if (target.closest('.annotation-panel-status-select')) return;
      if (!(card instanceof HTMLElement)) return;

      const thread = store.getThreadById(card.dataset.threadId);
      if (!thread) return;
      annotationState.activeEditId = '';
      annotationState.activeMessageId = card.dataset.messageId || '';
      const targetEl = store.getElementByRef(thread.elementRef);
      if (!targetEl) return;
      openPopupForElement(targetEl, true);
    });

    annotationUI.panelEl.addEventListener('keydown', (event) => {
      if (annotationUI.inlineMode) return;
      const { target } = event;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.classList.contains('annotation-panel-reply-input')) return;
      if (event.key !== 'Enter') return;
      event.preventDefault();
      submitPanelReply(target.dataset.threadId, target.dataset.commentId, target.value);
    });

    annotationUI.panelEl.addEventListener('change', (event) => {
      const { target } = event;
      if (target instanceof HTMLInputElement && target.classList.contains('annotation-inline-mode-radio')) return;
      if (annotationUI.inlineMode) return;
      if (!(target instanceof HTMLSelectElement)) return;
      if (!target.classList.contains('annotation-panel-status-select')) return;
      const { threadId } = target.dataset;
      if (!threadId) return;
      const thread = store.getThreadById(threadId);
      if (!thread) return;
      thread.status = target.value;
      annotationState.activeThreadId = thread.id;
      annotationState.activeMessageId = '';
      store.saveAnnotationStore();
      renderThreadMarkers();
      renderCommentsPanel();
    });

    document.addEventListener('click', (event) => {
      if (annotationUI.inlineMode) return;
      const { target } = event;
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
        const { target } = event;
        if (!(target instanceof HTMLInputElement) || !target.checked) return;
        target.disabled = true;
        try {
          annotationUI.annotationMode = 'edit';
          if (annotationUI.inlineAssetsToggleEl) annotationUI.inlineAssetsToggleEl.checked = false;
          await enableInlineEditMode();
        } catch {
          target.checked = false;
          if (annotationUI.inlineCommentsToggleEl) {
            annotationUI.inlineCommentsToggleEl.checked = true;
          }
          annotationUI.annotationMode = 'comments';
        } finally {
          target.disabled = false;
        }
        renderCommentsPanel();
      });
    }

    if (annotationUI.inlineCommentsToggleEl) {
      annotationUI.inlineCommentsToggleEl.addEventListener('change', (event) => {
        const { target } = event;
        if (!(target instanceof HTMLInputElement) || !target.checked) return;
        annotationUI.annotationMode = 'comments';
        disableInlineEditMode();
        if (annotationUI.inlineToggleEl) annotationUI.inlineToggleEl.checked = false;
        if (annotationUI.inlineAssetsToggleEl) annotationUI.inlineAssetsToggleEl.checked = false;
        renderCommentsPanel();
      });
    }

    if (annotationUI.inlineAssetsToggleEl) {
      annotationUI.inlineAssetsToggleEl.addEventListener('change', (event) => {
        const { target } = event;
        if (!(target instanceof HTMLInputElement) || !target.checked) return;
        annotationUI.annotationMode = 'assets';
        disableInlineEditMode();
        if (annotationUI.inlineToggleEl) annotationUI.inlineToggleEl.checked = false;
        if (annotationUI.inlineCommentsToggleEl) {
          annotationUI.inlineCommentsToggleEl.checked = false;
        }
        renderCommentsPanel();
      });
    }
  }

  return {
    removePopup,
    renderCommentsPanel,
    renderThreadMarkers,
    setInlineModeHandlers,
    setupAnnotationUI,
  };
}
