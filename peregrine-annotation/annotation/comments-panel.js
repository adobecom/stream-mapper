/* eslint-disable no-console */
/* eslint-disable no-use-before-define */
import {
  ANNOTATION_MESSAGES,
  ANNOTATION_DEFAULT_USERNAME,
  ANNOTATION_REFRESH_EVENT,
} from '../utils/constants.js';
import createAnnotationServiceClient from './service.js';
import requestParentCollabRefresh from './collab-sync.js';
import { hideGlobalSnackbar, showGlobalSnackbar } from '../utils/snackbar.js';
import {
  formatCardTimestamp,
  formatRelativeTime,
  getAvatarColor,
  getAvatarInitials,
  ARROW_ICON_SVG,
} from '../utils/utils.js';

const THREAD_STATUS_OPTIONS = Object.freeze(['Open', 'Accepted', 'Rejected', 'Closed']);

const MAX_LINK_DISPLAY_LENGTH = 60;

function truncateUrl(url) {
  if (url.length <= MAX_LINK_DISPLAY_LENGTH) return url;
  return `${url.slice(0, MAX_LINK_DISPLAY_LENGTH)}…`;
}

function linkifyText(str) {
  if (!str) return '';
  const escaped = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (match) => `<a href="${match}" target="_blank" rel="noopener noreferrer" title="${match}">${truncateUrl(match)}</a>`,
  );
}

