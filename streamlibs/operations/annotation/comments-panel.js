import {
  ANNOTATION_COMMENT_THREAD_POLL_INTERVAL_MS,
  ANNOTATION_MESSAGES,
  ANNOTATION_DEFAULT_USERNAME,
} from '../../utils/constants.js';
import { COMMENT_STATUSES } from './store.js';
import createAnnotationServiceClient from './service.js';
import { hideGlobalSnackbar, showGlobalSnackbar } from '../../utils/snackbar.js';

export default function createCommentsPanelController({
  annotationState,
  annotationUI,
  store,
}) {
  const annotationService = createAnnotationServiceClient();
  let enableInlineEditMode = async () => {};
  let disableInlineEditMode = () => {};
  let refreshThreadsFromService = async () => {};
  let popupSubmitPending = false;
  let activeCommentEditor = null;
  const pendingReplyComposerKeys = new Set();
  const pendingCommentEditIds = new Set();

  function refreshThreadsFromServiceInBackground() {
    refreshThreadsFromService().catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('Could not refresh annotation threads after write', error);
    });
  }

  function setInlineModeHandlers(handlers) {
    enableInlineEditMode = handlers.enableInlineEditMode;
    disableInlineEditMode = handlers.disableInlineEditMode;
  }

  function setSelectedElement(element) {
    store.clearSelectedElement();
    annotationState.selectedElement = element;
    annotationState.selectedElement.classList.add('annotation-selected-element');
    annotationState.selectedElementRef = '';
    annotationState.selectedElementPath = store.buildCommentElementPath(
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

  function getRootComment(thread) {
    return buildCommentGroups(thread)[0]?.comment || thread?.messages?.[0] || null;
  }

  function getCurrentUserIdentity() {
    return annotationService.getCurrentUserIdentity();
  }

  function isCommentEditableByCurrentUser(message) {
    if (!message || annotationUI.inlineMode || annotationUI.annotationMode !== 'comments') return false;
    const currentUser = getCurrentUserIdentity();
    const currentProfileId = `${currentUser?.profileId || ''}`.trim();
    const authorProfileId = `${message.authorProfileId ?? ''}`.trim();
    return Boolean(currentProfileId && authorProfileId && currentProfileId === authorProfileId);
  }

  function getCommentEditorKey(threadId, commentId) {
    return `${threadId || ''}::${commentId || ''}`;
  }

  function isEditingComment(threadId, commentId) {
    return activeCommentEditor?.threadId === threadId
      && activeCommentEditor?.commentId === commentId;
  }

  function openCommentEditor(threadId, commentId, text) {
    if (pendingCommentEditIds.size) return false;
    activeCommentEditor = {
      threadId,
      commentId,
      draft: text || '',
    };
    return true;
  }

  function focusCommentEditor(threadId, commentId) {
    window.requestAnimationFrame(() => {
      const input = annotationUI.panelEl?.querySelector(
        `.annotation-panel-edit-input[data-thread-id="${threadId}"][data-comment-id="${commentId}"]`,
      );
      if (!(input instanceof HTMLTextAreaElement)) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  function closeCommentEditor() {
    activeCommentEditor = null;
  }

  function updateCommentEditorDraft(value) {
    if (!activeCommentEditor) return;
    activeCommentEditor = {
      ...activeCommentEditor,
      draft: value,
    };
  }

  function setCommentEditPending(threadId, commentId, isPending) {
    const key = getCommentEditorKey(threadId, commentId);
    if (isPending) {
      pendingCommentEditIds.add(key);
    } else {
      pendingCommentEditIds.delete(key);
    }

    const textArea = annotationUI.panelEl?.querySelector(
      `.annotation-panel-edit-input[data-thread-id="${threadId}"][data-comment-id="${commentId}"]`,
    );
    const saveBtn = annotationUI.panelEl?.querySelector(
      `.annotation-panel-edit-save-btn[data-thread-id="${threadId}"][data-comment-id="${commentId}"]`,
    );
    const cancelBtn = annotationUI.panelEl?.querySelector(
      `.annotation-panel-edit-cancel-btn[data-thread-id="${threadId}"][data-comment-id="${commentId}"]`,
    );
    const form = textArea?.closest('.annotation-panel-edit-form')
      || saveBtn?.closest('.annotation-panel-edit-form')
      || cancelBtn?.closest('.annotation-panel-edit-form');

    if (form instanceof HTMLElement) {
      form.classList.toggle('is-submitting', isPending);
      form.setAttribute('aria-busy', `${isPending}`);
    }
    if (textArea instanceof HTMLTextAreaElement) {
      textArea.readOnly = isPending;
    }
    if (saveBtn instanceof HTMLButtonElement) {
      saveBtn.disabled = isPending;
    }
    if (cancelBtn instanceof HTMLButtonElement) {
      cancelBtn.disabled = isPending;
    }
  }

  function createCommentEditForm(threadId, commentId, draft, isReply = false) {
    const editorFieldId = `annotation-panel-edit-input-${threadId}-${commentId}`;
    const editForm = document.createElement('div');
    editForm.className = isReply
      ? 'annotation-panel-edit-form annotation-panel-edit-form-reply'
      : 'annotation-panel-edit-form';

    const input = document.createElement('textarea');
    input.className = 'annotation-panel-edit-input';
    input.id = editorFieldId;
    input.name = editorFieldId;
    input.dataset.threadId = threadId;
    input.dataset.commentId = commentId;
    input.placeholder = ANNOTATION_MESSAGES.editCommentPlaceholder;
    input.value = draft || '';

    const actions = document.createElement('div');
    actions.className = 'annotation-panel-edit-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'annotation-panel-edit-cancel-btn';
    cancelBtn.dataset.threadId = threadId;
    cancelBtn.dataset.commentId = commentId;
    cancelBtn.setAttribute('aria-label', ANNOTATION_MESSAGES.cancelCommentAction);
    cancelBtn.setAttribute('title', ANNOTATION_MESSAGES.cancelCommentAction);
    cancelBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6L18 18M18 6L6 18"></path>
      </svg>
    `;

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'annotation-panel-edit-save-btn';
    saveBtn.dataset.threadId = threadId;
    saveBtn.dataset.commentId = commentId;
    saveBtn.setAttribute('aria-label', ANNOTATION_MESSAGES.saveCommentAction);
    saveBtn.setAttribute('title', ANNOTATION_MESSAGES.saveCommentAction);
    saveBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5L9.5 17L19 7.5"></path>
      </svg>
    `;

    actions.append(cancelBtn, saveBtn);
    editForm.append(input, actions);
    return editForm;
  }

  function isCommentsServiceAvailable() {
    return annotationService.isAvailable();
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
      empty.textContent = ANNOTATION_MESSAGES.noAssets;
      annotationUI.panelListEl.appendChild(empty);
      return;
    }

    if (!isCommentsServiceAvailable()) {
      const empty = document.createElement('div');
      empty.className = 'annotation-comments-empty annotation-comments-empty-warning';
      empty.innerHTML = `
        <strong>${ANNOTATION_MESSAGES.collabUnavailableTitle}</strong>
        <span>${ANNOTATION_MESSAGES.collabUnavailableDescription}</span>
      `;
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
        ? ANNOTATION_MESSAGES.noComments
        : ANNOTATION_MESSAGES.noEdits;
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
          statusControls.append(statusSelect);
          if (isCommentEditableByCurrentUser(group.comment)) {
            const editThreadBtn = document.createElement('button');
            editThreadBtn.type = 'button';
            editThreadBtn.className = 'annotation-panel-edit-btn';
            editThreadBtn.dataset.action = 'edit-comment';
            editThreadBtn.dataset.threadId = thread.id;
            editThreadBtn.dataset.commentId = group.comment.id || '';
            editThreadBtn.setAttribute('aria-label', ANNOTATION_MESSAGES.editCommentAriaLabel);
            editThreadBtn.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 17.25V21h3.75L19.81 7.94l-3.75-3.75z"></path>
            </svg>
          `;
            statusControls.append(editThreadBtn);
          }
          card.append(statusControls);
        }

        const username = document.createElement('p');
        username.className = 'annotation-panel-comment-user';
        username.textContent = group.comment.username
          || thread.username
          || ANNOTATION_DEFAULT_USERNAME;

        const isEditingRootComment = isEditingComment(thread.id, group.comment.id || '');
        if (isEditingRootComment) {
          const editForm = createCommentEditForm(
            thread.id,
            group.comment.id || '',
            activeCommentEditor?.draft || '',
          );
          card.append(username, editForm);
        } else {
          const text = document.createElement('p');
          text.className = 'annotation-panel-comment-text';
          text.textContent = group.comment.text || '';
          card.append(username, text);
        }

        const repliesWrap = document.createElement('div');
        repliesWrap.className = 'annotation-panel-replies-list';
        group.replies.forEach((reply) => {
          const replyRow = document.createElement('div');
          replyRow.className = 'annotation-panel-reply-row';

          const isEditingReply = isEditingComment(thread.id, reply.id || '');
          if (isEditingReply) {
            const editForm = createCommentEditForm(
              thread.id,
              reply.id || '',
              activeCommentEditor?.draft || '',
              true,
            );
            replyRow.append(editForm);
          } else {
            const replyText = document.createElement('p');
            replyText.className = 'annotation-panel-reply-text';
            const replyUsername = document.createElement('span');
            replyUsername.className = 'annotation-panel-reply-user';
            replyUsername.textContent = reply.username || ANNOTATION_DEFAULT_USERNAME;
            replyText.append(replyUsername, document.createTextNode(reply.text || ''));
            replyRow.append(replyText);
          }

          if (showComments && isCommentEditableByCurrentUser(reply) && !isEditingReply) {
            const replyEditBtn = document.createElement('button');
            replyEditBtn.type = 'button';
            replyEditBtn.className = 'annotation-panel-edit-btn annotation-panel-edit-btn-reply';
            replyEditBtn.dataset.action = 'edit-comment';
            replyEditBtn.dataset.threadId = thread.id;
            replyEditBtn.dataset.commentId = reply.id || '';
            replyEditBtn.setAttribute('aria-label', ANNOTATION_MESSAGES.editCommentAriaLabel);
            replyEditBtn.innerHTML = `
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 17.25V21h3.75L19.81 7.94l-3.75-3.75z"></path>
              </svg>
            `;
            replyRow.append(replyEditBtn);
          }
          repliesWrap.appendChild(replyRow);
        });

        card.append(repliesWrap);

        if (showComments) {
          const replyFieldId = `annotation-panel-reply-input-${thread.id}-${group.comment.id || 'root'}`;
          const replyComposer = document.createElement('div');
          replyComposer.className = 'annotation-panel-reply-composer';
          replyComposer.innerHTML = `
            <input type="text" id="${replyFieldId}" name="${replyFieldId}" class="annotation-panel-reply-input" data-thread-id="${thread.id}" data-comment-id="${group.comment.id || ''}" placeholder="Reply..." />
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

  function clearThreadTargetCache() {
    if (!(annotationState.threadTargetCache instanceof Map)) {
      annotationState.threadTargetCache = new Map();
      return;
    }
    annotationState.threadTargetCache.clear();
  }

  function resolveThreadTargets() {
    clearThreadTargetCache();
    annotationState.store.threads.forEach((thread) => {
      if (!thread?.id) return;
      annotationState.threadTargetCache.set(thread.id, store.getElementForThread(thread));
    });
  }

  function getCachedThreadTarget(thread) {
    if (!thread?.id) return null;
    if (!(annotationState.threadTargetCache instanceof Map)) {
      annotationState.threadTargetCache = new Map();
    }

    const cachedTarget = annotationState.threadTargetCache.get(thread.id);
    if (
      cachedTarget instanceof HTMLElement
      && annotationUI.mainEl?.contains(cachedTarget)
    ) {
      return cachedTarget;
    }

    if (annotationState.threadTargetCache.has(thread.id) && cachedTarget === null) {
      return null;
    }

    const resolvedTarget = store.getElementForThread(thread);
    annotationState.threadTargetCache.set(thread.id, resolvedTarget);
    return resolvedTarget;
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

  function renderThreadMarkers({ resolveTargets = false } = {}) {
    if (!annotationUI.layerEl || !annotationUI.mainEl) return;
    if (resolveTargets) resolveThreadTargets();
    const occupiedMarkerSlots = new Set();
    const MARKER_STEP = 28;
    const MIN_MARKER_LEFT = 8;

    annotationUI.mainEl.querySelectorAll('[data-annotation-count]').forEach((el) => {
      el.classList.remove('annotation-has-comments');
      el.removeAttribute('data-annotation-count');
    });
    clearMarkers();
    if (annotationUI.annotationMode === 'assets') return;

    const markerThreadType = annotationUI.inlineMode ? 'edit' : 'comment';

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
        const targetEl = getCachedThreadTarget(thread);
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

  function getReplyComposerKey(threadId, commentId = '') {
    return `${threadId || ''}::${commentId || ''}`;
  }

  function setPanelReplyPending(threadId, commentId, isPending) {
    const key = getReplyComposerKey(threadId, commentId);
    if (isPending) {
      pendingReplyComposerKeys.add(key);
    } else {
      pendingReplyComposerKeys.delete(key);
    }

    const input = annotationUI.panelEl?.querySelector(
      `.annotation-panel-reply-input[data-thread-id="${threadId}"][data-comment-id="${commentId || ''}"]`,
    );
    const button = annotationUI.panelEl?.querySelector(
      `.annotation-panel-reply-btn[data-thread-id="${threadId}"][data-comment-id="${commentId || ''}"]`,
    );
    const composer = input?.closest('.annotation-panel-reply-composer')
      || button?.closest('.annotation-panel-reply-composer');

    if (composer instanceof HTMLElement) {
      composer.classList.toggle('is-submitting', isPending);
      composer.setAttribute('aria-busy', `${isPending}`);
    }
    if (input instanceof HTMLInputElement) {
      input.readOnly = isPending;
    }
    if (button instanceof HTMLButtonElement) {
      button.disabled = isPending;
    }
  }

  function setPopupSubmitPending(isPending) {
    popupSubmitPending = isPending;

    if (!(annotationUI.popupEl instanceof HTMLElement)) return;

    annotationUI.popupEl.classList.toggle('is-submitting', isPending);
    annotationUI.popupEl.setAttribute('aria-busy', `${isPending}`);

    const input = annotationUI.popupEl.querySelector('.annotation-reply-input');
    const sendBtn = annotationUI.popupEl.querySelector('.annotation-reply-btn');
    const closeBtn = annotationUI.popupEl.querySelector('.annotation-popup-close');

    if (input instanceof HTMLTextAreaElement) {
      input.readOnly = isPending;
    }
    if (sendBtn instanceof HTMLButtonElement) {
      sendBtn.disabled = isPending;
    }
    if (closeBtn instanceof HTMLButtonElement) {
      closeBtn.disabled = isPending;
    }
  }

  async function submitPanelReply(threadId, commentId, rawValue) {
    if (!isCommentsServiceAvailable()) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.commentsUnavailableSnackbar);
      return;
    }
    const composerKey = getReplyComposerKey(threadId, commentId);
    if (pendingReplyComposerKeys.has(composerKey)) return;

    const value = (rawValue || '').trim();
    if (!value) return;
    const thread = store.getThreadById(threadId);
    if (!thread) return;
    let activeThread = thread;
    let didPersistToService = false;
    let didHydrateThread = false;

    setPanelReplyPending(threadId, commentId, true);
    try {
      const result = await annotationService.createReply(threadId, value);
      if (result?.persisted) {
        didPersistToService = true;
      }
      if (result?.thread) {
        store.upsertThread(result.thread);
        activeThread = store.getThreadById(result.thread.id) || thread;
        didHydrateThread = true;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Could not save reply to service', error);
    }

    if (!didPersistToService) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.sendReplyError);
      setPanelReplyPending(threadId, commentId, false);
      return;
    }

    hideGlobalSnackbar();
    annotationState.activeThreadId = activeThread.id;
    annotationState.activeMessageId = commentId || getRootComment(activeThread)?.id || '';
    setPanelReplyPending(threadId, commentId, false);
    if (didHydrateThread) {
      store.saveAnnotationStore();
      renderThreadMarkers({ resolveTargets: true });
      renderCommentsPanel();
      scrollCommentsPanelToBottom();
      return;
    }

    renderCommentsPanel();
    refreshThreadsFromServiceInBackground();
  }

  function removePopup() {
    popupSubmitPending = false;
    if (!annotationUI.popupEl) return;
    annotationUI.popupEl.remove();
    annotationUI.popupEl = null;
  }

  function closePopupAndSelection() {
    store.clearSelectedElement();
    removePopup();
  }

  async function submitCommentEdit(threadId, commentId, rawValue) {
    if (!isCommentsServiceAvailable()) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.commentsUnavailableSnackbar);
      return;
    }
    const editKey = getCommentEditorKey(threadId, commentId);
    if (pendingCommentEditIds.has(editKey)) return;

    const thread = store.getThreadById(threadId);
    const message = thread?.messages?.find((item) => item.id === commentId);
    if (!thread || !message || !isCommentEditableByCurrentUser(message)) return;

    const nextValue = `${rawValue || ''}`.trim();
    const previousValue = `${message.text || ''}`.trim();
    if (!nextValue || nextValue === previousValue) {
      closeCommentEditor();
      renderCommentsPanel();
      return;
    }

    setCommentEditPending(threadId, commentId, true);
    try {
      const result = await annotationService.updateComment(commentId, nextValue, threadId);
      if (!result?.persisted) throw new Error('Comment update failed');
      if (result.thread) {
        store.upsertThread(result.thread);
      } else {
        message.text = nextValue;
      }
      hideGlobalSnackbar();
      closeCommentEditor();
      annotationState.activeThreadId = threadId;
      annotationState.activeMessageId = commentId;
      store.saveAnnotationStore();
      renderThreadMarkers({ resolveTargets: true });
      renderCommentsPanel();
      scrollThreadInPanel(threadId, commentId);
      if (!result.thread) {
        refreshThreadsFromServiceInBackground();
      }
    } catch (error) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.saveCommentError);
      // eslint-disable-next-line no-console
      console.warn('Could not update comment in service', error);
      setCommentEditPending(threadId, commentId, false);
      return;
    }

    setCommentEditPending(threadId, commentId, false);
  }

  async function submitPopupMessage() {
    if (!isCommentsServiceAvailable()) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.commentsUnavailableSnackbar);
      return;
    }
    if (popupSubmitPending) return;
    if (
      !annotationUI.popupEl
      || !annotationState.selectedElement
      || !annotationState.selectedElementPath
    ) return;
    const input = annotationUI.popupEl.querySelector('.annotation-reply-input');
    if (!(input instanceof HTMLTextAreaElement)) return;

    const value = input.value.trim();
    if (!value) return;

    let thread = store.getCommentThreadByElement(annotationState.selectedElement);
    const isReply = Boolean(thread);
    let didPersistToService = false;
    let didHydrateThread = false;
    setPopupSubmitPending(true);
    try {
      if (!thread) {
        const remoteThread = await annotationService.createThread({
          elementPath: annotationState.selectedElementPath,
          body: value,
          quotedText: annotationState.selectedElement.textContent?.trim() || null,
        });
        if (remoteThread) {
          store.upsertThread(remoteThread);
          thread = store.getThreadById(remoteThread.id);
          didPersistToService = true;
        }
      } else {
        const result = await annotationService.createReply(thread.id, value);
        if (result?.persisted) {
          didPersistToService = true;
        }
        if (result?.thread) {
          store.upsertThread(result.thread);
          thread = store.getThreadById(result.thread.id);
          didHydrateThread = true;
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Could not save comment thread to service', error);
    }

    if (!didPersistToService || !thread) {
      showGlobalSnackbar(
        isReply
          ? ANNOTATION_MESSAGES.sendReplyError
          : ANNOTATION_MESSAGES.postCommentError,
      );
      setPopupSubmitPending(false);
      return;
    }

    hideGlobalSnackbar();
    const latest = thread.messages[thread.messages.length - 1];
    annotationState.activeMessageId = getRootComment(thread)?.id || latest?.id || '';
    annotationState.activeThreadId = thread.id;
    setPopupSubmitPending(false);
    closePopupAndSelection();
    if (didHydrateThread || !isReply) {
      store.saveAnnotationStore();
      renderThreadMarkers({ resolveTargets: true });
      renderCommentsPanel();
      scrollCommentsPanelToBottom();
      return;
    }

    renderCommentsPanel();
    refreshThreadsFromServiceInBackground();
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
    const panelRect = annotationUI.panelEl?.getBoundingClientRect();
    const maxPopupRight = panelRect ? Math.max(24, panelRect.left - 12) : window.innerWidth - 12;
    const maxPopupWidth = Math.max(220, maxPopupRight - 24);
    annotationUI.popupEl.style.maxWidth = `${maxPopupWidth}px`;

    const rect = anchorElement.getBoundingClientRect();
    const popupWidth = Math.min(annotationUI.popupEl.offsetWidth || 320, maxPopupWidth);
    const popupHeight = annotationUI.popupEl.offsetHeight || 260;

    let left = rect.right + 12;
    if (left + popupWidth > maxPopupRight) {
      left = rect.left - popupWidth - 12;
    }
    left = Math.max(12, Math.min(left, maxPopupRight - popupWidth));

    let { top } = rect;
    top = Math.max(12, Math.min(top, window.innerHeight - popupHeight - 12));

    annotationUI.popupEl.style.left = `${left}px`;
    annotationUI.popupEl.style.top = `${top}px`;
  }

  function openPopupForElement(element, shouldScroll = false) {
    if (popupSubmitPending) return;
    if (!annotationUI.layerEl) return;
    setSelectedElement(element);
    const thread = store.getCommentThreadByElement(annotationState.selectedElement);
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
    title.textContent = thread ? 'Reply' : 'Comment';

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
    const popupFieldId = `annotation-popup-input-${thread?.id || 'new'}`;
    composer.innerHTML = `
      <textarea id="${popupFieldId}" name="${popupFieldId}" class="annotation-reply-input" placeholder="${thread ? 'Write a reply...' : 'Write a comment...'}"></textarea>
      <button type="button" class="annotation-reply-btn" aria-label="${thread ? 'Send reply' : 'Send comment'}">
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

  function scheduleFloatingUISync() {
    if (annotationState.floatingUiFrameId) return;
    annotationState.floatingUiFrameId = window.requestAnimationFrame(() => {
      annotationState.floatingUiFrameId = null;
      syncFloatingUI();
    });
  }

  refreshThreadsFromService = async function refreshThreadsFromServiceImpl() {
    if (!isCommentsServiceAvailable()) {
      renderCommentsPanel();
      return;
    }
    try {
      const remoteThreads = await annotationService.listThreads();
      if (!Array.isArray(remoteThreads)) return;
      store.replaceThreadsByType(
        'comment',
        remoteThreads.filter((thread) => store.getThreadType(thread) === 'comment'),
      );
      store.replaceThreadsByType(
        'edit',
        remoteThreads.filter((thread) => store.getThreadType(thread) === 'edit'),
      );
      clearThreadTargetCache();
      renderThreadMarkers({ resolveTargets: true });
      renderCommentsPanel();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Could not load annotation threads from service', error);
    }
  };

  function teardownGlobalListeners() {
    hideGlobalSnackbar();
    closeCommentEditor();
    if (annotationState.commentThreadPollId) {
      window.clearInterval(annotationState.commentThreadPollId);
      annotationState.commentThreadPollId = null;
    }
    if (annotationState.floatingUiFrameId) {
      window.cancelAnimationFrame(annotationState.floatingUiFrameId);
      annotationState.floatingUiFrameId = null;
    }
    if (annotationUI.mainEl && annotationState.mainScrollHandler) {
      annotationUI.mainEl.removeEventListener('scroll', annotationState.mainScrollHandler);
      annotationState.mainScrollHandler = null;
    }
    if (annotationUI.mainEl && annotationState.mainClickHandler) {
      annotationUI.mainEl.removeEventListener('click', annotationState.mainClickHandler, true);
      annotationState.mainClickHandler = null;
    }
    if (annotationUI.layerEl && annotationState.layerClickHandler) {
      annotationUI.layerEl.removeEventListener('click', annotationState.layerClickHandler);
      annotationState.layerClickHandler = null;
    }
    if (annotationUI.panelEl && annotationState.panelClickHandler) {
      annotationUI.panelEl.removeEventListener('click', annotationState.panelClickHandler);
      annotationState.panelClickHandler = null;
    }
    if (annotationUI.panelEl && annotationState.panelInputHandler) {
      annotationUI.panelEl.removeEventListener('input', annotationState.panelInputHandler);
      annotationState.panelInputHandler = null;
    }
    if (annotationUI.panelEl && annotationState.panelKeydownHandler) {
      annotationUI.panelEl.removeEventListener('keydown', annotationState.panelKeydownHandler);
      annotationState.panelKeydownHandler = null;
    }
    if (annotationUI.panelEl && annotationState.panelChangeHandler) {
      annotationUI.panelEl.removeEventListener('change', annotationState.panelChangeHandler);
      annotationState.panelChangeHandler = null;
    }
    if (annotationUI.inlineToggleEl && annotationState.inlineToggleChangeHandler) {
      annotationUI.inlineToggleEl.removeEventListener('change', annotationState.inlineToggleChangeHandler);
      annotationState.inlineToggleChangeHandler = null;
    }
    if (annotationUI.inlineCommentsToggleEl && annotationState.inlineCommentsToggleChangeHandler) {
      annotationUI.inlineCommentsToggleEl.removeEventListener(
        'change',
        annotationState.inlineCommentsToggleChangeHandler,
      );
      annotationState.inlineCommentsToggleChangeHandler = null;
    }
    if (annotationUI.inlineAssetsToggleEl && annotationState.inlineAssetsToggleChangeHandler) {
      annotationUI.inlineAssetsToggleEl.removeEventListener(
        'change',
        annotationState.inlineAssetsToggleChangeHandler,
      );
      annotationState.inlineAssetsToggleChangeHandler = null;
    }
    if (annotationState.documentClickHandler) {
      document.removeEventListener('click', annotationState.documentClickHandler);
      annotationState.documentClickHandler = null;
    }
    if (annotationState.windowResizeHandler) {
      window.removeEventListener('resize', annotationState.windowResizeHandler);
      annotationState.windowResizeHandler = null;
    }
  }

  async function setupAnnotationUI(mainEl) {
    teardownGlobalListeners();
    annotationUI.mainEl = mainEl;
    ensureFloatingLayer();
    ensureCommentsPanel();
    store.loadAnnotationStore();
    store.rebindThreadsToCurrentDom();
    store.saveAnnotationStore();
    renderThreadMarkers({ resolveTargets: true });
    renderCommentsPanel();
    await refreshThreadsFromService();
    if (isCommentsServiceAvailable()) {
      annotationState.commentThreadPollId = window.setInterval(() => {
        refreshThreadsFromService();
      }, ANNOTATION_COMMENT_THREAD_POLL_INTERVAL_MS);
    }

    annotationState.mainClickHandler = (event) => {
      if (annotationUI.inlineMode) return;
      if (annotationUI.annotationMode === 'assets') return;
      if (!isCommentsServiceAvailable()) return;
      if (popupSubmitPending) return;
      const { target } = event;
      if (!(target instanceof HTMLElement)) return;
      if (target === mainEl) return;
      if (target.closest('a')) event.preventDefault();
      event.stopPropagation();
      openPopupForElement(target);
    };
    mainEl.addEventListener('click', annotationState.mainClickHandler, true);

    annotationState.layerClickHandler = (event) => {
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
    };
    annotationUI.layerEl.addEventListener('click', annotationState.layerClickHandler);

    annotationState.panelClickHandler = (event) => {
      const { target } = event;
      if (!(target instanceof Element)) return;
      if (target.closest('.annotation-inline-edit-switcher')) return;
      if (!isCommentsServiceAvailable()) return;
      const card = target.closest('.annotation-panel-comment');

      if (annotationUI.inlineMode) {
        if (!(card instanceof HTMLElement)) return;
        const thread = store.getThreadById(card.dataset.threadId);
        if (!thread) return;
        const targetEl = store.getElementForThread(thread);
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

      if (target.closest('.annotation-panel-edit-save-btn')) {
        const saveBtn = target.closest('.annotation-panel-edit-save-btn');
        if (!(saveBtn instanceof HTMLButtonElement)) return;
        const { threadId, commentId } = saveBtn.dataset;
        if (!threadId || !commentId) return;
        const input = annotationUI.panelEl.querySelector(
          `.annotation-panel-edit-input[data-thread-id="${threadId}"][data-comment-id="${commentId}"]`,
        );
        if (!(input instanceof HTMLTextAreaElement)) return;
        submitCommentEdit(threadId, commentId, input.value);
        return;
      }

      if (target.closest('.annotation-panel-edit-cancel-btn')) {
        closeCommentEditor();
        renderCommentsPanel();
        return;
      }

      if (target.closest('.annotation-panel-edit-btn')) {
        const editBtn = target.closest('.annotation-panel-edit-btn');
        if (!(editBtn instanceof HTMLButtonElement)) return;
        const { threadId, commentId } = editBtn.dataset;
        if (!threadId || !commentId) return;
        const thread = store.getThreadById(threadId);
        const message = thread?.messages?.find((item) => item.id === commentId);
        if (!message || !isCommentEditableByCurrentUser(message)) return;
        if (!openCommentEditor(threadId, commentId, message.text || '')) return;
        renderCommentsPanel();
        focusCommentEditor(threadId, commentId);
        return;
      }

      if (target.closest('.annotation-panel-reply-input')) return;
      if (target.closest('.annotation-panel-edit-form')) return;
      if (target.closest('.annotation-panel-status-select')) return;
      if (!(card instanceof HTMLElement)) return;

      const thread = store.getThreadById(card.dataset.threadId);
      if (!thread) return;
      annotationState.activeEditId = '';
      annotationState.activeMessageId = card.dataset.messageId || '';
      const targetEl = store.getElementForThread(thread);
      if (!targetEl) return;
      openPopupForElement(targetEl, true);
    };
    annotationUI.panelEl.addEventListener('click', annotationState.panelClickHandler);

    annotationState.panelInputHandler = (event) => {
      const { target } = event;
      if (!(target instanceof HTMLTextAreaElement)) return;
      if (!target.classList.contains('annotation-panel-edit-input')) return;
      updateCommentEditorDraft(target.value);
    };
    annotationUI.panelEl.addEventListener('input', annotationState.panelInputHandler);

    annotationState.panelKeydownHandler = (event) => {
      if (annotationUI.inlineMode) return;
      if (!isCommentsServiceAvailable()) return;
      const { target } = event;
      if (target instanceof HTMLInputElement && target.classList.contains('annotation-panel-reply-input')) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        submitPanelReply(target.dataset.threadId, target.dataset.commentId, target.value);
        return;
      }
      if (!(target instanceof HTMLTextAreaElement)) return;
      if (!target.classList.contains('annotation-panel-edit-input')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCommentEditor();
        renderCommentsPanel();
        return;
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submitCommentEdit(target.dataset.threadId, target.dataset.commentId, target.value);
      }
    };
    annotationUI.panelEl.addEventListener('keydown', annotationState.panelKeydownHandler);

    annotationState.panelChangeHandler = async (event) => {
      const { target } = event;
      if (target instanceof HTMLInputElement && target.classList.contains('annotation-inline-mode-radio')) return;
      if (annotationUI.inlineMode) return;
      if (!isCommentsServiceAvailable()) return;
      if (!(target instanceof HTMLSelectElement)) return;
      if (!target.classList.contains('annotation-panel-status-select')) return;
      const { threadId } = target.dataset;
      if (!threadId) return;
      const thread = store.getThreadById(threadId);
      if (!thread) return;
      const previousStatus = thread.status;
      const nextStatus = target.value;
      target.value = previousStatus;
      target.disabled = true;
      annotationState.activeThreadId = thread.id;
      annotationState.activeMessageId = '';
      try {
        const remoteThread = await annotationService.updateThreadStatus(threadId, nextStatus);
        if (!remoteThread) return;
        store.upsertThread(remoteThread);
        hideGlobalSnackbar();
        store.saveAnnotationStore();
        renderThreadMarkers({ resolveTargets: true });
        renderCommentsPanel();
      } catch (error) {
        showGlobalSnackbar(ANNOTATION_MESSAGES.updateStatusError);
        target.value = previousStatus;
        renderCommentsPanel();
        // eslint-disable-next-line no-console
        console.warn('Could not update thread status in service', error);
      } finally {
        target.disabled = false;
      }
    };
    annotationUI.panelEl.addEventListener('change', annotationState.panelChangeHandler);

    annotationState.documentClickHandler = (event) => {
      if (annotationUI.inlineMode) return;
      if (popupSubmitPending) return;
      const { target } = event;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('.annotation-floating-popup')) return;
      if (target.closest('.annotation-thread-marker')) return;
      if (target.closest('.annotation-comments-panel')) return;
      if (target.closest('main')) return;
      closePopupAndSelection();
    };
    document.addEventListener('click', annotationState.documentClickHandler);

    annotationState.mainScrollHandler = scheduleFloatingUISync;
    annotationState.windowResizeHandler = scheduleFloatingUISync;
    mainEl.addEventListener('scroll', annotationState.mainScrollHandler);
    window.addEventListener('resize', annotationState.windowResizeHandler);

    if (annotationUI.inlineToggleEl) {
      annotationState.inlineToggleChangeHandler = async (event) => {
        const { target } = event;
        if (!(target instanceof HTMLInputElement) || !target.checked) return;
        if (!isCommentsServiceAvailable()) {
          target.checked = false;
          if (annotationUI.inlineCommentsToggleEl) {
            annotationUI.inlineCommentsToggleEl.checked = true;
          }
          annotationUI.annotationMode = 'comments';
          showGlobalSnackbar(ANNOTATION_MESSAGES.collabUnavailableSnackbar);
          return;
        }
        target.disabled = true;
        try {
          closeCommentEditor();
          annotationUI.annotationMode = 'edit';
          if (annotationUI.inlineAssetsToggleEl) annotationUI.inlineAssetsToggleEl.checked = false;
          const didEnable = await enableInlineEditMode();
          if (!didEnable) {
            throw new Error('Inline edit mode unavailable');
          }
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
      };
      annotationUI.inlineToggleEl.addEventListener('change', annotationState.inlineToggleChangeHandler);
    }

    if (annotationUI.inlineCommentsToggleEl) {
      annotationState.inlineCommentsToggleChangeHandler = async (event) => {
        const { target } = event;
        if (!(target instanceof HTMLInputElement) || !target.checked) return;
        closeCommentEditor();
        annotationUI.annotationMode = 'comments';
        await disableInlineEditMode();
        if (annotationUI.inlineToggleEl) annotationUI.inlineToggleEl.checked = false;
        if (annotationUI.inlineAssetsToggleEl) annotationUI.inlineAssetsToggleEl.checked = false;
        renderCommentsPanel();
      };
      annotationUI.inlineCommentsToggleEl.addEventListener(
        'change',
        annotationState.inlineCommentsToggleChangeHandler,
      );
    }

    if (annotationUI.inlineAssetsToggleEl) {
      annotationState.inlineAssetsToggleChangeHandler = async (event) => {
        const { target } = event;
        if (!(target instanceof HTMLInputElement) || !target.checked) return;
        closeCommentEditor();
        annotationUI.annotationMode = 'assets';
        await disableInlineEditMode();
        if (annotationUI.inlineToggleEl) annotationUI.inlineToggleEl.checked = false;
        if (annotationUI.inlineCommentsToggleEl) {
          annotationUI.inlineCommentsToggleEl.checked = false;
        }
        renderCommentsPanel();
      };
      annotationUI.inlineAssetsToggleEl.addEventListener(
        'change',
        annotationState.inlineAssetsToggleChangeHandler,
      );
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
