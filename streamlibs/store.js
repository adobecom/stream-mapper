export function fetchTargetHtmlFromStore() {
    return window.sessionStorage.getItem('targetHtml');
}

export function pushTargetHtmlToStore(html) {
    window.sessionStorage.setItem('targetHtml', html);
}