export default function createCommentsPanelController({
  annotationState,
  annotationUI,
  store,
}) {
  const annotationService = createAnnotationServiceClient();
  let flushPendingCommentsPanelRefresh = () => {};
  let renderCommentsPanel = () => {};
  let popupSubmitPending = false;

  let activeCommentEditor = null;
  let popupDraft = '';
  let popupDraftKey = '';
  let pendingCommentsPanelRefresh = false;
  let reviewerStatusUpdatePending = false;
  const panelReplyDrafts = new Map();
  const pendingReplyComposerKeys = new Set();
  const pendingCommentEditIds = new Set();

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

  function updateModeButtonStates() {
  }

  function ensureCommentsPanel() {
    const existing = document.querySelector('.annotation-comments-panel');
    if (existing) existing.remove();

    const panel = document.createElement('aside');
    panel.className = 'annotation-comments-panel peregrine-collab-drawer';
    panel.innerHTML = `
      <div class="annotation-comments-panel-header">
        <span class="peregrine-collab-drawer-drag" title="Drag to move" aria-label="Drag to move panel">
          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
            <circle cx="3" cy="3" r="1.2" fill="currentColor"/><circle cx="7" cy="3" r="1.2" fill="currentColor"/>
            <circle cx="3" cy="8" r="1.2" fill="currentColor"/><circle cx="7" cy="8" r="1.2" fill="currentColor"/>
            <circle cx="3" cy="13" r="1.2" fill="currentColor"/><circle cx="7" cy="13" r="1.2" fill="currentColor"/>
          </svg>
        </span>
        <div class="annotation-comments-panel-heading">
          <h3>Activity</h3>
        </div>
        <button type="button" class="peregrine-collab-drawer-dock" aria-label="Dock to other side" title="Dock to other side">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/>
            <path d="M12 4v16" stroke="currentColor" stroke-width="1.7"/>
          </svg>
        </button>
        <button type="button" class="annotation-comments-panel-close-btn" aria-label="Close activity panel" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="peregrine-collab-search">
        <svg class="peregrine-collab-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/>
          <path d="M20 20l-3.2-3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <input type="search" class="peregrine-collab-search-input" placeholder="Search comments and authors…" aria-label="Search comments and authors" />
      </div>
      <div class="peregrine-collab-activity-filters" role="tablist">
        <button type="button" class="peregrine-collab-activity-chip is-active" data-filter="all">All</button>
        <button type="button" class="peregrine-collab-activity-chip" data-filter="mine">Mine</button>
        <button type="button" class="peregrine-collab-activity-chip" data-filter="others">Others</button>
      </div>
      <div class="annotation-comments-content">
        <div class="annotation-comments-list"></div>
        <div class="annotation-comments-disabled-overlay">Edit mode is on. Switch it off to add comments.</div>
      </div>
    `;
    document.body.appendChild(panel);
    annotationUI.panelEl = panel;
    annotationUI.panelListEl = panel.querySelector('.annotation-comments-list');

    panel.querySelector('.annotation-comments-panel-close-btn')
      ?.addEventListener('click', () => closeCommentsDrawer());

    panel.querySelector('.peregrine-collab-drawer-dock')
      ?.addEventListener('click', () => togglePanelSide());

    const searchInput = panel.querySelector('.peregrine-collab-search-input');
    if (searchInput instanceof HTMLInputElement) {
      searchInput.value = annotationState.searchQuery || '';
      searchInput.addEventListener('input', () => {
        annotationState.searchQuery = searchInput.value;
        renderCommentsPanel();
      });
    }

    panel.querySelectorAll('.peregrine-collab-activity-filters .peregrine-collab-activity-chip')
      .forEach((chip) => {
        chip.addEventListener('click', () => {
          annotationState.activityFilter = chip.dataset.filter || 'all';
          renderCommentsPanel();
        });
      });

    setupPanelDrag(panel);
    loadPanelPlacement();
    applyPanelPlacement();

    updateModeButtonStates();
    applyOwnerOnlyToggleState();
    applyDisableEditsState();
  }

  // ── Panel placement (dock left/right + drag to float) ───────────────────────

  const PANEL_STORAGE_PLACEMENT = 'peregrine-collab-panel-placement';
  const PANEL_STORAGE_FLOATPOS = 'peregrine-collab-panel-floatpos';
  const PANEL_DRAG_THRESHOLD = 4;
  const PANEL_SNAP_EDGE = 60;

  function loadPanelPlacement() {
    try {
      const placement = window.localStorage.getItem(PANEL_STORAGE_PLACEMENT);
      if (placement === 'left' || placement === 'right' || placement === 'floating') {
        annotationState.panelPlacement = placement;
        if (placement !== 'floating') annotationState.lastDockedSide = placement;
      }
      const rawPos = window.localStorage.getItem(PANEL_STORAGE_FLOATPOS);
      const pos = rawPos ? JSON.parse(rawPos) : null;
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        annotationState.panelFloatPos = pos;
      }
    } catch { /* ignore storage errors */ }
  }

  function savePanelPlacement() {
    try {
      window.localStorage.setItem(PANEL_STORAGE_PLACEMENT, annotationState.panelPlacement);
      if (annotationState.panelFloatPos) {
        window.localStorage.setItem(
          PANEL_STORAGE_FLOATPOS,
          JSON.stringify(annotationState.panelFloatPos),
        );
      }
    } catch { /* ignore storage errors */ }
  }

  function clampPanelFloatPos(x, y) {
    const width = annotationUI.panelEl?.offsetWidth || 380;
    const topbarH = 54;
    const minOnscreen = 80;
    return {
      x: Math.min(window.innerWidth - minOnscreen, Math.max(minOnscreen - width, x)),
      y: Math.min(window.innerHeight - 48, Math.max(topbarH + 4, y)),
    };
  }

  function applyPanelPlacement() {
    const panel = annotationUI.panelEl;
    if (!(panel instanceof HTMLElement)) return;
    const placement = annotationState.panelPlacement;
    panel.classList.toggle('peregrine-collab-dock-left', placement === 'left');
    panel.classList.toggle('peregrine-collab-floating', placement === 'floating');

    if (placement === 'floating') {
      const fallback = {
        x: Math.max(16, window.innerWidth - (panel.offsetWidth || 380) - 24),
        y: 70,
      };
      const clamped = clampPanelFloatPos(
        annotationState.panelFloatPos?.x ?? fallback.x,
        annotationState.panelFloatPos?.y ?? fallback.y,
      );
      annotationState.panelFloatPos = clamped;
      panel.style.setProperty('--pc-float-x', `${clamped.x}px`);
      panel.style.setProperty('--pc-float-y', `${clamped.y}px`);
    } else {
      panel.style.removeProperty('--pc-float-x');
      panel.style.removeProperty('--pc-float-y');
    }

    const dockBtn = panel.querySelector('.peregrine-collab-drawer-dock');
    if (dockBtn instanceof HTMLElement) {
      dockBtn.title = placement === 'left' ? 'Dock to right' : 'Dock to left';
    }
    scheduleFloatingUISync();
  }

  function togglePanelSide() {
    if (annotationState.panelPlacement === 'floating') {
      annotationState.panelPlacement = annotationState.lastDockedSide || 'right';
    } else {
      annotationState.panelPlacement = annotationState.panelPlacement === 'right' ? 'left' : 'right';
      annotationState.lastDockedSide = annotationState.panelPlacement;
    }
    applyPanelPlacement();
    savePanelPlacement();
  }

  function setupPanelDrag(panel) {
    const handle = panel.querySelector('.peregrine-collab-drawer-drag');
    if (!(handle instanceof HTMLElement)) return;
    let press = null;

    const onMove = (event) => {
      if (!press) return;
      const dx = event.clientX - press.startX;
      const dy = event.clientY - press.startY;
      if (!press.dragging) {
        if (Math.hypot(dx, dy) < PANEL_DRAG_THRESHOLD) return;
        press.dragging = true;
        panel.classList.add('is-dragging', 'peregrine-collab-floating');
        panel.classList.remove('peregrine-collab-dock-left');
        try { handle.setPointerCapture(press.pointerId); } catch { /* ignore */ }
      }
      const next = clampPanelFloatPos(press.originLeft + dx, press.originTop + dy);
      panel.style.setProperty('--pc-float-x', `${next.x}px`);
      panel.style.setProperty('--pc-float-y', `${next.y}px`);
    };

    const finish = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      if (!press) return;
      const wasDragging = press.dragging;
      press = null;
      panel.classList.remove('is-dragging');
      if (!wasDragging) return;
      const x = parseFloat(panel.style.getPropertyValue('--pc-float-x') || '0');
      const y = parseFloat(panel.style.getPropertyValue('--pc-float-y') || '0');
      const width = panel.offsetWidth || 380;
      if (x <= PANEL_SNAP_EDGE) {
        annotationState.panelPlacement = 'left';
        annotationState.lastDockedSide = 'left';
      } else if (x + width >= window.innerWidth - PANEL_SNAP_EDGE) {
        annotationState.panelPlacement = 'right';
        annotationState.lastDockedSide = 'right';
      } else {
        annotationState.panelPlacement = 'floating';
        annotationState.panelFloatPos = { x, y };
      }
      applyPanelPlacement();
      savePanelPlacement();
    };

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      const rect = panel.getBoundingClientRect();
      press = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: rect.left,
        originTop: rect.top,
        dragging: false,
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
      event.preventDefault();
    });
  }

  // Author names + message text for the drawer search filter.
  function buildThreadHaystack(item) {
    const parts = [];
    const thread = item?.thread;
    if (thread) {
      (thread.messages || []).forEach((message) => {
        if (message.username) parts.push(message.username);
        if (message.text) parts.push(message.text);
      });
      if (thread.status) parts.push(thread.status);
    }
    return parts.join(' ').toLowerCase();
  }

  const MARKER_CHECK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7.5" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const EYE_SHOW_ICON = `
    <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M12.306 4.28999C11.2818 3.76572 10.1505 3.48445 9 3.46799C4.668 3.46799 1.125 7.78099 1.125 9.17999C1.125 10.68 4.854 14.532 8.968 14.532C13.116 14.532 16.875 10.679 16.875 9.17999C16.875 7.99999 14.768 5.50999 12.306 4.28999ZM9 13.612C7.45329 13.612 5.9699 12.9976 4.87626 11.9039C3.78261 10.8103 3.16812 9.32693 3.16812 7.78022C3.16812 6.99999 3.9 6.99999 9 6.99999C13.612 6.99999 14.832 6.99999 14.832 7.78022C14.832 9.32693 14.2174 10.8103 13.1237 11.9039C12.0301 12.9976 10.5467 13.612 9 13.612Z" fill="currentColor"/>
      <circle cx="9" cy="9" r="2.4" fill="currentColor"/>
    </svg>`;
  const EYE_HIDE_ICON = `
    <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2.2 2.2 15.8 15.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M9 3.468C4.668 3.468 1.125 7.781 1.125 9.18c0 .78.9 2.02 2.4 3.16l1.5-1.5A3.83 3.83 0 0 1 9 5.35c.52 0 1.03.1 1.5.29l1.1-1.1A6.2 6.2 0 0 0 9 3.468Zm5.4 2.86-1.5 1.5A3.83 3.83 0 0 1 9 12.65c-.52 0-1.03-.1-1.5-.29l-1.1 1.1c.8.35 1.68.54 2.6.54 4.332 0 7.875-4.31 7.875-5.71 0-.78-.9-2.02-2.475-3.16Z" fill="currentColor"/>
    </svg>`;

  function setMarkupsHidden(hidden) {
    annotationState.markupsHidden = hidden;
    const layer = document.querySelector('.annotation-floating-layer');
    if (layer) layer.style.display = hidden ? 'none' : '';
    document.body.classList.toggle('peregrine-collab-markups-hidden', hidden);
    const btn = annotationUI.visibilityToggleEl;
    if (btn instanceof HTMLButtonElement) {
      btn.setAttribute('aria-pressed', String(hidden));
      btn.title = hidden ? 'Show markups' : 'Hide all markups';
      btn.innerHTML = hidden ? EYE_HIDE_ICON : EYE_SHOW_ICON;
    }
    if (hidden) hideBlockHover();
  }

  function applyOwnerOnlyToggleState() {}

  function applyDisableEditsState() {
    const noToken = !new URLSearchParams(window.location.search).get('token') && !window.streamConfig?.token;
    if (!window.streamConfig?.disableEdits && !noToken) return;
    const bar = annotationUI.topbarEl;
    if (!bar) return;
    bar.querySelectorAll('.peregrine-collab-topbar-btn').forEach((btn) => {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      }
    });
  }

  // ── Identity / collaborator helpers ─────────────────────────────────────────

  function getCollabSnapshot() {
    return annotationState.latestRemoteCollabSnapshot?.collab || null;
  }

  function getWorkspaceTitle() {
    const collab = getCollabSnapshot();
    return `${collab?.title || ''}`.trim() || 'Workspace';
  }

  function getCurrentUserKey() {
    const identity = getCurrentUserIdentity();
    const profileId = `${identity?.profileId ?? ''}`.trim();
    if (profileId) return `profile:${profileId}`;
    const name = `${window.streamConfig?.username || window.streamConfig?.userName || window.streamConfig?.userEmail || ''}`.trim().toLowerCase();
    return name ? `name:${name}` : '';
  }

  function isMessageByCurrentUser(message) {
    if (!message) return false;
    const identity = getCurrentUserIdentity();
    const currentProfileId = `${identity?.profileId ?? ''}`.trim();
    const authorProfileId = `${message.authorProfileId ?? ''}`.trim();
    if (currentProfileId && authorProfileId) return currentProfileId === authorProfileId;
    const currentName = `${window.streamConfig?.username || window.streamConfig?.userName || ''}`.trim().toLowerCase();
    const authorName = `${message.username || ''}`.trim().toLowerCase();
    return Boolean(currentName && authorName && currentName === authorName);
  }

  function isThreadMine(thread) {
    return (thread?.messages || []).some((message) => isMessageByCurrentUser(message));
  }

  function getCollaborators() {
    const collab = getCollabSnapshot();
    const participants = Array.isArray(collab?.participants) ? collab.participants : [];
    const seenNames = new Set();
    const people = [];
    const currentKey = getCurrentUserKey();

    participants.forEach((participant, index) => {
      if (!participant || typeof participant !== 'object') return;
      const profileId = getParticipantProfileId(participant);
      const displayName = getParticipantDisplayName(participant, index);
      // One icon per person — dedupe by display name (ignore duplicates).
      const nameKey = displayName.trim().toLowerCase();
      if (!nameKey || seenNames.has(nameKey)) return;
      seenNames.add(nameKey);
      const key = profileId ? `profile:${profileId}` : `name:${nameKey}`;
      people.push({
        key,
        name: displayName,
        role: normalizeRole(participant.role || participant.collabRole || participant.type),
        isCurrent: Boolean(currentKey) && key === currentKey,
      });
    });

    // Ensure the current user always appears — but only if not already present by name.
    const selfName = `${window.streamConfig?.username || window.streamConfig?.userName || window.streamConfig?.userEmail || 'You'}`.trim();
    if (currentKey && !seenNames.has(selfName.toLowerCase())) {
      seenNames.add(selfName.toLowerCase());
      people.unshift({
        key: currentKey,
        name: selfName,
        role: normalizeRole(window.streamConfig?.collabRole),
        isCurrent: true,
      });
    }
    // Current user first.
    people.sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));
    return people;
  }

  function buildAvatarEl(name, key, { size = 26, withDot = false, className = '' } = {}) {
    const avatar = document.createElement('span');
    avatar.className = `peregrine-collab-avatar${className ? ` ${className}` : ''}`;
    avatar.style.width = `${size}px`;
    avatar.style.height = `${size}px`;
    avatar.style.background = getAvatarColor(key || name);
    avatar.style.fontSize = `${Math.round(size * 0.42)}px`;
    avatar.textContent = getAvatarInitials(name);
    avatar.title = name;
    if (withDot) {
      const dot = document.createElement('span');
      dot.className = 'peregrine-collab-avatar-dot';
      avatar.appendChild(dot);
    }
    return avatar;
  }

  function buildResolvedAvatar(size = 22) {
    const avatar = document.createElement('span');
    avatar.className = 'peregrine-collab-avatar';
    avatar.style.width = `${size}px`;
    avatar.style.height = `${size}px`;
    avatar.style.background = '#2e9e6b';
    avatar.title = 'Resolved';
    avatar.innerHTML = MARKER_CHECK_ICON;
    return avatar;
  }

  // ── Top bar ─────────────────────────────────────────────────────────────────

  function ensureAnnotationTopbar() {
    const existing = document.querySelector('.peregrine-collab-topbar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.className = 'peregrine-collab-topbar';
    bar.setAttribute('role', 'banner');
    bar.innerHTML = `
      <div class="peregrine-collab-topbar-brand">
        <span class="peregrine-collab-topbar-glyph" aria-hidden="true">✦</span>
        <span class="peregrine-collab-topbar-title" title="">Workspace</span>
      </div>
      <div class="peregrine-collab-topbar-spacer"></div>
      <div class="peregrine-collab-topbar-presence" aria-label="Collaborators"></div>
      <button type="button" class="peregrine-collab-topbar-btn peregrine-collab-topbar-comments">
        <span class="peregrine-collab-topbar-btn-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5h16v11H8l-4 4V5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
        </span>
        <span>Comments</span>
        <span class="peregrine-collab-topbar-badge" hidden>0</span>
      </button>
      <button type="button" class="peregrine-collab-topbar-btn peregrine-collab-topbar-visibility" aria-pressed="false" aria-label="Hide all markups" title="Hide all markups"></button>
    `;
    document.body.appendChild(bar);

    annotationUI.topbarEl = bar;
    annotationUI.workspaceTitleEl = bar.querySelector('.peregrine-collab-topbar-title');
    annotationUI.presenceEl = bar.querySelector('.peregrine-collab-topbar-presence');
    annotationUI.commentsBtnEl = bar.querySelector('.peregrine-collab-topbar-comments');
    annotationUI.visibilityToggleEl = bar.querySelector('.peregrine-collab-topbar-visibility');

    setMarkupsHidden(false);

    annotationUI.visibilityToggleEl.addEventListener('click', () => {
      setMarkupsHidden(!annotationState.markupsHidden);
    });

    annotationUI.commentsBtnEl.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleCommentsDrawer('all');
    });

    renderWorkspaceTitle();
    renderPresence();
    updateCommentsBadge();
    applyDisableEditsState();
  }

  function renderWorkspaceTitle() {
    if (!(annotationUI.workspaceTitleEl instanceof HTMLElement)) return;
    const title = getWorkspaceTitle();
    annotationUI.workspaceTitleEl.textContent = title;
    annotationUI.workspaceTitleEl.title = title;
  }

  function renderPresence() {
    if (!(annotationUI.presenceEl instanceof HTMLElement)) return;
    const people = getCollaborators();
    annotationUI.presenceEl.innerHTML = '';
    const MAX_VISIBLE = 5;
    people.slice(0, MAX_VISIBLE).forEach((person) => {
      const avatar = buildAvatarEl(person.name, person.key, {
        size: 28,
        withDot: person.isCurrent,
        className: 'peregrine-collab-presence-avatar',
      });
      avatar.title = person.isCurrent ? `${person.name} (you)` : person.name;
      annotationUI.presenceEl.appendChild(avatar);
    });
    if (people.length > MAX_VISIBLE) {
      const more = document.createElement('span');
      more.className = 'peregrine-collab-avatar peregrine-collab-presence-avatar peregrine-collab-presence-more';
      more.style.width = '28px';
      more.style.height = '28px';
      more.textContent = `+${people.length - MAX_VISIBLE}`;
      annotationUI.presenceEl.appendChild(more);
    }

    // DEMO ONLY: extra placeholder collaborator. Remove before shipping.
    const demoAvatar = buildAvatarEl('User', 'demo-user', {
      size: 28,
      className: 'peregrine-collab-presence-avatar',
    });
    annotationUI.presenceEl.appendChild(demoAvatar);
  }

  function updateCommentsBadge() {
    const badge = annotationUI.topbarEl?.querySelector('.peregrine-collab-topbar-badge');
    if (!(badge instanceof HTMLElement)) return;
    const mineCount = annotationState.store.threads
      .filter((thread) => store.getThreadType(thread) === 'comment')
      .filter((thread) => isThreadMine(thread)).length;
    badge.textContent = String(mineCount);
    badge.hidden = mineCount === 0;
  }

  // ── Activity drawer (open/close) ────────────────────────────────────────────

  function isCommentsDrawerOpen() {
    return Boolean(annotationUI.panelEl?.classList.contains('is-open'));
  }

  function syncDrawerChrome() {
    const filter = annotationState.activityFilter || 'all';
    annotationUI.panelEl?.querySelectorAll('.peregrine-collab-activity-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.filter === filter);
    });
    const open = isCommentsDrawerOpen();
    annotationUI.commentsBtnEl?.classList.toggle('is-open', open);
  }

  function openCommentsDrawer(filter) {
    if (!annotationUI.panelEl) return;
    if (filter) annotationState.activityFilter = filter;
    annotationUI.panelEl.classList.add('is-open');
    document.body.classList.add('peregrine-collab-drawer-open');
    renderCommentsPanel();
    syncDrawerChrome();
    scheduleFloatingUISync();
  }

  function ensureCommentsDrawerOpen() {
    if (!isCommentsDrawerOpen()) openCommentsDrawer();
  }

  function closeCommentsDrawer() {
    if (!annotationUI.panelEl) return;
    annotationUI.panelEl.classList.remove('is-open');
    document.body.classList.remove('peregrine-collab-drawer-open');
    syncDrawerChrome();
    scheduleFloatingUISync();
  }

  function toggleCommentsDrawer(filter) {
    if (isCommentsDrawerOpen()
      && (!filter || filter === annotationState.activityFilter)) {
      closeCommentsDrawer();
      return;
    }
    openCommentsDrawer(filter);
  }

  // ── Block hover "add here" affordance ───────────────────────────────────────

  function resolveHoverBlock(target) {
    if (!(target instanceof HTMLElement) || !annotationUI.mainEl) return null;
    if (!annotationUI.mainEl.contains(target)) return null;
    // Prefer a Milo block (main > div > div); fall back to the section child.
    const block = target.closest('main > div > div') || target.closest('main > div');
    if (!(block instanceof HTMLElement)) return null;
    if (block === annotationUI.mainEl) return null;
    return block;
  }

  function showBlockHover(block) {
    if (annotationState.markupsHidden) return;
    if (annotationState.hoveredBlockEl === block) return;
    if (annotationState.hoveredBlockEl instanceof HTMLElement) {
      annotationState.hoveredBlockEl.classList.remove('peregrine-collab-block-hover');
    }
    annotationState.hoveredBlockEl = block;
    block.classList.add('peregrine-collab-block-hover');
  }

  function hideBlockHover() {
    if (annotationState.hoveredBlockEl instanceof HTMLElement) {
      annotationState.hoveredBlockEl.classList.remove('peregrine-collab-block-hover');
    }
    annotationState.hoveredBlockEl = null;
  }

  function ensureCanvasRefreshBar() {
    const existing = document.querySelector('.annotation-canvas-refresh-bar');
    if (existing) existing.remove();

    const refreshBar = document.createElement('div');
    refreshBar.className = 'annotation-canvas-refresh-bar';
    refreshBar.setAttribute('aria-hidden', 'true');
    refreshBar.setAttribute('role', 'status');
    refreshBar.setAttribute('aria-live', 'polite');
    refreshBar.innerHTML = `
      <div class="annotation-canvas-refresh-copy">
        <span class="annotation-canvas-refresh-icon" aria-hidden="true">i</span>
        <div class="annotation-canvas-refresh-text">
          <strong>${ANNOTATION_MESSAGES.refreshEditsTitle}</strong>
          <span>${ANNOTATION_MESSAGES.refreshEditsInlineMessage}</span>
        </div>
      </div>
      <button type="button" class="annotation-canvas-refresh-btn">${ANNOTATION_MESSAGES.refreshEditsAction}</button>
    `;
    document.body.appendChild(refreshBar);
    annotationUI.canvasRefreshBarEl = refreshBar;

    const refreshButton = refreshBar.querySelector('.annotation-canvas-refresh-btn');
    if (refreshButton instanceof HTMLButtonElement) {
      annotationState.canvasRefreshBarClickHandler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideGlobalSnackbar();
        window.dispatchEvent(new CustomEvent(ANNOTATION_REFRESH_EVENT));
      };
      refreshButton.addEventListener('click', annotationState.canvasRefreshBarClickHandler);
    }
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

  function isCurrentUserCollabOwner() {
    const normalizedRole = `${window.streamConfig?.collabRole || ''}`
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ');
    if (!normalizedRole) {
      return window.streamConfig?.inlineEditingAllowed === true;
    }
    return normalizedRole === 'owner'
      || normalizedRole === 'collab owner';
  }

  function isThreadClosed(thread) {
    return Boolean(thread) && store.normalizeCommentStatus(thread.status) === 'Closed';
  }

  // A thread counts as "resolved" (green tick) once it leaves the Open state —
  // i.e. Accepted, Rejected, or Closed.
  function isThreadResolved(thread) {
    if (!thread) return false;
    return store.normalizeCommentStatus(thread.status) !== 'Open';
  }

  function isCommentEditableByCurrentUser(thread, message) {
    if (!message || annotationUI.annotationMode !== 'comments') return false;
    const currentUser = getCurrentUserIdentity();
    const currentProfileId = `${currentUser?.profileId || ''}`.trim();
    const authorProfileId = `${message.authorProfileId ?? ''}`.trim();
    return Boolean(currentProfileId && authorProfileId && currentProfileId === authorProfileId);
  }

  function isThreadStatusEditableByCurrentUser(thread) {
    if (!thread) return false;
    if (annotationUI.annotationMode !== 'comments') return false;
    return isCurrentUserCollabOwner();
  }

  function normalizeRole(role) {
    return `${role || ''}`.trim().toLowerCase().replace(/[_-]+/g, ' ');
  }

  function getParticipantProfileId(participant) {
    if (!participant || typeof participant !== 'object') return '';
    const candidate = participant.profileId
      ?? participant.profile_id
      ?? participant.userProfileId
      ?? participant.user_profile_id
      ?? participant.id;
    return `${candidate || ''}`.trim();
  }

  function getParticipantUserId(participant) {
    if (!participant || typeof participant !== 'object') return '';
    return `${participant.userId || participant.user_id || ''}`.trim();
  }

  function getParticipantDisplayName(participant, index) {
    const value = participant?.username
      || participant?.displayName
      || participant?.fullName
      || participant?.name
      || participant?.email
      || participant?.userName
      || participant?.user_name
      || '';
    return `${value || ''}`.trim() || `Reviewer ${index + 1}`;
  }

  function isReviewerParticipant(participant) {
    const role = normalizeRole(
      participant?.role
      || participant?.collabRole
      || participant?.type
      || participant?.participantRole,
    );
    return role === 'reviewer' || role.endsWith(' reviewer') || role.includes(' reviewer ');
  }

  function isReviewerMarkedComplete(participant) {
    if (!participant || typeof participant !== 'object') return false;
    return participant.reviewCompleted === true;
  }

  function getReviewerParticipants() {
    const participants = annotationState.latestRemoteCollabSnapshot?.collab?.participants;
    if (!Array.isArray(participants)) return [];
    return participants
      .filter((participant) => participant && typeof participant === 'object')
      .filter((participant) => isReviewerParticipant(participant))
      .map((participant, index) => {
        const userId = getParticipantUserId(participant);
        const profileId = getParticipantProfileId(participant) || userId;
        return {
          raw: participant,
          profileId,
          userId,
          displayName: getParticipantDisplayName(participant, index),
          isComplete: isReviewerMarkedComplete(participant),
        };
      })
      .filter((participant) => participant.userId);
  }

  function getCurrentReviewerProfileId() {
    const currentUser = getCurrentUserIdentity();
    return `${currentUser?.profileId || ''}`.trim();
  }

  function isReviewerCurrentUser(reviewer) {
    const currentProfileId = getCurrentReviewerProfileId();
    if (currentProfileId && reviewer.profileId === currentProfileId) return true;
    const currentUsername = `${window.streamConfig?.username || ''}`.trim().toLowerCase();
    return !!currentUsername && reviewer.userId.toLowerCase() === currentUsername;
  }

  function canLoggedInReviewerEditSelection(selectedReviewerProfileId, reviewers) {
    if (!selectedReviewerProfileId || !Array.isArray(reviewers) || !reviewers.length) return false;
    const selectedReviewer = reviewers.find(
      (reviewer) => reviewer.profileId === selectedReviewerProfileId,
    );
    if (!selectedReviewer) return false;
    return isReviewerCurrentUser(selectedReviewer);
  }

  function markReviewerAsCompleteInSnapshot(reviewerProfileId, reviewCompleted = true) {
    const participants = annotationState.latestRemoteCollabSnapshot?.collab?.participants;
    if (!Array.isArray(participants)) return false;
    const participant = participants.find(
      (item) => getParticipantProfileId(item) === reviewerProfileId
        || getParticipantUserId(item) === reviewerProfileId,
    );
    if (!participant) return false;
    participant.reviewCompleted = reviewCompleted === true;
    return true;
  }

  async function completeReviewerIfAllowed(selectedReviewerProfileId, reviewers) {
    if (!canLoggedInReviewerEditSelection(selectedReviewerProfileId, reviewers)) {
      showGlobalSnackbar('Only the logged-in reviewer can mark their review as complete.');
      renderReviewerControls();
      return false;
    }
    const selectedReviewer = reviewers.find(
      (reviewer) => reviewer.profileId === selectedReviewerProfileId,
    );
    if (selectedReviewer?.isComplete) {
      renderReviewerControls();
      return false;
    }
    if (!selectedReviewer?.userId) {
      showGlobalSnackbar('Could not update reviewer completion status.');
      return false;
    }

    reviewerStatusUpdatePending = true;
    renderReviewerControls();
    try {
      const updated = await annotationService.markReviewComplete(selectedReviewer.userId, true);
      if (!updated) {
        showGlobalSnackbar('Could not update reviewer completion status.');
        return false;
      }
      markReviewerAsCompleteInSnapshot(
        selectedReviewerProfileId,
        updated.reviewCompleted === true,
      );
      requestParentCollabRefresh('reviewer-completed');
      hideGlobalSnackbar();
      renderCommentsPanel();
      showGlobalSnackbar('Review marked as complete.');
      return true;
    } catch (error) {
      showGlobalSnackbar('Could not update reviewer completion status.');
      // eslint-disable-next-line no-console
      console.warn('Could not mark review complete in service', error);
      return false;
    } finally {
      reviewerStatusUpdatePending = false;
      renderReviewerControls();
    }
  }

  function renderReviewerControls() {
    const heading = annotationUI.panelEl?.querySelector('.annotation-comments-panel-heading');
    if (!(heading instanceof HTMLElement)) return;
    let controls = heading.querySelector('.annotation-reviewer-controls');
    if (!(controls instanceof HTMLElement)) {
      controls = document.createElement('div');
      controls.className = 'annotation-reviewer-controls';
      heading.appendChild(controls);
    }

    const reviewers = getReviewerParticipants();
    if (!reviewers.length) {
      controls.innerHTML = '';
      controls.classList.add('is-empty');
      return;
    }
    controls.classList.remove('is-empty');

    controls.innerHTML = `
      <div class="annotation-reviewer-controls-row">
        <select
          id="annotation-reviewer-select"
          class="annotation-reviewer-select"
          ${reviewerStatusUpdatePending ? 'disabled' : ''}
          aria-label="Reviewers"
        ></select>
      </div>
    `;

    const reviewerSelect = controls.querySelector('.annotation-reviewer-select');
    if (!(reviewerSelect instanceof HTMLSelectElement)) return;

    reviewerSelect.disabled = reviewerStatusUpdatePending;
    reviewerSelect.title = 'Reviewer details are visible to everyone.';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'Reviewers';
    placeholderOption.selected = true;
    reviewerSelect.appendChild(placeholderOption);

    reviewers.forEach((reviewer) => {
      const option = document.createElement('option');
      option.value = reviewer.profileId;
      option.textContent = reviewer.isComplete
        ? `✓ ${reviewer.displayName}`
        : reviewer.displayName;
      option.disabled = !isReviewerCurrentUser(reviewer);
      if (reviewer.isComplete) {
        option.className = 'annotation-reviewer-complete';
      }
      reviewerSelect.appendChild(option);
    });
  }

  function getCommentEditorKey(threadId, commentId) {
    return `${threadId || ''}::${commentId || ''}`;
  }

  function getDraftScopeKey(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  function syncPopupDraftScope(elementPath) {
    const nextKey = getDraftScopeKey(elementPath);
    if (popupDraftKey && popupDraftKey !== nextKey) {
      popupDraft = '';
    }
    popupDraftKey = nextKey;
  }

  function updatePopupDraft(value) {
    popupDraft = value || '';
  }

  function clearPopupDraft() {
    popupDraft = '';
    popupDraftKey = '';
  }

  function getReplyComposerKey(threadId, commentId = '') {
    return `${threadId || ''}::${commentId || ''}`;
  }

  function getPanelReplyDraft(threadId, commentId = '') {
    return panelReplyDrafts.get(getReplyComposerKey(threadId, commentId)) || '';
  }

  function updatePanelReplyDraft(threadId, commentId = '', value = '') {
    const key = getReplyComposerKey(threadId, commentId);
    if (!value) {
      panelReplyDrafts.delete(key);
      return;
    }
    panelReplyDrafts.set(key, value);
  }

  function clearPanelReplyDraft(threadId, commentId = '') {
    panelReplyDrafts.delete(getReplyComposerKey(threadId, commentId));
  }

  function resetPanelReplyComposer(threadId, commentId = '') {
    clearPanelReplyDraft(threadId, commentId);
    const input = annotationUI.panelEl?.querySelector(
      `.annotation-panel-reply-input[data-thread-id="${threadId}"][data-comment-id="${commentId}"]`,
    );
    if (input instanceof HTMLInputElement) {
      input.value = '';
    }
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

  function isCommentsViewActive() {
    return annotationUI.annotationMode === 'comments';
  }

  function schedulePendingCommentsPanelRefreshFlush() {
    window.requestAnimationFrame(() => {
      flushPendingCommentsPanelRefresh();
    });
  }

  function shouldDeferCommentsPanelRefresh() {
    return pendingReplyComposerKeys.size > 0
      || pendingCommentEditIds.size > 0;
  }

  flushPendingCommentsPanelRefresh = function flushPendingCommentsPanelRefreshImpl() {
    if (!pendingCommentsPanelRefresh) return;
    if (shouldDeferCommentsPanelRefresh()) return;
    renderCommentsPanel();
  };

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
    if (!isPending) {
      schedulePendingCommentsPanelRefreshFlush();
    }
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
    if (!isPending) {
      schedulePendingCommentsPanelRefreshFlush();
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

  function captureTransientDraftsFromDom() {
    const popupInput = annotationUI.popupEl?.querySelector('.annotation-reply-input');
    if (popupInput instanceof HTMLTextAreaElement) {
      updatePopupDraft(popupInput.value);
    }

    annotationUI.panelEl?.querySelectorAll('.annotation-panel-reply-input').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      updatePanelReplyDraft(input.dataset.threadId, input.dataset.commentId, input.value);
    });
  }

  function getThreadRenderSnapshot(thread) {
    return {
      id: thread?.id || '',
      threadType: store.getThreadType(thread),
      status: thread?.status || '',
      username: thread?.username || '',
      elementPath: getDraftScopeKey(thread?.elementPath),
      messages: (thread?.messages || []).map((message) => ({
        id: message?.id || '',
        authorProfileId: `${message?.authorProfileId ?? ''}`,
        username: message?.username || '',
        text: message?.text || '',
        kind: message?.kind || '',
        replyToCommentId: message?.replyToCommentId || '',
      })),
    };
  }

  function getThreadsRenderSignature(threads = []) {
    return JSON.stringify(threads.map(getThreadRenderSnapshot));
  }

  function createFnv1aHash() {
    let hash = 0x811c9dc5;
    return {
      update(value = '') {
        const input = `${value}`;
        for (let index = 0; index < input.length; index += 1) {
          // eslint-disable-next-line no-bitwise
          hash ^= input.charCodeAt(index);
          // eslint-disable-next-line no-bitwise
          hash = Math.imul(hash, 0x01000193) >>> 0;
        }
      },
      digest() {
        return hash.toString(16).padStart(8, '0');
      },
    };
  }

  function getStableStringValue(input) {
    if (Array.isArray(input)) {
      return input.map((item) => getStableStringValue(item));
    }
    if (input && typeof input === 'object') {
      return Object.keys(input)
        .sort()
        .reduce((result, key) => {
          result[key] = getStableStringValue(input[key]);
          return result;
        }, {});
    }
    return input;
  }

  function stringifyStableValue(value) {
    try {
      return JSON.stringify(getStableStringValue(value));
    } catch {
      return '';
    }
  }

  function getEasyEditComparisonSnapshot(edit) {
    return {
      editType: edit?.editType || '',
      attrName: edit?.attrName || '',
      elementPath: edit?.elementPath || '',
      elementProps: stringifyStableValue(edit?.elementProps || {}),
      from: edit?.from || '',
      to: edit?.to || '',
      fromHtml: edit?.fromHtml || '',
      toHtml: edit?.toHtml || '',
      changedFrom: edit?.changedFrom || '',
      changedTo: edit?.changedTo || '',
    };
  }

  function getEasyEditsComparisonHash(edits = []) {
    const normalizedEdits = [...edits]
      .map((edit) => {
        const snapshot = getEasyEditComparisonSnapshot(edit);
        const stableKey = `${snapshot.elementPath}::${snapshot.attrName}::${snapshot.editType}`;
        return `${stableKey}|${stringifyStableValue(snapshot)}`;
      })
      .sort();

    const hash = createFnv1aHash();
    normalizedEdits.forEach((normalizedEdit) => {
      hash.update(normalizedEdit);
      hash.update('\u001f');
    });

    return hash.digest();
  }

  function getEasyEditsComparisonSize(edits = []) {
    return Array.isArray(edits) ? edits.length : 0;
  }

  function getSelfSavedEditsFingerprint(edits = []) {
    return {
      count: getEasyEditsComparisonSize(edits),
      hash: getEasyEditsComparisonHash(edits),
    };
  }

  function setSelfSavedEditsFingerprint(edits = []) {
    const fingerprint = getSelfSavedEditsFingerprint(edits);
    annotationState.latestSelfSavedEditsHash = fingerprint.hash;
    annotationState.latestSelfSavedEditsCount = fingerprint.count;
  }

  function clearSelfSavedEditsFingerprint() {
    annotationState.latestSelfSavedEditsHash = '';
    annotationState.latestSelfSavedEditsCount = 0;
  }

  function markSelfSavedEditsSnapshot(editRecord = []) {
    setSelfSavedEditsFingerprint(editRecord);
  }

  function shouldSuppressSelfSaveRefresh(remoteEditRecord = []) {
    if (!annotationState.latestSelfSavedEditsHash) return false;
    if (
      getEasyEditsComparisonSize(remoteEditRecord) !== annotationState.latestSelfSavedEditsCount
    ) {
      return false;
    }
    return (
      getEasyEditsComparisonHash(remoteEditRecord)
      === annotationState.latestSelfSavedEditsHash
    );
  }

  function syncPendingPanelStates() {
    pendingReplyComposerKeys.forEach((key) => {
      const [threadId = '', commentId = ''] = key.split('::');
      setPanelReplyPending(threadId, commentId, true);
    });
    pendingCommentEditIds.forEach((key) => {
      const [threadId = '', commentId = ''] = key.split('::');
      setCommentEditPending(threadId, commentId, true);
    });
  }

  function getTimestampValue(value) {
    const timestamp = new Date(value || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function hasPendingRemoteEdits() {
    return Boolean(
      annotationState.pendingRemoteEditsSnapshot?.updatedAt
      || annotationState.pendingRemoteEditsSnapshot?.createdAt,
    );
  }

  function renderRefreshAction() {
    if (!(annotationUI.canvasRefreshBarEl instanceof HTMLElement)) return;
    const isVisible = hasPendingRemoteEdits();
    annotationUI.canvasRefreshBarEl.classList.toggle('is-visible', isVisible);
    annotationUI.canvasRefreshBarEl.setAttribute('aria-hidden', `${!isVisible}`);
  }

  function applyNormalizedCommentThreads(nextCommentThreads = []) {
    const currentCommentThreads = annotationState.store.threads.filter(
      (thread) => store.getThreadType(thread) === 'comment',
    );
    const didCommentsChange = getThreadsRenderSignature(currentCommentThreads)
      !== getThreadsRenderSignature(nextCommentThreads);

    if (!didCommentsChange) {
      if (pendingCommentsPanelRefresh && !shouldDeferCommentsPanelRefresh()) {
        renderCommentsPanel();
      }
      return false;
    }

    store.replaceThreadsByType('comment', nextCommentThreads);

    // eslint-disable-next-line no-use-before-define
    clearThreadTargetCache();
    // eslint-disable-next-line no-use-before-define
    renderThreadMarkers({ resolveTargets: true });

    if (shouldDeferCommentsPanelRefresh()) {
      pendingCommentsPanelRefresh = true;
      return true;
    }

    renderCommentsPanel();
    return true;
  }

  function applySavedEditsSnapshot(snapshot) {
    store.replaceEasyEdits(snapshot?.editRecord || []);
    annotationState.latestSavedEditsUpdatedAt = snapshot?.updatedAt || snapshot?.createdAt || null;
    annotationState.pendingRemoteEditsSnapshot = null;
    annotationState.hasLoadedInitialEditsSnapshot = true;
    store.rebindEasyEditsToCurrentDom();
    store.applyEasyEditsToDom();
    store.saveAnnotationStore();
    // eslint-disable-next-line no-use-before-define
    clearThreadTargetCache();
    // eslint-disable-next-line no-use-before-define
    renderThreadMarkers({ resolveTargets: true });
    renderCommentsPanel();
  }

  function applyRemoteEditsSnapshot(remoteEditSnapshot, options = {}) {
    const {
      forceApply = false,
    } = options;

    const safeSnapshot = remoteEditSnapshot || {
      createdAt: null,
      updatedAt: null,
      authorUsername: '',
      editRecord: [],
    };
    const remoteUpdatedAtValue = getTimestampValue(
      safeSnapshot.updatedAt || safeSnapshot.createdAt,
    );
    const currentUpdatedAtValue = getTimestampValue(annotationState.latestSavedEditsUpdatedAt);
    const pendingUpdatedAtValue = getTimestampValue(
      annotationState.pendingRemoteEditsSnapshot?.updatedAt
      || annotationState.pendingRemoteEditsSnapshot?.createdAt,
    );

    if (!annotationState.hasLoadedInitialEditsSnapshot || forceApply) {
      applySavedEditsSnapshot(safeSnapshot);
      return true;
    }

    if (!remoteUpdatedAtValue) {
      return false;
    }

    if (remoteUpdatedAtValue <= currentUpdatedAtValue) {
      return false;
    }

    if (remoteUpdatedAtValue <= pendingUpdatedAtValue) {
      return false;
    }

    if (annotationState.latestSelfSavedEditsHash) {
      const shouldSuppress = shouldSuppressSelfSaveRefresh(safeSnapshot.editRecord);
      clearSelfSavedEditsFingerprint();
      if (shouldSuppress) {
        applySavedEditsSnapshot(safeSnapshot);
        return false;
      }
    }

    annotationState.pendingRemoteEditsSnapshot = safeSnapshot;
    renderCommentsPanel();
    showGlobalSnackbar(ANNOTATION_MESSAGES.refreshEditsSnackbar, {
      variant: 'warning',
    });
    return true;
  }

  function applyRemoteCollabSnapshot(snapshot = {}) {
    annotationState.latestRemoteCollabSnapshot = snapshot;

    if (snapshot?.collab) {
      try {
        const nextThreads = annotationService.normalizeThreadsPayload(snapshot.collab);
        if (Array.isArray(nextThreads)) {
          applyNormalizedCommentThreads(
            nextThreads.filter((thread) => store.getThreadType(thread) === 'comment'),
          );
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Could not apply remote comment snapshot', error);
      }
    }

    if (snapshot?.collab) {
      renderReviewerControls();
      renderWorkspaceTitle();
      renderPresence();
      updateCommentsBadge();
    }
  }

  function applyPendingRemoteEditsSnapshot() {
    if (!annotationState.pendingRemoteEditsSnapshot) return false;
    applyRemoteEditsSnapshot(annotationState.pendingRemoteEditsSnapshot, {
      forceApply: true,
    });
    return true;
  }

  function getThreadActivityTimestamp(thread) {
    if (!thread) return 0;
    const messages = Array.isArray(thread.messages) ? thread.messages : [];
    let latest = 0;
    messages.forEach((message) => {
      const candidates = [message?.editedAt, message?.createdAt];
      candidates.forEach((value) => {
        const ts = getTimestampValue(value);
        if (ts > latest) latest = ts;
      });
    });
    if (!latest) {
      latest = getTimestampValue(thread.updatedAt || thread.createdAt);
    }
    return latest;
  }

  function buildUnifiedItems() {
    const items = [];

    annotationState.store.threads.forEach((thread) => {
      if (!thread) return;
      const threadType = store.getThreadType(thread);
      if (threadType === 'comment' || threadType === 'edit') {
        items.push({
          kind: threadType,
          thread,
          timestamp: getThreadActivityTimestamp(thread),
        });
      }
    });

    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return items;
  }

  function enforceThreadStatusSelectOptions(root) {
    const scope = root || annotationUI.panelEl || annotationUI.panelListEl;
    if (!scope || typeof scope.querySelectorAll !== 'function') return;
    const statusSelects = scope.querySelectorAll(
      '.annotation-panel-status-select:not(.annotation-reviewer-select)',
    );
    statusSelects.forEach((statusSelect) => {
      if (!(statusSelect instanceof HTMLSelectElement)) return;
      const { threadId } = statusSelect.dataset;
      const thread = threadId ? store.getThreadById?.(threadId) : null;
      const normalizedThreadStatus = store.normalizeCommentStatus(thread?.status || statusSelect.value || '');
      const selectedStatus = THREAD_STATUS_OPTIONS.includes(normalizedThreadStatus)
        ? normalizedThreadStatus
        : THREAD_STATUS_OPTIONS[0];
      statusSelect.innerHTML = '';
      THREAD_STATUS_OPTIONS.forEach((status) => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        option.selected = selectedStatus === status;
        statusSelect.appendChild(option);
      });
    });
  }

  renderCommentsPanel = function renderCommentsPanelImpl() {
    if (!annotationUI.panelListEl) return;
    pendingCommentsPanelRefresh = false;
    captureTransientDraftsFromDom();
    renderRefreshAction();
    updateModeButtonStates();
    applyDisableEditsState();
    updateCommentsBadge();
    syncDrawerChrome();

    const activePopupThreadId = `${annotationUI.popupEl?.dataset.threadId || ''}`.trim();
    if (activePopupThreadId) {
      const popupThread = store.getThreadById(activePopupThreadId);
      if (isThreadClosed(popupThread)) {
        closePopupAndSelection();
        showGlobalSnackbar(ANNOTATION_MESSAGES.closedThreadRestricted);
      }
    }

    let preservedComposer = null;
    let preservedComposerKey = '';
    let preservedEditForm = null;
    let preservedEditKey = '';
    let preservedSelStart = 0;
    let preservedSelEnd = 0;
    let preservedIsReply = false;

    const { activeElement } = document;
    if (activeElement && annotationUI.panelListEl.contains(activeElement)) {
      if (
        activeElement instanceof HTMLInputElement
        && activeElement.classList.contains('annotation-panel-reply-input')
      ) {
        const tid = activeElement.dataset.threadId || '';
        const cid = activeElement.dataset.commentId || '';
        preservedComposerKey = `${tid}::${cid}`;
        preservedSelStart = activeElement.selectionStart ?? activeElement.value.length;
        preservedSelEnd = activeElement.selectionEnd ?? activeElement.value.length;
        preservedComposer = activeElement.closest('.annotation-panel-reply-composer');
        if (preservedComposer) preservedComposer.remove();
      } else if (
        activeElement instanceof HTMLTextAreaElement
        && activeElement.classList.contains('annotation-panel-edit-input')
      ) {
        const tid = activeElement.dataset.threadId || '';
        const cid = activeElement.dataset.commentId || '';
        preservedEditKey = `${tid}::${cid}`;
        preservedSelStart = activeElement.selectionStart ?? activeElement.value.length;
        preservedSelEnd = activeElement.selectionEnd ?? activeElement.value.length;
        preservedEditForm = activeElement.closest('.annotation-panel-edit-form');
        preservedIsReply = !!activeElement.closest('.annotation-panel-reply-row');
        if (preservedEditForm) preservedEditForm.remove();
      }
    }

    const scrollContainer = annotationUI.panelEl?.querySelector('.annotation-comments-content');
    const savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    annotationUI.panelListEl.innerHTML = '';
    const panelTitle = annotationUI.panelEl?.querySelector('.annotation-comments-panel-header h3');
    if (panelTitle instanceof HTMLElement) {
      panelTitle.textContent = 'Annotations';
    }
    renderReviewerControls();

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

    const activityFilter = annotationState.activityFilter || 'all';
    const searchQuery = `${annotationState.searchQuery || ''}`.trim().toLowerCase();
    const searchTokens = searchQuery ? searchQuery.split(/\s+/).filter(Boolean) : [];
    const unifiedItems = buildUnifiedItems().filter((item) => {
      // Mine / Others apply to comment threads; edits & assets show under "All" only.
      if (activityFilter !== 'all') {
        if (item.kind !== 'comment') return false;
        const mine = isThreadMine(item.thread);
        if (activityFilter === 'mine' ? !mine : mine) return false;
      }
      if (searchTokens.length) {
        const haystack = buildThreadHaystack(item);
        if (!searchTokens.every((token) => haystack.includes(token))) return false;
      }
      return true;
    });

    if (!unifiedItems.length) {
      const empty = document.createElement('p');
      empty.className = 'annotation-comments-empty';
      if (searchTokens.length) {
        empty.textContent = 'No comments match your search.';
      } else if (activityFilter === 'mine') {
        empty.textContent = 'No comments from you yet. Click an element on the page to add one.';
      } else if (activityFilter === 'others') {
        empty.textContent = 'No comments from others yet.';
      } else {
        empty.textContent = 'No annotations yet. Add comments, make inline edits, or replace images to populate this feed.';
      }
      annotationUI.panelListEl.appendChild(empty);
      return;
    }

    let didReuseComposer = false;
    let didReuseEditForm = false;

    const renderThreadItem = (thread, isCommentThread) => {
      const groups = buildCommentGroups(thread);
      groups.forEach((group, idx) => {
        const isLatestInThread = idx === groups.length - 1;
        const isClosedThread = isThreadClosed(thread);
        const canEditRootComment = isCommentThread
          && !isClosedThread
          && isCommentEditableByCurrentUser(thread, group.comment);
        // Comment threads are collapsed to their top comment until opened;
        // edit/asset items always render in full.
        const isExpanded = !isCommentThread
          || thread.id === annotationState.expandedThreadId;
        const card = document.createElement('article');
        card.className = isCommentThread
          ? 'annotation-panel-comment annotation-panel-comment-item'
          : 'annotation-panel-comment annotation-panel-edit-item';
        if (isCommentThread && !isExpanded) card.classList.add('is-collapsed');
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

        let statusControls;
        if (isCommentThread) {
          statusControls = document.createElement('div');
          statusControls.className = 'annotation-panel-status-controls';
          const statusSelect = document.createElement('select');
          const canEditThreadStatus = isThreadStatusEditableByCurrentUser(thread);
          statusSelect.className = 'annotation-panel-status-select';
          statusSelect.dataset.threadId = thread.id;
          statusSelect.dataset.messageId = group.comment.id || '';
          statusSelect.disabled = !canEditThreadStatus;
          if (!canEditThreadStatus) {
            const restrictionMessage = isClosedThread
              ? ANNOTATION_MESSAGES.closedThreadRestricted
              : ANNOTATION_MESSAGES.updateStatusRestricted;
            statusSelect.title = restrictionMessage;
            statusSelect.setAttribute('aria-label', restrictionMessage);
          }
          const normalizedThreadStatus = store.normalizeCommentStatus(thread.status);
          const selectedThreadStatus = THREAD_STATUS_OPTIONS.includes(normalizedThreadStatus)
            ? normalizedThreadStatus
            : THREAD_STATUS_OPTIONS[0];
          THREAD_STATUS_OPTIONS.forEach((status) => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            option.selected = selectedThreadStatus === status;
            statusSelect.appendChild(option);
          });
          statusSelect.dataset.status = store.normalizeCommentStatus(thread.status);
          statusControls.append(statusSelect);
          if (canEditRootComment) {
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
        }

        const cardAuthor = group.comment.username
          || thread.username
          || ANNOTATION_DEFAULT_USERNAME;

        const username = document.createElement('p');
        username.className = 'annotation-panel-comment-user';
        username.textContent = cardAuthor;

        const cardHeader = document.createElement('div');
        cardHeader.className = 'annotation-panel-comment-header';
        if (isCommentThread) {
          const cardAuthorKey = `${group.comment.authorProfileId ?? ''}` || cardAuthor;
          const cardAvatar = isThreadResolved(thread)
            ? buildResolvedAvatar(22)
            : buildAvatarEl(cardAuthor, cardAuthorKey, { size: 22 });
          cardAvatar.classList.add('annotation-panel-comment-avatar');
          cardHeader.append(cardAvatar);
        }
        cardHeader.append(username);
        if (isCommentThread) {
          const cardTimeText = formatRelativeTime(
            group.comment.editedAt || group.comment.createdAt,
          );
          if (cardTimeText) {
            const cardTime = document.createElement('span');
            cardTime.className = 'annotation-panel-comment-time';
            cardTime.textContent = cardTimeText;
            cardHeader.append(cardTime);
          }
        }
        if (statusControls && isExpanded) cardHeader.append(statusControls);

        const hasPending = !!group.comment?.hasPendingHistory || !group.comment?.isCommitted;
        if (!isCommentThread && group.comment?.isCurrent && hasPending) {
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'annotation-panel-cancel-btn';
          cancelBtn.title = 'Discard last local change';
          cancelBtn.setAttribute('aria-label', 'Discard last local change');
          cancelBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.0605 10L13.2803 7.78028C13.5733 7.48731 13.5733 7.0127 13.2803 6.71973C12.9873 6.42676 12.5127 6.42676 12.2197 6.71973L10 8.93946L7.78027 6.71973C7.4873 6.42676 7.01269 6.42676 6.71972 6.71973C6.42675 7.0127 6.42675 7.48731 6.71972 7.78028L8.93945 10L6.71972 12.2197C6.42675 12.5127 6.42675 12.9873 6.71972 13.2803C6.8662 13.4268 7.05761 13.5 7.24999 13.5C7.44237 13.5 7.63378 13.4268 7.78026 13.2803L9.99999 11.0606L12.2197 13.2803C12.3662 13.4268 12.5576 13.5 12.75 13.5C12.9424 13.5 13.1338 13.4268 13.2803 13.2803C13.5732 12.9873 13.5732 12.5127 13.2803 12.2197L11.0605 10Z" fill="currentColor"/><path d="M10 18.75C5.1748 18.75 1.25 14.8252 1.25 10C1.25 5.1748 5.1748 1.25 10 1.25C14.8252 1.25 18.75 5.1748 18.75 10C18.75 14.8252 14.8252 18.75 10 18.75ZM10 2.75C6.00195 2.75 2.75 6.00195 2.75 10C2.75 13.998 6.00195 17.25 10 17.25C13.998 17.25 17.25 13.998 17.25 10C17.25 6.00195 13.998 2.75 10 2.75Z" fill="currentColor"/></svg>';
          cancelBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const result = store.undoLastChange(thread.id);
            if (!result) return;
            store.applyEasyEditsToDom();
            store.saveAnnotationStore();
            renderThreadMarkers({ resolveTargets: true });
            renderCommentsPanel();
          });
          card.append(cancelBtn);
        }

        card.append(cardHeader);

        const rootCommentKey = `${thread.id}::${group.comment.id || ''}`;
        const isEditingRootComment = canEditRootComment
          && isEditingComment(thread.id, group.comment.id || '');
        if (isEditingRootComment) {
          if (preservedEditForm && !preservedIsReply && preservedEditKey === rootCommentKey) {
            card.append(preservedEditForm);
            preservedEditForm = null;
            didReuseEditForm = true;
          } else {
            const editForm = createCommentEditForm(
              thread.id,
              group.comment.id || '',
              activeCommentEditor?.draft || '',
            );
            card.append(editForm);
          }
        } else {
          const text = document.createElement('p');
          text.className = 'annotation-panel-comment-text';
          const blockClass = !isCommentThread ? (thread.elementProps?.blockClass || '') : '';
          if (blockClass) {
            const blockLabel = document.createElement('span');
            blockLabel.className = 'annotation-panel-block-label annotation-panel-block-label-edit';
            blockLabel.textContent = blockClass;
            text.append(blockLabel);
          }
          const textBody = document.createElement('span');
          const linkified = linkifyText(group.comment.text);
          textBody.innerHTML = isCommentThread
            ? linkified
            : linkified.replace(/→/g, ARROW_ICON_SVG);
          text.append(textBody);
          card.append(text);
        }

        const repliesWrap = document.createElement('div');
        repliesWrap.className = 'annotation-panel-replies-list';
        (isExpanded ? group.replies : []).forEach((reply) => {
          const replyRow = document.createElement('div');
          replyRow.className = 'annotation-panel-reply-row';

          const replyKey = `${thread.id}::${reply.id || ''}`;
          const canEditReply = isCommentThread
            && !isClosedThread
            && isCommentEditableByCurrentUser(thread, reply);
          const isEditingReply = canEditReply && isEditingComment(thread.id, reply.id || '');
          if (isEditingReply) {
            if (preservedEditForm && preservedIsReply && preservedEditKey === replyKey) {
              replyRow.append(preservedEditForm);
              preservedEditForm = null;
              didReuseEditForm = true;
            } else {
              const editForm = createCommentEditForm(
                thread.id,
                reply.id || '',
                activeCommentEditor?.draft || '',
                true,
              );
              replyRow.append(editForm);
            }
          } else {
            const replyContent = document.createElement('div');
            replyContent.className = 'annotation-panel-reply-content';
            const replyHead = document.createElement('div');
            replyHead.className = 'annotation-panel-reply-head';
            const replyUsername = document.createElement('p');
            replyUsername.className = 'annotation-panel-reply-user';
            replyUsername.textContent = reply.username || ANNOTATION_DEFAULT_USERNAME;
            replyHead.append(replyUsername);
            const replyTimeText = formatRelativeTime(reply.editedAt || reply.createdAt);
            if (replyTimeText) {
              const replyTime = document.createElement('span');
              replyTime.className = 'annotation-panel-reply-time';
              replyTime.textContent = replyTimeText;
              replyHead.append(replyTime);
            }
            const replyText = document.createElement('p');
            replyText.className = 'annotation-panel-reply-text';
            replyText.innerHTML = linkifyText(reply.text);
            replyContent.append(replyHead, replyText);
            replyRow.append(replyContent);
          }

          if (isCommentThread && canEditReply && !isEditingReply) {
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

        // Collapsed comment card: show a compact "N replies" hint instead of the thread.
        if (isCommentThread && !isExpanded && group.replies.length) {
          const hint = document.createElement('p');
          hint.className = 'annotation-panel-reply-hint';
          const n = group.replies.length;
          hint.textContent = `${n} ${n === 1 ? 'reply' : 'replies'}`;
          card.append(hint);
        }

        if (isCommentThread && isExpanded && !isClosedThread) {
          const composerKey = `${thread.id}::${group.comment.id || ''}`;
          if (preservedComposer && preservedComposerKey === composerKey) {
            card.append(preservedComposer);
            preservedComposer = null;
            didReuseComposer = true;
          } else {
            const replyFieldId = `annotation-panel-reply-input-${thread.id}-${group.comment.id || 'root'}`;
            const replyComposer = document.createElement('div');
            replyComposer.className = 'annotation-panel-reply-composer';
            replyComposer.innerHTML = `
              <input type="text" id="${replyFieldId}" name="${replyFieldId}" class="annotation-panel-reply-input" data-thread-id="${thread.id}" data-comment-id="${group.comment.id || ''}" placeholder="Reply..." />
              <button type="button" class="annotation-panel-reply-btn" data-thread-id="${thread.id}" data-comment-id="${group.comment.id || ''}" aria-label="Send reply">
                <span aria-hidden="true">➤</span>
              </button>
            `;
            const replyInput = replyComposer.querySelector('.annotation-panel-reply-input');
            if (replyInput instanceof HTMLInputElement) {
              replyInput.value = getPanelReplyDraft(thread.id, group.comment.id || '');
            }
            card.append(replyComposer);
          }
        }

        if (!isCommentThread) {
          const timestamp = formatCardTimestamp(group.comment.createdAt || thread.updatedAt);
          if (timestamp) {
            const time = document.createElement('p');
            time.className = 'annotation-card-timestamp';
            time.textContent = timestamp;
            card.append(time);
          }
        }

        annotationUI.panelListEl.appendChild(card);
      });
    };

    unifiedItems.forEach((item) => {
      if (item.kind === 'comment') {
        renderThreadItem(item.thread, true);
      } else if (item.kind === 'edit') {
        renderThreadItem(item.thread, false);
      }
    });

    if (scrollContainer) scrollContainer.scrollTop = savedScrollTop;
    syncPendingPanelStates();

    if (didReuseComposer && preservedComposerKey) {
      const [tid, cid] = preservedComposerKey.split('::');
      const input = annotationUI.panelListEl.querySelector(
        `.annotation-panel-reply-input[data-thread-id="${tid}"][data-comment-id="${cid}"]`,
      );
      if (input instanceof HTMLInputElement) {
        window.requestAnimationFrame(() => {
          input.focus();
          input.setSelectionRange(preservedSelStart, preservedSelEnd);
        });
      }
    }

    if (didReuseEditForm && preservedEditKey) {
      const [tid, cid] = preservedEditKey.split('::');
      const textarea = annotationUI.panelListEl.querySelector(
        `.annotation-panel-edit-input[data-thread-id="${tid}"][data-comment-id="${cid}"]`,
      );
      if (textarea instanceof HTMLTextAreaElement) {
        window.requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(preservedSelStart, preservedSelEnd);
        });
      }
    }
    enforceThreadStatusSelectOptions(annotationUI.panelEl);
  };

  function getCommentsScrollContainer() {
    if (!annotationUI.panelEl) return null;
    return annotationUI.panelEl.querySelector('.annotation-comments-content');
  }

  function findAnnotationMarker(threadId = '', messageId = '') {
    if (!annotationUI.layerEl) return null;
    if (threadId) {
      if (messageId) {
        const specificMarker = annotationUI.layerEl.querySelector(
          `.annotation-thread-marker[data-thread-id="${threadId}"][data-message-id="${messageId}"], .annotation-edit-marker[data-thread-id="${threadId}"][data-message-id="${messageId}"]`,
        );
        if (specificMarker instanceof HTMLElement) return specificMarker;
      }
      const marker = annotationUI.layerEl.querySelector(
        `.annotation-thread-marker[data-thread-id="${threadId}"], .annotation-edit-marker[data-thread-id="${threadId}"]`,
      );
      return marker instanceof HTMLElement ? marker : null;
    }
    return null;
  }

  function applyPendingMarkerPulse() {
    const pending = annotationState.pendingMarkerPulse;
    if (!pending) return;
    const marker = findAnnotationMarker(pending.threadId, pending.messageId);
    if (!marker) return;
    marker.classList.remove('annotation-marker-pulse');
    void marker.offsetWidth; // eslint-disable-line no-void
    marker.classList.add('annotation-marker-pulse');
    marker.addEventListener('animationend', () => {
      marker.classList.remove('annotation-marker-pulse');
      if (annotationState.pendingMarkerPulse === pending) {
        annotationState.pendingMarkerPulse = null;
      }
    }, { once: true });
  }

  function queueMarkerPulseAfterScroll() {
    if (annotationState.markerPulseScrollTimer) {
      window.clearTimeout(annotationState.markerPulseScrollTimer);
    }
    annotationState.markerPulseScrollTimer = window.setTimeout(() => {
      annotationState.markerPulseScrollTimer = null;
      applyPendingMarkerPulse();
    }, 150);
  }

  function pulseAnnotationMarker(threadId = '', messageId = '') {
    annotationState.pendingMarkerPulse = { threadId, messageId };
    queueMarkerPulseAfterScroll();
  }

  function scrollThreadInPanel(threadId, messageId = '', commentIndex = 0) {
    if (!annotationUI.panelEl || !annotationUI.panelListEl || !threadId) return;
    const thread = store.getThreadById(threadId);
    if (!thread) return;

    const firstCommentId = buildCommentGroups(thread)[0]?.comment?.id || '';
    annotationState.activeThreadId = threadId;
    annotationState.activeMessageId = messageId || firstCommentId;
    annotationState.activeEditId = '';
    // Opening a thread from a marker expands it in the drawer.
    if (store.getThreadType(thread) === 'comment') {
      annotationState.expandedThreadId = threadId;
    }
    ensureCommentsDrawerOpen();
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

    const resolvedTarget = store.getElementForThread(thread);
    annotationState.threadTargetCache.set(thread.id, resolvedTarget);
    return resolvedTarget;
  }

  function scrollCommentsPanelToBottom() {
    ensureCommentsDrawerOpen();
    const scrollContainer = getCommentsScrollContainer();
    if (!scrollContainer) return;
    window.requestAnimationFrame(() => {
      scrollContainer.scrollTo({
        top: 0,
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

    const resolveMarkerPosition = (baseTop, baseLeft) => {
      const row = Math.max(0, Math.round(baseTop));
      // Left-anchored markers: on collision, step rightward into the block.
      let nextLeft = Math.max(MIN_MARKER_LEFT, Math.round(baseLeft));
      let slotKey = `${row}:${nextLeft}`;
      while (occupiedMarkerSlots.has(slotKey)) {
        nextLeft += MARKER_STEP;
        slotKey = `${row}:${nextLeft}`;
      }
      occupiedMarkerSlots.add(slotKey);
      return {
        top: row,
        left: nextLeft,
      };
    };

    annotationState.store.threads
      .filter((thread) => store.getThreadType(thread) === 'comment')
      .forEach((thread) => {
        const targetEl = getCachedThreadTarget(thread);
        if (!targetEl) return;

        targetEl.classList.add('annotation-has-comments');
        targetEl.setAttribute(
          'data-annotation-count',
          String((thread.messages || []).length || 1),
        );

        const rect = targetEl.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;

        // One icon per thread (root author) — no duplicate icons per comment.
        const rootComment = getRootComment(thread) || {};
        const author = rootComment.username || thread.username || ANNOTATION_DEFAULT_USERNAME;
        const resolved = isThreadResolved(thread);
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'annotation-thread-marker';
        marker.dataset.threadId = thread.id;
        marker.dataset.messageId = rootComment.id || '';
        marker.dataset.commentIndex = '0';
        if (resolved) {
          // Resolved thread → green check instead of the author's face.
          marker.classList.add('is-resolved');
          marker.title = `${author} · resolved`;
          marker.setAttribute('aria-label', `Resolved comment thread by ${author}`);
          marker.style.setProperty('--annotation-marker-color', '#2e9e6b');
          marker.innerHTML = MARKER_CHECK_ICON;
        } else {
          marker.title = `${author} · comment thread`;
          marker.setAttribute('aria-label', `Open comment thread by ${author}`);
          const authorKey = `${rootComment.authorProfileId ?? ''}` || author;
          marker.style.setProperty('--annotation-marker-color', getAvatarColor(authorKey));
          marker.textContent = getAvatarInitials(author);
        }

        const position = resolveMarkerPosition(rect.top - 8, rect.left + 8);
        marker.style.top = `${position.top}px`;
        marker.style.left = `${position.left}px`;
        annotationUI.layerEl.appendChild(marker);
      });

    annotationState.store.threads
      .filter((thread) => store.getThreadType(thread) === 'edit')
      .forEach((thread) => {
        const targetEl = getCachedThreadTarget(thread);
        if (!targetEl) return;

        const rect = targetEl.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;

        const groups = buildCommentGroups(thread);
        groups.forEach((group, idx) => {
          const marker = document.createElement('button');
          marker.type = 'button';
          marker.className = 'annotation-edit-marker';
          marker.dataset.threadId = thread.id;
          marker.dataset.messageId = group.comment.id || '';
          marker.dataset.commentIndex = String(idx);
          marker.title = `Edit ${idx + 1}`;
          marker.setAttribute('aria-label', `Open edit ${idx + 1}`);
          marker.innerHTML = `
            <svg class="annotation-edit-marker-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 17.25V21h3.75L19.81 7.94l-3.75-3.75z"></path>
            </svg>
          `;

          const position = resolveMarkerPosition(
            rect.top - 8,
            rect.left + 8 + (idx * MARKER_STEP),
          );
          marker.style.top = `${position.top}px`;
          marker.style.left = `${position.left}px`;
          annotationUI.layerEl.appendChild(marker);
        });
      });
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
    if (isThreadClosed(thread)) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.closedThreadRestricted);
      return;
    }
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

    if (!didHydrateThread) {
      store.pushThreadMessage(activeThread, value, 'reply');
    }

    hideGlobalSnackbar();
    annotationState.activeThreadId = activeThread.id;
    annotationState.activeMessageId = commentId || getRootComment(activeThread)?.id || '';
    resetPanelReplyComposer(threadId, commentId);
    setPanelReplyPending(threadId, commentId, false);
    if (didHydrateThread) {
      store.saveAnnotationStore();
      renderThreadMarkers({ resolveTargets: true });
      renderCommentsPanel();
      scrollCommentsPanelToBottom();
    } else {
      store.saveAnnotationStore();
      renderCommentsPanel();
    }
    requestParentCollabRefresh('reply-created');
  }

  function removePopup() {
    popupSubmitPending = false;
    if (!annotationUI.popupEl) return;
    annotationUI.popupEl.remove();
    annotationUI.popupEl = null;
  }

  function closePopupAndSelection() {
    clearPopupDraft();
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
    if (!thread) return;
    const message = thread.messages?.find((item) => item.id === commentId);
    if (isThreadClosed(thread)) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.closedThreadRestricted);
      return;
    }
    if (!message || !isCommentEditableByCurrentUser(thread, message)) return;

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
      requestParentCollabRefresh('comment-updated');
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

    let didPersistToService = false;
    let thread = null;
    setPopupSubmitPending(true);
    try {
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
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Could not save comment thread to service', error);
    }

    if (!didPersistToService || !thread) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.postCommentError);
      setPopupSubmitPending(false);
      return;
    }

    hideGlobalSnackbar();
    const latest = thread.messages[thread.messages.length - 1];
    annotationState.activeMessageId = getRootComment(thread)?.id || latest?.id || '';
    annotationState.activeThreadId = thread.id;
    setPopupSubmitPending(false);
    closePopupAndSelection();
    store.saveAnnotationStore();
    // Just drop the pin — don't auto-open the Activity drawer or the reply popup.
    renderThreadMarkers({ resolveTargets: true });
    renderCommentsPanel();
    requestParentCollabRefresh('comment-created');
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
      input.addEventListener('input', (event) => {
        const { target } = event;
        if (!(target instanceof HTMLTextAreaElement)) return;
        updatePopupDraft(target.value);
      });
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

  function preparePopupDraftForElement(element) {
    if (annotationState.selectedElement && annotationState.selectedElement !== element) {
      const popupInput = annotationUI.popupEl?.querySelector('.annotation-reply-input');
      if (popupInput instanceof HTMLTextAreaElement) {
        popupInput.value = '';
      }
      clearPopupDraft();
    }
    return store.buildCommentElementPath(element, annotationUI.mainEl);
  }

  function openPopupForElement(element, shouldScroll = false) {
    if (popupSubmitPending) return;
    if (!annotationUI.layerEl) return;
    const nextElementPath = preparePopupDraftForElement(element);
    setSelectedElement(element);
    syncPopupDraftScope(nextElementPath);
    const thread = store.getCommentThreadByElement(annotationState.selectedElement);
    if (thread && isThreadClosed(thread)) {
      store.clearSelectedElement();
      removePopup();
      showGlobalSnackbar(ANNOTATION_MESSAGES.closedThreadRestricted);
      return;
    }
    // If this element already has an open thread, open its reply dialog in place
    // instead of starting a new comment.
    if (thread) {
      store.clearSelectedElement();
      removePopup();
      openFloatingThread(thread.id, element);
      return;
    }
    // Starting a new comment on a different element — close any open thread window.
    removeFloatingThread();
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
    const popupFieldId = `annotation-popup-input-${thread?.id || 'new'}`;
    composer.innerHTML = `
      <textarea id="${popupFieldId}" name="${popupFieldId}" class="annotation-reply-input" placeholder="Write a comment..."></textarea>
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
    if (input instanceof HTMLTextAreaElement) {
      input.value = popupDraft;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  // ── Floating thread (opens in place next to the pin, not the drawer) ────────

  function removeFloatingThread() {
    if (annotationUI.threadEl) {
      annotationUI.threadEl.remove();
      annotationUI.threadEl = null;
    }
    annotationState.activeFloatingThreadId = '';
    annotationState.floatingThreadAnchor = null;
  }

  function positionFloatingThread() {
    const el = annotationUI.threadEl;
    const anchor = annotationState.floatingThreadAnchor;
    if (!(el instanceof HTMLElement) || !(anchor instanceof HTMLElement)) return;
    if (!annotationUI.mainEl?.contains(anchor)) return;

    // Mirror the new-comment popup: sit beside the element, flip left if no room,
    // stay clear of the drawer and viewport edges, and never cover the top bar.
    const panelRect = annotationUI.panelEl?.getBoundingClientRect();
    const maxRight = panelRect ? Math.max(24, panelRect.left - 12) : window.innerWidth - 12;
    const maxWidth = Math.max(220, maxRight - 24);
    el.style.maxWidth = `${maxWidth}px`;

    const rect = anchor.getBoundingClientRect();
    const width = Math.min(el.offsetWidth || 300, maxWidth);
    const height = el.offsetHeight || 220;
    const topbarH = 54;

    let left = rect.right + 12;
    if (left + width > maxRight) {
      left = rect.left - width - 12;
    }
    left = Math.max(12, Math.min(left, maxRight - width));

    let { top } = rect;
    top = Math.max(topbarH + 8, Math.min(top, window.innerHeight - height - 12));

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function renderFloatingThread(threadId) {
    const el = annotationUI.threadEl;
    if (!(el instanceof HTMLElement)) return;
    const thread = store.getThreadById(threadId);
    if (!thread) { removeFloatingThread(); return; }

    const resolved = isThreadResolved(thread);
    const closed = isThreadClosed(thread);
    const normalizedStatus = store.normalizeCommentStatus(thread.status);
    const canEditStatus = isThreadStatusEditableByCurrentUser(thread);

    const head = document.createElement('div');
    head.className = 'peregrine-collab-thread-head';
    const label = document.createElement('span');
    label.className = 'peregrine-collab-thread-label';
    label.textContent = resolved ? 'Resolved' : 'Thread';
    head.append(label);

    if (canEditStatus) {
      const statusSelect = document.createElement('select');
      statusSelect.className = 'peregrine-collab-thread-status';
      THREAD_STATUS_OPTIONS.forEach((status) => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        option.selected = normalizedStatus === status;
        statusSelect.appendChild(option);
      });
      statusSelect.addEventListener('change', () => {
        changeFloatingThreadStatus(threadId, statusSelect.value, statusSelect);
      });
      head.append(statusSelect);
    } else {
      const badge = document.createElement('span');
      badge.className = 'peregrine-collab-thread-status-badge';
      badge.textContent = normalizedStatus;
      head.append(badge);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'peregrine-collab-thread-close';
    closeBtn.setAttribute('aria-label', 'Close thread');
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    closeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      removeFloatingThread();
    });
    head.append(closeBtn);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'peregrine-collab-thread-body';
    (thread.messages || []).forEach((message) => {
      const author = message.username || ANNOTATION_DEFAULT_USERNAME;
      const authorKey = `${message.authorProfileId ?? ''}` || author;
      const cmt = document.createElement('div');
      cmt.className = 'peregrine-collab-thread-cmt';
      const meta = document.createElement('div');
      meta.className = 'peregrine-collab-thread-meta';
      meta.append(buildAvatarEl(author, authorKey, { size: 20 }));
      const nm = document.createElement('span');
      nm.className = 'peregrine-collab-thread-nm';
      nm.textContent = author;
      meta.append(nm);
      const tmText = formatRelativeTime(message.editedAt || message.createdAt);
      if (tmText) {
        const tm = document.createElement('span');
        tm.className = 'peregrine-collab-thread-tm';
        tm.textContent = tmText;
        meta.append(tm);
      }
      const bd = document.createElement('p');
      bd.className = 'peregrine-collab-thread-bd';
      bd.innerHTML = linkifyText(message.text);
      cmt.append(meta, bd);
      bodyEl.append(cmt);
    });

    el.innerHTML = '';
    el.append(head, bodyEl);

    if (!closed) {
      const composer = document.createElement('div');
      composer.className = 'peregrine-collab-thread-composer';
      const input = document.createElement('textarea');
      input.className = 'peregrine-collab-thread-input';
      input.rows = 1;
      input.placeholder = 'Reply…';
      const send = document.createElement('button');
      send.type = 'button';
      send.className = 'peregrine-collab-thread-send';
      send.textContent = 'Reply';
      send.disabled = true;
      input.addEventListener('input', () => {
        send.disabled = !input.value.trim();
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (!send.disabled) submitFloatingReply(threadId, input.value, input, send);
        }
      });
      send.addEventListener('click', () => submitFloatingReply(threadId, input.value, input, send));
      composer.append(input, send);
      el.append(composer);
    }

    positionFloatingThread();
  }

  function openFloatingThread(threadId, targetEl) {
    if (!threadId) return;
    if (annotationState.activeFloatingThreadId === threadId && annotationUI.threadEl) {
      removeFloatingThread();
      return;
    }
    removeFloatingThread();
    closePopupAndSelection();
    closeCommentsDrawer();
    const thread = store.getThreadById(threadId);
    if (!thread) return;
    const anchor = targetEl instanceof HTMLElement ? targetEl : store.getElementForThread(thread);
    if (!(anchor instanceof HTMLElement)) return;

    const el = document.createElement('div');
    el.className = 'peregrine-collab-thread';
    el.dataset.threadId = threadId;
    document.body.appendChild(el);
    annotationUI.threadEl = el;
    annotationState.activeFloatingThreadId = threadId;
    annotationState.floatingThreadAnchor = anchor;
    annotationState.activeThreadId = threadId;
    renderFloatingThread(threadId);
    window.requestAnimationFrame(() => {
      const input = el.querySelector('.peregrine-collab-thread-input');
      if (input instanceof HTMLTextAreaElement) input.focus();
    });
  }

  async function changeFloatingThreadStatus(threadId, nextStatus, selectEl) {
    const thread = store.getThreadById(threadId);
    if (!thread) return;
    if (!isThreadStatusEditableByCurrentUser(thread)) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.updateStatusRestricted);
      if (selectEl) selectEl.value = store.normalizeCommentStatus(thread.status);
      return;
    }
    const previousStatus = thread.status;
    if (selectEl) selectEl.disabled = true;
    try {
      const remoteThread = await annotationService.updateThreadStatus(threadId, nextStatus);
      if (remoteThread) store.upsertThread(remoteThread);
      hideGlobalSnackbar();
      store.saveAnnotationStore();
      renderThreadMarkers({ resolveTargets: true });
      renderCommentsPanel();
      renderFloatingThread(threadId);
      requestParentCollabRefresh('thread-status-updated');
    } catch (error) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.updateStatusError);
      if (selectEl) {
        selectEl.value = store.normalizeCommentStatus(previousStatus);
        selectEl.disabled = false;
      }
      // eslint-disable-next-line no-console
      console.warn('Could not update thread status in service', error);
    }
  }

  async function submitFloatingReply(threadId, rawValue, inputEl, sendEl) {
    if (!isCommentsServiceAvailable()) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.commentsUnavailableSnackbar);
      return;
    }
    const value = (rawValue || '').trim();
    if (!value) return;
    const thread = store.getThreadById(threadId);
    if (!thread) return;
    if (isThreadClosed(thread)) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.closedThreadRestricted);
      return;
    }
    if (inputEl) inputEl.readOnly = true;
    if (sendEl) sendEl.disabled = true;

    let didPersist = false;
    try {
      const result = await annotationService.createReply(threadId, value);
      if (result?.persisted) didPersist = true;
      if (result?.thread) store.upsertThread(result.thread);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Could not save reply to service', error);
    }

    if (!didPersist) {
      showGlobalSnackbar(ANNOTATION_MESSAGES.sendReplyError);
      if (inputEl) inputEl.readOnly = false;
      if (sendEl) sendEl.disabled = false;
      return;
    }

    hideGlobalSnackbar();
    store.saveAnnotationStore();
    renderThreadMarkers({ resolveTargets: true });
    renderCommentsPanel();
    renderFloatingThread(threadId);
    requestParentCollabRefresh('reply-created');
  }

  function syncFloatingUI() {
    if (!annotationUI.mainEl) return;
    renderThreadMarkers();
    if (annotationUI.popupEl && annotationState.selectedElement) {
      positionPopup(annotationState.selectedElement);
    }
    if (annotationUI.threadEl && annotationState.activeFloatingThreadId) {
      positionFloatingThread();
    }
  }

  function scheduleFloatingUISync() {
    if (annotationState.pendingMarkerPulse) {
      queueMarkerPulseAfterScroll();
    }
    if (annotationState.floatingUiFrameId) return;
    annotationState.floatingUiFrameId = window.requestAnimationFrame(() => {
      annotationState.floatingUiFrameId = null;
      syncFloatingUI();
    });
  }

  function teardownGlobalListeners(options = {}) {
    const {
      preserveRemoteEditState = false,
    } = options;
    hideGlobalSnackbar();
    closeCommentEditor();
    pendingCommentsPanelRefresh = false;
    if (!preserveRemoteEditState) {
      clearSelfSavedEditsFingerprint();
      annotationState.pendingRemoteEditsSnapshot = null;
      annotationState.hasLoadedInitialEditsSnapshot = false;
    }
    panelReplyDrafts.clear();
    popupDraft = '';
    popupDraftKey = '';
    if (annotationState.floatingUiFrameId) {
      window.cancelAnimationFrame(annotationState.floatingUiFrameId);
      annotationState.floatingUiFrameId = null;
    }
    if (annotationUI.mainEl && annotationState.mainScrollHandler) {
      annotationUI.mainEl.removeEventListener('scroll', annotationState.mainScrollHandler);
      document.removeEventListener('scroll', annotationState.mainScrollHandler, true);
      annotationState.mainScrollHandler = null;
    }
    if (annotationUI.mainEl && annotationState.blockHoverHandler) {
      annotationUI.mainEl.removeEventListener('mousemove', annotationState.blockHoverHandler);
      annotationState.blockHoverHandler = null;
    }
    if (annotationUI.mainEl && annotationState.blockHoverLeaveHandler) {
      annotationUI.mainEl.removeEventListener('mouseleave', annotationState.blockHoverLeaveHandler);
      annotationState.blockHoverLeaveHandler = null;
    }
    hideBlockHover();
    removeFloatingThread();
    if (annotationUI.topbarEl) {
      annotationUI.topbarEl.remove();
      annotationUI.topbarEl = null;
    }
    document.body.classList.remove('peregrine-collab-drawer-open');
    annotationState.hoveredBlockEl = null;
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
    if (annotationUI.canvasRefreshBarEl && annotationState.canvasRefreshBarClickHandler) {
      const refreshButton = annotationUI.canvasRefreshBarEl.querySelector('.annotation-canvas-refresh-btn');
      if (refreshButton instanceof HTMLButtonElement) {
        refreshButton.removeEventListener('click', annotationState.canvasRefreshBarClickHandler);
      }
      annotationState.canvasRefreshBarClickHandler = null;
    }
    if (annotationUI.canvasRefreshBarEl) {
      annotationUI.canvasRefreshBarEl.remove();
      annotationUI.canvasRefreshBarEl = null;
    }
    if (annotationUI.panelEl && annotationState.panelInputHandler) {
      annotationUI.panelEl.removeEventListener('input', annotationState.panelInputHandler);
      annotationState.panelInputHandler = null;
    }
    if (annotationUI.panelEl && annotationState.panelKeydownHandler) {
      annotationUI.panelEl.removeEventListener('keydown', annotationState.panelKeydownHandler);
      annotationState.panelKeydownHandler = null;
    }
    if (annotationUI.panelEl && annotationState.panelFocusoutHandler) {
      annotationUI.panelEl.removeEventListener('focusout', annotationState.panelFocusoutHandler);
      annotationState.panelFocusoutHandler = null;
    }
    if (annotationUI.panelEl && annotationState.panelChangeHandler) {
      annotationUI.panelEl.removeEventListener('change', annotationState.panelChangeHandler);
      annotationState.panelChangeHandler = null;
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

  async function setupAnnotationUI(mainEl, options = {}) {
    const {
      preserveRemoteEditState = false,
    } = options;
    teardownGlobalListeners({ preserveRemoteEditState });
    annotationUI.mainEl = mainEl;
    ensureFloatingLayer();
    ensureCommentsPanel();
    ensureAnnotationTopbar();
    ensureCanvasRefreshBar();
    store.loadAnnotationStore();
    store.rebindThreadsToCurrentDom();
    store.saveAnnotationStore();
    renderThreadMarkers({ resolveTargets: true });
    renderCommentsPanel();

    annotationState.mainClickHandler = (event) => {
      if (!isCommentsViewActive()) return;
      if (!isCommentsServiceAvailable()) return;
      if (popupSubmitPending) return;
      const { target } = event;
      if (!(target instanceof HTMLElement)) return;
      if (target === mainEl) return;
      if (target.closest('a')) event.preventDefault();
      event.stopPropagation();
      // Markups hidden: just highlight the element (show the box), no popup/thread.
      if (annotationState.markupsHidden) {
        setSelectedElement(target);
        return;
      }
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
      // Open the thread in place next to the pin (not the Activity drawer).
      openFloatingThread(marker.dataset.threadId);
    };
    annotationUI.layerEl.addEventListener('click', annotationState.layerClickHandler);

    annotationState.panelClickHandler = async (event) => {
      const { target } = event;
      if (!(target instanceof Element)) return;
      if (!isCommentsServiceAvailable()) return;
      const card = target.closest('.annotation-panel-comment');

      if (card instanceof HTMLElement && card.classList.contains('annotation-panel-edit-item')) {
        const thread = store.getThreadById(card.dataset.threadId);
        if (!thread) return;
        const targetEl = store.getElementForThread(thread);
        if (targetEl) targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        annotationState.activeThreadId = thread.id;
        annotationState.activeMessageId = card.dataset.messageId || '';
        renderCommentsPanel();
        pulseAnnotationMarker(thread.id, card.dataset.messageId || '');
        return;
      }

      if (target.closest('.annotation-panel-reply-btn')) {
        const replyBtn = target.closest('.annotation-panel-reply-btn');
        if (!(replyBtn instanceof HTMLButtonElement)) return;
        const { threadId, commentId } = replyBtn.dataset;
        if (!threadId) return;
        const thread = store.getThreadById(threadId);
        if (isThreadClosed(thread)) {
          showGlobalSnackbar(ANNOTATION_MESSAGES.closedThreadRestricted);
          return;
        }
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
        if (isThreadClosed(thread)) {
          showGlobalSnackbar(ANNOTATION_MESSAGES.closedThreadRestricted);
          return;
        }
        if (!message || !isCommentEditableByCurrentUser(thread, message)) return;
        if (!openCommentEditor(threadId, commentId, message.text || '')) return;
        renderCommentsPanel();
        focusCommentEditor(threadId, commentId);
        return;
      }

      if (target.closest('.annotation-panel-reply-input')) return;
      if (target.closest('.annotation-panel-edit-form')) return;
      if (target.closest('.annotation-panel-reply-composer')) return;
      if (target.closest('.annotation-panel-status-select')) return;
      if (!(card instanceof HTMLElement)) return;

      const thread = store.getThreadById(card.dataset.threadId);
      if (!thread) return;

      // Toggle this comment thread open/closed in the drawer.
      const wasExpanded = annotationState.expandedThreadId === thread.id;
      annotationState.expandedThreadId = wasExpanded ? '' : thread.id;
      annotationState.activeEditId = '';
      annotationState.activeThreadId = thread.id;
      annotationState.activeMessageId = card.dataset.messageId || '';
      renderCommentsPanel();

      if (!wasExpanded) {
        // Opened — locate the anchored element on the page.
        const targetEl = store.getElementForThread(thread);
        if (targetEl) targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        pulseAnnotationMarker(thread.id, card.dataset.messageId || '');
      }
    };
    annotationUI.panelEl.addEventListener('click', annotationState.panelClickHandler);

    annotationState.panelInputHandler = (event) => {
      const { target } = event;
      if (target instanceof HTMLInputElement && target.classList.contains('annotation-panel-reply-input')) {
        updatePanelReplyDraft(target.dataset.threadId, target.dataset.commentId, target.value);
        return;
      }
      if (!(target instanceof HTMLTextAreaElement)) return;
      if (!target.classList.contains('annotation-panel-edit-input')) return;
      updateCommentEditorDraft(target.value);
    };
    annotationUI.panelEl.addEventListener('input', annotationState.panelInputHandler);

    annotationState.panelKeydownHandler = (event) => {
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

    annotationState.panelFocusoutHandler = () => {
      schedulePendingCommentsPanelRefreshFlush();
    };
    annotationUI.panelEl.addEventListener('focusout', annotationState.panelFocusoutHandler);

    annotationState.panelChangeHandler = async (event) => {
      const { target } = event;
      if (!isCommentsServiceAvailable()) return;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.classList.contains('annotation-reviewer-select')) {
        const reviewers = getReviewerParticipants();
        const selectedReviewerProfileId = `${target.value || ''}`.trim();
        if (!selectedReviewerProfileId) return;
        if (!canLoggedInReviewerEditSelection(selectedReviewerProfileId, reviewers)) {
          target.value = '';
          showGlobalSnackbar('Only the logged-in reviewer can mark their review as complete.');
          renderReviewerControls();
          return;
        }
        hideGlobalSnackbar();
        await completeReviewerIfAllowed(selectedReviewerProfileId, reviewers);
        return;
      }
      if (!target.classList.contains('annotation-panel-status-select')) return;
      const { threadId } = target.dataset;
      if (!threadId) return;
      const thread = store.getThreadById(threadId);
      if (!thread) return;
      if (!isThreadStatusEditableByCurrentUser(thread)) {
        target.value = thread.status;
        target.disabled = true;
        showGlobalSnackbar(ANNOTATION_MESSAGES.updateStatusRestricted);
        window.setTimeout(() => {
          target.disabled = false;
        }, 0);
        return;
      }
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
        requestParentCollabRefresh('thread-status-updated');
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
      const { target } = event;
      if (!(target instanceof HTMLElement)) return;
      // Close the floating thread when clicking away from it (and not on a pin).
      if (annotationUI.threadEl
        && !target.closest('.peregrine-collab-thread')
        && !target.closest('.annotation-thread-marker')) {
        removeFloatingThread();
      }
      if (popupSubmitPending) return;
      if (target.closest('.peregrine-collab-thread')) return;
      if (target.closest('.annotation-floating-popup')) return;
      if (target.closest('.annotation-thread-marker')) return;
      if (target.closest('.annotation-comments-panel')) return;
      if (target.closest('main')) return;
      closePopupAndSelection();
    };
    document.addEventListener('click', annotationState.documentClickHandler);

    annotationState.mainScrollHandler = (event) => {
      const { target } = event;
      if (target instanceof Node) {
        if (annotationUI.panelEl?.contains(target)) return;
        if (annotationUI.popupEl?.contains(target)) return;
      }
      hideBlockHover();
      scheduleFloatingUISync();
    };
    annotationState.windowResizeHandler = () => {
      scheduleFloatingUISync();
    };
    mainEl.addEventListener('scroll', annotationState.mainScrollHandler);
    document.addEventListener('scroll', annotationState.mainScrollHandler, true);
    window.addEventListener('resize', annotationState.windowResizeHandler);

    annotationState.blockHoverHandler = (event) => {
      if (!isCommentsViewActive()) return;
      if (annotationState.markupsHidden) return;
      if (popupSubmitPending) return;
      const block = resolveHoverBlock(event.target);
      if (block) {
        showBlockHover(block);
      } else {
        hideBlockHover();
      }
    };
    annotationState.blockHoverLeaveHandler = () => {
      hideBlockHover();
    };
    mainEl.addEventListener('mousemove', annotationState.blockHoverHandler);
    mainEl.addEventListener('mouseleave', annotationState.blockHoverLeaveHandler);
  }

  return {
    applyPendingRemoteEditsSnapshot,
    applyRemoteCollabSnapshot,
    markSelfSavedEditsSnapshot,
    removePopup,
    renderCommentsPanel,
    renderThreadMarkers,
    setupAnnotationUI,
  };
}
