// Check
/* eslint-disable no-console */
import { CONFIG } from '../utils/config.js';
import {
  resetTargetHtmlInStore,
  resetPreviewHtmlInStore,
  resetEditChangesInStore,
} from '../store/store.js';
import { annotationOperationOnHostPage, applyRemoteCollabSnapshot } from '../annotation.js';
import { initIms, getImsToken, getImsProfile } from './ims.js';

const API_ENDPOINT = 'http://localhost:8081/api';
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_MIN_LENGTH = 3;

let resolvedToken = '';
let resolvedEmail = '';
let resolvedName = '';

function getMapperEnv() {
  return 'dev';
}

function initiatePreviewer() {
  annotationOperationOnHostPage();
}

function loadCssFiles(filePath) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = filePath;
  link.dataset.streamMapperStyles = '';
  document.head.appendChild(link);
}

function getToken() {
  return getImsToken() || resolvedToken || window.adobeIMS?.getAccessToken()?.token || '';
}

async function searchUsers(query) {
  if (!query || query.length < SEARCH_MIN_LENGTH) return [];
  const token = getToken();
  if (!token) return [];
  try {
    const res = await fetch(
      `${API_ENDPOINT}/search/groups-or-users?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    const payload = await res.json();
    // eslint-disable-next-line no-nested-ternary
    const result = Array.isArray(payload?.result)
      ? payload.result
      : Array.isArray(payload) ? payload : [];
    return result.filter((item) => item?.type === 'user' && item?.id).slice(0, 8);
  } catch {
    return [];
  }
}

async function createCollab(collabData) {
  const token = getToken();
  const res = await fetch(`${API_ENDPOINT}/collabs`, {
    method: 'POST',
    // eslint-disable-next-line object-curly-newline
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-User-Email': resolvedEmail, 'X-User-Name': resolvedName },
    body: JSON.stringify(collabData),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result?.error || `HTTP ${res.status}`);
  return result;
}

async function assignCollabRoles(collabId, assignments) {
  if (!assignments.length) return;
  const token = getToken();
  const res = await fetch(`${API_ENDPOINT}/collabs/${encodeURIComponent(collabId)}/roles/assign`, {
    method: 'POST',
    // eslint-disable-next-line object-curly-newline
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-User-Email': resolvedEmail, 'X-User-Name': resolvedName },
    body: JSON.stringify({ assignments }),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(result?.error || 'Failed to assign roles');
  }
}

async function fetchAndApplyCollabSnapshot(collabId) {
  const token = getToken();
  if (!collabId || !token) return;
  const serviceEP = window.streamConfig?.streamMapper?.serviceEP || '';
  if (!serviceEP) return;
  const headers = { Authorization: `Bearer ${token}`, 'X-User-Email': resolvedEmail, 'X-User-Name': resolvedName };
  try {
    const r = await fetch(`${serviceEP}/api/collabs/${encodeURIComponent(collabId)}`, { headers });
    const collab = await r.json();
    applyRemoteCollabSnapshot({ collab });
  } catch (err) {
    console.warn('[milo-collab-init] Failed to fetch collab snapshot:', err);
  }
}

async function startAnnotation(createdCollabId = null) {
  const params = new URLSearchParams(window.location.search);
  loadCssFiles(new URL('../annotation/annotation.css', import.meta.url).href);
  const env = getMapperEnv();
  const collabId = createdCollabId || params.get('miloCollabId') || params.get('peregrine-collab-id');
  /*
  const { host, pathname } = window.location;
  if (!host.includes('.aem.')) return;
  const repo = host.split('--')[1];
  const pageUrl = `adobecom/${repo}${pathname}`;
  let filename = pathname.split('/');
  filename = filename[filename.length - 1];
  const draftLocation = `adobecom/${repo}/drafts/collab/${collabId}/${filename}`;
  */
  const username = resolvedName || resolvedEmail.split('@')[0] || 'Unknown';
  window.streamConfig = {
    streamMapper: { ...CONFIG[env].streamMapper },
    source: 'da',
    pageUrl: window.location.href,
    token: getToken(),
    userEmail: resolvedEmail,
    userName: resolvedName,
    username,
    profileId: '3',
    collabId,
    reviewId: params.get('miloCollabId') || params.get('peregrine-collab-id'),
    collabRole: 'owner',
  };

  resetTargetHtmlInStore();
  resetPreviewHtmlInStore();
  resetEditChangesInStore();

  // Standalone mode: page is already loaded by Milo; inject the readiness signal that
  // annotationOperationOnHostPage waits for (normally provided by miloLoadArea in iframe flow).
  if (!document.getElementById('page-load-ok-milo')) {
    const sig = document.createElement('div');
    sig.id = 'page-load-ok-milo';
    sig.style.display = 'none';
    document.body.appendChild(sig);
  }
  await initiatePreviewer();
  await fetchAndApplyCollabSnapshot(collabId);

  let pollId = null;
  const startPolling = () => {
    if (pollId || document.visibilityState !== 'visible') return;
    pollId = window.setInterval(() => {
      fetchAndApplyCollabSnapshot(collabId);
    }, 20000);
  };
  const stopPolling = () => {
    if (!pollId) return;
    window.clearInterval(pollId);
    pollId = null;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchAndApplyCollabSnapshot(collabId);
      startPolling();
    } else {
      stopPolling();
    }
  });
  startPolling();
}

function injectModalStyles() {
  if (document.getElementById('sc-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'sc-modal-styles';
  style.textContent = `
    .sc-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      animation: sc-fade-in 0.2s ease;
    }
    @keyframes sc-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes sc-slide-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    .sc-modal {
      background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      width: 100%; max-width: 520px; padding: 32px;
      display: flex; flex-direction: column; gap: 20px;
      animation: sc-slide-up 0.3s cubic-bezier(0.22,1,0.36,1) both;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .sc-modal h2 {
      margin: 0; font-size: 20px; font-weight: 600; color: #1a1a1a;
    }
    .sc-field { display: flex; flex-direction: column; gap: 4px; }
    .sc-label { font-size: 14px; font-weight: 600; color: #1a1a1a; }
    .sc-required { color: #c0392b; margin-left: 2px; }
    .sc-input {
      width: 100%; min-height: 42px; border: 1px solid #d1d5db; border-radius: 10px;
      background: #fff; color: #1a1a1a; font-size: 14px; padding: 10px 12px;
      box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s;
      font-family: inherit;
    }
    .sc-input:focus { outline: none; border-color: #1473E6; box-shadow: 0 0 0 2px rgba(20,115,230,0.15); }
    .sc-input--error { border-color: #c0392b; }
    .sc-input--readonly { background: #f9fafb; color: #6b7280; cursor: default; }
    .sc-error { font-size: 12px; color: #c0392b; margin-top: 2px; }
    .sc-collab-wrap {
      position: relative; width: 100%; min-height: 42px; border: 1px solid #d1d5db;
      border-radius: 10px; padding: 6px 8px; display: flex; flex-wrap: wrap;
      align-items: center; gap: 6px; background: #fff; box-sizing: border-box;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .sc-collab-wrap:focus-within { border-color: #1473E6; box-shadow: 0 0 0 2px rgba(20,115,230,0.15); }
    .sc-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 8px; background: #f3f4f6; border: 1px solid #d1d5db;
      border-radius: 999px; font-size: 12px; color: #1a1a1a; line-height: 1;
    }
    .sc-pill--pinned { background: #d1fae5; border-color: #059669; color: #059669; }
    .sc-pill-remove {
      border: none; background: transparent; color: #6b7280; cursor: pointer;
      font-size: 14px; line-height: 1; padding: 0;
    }
    .sc-collab-input {
      flex: 1; min-width: 140px; border: none; outline: none; background: transparent;
      font-size: 14px; color: #1a1a1a; padding: 4px 2px; font-family: inherit;
    }
    .sc-collab-input::placeholder { color: #9ca3af; }
    .sc-suggestions {
      position: absolute; left: 0; right: 0; top: 100%; margin-top: 4px;
      border: 1px solid #d1d5db; border-radius: 10px; background: #fff;
      max-height: 180px; overflow-y: auto; z-index: 10;
      display: flex; flex-direction: column;
    }
    .sc-suggestion {
      border: none; background: transparent; text-align: left;
      padding: 10px 12px; font-size: 12px; color: #1a1a1a; cursor: pointer;
      font-family: inherit; transition: background 0.15s;
    }
    .sc-suggestion:hover { background: #f3f4f6; }
    .sc-tabs { display: flex; gap: 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 4px; }
    .sc-tab {
      flex: 1; padding: 10px 16px; border: none; background: transparent;
      font-size: 14px; font-weight: 600; color: #6b7280; cursor: pointer;
      font-family: inherit; transition: color 0.15s, border-color 0.15s;
      border-bottom: 2px solid transparent; margin-bottom: -2px;
    }
    .sc-tab:hover { color: #1a1a1a; }
    .sc-tab--active { color: #1473E6; border-bottom-color: #1473E6; }
    .sc-tab-content { display: none; flex-direction: column; gap: 16px; }
    .sc-tab-content--active { display: flex; }
    .sc-copy-box {
      display: flex; align-items: center; gap: 8px;
    }
    .sc-copy-box input {
      flex: 1; min-height: 42px; border: 1px solid #d1d5db; border-radius: 10px;
      background: #f9fafb; color: #1a1a1a; font-size: 13px; padding: 10px 12px;
      box-sizing: border-box; font-family: monospace;
    }
    .sc-copy-btn {
      padding: 10px 16px; background: #1473E6; color: #fff; border: none;
      border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
      font-family: inherit; white-space: nowrap; transition: background 0.15s;
    }
    .sc-copy-btn:hover { background: #0d66d0; }
    .sc-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
    .sc-btn-cancel {
      padding: 10px 24px; background: #fff; color: #374151; border: 1px solid #d1d5db;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
      font-family: inherit; transition: background 0.15s;
    }
    .sc-btn-cancel:hover { background: #f3f4f6; }
    .sc-btn-submit {
      padding: 10px 24px; background: #1473E6; color: #fff; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
      font-family: inherit; transition: background 0.15s;
    }
    .sc-btn-submit:hover:not(:disabled) { background: #0d66d0; }
    .sc-btn-submit:disabled { opacity: 0.45; cursor: not-allowed; }
    .sc-success-msg { font-size: 14px; color: #059669; font-weight: 600; }
  `;
  document.head.appendChild(style);
}

function createCollaboratorField(label, placeholder) {
  const ldaps = [];
  const displayMap = {};
  let debounceTimer = null;

  const field = document.createElement('div');
  field.className = 'sc-field';

  const labelEl = document.createElement('label');
  labelEl.className = 'sc-label';
  labelEl.textContent = label;
  field.appendChild(labelEl);

  const wrap = document.createElement('div');
  wrap.className = 'sc-collab-wrap';
  field.appendChild(wrap);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'sc-collab-input';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  wrap.appendChild(input);

  const suggestionsEl = document.createElement('div');
  suggestionsEl.className = 'sc-suggestions';
  suggestionsEl.style.display = 'none';
  wrap.appendChild(suggestionsEl);

  function renderPills() {
    wrap.querySelectorAll('.sc-pill').forEach((p) => p.remove());
    ldaps.forEach((ldap, i) => {
      const pill = document.createElement('span');
      pill.className = 'sc-pill';
      const text = document.createElement('span');
      text.textContent = displayMap[ldap] || ldap;
      pill.appendChild(text);
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'sc-pill-remove';
      removeBtn.setAttribute('aria-label', `Remove ${ldap}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        ldaps.splice(i, 1);
        renderPills();
      });
      pill.appendChild(removeBtn);
      wrap.insertBefore(pill, input);
    });
  }

  function showSuggestions(users) {
    suggestionsEl.innerHTML = '';
    if (!users.length) { suggestionsEl.style.display = 'none'; return; }
    users.forEach((user) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sc-suggestion';
      btn.textContent = `${user.displayName || user.id} (${user.id})`;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!ldaps.some((l) => l.toLowerCase() === user.id.toLowerCase())) {
          ldaps.push(user.id);
          if (user.displayName) displayMap[user.id] = user.displayName;
          renderPills();
        }
        input.value = '';
        suggestionsEl.style.display = 'none';
      });
      suggestionsEl.appendChild(btn);
    });
    suggestionsEl.style.display = 'flex';
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < SEARCH_MIN_LENGTH) {
      suggestionsEl.style.display = 'none';
      return;
    }
    debounceTimer = setTimeout(async () => {
      const users = await searchUsers(query);
      showSuggestions(users);
    }, SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { suggestionsEl.style.display = 'none'; }, 150);
  });

  return {
    el: field,
    getLdaps: () => [...ldaps],
    getDisplayMap: () => ({ ...displayMap }),
    addPinned: (ldap, name) => {
      if (!ldaps.some((l) => l.toLowerCase() === ldap.toLowerCase())) {
        ldaps.push(ldap);
        if (name) displayMap[ldap] = name;
        renderPills();
      }
      const pill = wrap.querySelector('.sc-pill');
      if (pill) pill.classList.add('sc-pill--pinned');
    },
  };
}

function showCollabModal() {
  if (document.querySelector('.sc-overlay')) return Promise.resolve(null);
  return new Promise((resolve) => {
    injectModalStyles();

    const overlay = document.createElement('div');
    overlay.className = 'sc-overlay';

    const modal = document.createElement('div');
    modal.className = 'sc-modal';
    overlay.appendChild(modal);

    const heading = document.createElement('h2');
    heading.textContent = 'Collab';
    modal.appendChild(heading);

    // ── Tabs ──
    const tabs = document.createElement('div');
    tabs.className = 'sc-tabs';
    const startTab = document.createElement('button');
    startTab.type = 'button';
    startTab.className = 'sc-tab sc-tab--active';
    startTab.textContent = 'Start a Collab';
    const openTab = document.createElement('button');
    openTab.type = 'button';
    openTab.className = 'sc-tab';
    openTab.textContent = 'Open a Collab';
    tabs.append(startTab, openTab);
    modal.appendChild(tabs);

    // ── Start Collab tab content ──
    const startContent = document.createElement('div');
    startContent.className = 'sc-tab-content sc-tab-content--active';

    // Title field
    const titleField = document.createElement('div');
    titleField.className = 'sc-field';
    const titleLabel = document.createElement('label');
    titleLabel.className = 'sc-label';
    titleLabel.innerHTML = 'Collab Title <span class="sc-required">*</span>';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'sc-input';
    titleInput.placeholder = 'Enter collab title';
    const titleError = document.createElement('span');
    titleError.className = 'sc-error';
    titleError.style.display = 'none';
    titleError.textContent = 'Collab title is required.';
    titleField.append(titleLabel, titleInput, titleError);
    startContent.appendChild(titleField);

    // Page URL field (read-only)
    const urlField = document.createElement('div');
    urlField.className = 'sc-field';
    const urlLabel = document.createElement('label');
    urlLabel.className = 'sc-label';
    urlLabel.textContent = 'Page URL';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'sc-input sc-input--readonly';
    // eslint-disable-next-line prefer-destructuring
    urlInput.value = window.location.href.split('?')[0];
    urlInput.readOnly = true;
    urlField.append(urlLabel, urlInput);
    startContent.appendChild(urlField);

    // Reviewer field
    const reviewerField = createCollaboratorField('Reviewers', 'Search reviewers...');
    startContent.appendChild(reviewerField.el);

    // Owner field
    const ownerField = createCollaboratorField('Owners', 'Search owners...');
    startContent.appendChild(ownerField.el);

    // Pre-fill current user as pinned owner
    try {
      const imsProfile = getImsProfile();
      const profile = imsProfile || window.adobeIMS?.getProfile?.();
      const userId = profile?.userId || profile?.email || '';
      const displayName = profile?.displayName || profile?.name || userId;
      if (userId) ownerField.addPinned(userId, displayName);
    } catch { /* ignore */ }

    // Result area (hidden initially, shown after creation)
    const resultArea = document.createElement('div');
    resultArea.className = 'sc-field';
    resultArea.style.display = 'none';
    const resultLabel = document.createElement('span');
    resultLabel.className = 'sc-success-msg';
    resultLabel.textContent = 'Collab created! Share this ID:';
    const copyBox = document.createElement('div');
    copyBox.className = 'sc-copy-box';
    const copyInput = document.createElement('input');
    copyInput.type = 'text';
    copyInput.readOnly = true;
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'sc-copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(copyInput.value).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      });
    });
    copyBox.append(copyInput, copyBtn);
    resultArea.append(resultLabel, copyBox);
    startContent.appendChild(resultArea);

    const startFormError = document.createElement('p');
    startFormError.className = 'sc-error';
    startFormError.style.display = 'none';
    startContent.appendChild(startFormError);

    const startActions = document.createElement('div');
    startActions.className = 'sc-actions';
    const startCancelBtn = document.createElement('button');
    startCancelBtn.type = 'button';
    startCancelBtn.className = 'sc-btn-cancel';
    startCancelBtn.textContent = 'Cancel';
    const startSubmitBtn = document.createElement('button');
    startSubmitBtn.type = 'button';
    startSubmitBtn.className = 'sc-btn-submit';
    startSubmitBtn.textContent = 'Create Collab';
    startActions.append(startCancelBtn, startSubmitBtn);
    startContent.appendChild(startActions);

    modal.appendChild(startContent);

    // ── Open Collab tab content ──
    const openContent = document.createElement('div');
    openContent.className = 'sc-tab-content';

    const openField = document.createElement('div');
    openField.className = 'sc-field';
    const openLabel = document.createElement('label');
    openLabel.className = 'sc-label';
    openLabel.innerHTML = 'Collab ID <span class="sc-required">*</span>';
    const openInput = document.createElement('input');
    openInput.type = 'text';
    openInput.className = 'sc-input';
    openInput.placeholder = 'Paste collab ID here';
    const openError = document.createElement('span');
    openError.className = 'sc-error';
    openError.style.display = 'none';
    openError.textContent = 'Collab ID is required.';
    openField.append(openLabel, openInput, openError);
    openContent.appendChild(openField);

    const openFormError = document.createElement('p');
    openFormError.className = 'sc-error';
    openFormError.style.display = 'none';
    openContent.appendChild(openFormError);

    const openActions = document.createElement('div');
    openActions.className = 'sc-actions';
    const openCancelBtn = document.createElement('button');
    openCancelBtn.type = 'button';
    openCancelBtn.className = 'sc-btn-cancel';
    openCancelBtn.textContent = 'Cancel';
    const openSubmitBtn = document.createElement('button');
    openSubmitBtn.type = 'button';
    openSubmitBtn.className = 'sc-btn-submit';
    openSubmitBtn.textContent = 'Open Collab';
    openActions.append(openCancelBtn, openSubmitBtn);
    openContent.appendChild(openActions);

    modal.appendChild(openContent);

    // ── Tab switching ──
    function switchTab(activeTab) {
      const isStart = activeTab === 'start';
      startTab.classList.toggle('sc-tab--active', isStart);
      openTab.classList.toggle('sc-tab--active', !isStart);
      startContent.classList.toggle('sc-tab-content--active', isStart);
      openContent.classList.toggle('sc-tab-content--active', !isStart);
    }
    startTab.addEventListener('click', () => switchTab('start'));
    openTab.addEventListener('click', () => switchTab('open'));

    // ── Close helper ──
    function close(result) {
      overlay.remove();
      resolve(result);
    }

    startCancelBtn.addEventListener('click', () => close(null));
    openCancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

    // ── Start Collab submit ──
    let createdCollabId = null;
    startSubmitBtn.addEventListener('click', async () => {
      if (createdCollabId) {
        close({ action: 'open', collabId: createdCollabId });
        return;
      }

      titleError.style.display = 'none';
      startFormError.style.display = 'none';
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.classList.add('sc-input--error');
        titleError.style.display = 'block';
        return;
      }
      titleInput.classList.remove('sc-input--error');

      startSubmitBtn.disabled = true;
      startSubmitBtn.textContent = 'Creating...';

      try {
        const { host, pathname } = window.location;
        const repo = host.split('--')[1] || '';
        const daPageUrl = `adobecom/${repo}${pathname}`;
        const previewBase = `${window.location.origin}${pathname}`;
        const previewUrl = `${previewBase}?martech=off&mepButton=off&georouting=off&daRenderingApp=stream`;

        const collabData = {
          title,
          pageUrl: daPageUrl,
          designUrl: null,
          previewUrl,
          jiraId: null,
          metadata: { source: 'milo-collab-init' },
        };

        const collab = await createCollab(collabData);
        const collabId = collab?.id;
        if (!collabId) throw new Error('No collab id in response');

        const reviewerLdaps = reviewerField.getLdaps();
        const ownerLdaps = ownerField.getLdaps();
        const ownerSet = new Set(ownerLdaps.map((l) => l.toLowerCase()));
        const assignments = [
          ...ownerLdaps.map((ldap) => ({ userId: ldap, role: 'owner', displayName: ownerField.getDisplayMap()[ldap] || ldap })),
          ...reviewerLdaps
            .filter((ldap) => !ownerSet.has(ldap.toLowerCase()))
            .map((ldap) => ({ userId: ldap, role: 'reviewer', displayName: reviewerField.getDisplayMap()[ldap] || ldap })),
        ];
        await assignCollabRoles(collabId, assignments);

        createdCollabId = collabId;
        copyInput.value = collabId;
        resultArea.style.display = 'flex';
        startSubmitBtn.textContent = 'Open Collab';
        startSubmitBtn.disabled = false;
      } catch (err) {
        console.error('[milo-collab-init] Failed to start collab:', err);
        startFormError.textContent = err?.message || 'Failed to start collab. Please try again.';
        startFormError.style.display = 'block';
        startSubmitBtn.disabled = false;
        startSubmitBtn.textContent = 'Create Collab';
      }
    });

    // ── Open Collab submit ──
    openSubmitBtn.addEventListener('click', () => {
      openError.style.display = 'none';
      openFormError.style.display = 'none';
      const id = openInput.value.trim();
      if (!id) {
        openInput.classList.add('sc-input--error');
        openError.style.display = 'block';
        return;
      }
      openInput.classList.remove('sc-input--error');
      close({ action: 'open', collabId: id });
    });

    document.body.appendChild(overlay);
    titleInput.focus();
  });
}

// (async function initMiloCollab() {
//   const params = new URLSearchParams(window.location.search);

//   const collabId = params.get('miloCollabId');
//   if (collabId) {
//     await startAnnotation();
//     return;
//   }

//   const token = getToken();
//   if (!token) {
//     console.error('[milo-collab-init] No auth token found.');
//     return;
//   }

//   const result = await showCollabModal();
//   if (!result) return;

//   if (result.action === 'open') {
//     await startAnnotation(result.collabId);
//   }
// }());

let initInProgress = false;
// eslint-disable-next-line import/prefer-default-export
export async function initializeStreamAnnotation(sidekickDetail = null) {
  if (initInProgress) return;
  initInProgress = true;

  // Primary: bootstrap IMS library for auth
  try {
    await initIms(window.location.href, (token, imsProfile) => {
      if (token && imsProfile) {
        resolvedToken = token;
        resolvedEmail = imsProfile.email || resolvedEmail;
        resolvedName = imsProfile.name || resolvedName;
      }
    });
    const imsToken = getImsToken();
    if (imsToken) {
      resolvedToken = imsToken;
      const imsProfile = getImsProfile();
      if (imsProfile) {
        resolvedEmail = imsProfile.email || resolvedEmail;
        resolvedName = imsProfile.name || resolvedName;
      }
    }
  } catch (e) {
    console.warn('[milo-collab-init] IMS bootstrap failed, falling back:', e);
  }

  // Fallback: backend token exchange via sidekick profile
  if (!resolvedToken) {
    const profile = sidekickDetail?.status?.profile;
    if (profile) {
      try {
        const response = await fetch(`${API_ENDPOINT}/auth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile }),
        });
        if (response.ok) {
          const data = await response.json();
          resolvedToken = data.token || '';
          resolvedEmail = data.email || '';
          resolvedName = profile.name || profile.email?.split('@')[0] || '';
        } else {
          console.warn('[milo-collab-init] Token exchange failed:', response.status);
        }
      } catch (error) {
        console.warn('[milo-collab-init] Token exchange error:', error);
      }
    }
  }

  // Last resort: existing window.adobeIMS
  if (!resolvedToken) {
    resolvedToken = window.adobeIMS?.getAccessToken()?.token || '';
  }

  const params = new URLSearchParams(window.location.search);

  const collabId = params.get('miloCollabId') || params.get('peregrine-collab-id');
  if (collabId) {
    await startAnnotation(collabId);
    return;
  }

  if (!resolvedToken) {
    console.error('[milo-collab-init] No auth token found.');
    // return;
  }

  const result = await showCollabModal();
  if (!result) return;

  if (result.action === 'open') {
    await startAnnotation(result.collabId);
  }
}
