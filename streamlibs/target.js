import { getDACompatibleHtml, postData } from './target/da.js';
import { fetchTargetHtmlFromStore } from './store.js';

export function targetCompatibleHtml(html) {
    if (!window.streamConfig.target === 'da') return html;
    let modifiedHtml = getDACompatibleHtml(html);
    return modifiedHtml;
}

export async function persistOnTarget() {
  if (!window.streamConfig.target === 'da') return;
  return await postData(window.streamConfig.targetUrl, fetchTargetHtmlFromStore(window.streamConfig.contentUrl));
}
