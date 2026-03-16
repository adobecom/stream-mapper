let snackbarEl = null;
let snackbarMessageEl = null;
let hideTimeoutId = null;

function ensureSnackbar() {
  if (snackbarEl instanceof HTMLElement && document.body.contains(snackbarEl)) {
    return snackbarEl;
  }

  snackbarEl = document.createElement('div');
  snackbarEl.className = 'stream-snackbar';
  snackbarEl.setAttribute('role', 'status');
  snackbarEl.setAttribute('aria-live', 'polite');
  snackbarEl.innerHTML = `
    <span class="stream-snackbar__icon" aria-hidden="true">!</span>
    <span class="stream-snackbar__message"></span>
  `;

  snackbarMessageEl = snackbarEl.querySelector('.stream-snackbar__message');
  document.body.appendChild(snackbarEl);
  return snackbarEl;
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
    snackbarMessageEl = snackbar.querySelector('.stream-snackbar__message');
  }
  if (!(snackbarMessageEl instanceof HTMLElement)) return;

  snackbar.dataset.variant = variant;
  snackbarMessageEl.textContent = message;
  snackbar.classList.add('is-visible');

  if (hideTimeoutId) {
    window.clearTimeout(hideTimeoutId);
  }

  hideTimeoutId = window.setTimeout(() => {
    hideGlobalSnackbar();
  }, duration);
}
