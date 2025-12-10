// Handle target html in store

export function fetchTargetHtmlFromStore() {
  return window.sessionStorage.getItem('targetHtml');
}

export function pushTargetHtmlToStore(html) {
  window.sessionStorage.setItem('targetHtml', html);
}

export function resetTargetHtmlInStore() {
  window.sessionStorage.removeItem('targetHtml');
}

// Handle preview html in store
export function fetchPreviewHtmlFromStore() {
  return window.sessionStorage.getItem('previewHtml');
}

export function pushPreviewHtmlToStore(html) {
  window.sessionStorage.setItem('previewHtml', html);
}

export function resetPreviewHtmlInStore() {
  window.sessionStorage.removeItem('previewHtml');
}

// Handle edit changes in store
export function fetchEditChangesFromStore() {
  return window.sessionStorage.getItem('stream-edit');
}

export function pushEditChangesToStore(changes) {
  window.sessionStorage.setItem('stream-edit', changes);
}

export function resetEditChangesInStore() {
  window.sessionStorage.removeItem('stream-edit');
}