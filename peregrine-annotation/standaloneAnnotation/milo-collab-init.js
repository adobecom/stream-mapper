// Check
/* eslint-disable no-console */
import { CONFIG } from '../utils/config.js';
import {
  resetTargetHtmlInStore,
  resetPreviewHtmlInStore,
  resetEditChangesInStore,
} from '../store/store.js';
import {
  annotationOperationOnHostPage,
  applyRemoteCollabSnapshot,
  refreshTopbarUser,
} from '../annotation.js';

const API_ENDPOINT = 'http://localhost:8081/api';
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_MIN_LENGTH = 3;
const SESSION_TOKEN_KEY = 'peregrine.ims.accessToken';

function getImsHostFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload?.as?.includes('ims-na1-stg1')) return 'ims-na1-stg1.adobelogin.com';
  } catch { /* fall through */ }
  return 'ims-na1.adobelogin.com';
}

let cachedUserProfile = null;
let activeCollabPollId = null;

async function fetchCurrentUserProfile(token) {
  if (cachedUserProfile) return cachedUserProfile;
  if (!token) return null;
  try {
    const res = await fetch(`https://${getImsHostFromToken(token)}/ims/profile/v1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const p = await res.json();
    const firstName = `${p?.first_name || ''}`.trim();
    const lastName = `${p?.last_name || ''}`.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    cachedUserProfile = {
      email: `${p?.email || ''}`.trim().toLowerCase(),
      name: `${p?.displayName || fullName || ''}`.trim(),
    };
    return cachedUserProfile;
  } catch {
    return null;
  }
}
function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString();
}

const stopActiveCollabPolling = () => {
  if (!activeCollabPollId) return;
  window.clearInterval(activeCollabPollId);
  activeCollabPollId = null;
};

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
  link.dataset.peregrineMapperStyles = '';
  document.head.appendChild(link);
}

function getToken() {
  try {
    const raw = window.sessionStorage?.getItem(SESSION_TOKEN_KEY);
    if (!raw) return '';
    try { return JSON.parse(raw)?.token || raw; } catch { return raw; }
  } catch {
    return '';
  }
}

export function hasPeregrineAuthToken() {
  return Boolean(getToken());
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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ assignments }),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(result?.error || 'Failed to assign roles');
  }
}

async function searchCollabs(pageUrl) {
  const token = getToken();
  const res = await fetch(
    `${API_ENDPOINT}/me/collabs/search?url=${encodeURIComponent(pageUrl)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result?.error || `HTTP ${res.status}`);
  return Array.isArray(result) ? result : (result?.collabs || result?.data || []);
}

async function fetchAndApplyCollabSnapshot(collabId) {
  const token = getToken();
  if (!collabId || !token) return;
  const serviceEP = window.peregrineConfig?.peregrineMapper?.serviceEP || '';
  if (!serviceEP) return;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const r = await fetch(`${serviceEP}/api/collabs/${encodeURIComponent(collabId)}`, { headers });
    const collab = await r.json();
    applyRemoteCollabSnapshot({ collab });
  } catch (err) {
    console.warn('[milo-collab-init] Failed to fetch collab snapshot:', err);
  }
}

async function startAnnotation(createdCollabId = null) {
  stopActiveCollabPolling();
  const params = new URLSearchParams(window.location.search);
  const token = getToken();
  if (!token) {
    console.error('[milo-collab-init] No auth token found.');
    return false;
  }

  loadCssFiles(new URL('../annotation/annotation.css', import.meta.url).href);
  const env = getMapperEnv();
  const collabId = createdCollabId || params.get('miloCollabId') || params.get('peregrine-collab-id');

  const userProfile = await fetchCurrentUserProfile(token);

  /*
  const { host, pathname } = window.location;
  if (!host.includes('.aem.')) return;
  const repo = host.split('--')[1];
  const pageUrl = `adobecom/${repo}${pathname}`;
  let filename = pathname.split('/');
  filename = filename[filename.length - 1];
  const draftLocation = `adobecom/${repo}/drafts/collab/${collabId}/${filename}`;
  */
  window.peregrineConfig = {
    peregrineMapper: { ...CONFIG[env].peregrineMapper },
    source: 'da',
    pageUrl: window.location.href,
    token,
    userEmail: userProfile?.email || '',
    userName: userProfile?.name || '',
    username: userProfile?.name || userProfile?.email || '',
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
  refreshTopbarUser();

  const startPolling = () => {
    if (activeCollabPollId || document.visibilityState !== 'visible') return;
    activeCollabPollId = window.setInterval(() => {
      fetchAndApplyCollabSnapshot(collabId);
    }, 10000);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchAndApplyCollabSnapshot(collabId);
      startPolling();
    } else {
      stopActiveCollabPolling();
    }
  });
  startPolling();
  return true;
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
      width: 100%; max-width: 520px; padding: 32px; position: relative;
      display: flex; flex-direction: column; gap: 8px;
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
    .sc-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 16px; border-top: 1px solid #f0f0f0; }
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
    .sc-collab-list-wrap { position: relative; overflow: hidden; }
    .sc-collab-list {
      display: flex; flex-direction: column; gap: 4px; max-height: 280px;
      overflow-y: auto; scrollbar-width: thin; scrollbar-color: #ccc transparent;
      padding: 4px 4px 24px;
    }
    .sc-collab-list::-webkit-scrollbar { width: 5px; }
    .sc-collab-list::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
    .sc-list-fade {
      position: absolute; bottom: 0; left: 0; right: 0; height: 36px;
      background: linear-gradient(transparent, #fff);
      pointer-events: none; transition: opacity 0.2s;
    }
    .sc-list-fade.sc-fade-hidden { opacity: 0; }
    .sc-modal-header { display: flex; align-items: center; padding-bottom: 16px; border-bottom: 1px solid #f0f0f0; }
    .sc-close-btn {
      margin-left: auto; flex-shrink: 0;
      width: 36px; height: 36px; border-radius: 50%;
      border: none; background: #eee; color: #555;
      font-size: 18px; line-height: 1; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-family: inherit; padding: 0; transition: background 0.15s;
    }
    .sc-close-btn:hover { background: #ddd; color: #111; }
    .sc-list-status { font-size: 14px; color: #6b7280; text-align: center; padding: 16px 0; margin: 0; }
    .sc-collab-item {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 10px 12px; border: none; border-radius: 10px; width: 100%;
      cursor: pointer; transition: background 0.15s;
      font-family: inherit; background: transparent; text-align: left;
    }
    .sc-collab-item:hover { background: #f5f5f5; }
    .sc-collab-item--active { background: #eef4ff; }
    .sc-collab-item--active .sc-collab-item-name { color: #1473E6; }
    .sc-collab-item-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
    .sc-collab-item-left { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .sc-collab-right-col { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
    .sc-collab-item-when { font-size: 12px; color: #6b7280; white-space: nowrap; }
    .sc-collab-pills {
      display: flex; flex-wrap: wrap; gap: 4px;
    }
    .sc-owner-pill {
      font-size: 11px; font-weight: 500; color: #5b21b6; background: #ede9fe;
      border-radius: 999px; padding: 2px 8px; white-space: nowrap; flex-shrink: 0;
    }
    .sc-participant-pill {
      font-size: 11px; color: #374151; background: #f3f4f6; border: 1px solid #e5e7eb;
      border-radius: 999px; padding: 2px 8px; white-space: nowrap; flex-shrink: 0;
    }
    @keyframes sc-spin { to { transform: rotate(360deg); } }
    .sc-spinner {
      width: 24px; height: 24px; border: 3px solid #e5e7eb;
      border-top-color: #1473E6; border-radius: 50%;
      animation: sc-spin 0.7s linear infinite;
    }
    .sc-list-loading { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px 0; }
    .sc-scroll-chevron { display: none; }
    .sc-btn-back {
      display: inline-flex; align-items: center; gap: 4px; border: none;
      background: transparent; color: #1473E6; font-size: 13px; font-weight: 600;
      cursor: pointer; padding: 0; font-family: inherit;
    }
    .sc-btn-back:hover { text-decoration: underline; }
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

    const modalHeader = document.createElement('div');
    modalHeader.className = 'sc-modal-header';
    const heading = document.createElement('h2');
    heading.textContent = 'Collaboration';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sc-close-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    modalHeader.append(heading, closeBtn);
    modal.append(modalHeader);

    // ── Start Collab tab content ──
    const startContent = document.createElement('div');
    startContent.className = 'sc-tab-content';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'sc-btn-back';
    backBtn.textContent = '← Back to list';
    startContent.appendChild(backBtn);

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
    const startSubmitBtn = document.createElement('button');
    startSubmitBtn.type = 'button';
    startSubmitBtn.className = 'sc-btn-submit';
    startSubmitBtn.textContent = 'Create Collab';
    startActions.appendChild(startSubmitBtn);
    startContent.appendChild(startActions);

    modal.appendChild(startContent);

    // ── List Collab tab content ──
    const openContent = document.createElement('div');
    openContent.className = 'sc-tab-content sc-tab-content--active';

    const listWrap = document.createElement('div');
    listWrap.className = 'sc-collab-list-wrap';
    const listContainer = document.createElement('div');
    listContainer.className = 'sc-collab-list';
    let listStatus = document.createElement('div');
    listStatus.className = 'sc-list-loading';
    const spinner = document.createElement('div');
    spinner.className = 'sc-spinner';
    const spinnerText = document.createElement('p');
    spinnerText.className = 'sc-list-status';
    spinnerText.textContent = 'Loading collabs...';
    listStatus.append(spinner, spinnerText);
    listContainer.appendChild(listStatus);
    const listFade = document.createElement('div');
    listFade.className = 'sc-list-fade';
    const scrollChevron = document.createElement('div');
    scrollChevron.className = 'sc-scroll-chevron';
    listFade.appendChild(scrollChevron);
    listWrap.appendChild(listContainer);
    listWrap.appendChild(listFade);
    openContent.appendChild(listWrap);

    const openFormError = document.createElement('p');
    openFormError.className = 'sc-error';
    openFormError.style.display = 'none';
    openContent.appendChild(openFormError);

    const openActions = document.createElement('div');
    openActions.className = 'sc-actions';
    const createNewBtn = document.createElement('button');
    createNewBtn.type = 'button';
    createNewBtn.className = 'sc-btn-submit';
    createNewBtn.textContent = '+ Create new collab';
    openActions.appendChild(createNewBtn);
    openContent.appendChild(openActions);

    modal.appendChild(openContent);

    // ── Close helper ──
    function close(result) {
      overlay.remove();
      resolve(result);
    }

    // ── View switching ──
    function switchTab(activeTab) {
      const isStart = activeTab === 'start';
      startContent.classList.toggle('sc-tab-content--active', isStart);
      openContent.classList.toggle('sc-tab-content--active', !isStart);
    }

    // ── List load ──
    let listLoaded = false;
    function loadCollabList() {
      if (listLoaded) return;
      listLoaded = true;
      const { host, pathname } = window.location;
      const repo = host.split('--')[1] || '';
      const daPageUrl = `adobecom/${repo}${pathname}`;
      const activeCollabId = new URLSearchParams(window.location.search).get('peregrine-collab-id') || '';
      searchCollabs(daPageUrl).then((collabs) => {
        listStatus.remove();
        if (!collabs.length) {
          const empty = document.createElement('p');
          empty.className = 'sc-list-status';
          empty.textContent = 'No collabs found for this page.';
          listContainer.appendChild(empty);
          return;
        }
        collabs.forEach((collab) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'sc-collab-item';

          const leftCol = document.createElement('div');
          leftCol.className = 'sc-collab-item-left';

          const name = document.createElement('span');
          name.className = 'sc-collab-item-name';
          name.textContent = collab.title || collab.name || 'Untitled';

          const pillsEl = document.createElement('div');
          pillsEl.className = 'sc-collab-pills';

          const ownerName = collab.owner?.name || collab.owner?.email || '';
          if (ownerName) {
            const ownerPill = document.createElement('span');
            ownerPill.className = 'sc-owner-pill';
            ownerPill.textContent = ownerName;
            pillsEl.appendChild(ownerPill);
          }

          const seen = new Set();
          (collab.participants || []).forEach((p) => {
            if (p.role === 'owner') return;
            const key = String(p.id);
            if (seen.has(key)) return;
            seen.add(key);
            const pill = document.createElement('span');
            pill.className = 'sc-participant-pill';
            pill.textContent = p.name || p.email || String(p.id);
            pillsEl.appendChild(pill);
          });

          leftCol.append(name, pillsEl);

          const rightCol = document.createElement('div');
          rightCol.className = 'sc-collab-right-col';

          const whenEl = document.createElement('span');
          whenEl.className = 'sc-collab-item-when';
          whenEl.textContent = relativeTime(collab.createdAt);

          rightCol.appendChild(whenEl);
          item.append(leftCol, rightCol);

          const isActive = activeCollabId
            && (collab.id === activeCollabId || collab.collabId === activeCollabId);
          if (isActive) {
            item.classList.add('sc-collab-item--active');
          }

          item.addEventListener('click', () => {
            close({ action: 'open', collabId: collab.id || collab.collabId });
          });
          listContainer.appendChild(item);
        });
        if (listContainer.scrollHeight <= listContainer.clientHeight) {
          listFade.classList.add('sc-fade-hidden');
        }
      }).catch((err) => {
        listStatus.remove();
        openFormError.textContent = err?.message || 'Failed to load collabs.';
        openFormError.style.display = 'block';
      });
    }

    function resetAndReloadList() {
      listContainer.innerHTML = '';
      listStatus = document.createElement('div');
      listStatus.className = 'sc-list-loading';
      const newSpinner = document.createElement('div');
      newSpinner.className = 'sc-spinner';
      const newSpinnerText = document.createElement('p');
      newSpinnerText.className = 'sc-list-status';
      newSpinnerText.textContent = 'Loading collabs...';
      listStatus.append(newSpinner, newSpinnerText);
      listContainer.appendChild(listStatus);
      listFade.classList.remove('sc-fade-hidden');
      listLoaded = false;
      loadCollabList();
    }

    listContainer.addEventListener('scroll', () => {
      const atBottom = listContainer.scrollHeight - listContainer.scrollTop
        <= listContainer.clientHeight + 1;
      listFade.classList.toggle('sc-fade-hidden', atBottom);
    });

    let holdTimer = null;
    let holdInterval = null;
    const clearHold = () => {
      clearTimeout(holdTimer);
      clearInterval(holdInterval);
      holdTimer = null;
      holdInterval = null;
    };
    scrollChevron.addEventListener('mousedown', (e) => {
      e.preventDefault();
      listContainer.scrollBy({ top: 80, behavior: 'smooth' });
      holdTimer = setTimeout(() => {
        holdInterval = setInterval(() => { listContainer.scrollBy({ top: 80 }); }, 100);
      }, 400);
    });
    scrollChevron.addEventListener('mouseup', clearHold);
    scrollChevron.addEventListener('mouseleave', clearHold);

    closeBtn.addEventListener('click', () => close(null));
    createNewBtn.addEventListener('click', () => {
      switchTab('start');
      fetchCurrentUserProfile(getToken()).then((profile) => {
        if (profile?.email) ownerField.addPinned(profile.email, profile.name || profile.email);
      });
    });
    backBtn.addEventListener('click', () => switchTab('open'));

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

    loadCollabList();

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
        const previewUrl = `${previewBase}?martech=off&mepButton=off&georouting=off&daRenderingApp=peregrine`;

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
        createNewBtn.remove();
        resetAndReloadList();
      } catch (err) {
        console.error('[milo-collab-init] Failed to start collab:', err);
        startFormError.textContent = err?.message || 'Failed to start collab. Please try again.';
        startFormError.style.display = 'block';
        startSubmitBtn.disabled = false;
        startSubmitBtn.textContent = 'Create Collab';
      }
    });

    document.body.appendChild(overlay);
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
let collabListListenerAdded = false;

// eslint-disable-next-line import/prefer-default-export
export async function initializePeregrineAnnotation() {
  if (!collabListListenerAdded) {
    collabListListenerAdded = true;
    document.addEventListener('peregrine:show-collab-list', async () => {
      const result = await showCollabModal();
      if (result?.action === 'open') {
        const url = new URL(window.location.href);
        url.searchParams.set('peregrine-collab-id', result.collabId);
        window.history.replaceState(null, '', url.toString());
        await startAnnotation(result.collabId);
      }
    });
  }

  if (initInProgress) return;
  initInProgress = true;

  if (!hasPeregrineAuthToken()) {
    console.error('[milo-collab-init] No auth token found.');
    initInProgress = false;
    return;
  }

  const params = new URLSearchParams(window.location.search);

  const collabId = params.get('peregrine-collab-id');

  if (collabId) {
    const started = await startAnnotation(collabId);
    if (!started) initInProgress = false;
    return;
  }

  if (params.has('peregrine-collab-id')) {
    const result = await showCollabModal();
    if (!result) {
      initInProgress = false;
      return;
    }
    if (result.action === 'open') {
      const selectedUrl = new URL(window.location.href);
      selectedUrl.searchParams.set('peregrine-collab-id', result.collabId);
      window.history.replaceState(null, '', selectedUrl.toString());
      const started = await startAnnotation(result.collabId);
      if (!started) initInProgress = false;
    }
    return;
  }

  // eslint-disable-next-line no-alert
  alert('Collab Not enabled');
  initInProgress = false;
}
