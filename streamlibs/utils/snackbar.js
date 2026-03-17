let snackbarEl = null;
let snackbarIconEl = null;
let snackbarMessageEl = null;
let hideTimeoutId = null;
let loadingRequestCount = 0;

function ensureSnackbar() {
  if (snackbarEl instanceof HTMLElement && document.body.contains(snackbarEl)) {
    return snackbarEl;
  }

  snackbarEl = document.createElement('div');
  snackbarEl.className = 'stream-snackbar';
  snackbarEl.setAttribute('role', 'status');
  snackbarEl.setAttribute('aria-live', 'polite');
  snackbarEl.innerHTML = `
    <span class="stream-snackbar-icon" aria-hidden="true">!</span>
    <span class="stream-snackbar-message"></span>
  `;

  snackbarIconEl = snackbarEl.querySelector('.stream-snackbar-icon');
  snackbarMessageEl = snackbarEl.querySelector('.stream-snackbar-message');
  document.body.appendChild(snackbarEl);
  return snackbarEl;
}

function setSnackbarVariant(variant = 'error') {
  if (!(snackbarEl instanceof HTMLElement)) return;
  if (!(snackbarIconEl instanceof HTMLElement)) {
    snackbarIconEl = snackbarEl.querySelector('.stream-snackbar-icon');
  }

  snackbarEl.dataset.variant = variant;
  if (!(snackbarIconEl instanceof HTMLElement)) return;

  snackbarIconEl.classList.remove('is-spinner');
  if (variant === 'loading') {
    snackbarIconEl.textContent = '';
    snackbarIconEl.classList.add('is-spinner');
    return;
  }

  snackbarIconEl.textContent = '!';
}

export function hideGlobalSnackbar() {
  if (hideTimeoutId) {
    window.clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }

  if (snackbarEl instanceof HTMLElement) {
    snackbarEl.classList.remove('is-visible');
  }
}

export function showGlobalSnackbar(message, options = {}) {
  const {
    variant = 'error',
    duration = 4200,
  } = options;

  const snackbar = ensureSnackbar();
  if (!(snackbarMessageEl instanceof HTMLElement)) {
    snackbarMessageEl = snackbar.querySelector('.stream-snackbar-message');
  }
  if (!(snackbarMessageEl instanceof HTMLElement)) return;

  setSnackbarVariant(variant);
  snackbarMessageEl.textContent = message;
  snackbar.classList.add('is-visible');

  if (hideTimeoutId) {
    window.clearTimeout(hideTimeoutId);
  }

  hideTimeoutId = window.setTimeout(() => {
    hideGlobalSnackbar();
  }, duration);
}

export function showGlobalSyncIndicator(message = 'Syncing changes...') {
  loadingRequestCount += 1;
  const snackbar = ensureSnackbar();
  if (!(snackbarMessageEl instanceof HTMLElement)) {
    snackbarMessageEl = snackbar.querySelector('.stream-snackbar-message');
  }
  if (!(snackbarMessageEl instanceof HTMLElement)) return;

  if (hideTimeoutId) {
    window.clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }

  setSnackbarVariant('loading');
  snackbarMessageEl.textContent = message;
  snackbar.classList.add('is-visible');
}

export function hideGlobalSyncIndicator() {
  if (loadingRequestCount > 0) {
    loadingRequestCount -= 1;
  }
  if (loadingRequestCount > 0) return;

  if (snackbarEl instanceof HTMLElement && snackbarEl.dataset.variant === 'loading') {
    hideGlobalSnackbar();
  }
}
