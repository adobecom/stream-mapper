export function fetchTargetHtmlFromStore() {
  return window.sessionStorage.getItem('targetHtml');
}

export function pushTargetHtmlToStore(html) {
  window.sessionStorage.setItem('targetHtml', html);
}

export function fetchPreviewHtmlFromStore() {
  return window.sessionStorage.getItem('previewHtml');
}

export function pushPreviewHtmlToStore(html) {
  window.sessionStorage.setItem('previewHtml', html);
}