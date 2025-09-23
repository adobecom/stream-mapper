export function fetchTargetHtmlFromStorage(contentUrl) {
    return window.sessionStorage.getItem('targetHtml');
}

export function pushTargetHtmlToSTore(html) {
    window.sessionStorage.setItem('targetHtml', html);
}