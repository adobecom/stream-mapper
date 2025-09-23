export function fetchFromStorage(contentUrl) {
    return window.sessionStorage.getItem('targetHtml');
}

export function fetchTargetHtmlFromStorage(contentUrl) {
    return window.sessionStorage.getItem('targetHtml');
}

export function pushToStorage(obj) {
    window.sessionStorage.setItem('editor-html', JSON.stringify(obj));
}

export function pushEditableHtmlToSTore(editableHtml) {
    if (window.sessionStorage.getItem('editor-html')) {
        const json = JSON.parse(window.sessionStorage.getItem('editor-html'));
        json.editableHtml = editableHtml;
        window.sessionStorage.setItem('editor-html', JSON.stringify(json));
    }
}

export function pushTargetHtmlToSTore(html) {
    window.sessionStorage.setItem('targetHtml', html);
}