import {getDACompatibleHtml, postData} from './target/da.js';
import {fetchTargetHtmlFromStorage, pushTargetHtmlToSTore} from './store.js';

export function targetCompatibleHtml(html, target, CONFIGS) {

    if (target === 'da') {
        let modifiedHtml = getDACompatibleHtml(html, CONFIGS);
        modifiedHtml = populateMetadataBlock(modifiedHtml);
        pushTargetHtmlToSTore(modifiedHtml);
        return modifiedHtml;
    }
}

function populateMetadataBlock(html) {
    const metadataMap = JSON.parse(window.sessionStorage.getItem('metadataMap')) || {};
    if(Object.keys(metadataMap).length === 0) {
        return html; // No metadata to add
    }
    let metaHtml = "<div><div class='metadata'>";

    for (const [key, value] of Object.entries(metadataMap)) {
        metaHtml += `<div><div><p>${key}</p></div><div><p>${value}</p></div></div>`;
    }
    metaHtml += "</div></div>";
    return html + metaHtml;
}

export async function persistOnTarget(contentUrl, target, targetUrl, CONFIGS) {
    if (target === 'da') {
        return await postData(targetUrl, fetchTargetHtmlFromStorage(contentUrl), CONFIGS);
    }
}
