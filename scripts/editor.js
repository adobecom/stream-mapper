import {pushEditableHtmlToSTore} from './store.js';

export function renderEditableHtml(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    doc.querySelectorAll('[class]').forEach((parentElement) => {
        parentElement.querySelectorAll('*').forEach((element) => {
            if (element.tagName.toLowerCase() !== 'div') {
                element.setAttribute('contenteditable', 'true');
                const xpath = getXPath(element);
                if (xpath) {
                    element.setAttribute('data-gem-id', xpath);
                }
            }
        });
    });

    pushEditableHtmlToSTore(doc.body.innerHTML);

    // make a call to register the edit event
    addEditListener();

    return doc.body.innerHTML;
}

function getXPath(element) {
    if (!element || element.nodeType !== 1) return '';
    const parts = [];
    while (element.parentNode && element.nodeType === 1) {
        let index = 1;
        let sibling = element.previousSibling;
        while (sibling) {
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                index++;
            }
            sibling = sibling.previousSibling;
        }
        parts.unshift(`${element.tagName.toLowerCase()}[${index}]`);
        element = element.parentNode;
    }
    return parts.length ? '/' + parts.join('/') : '';
}

function saveEditedHTML(container) {
    return container.innerHTML;
}

function updateElementByGemId(gemId, newValue) {
    const element = document.querySelector(`[data-gem-id='${gemId}']`);
    if (element) {
        element.innerHTML = newValue;
    } else {
        console.warn(`Element with data-gem-id '${gemId}' not found.`);
    }
}

function addEditListener() {
    document.addEventListener('focusout', (event) => {
        const element = event.target;
        if (element.hasAttribute('data-gem-id') && element.isContentEditable) {
            console.log(`Edited element data-gem-id: ${element.getAttribute('data-gem-id')}`);
            console.log(`New content: ${element.innerHTML}`);
        }
    }, true);
}