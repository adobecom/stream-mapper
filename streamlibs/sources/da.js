import { handleError, safeFetch } from '../utils/error-handler.js';

async function getDAContent() {
  let url = window.streamConfig.targetUrl;
  if (!url.startsWith('/')) url = `/${url}`;
  if (!url.endsWith('.html')) url += '.html';
  const options = {
    method: 'GET',
    headers: {
      'Content-Type': 'text/html',
      Authorization: window.streamConfig.token,
    },
  };
  let response = null;
  try {
    response = await safeFetch(`https://admin.da.live/source${url}`, options);
  } catch (error) {
    handleError(error, 'getting html from DA page');
    throw error;
  }
  const html = await response.text();
  return html;
}

// eslint-disable-next-line import/prefer-default-export
export async function fetchDAContent() {
  const doc = await getDAContent();
  const parser = new DOMParser();
  const html = parser.parseFromString(doc, 'text/html');
  return html.querySelector('main');
}

export async function previewDAPage(url) {
  let previewUrl = url;
  if (previewUrl.startsWith('/')) previewUrl = previewUrl.slice(1);
  previewUrl = previewUrl.split('/');
  previewUrl.splice(2, 0, 'main');
  previewUrl = previewUrl.join('/');
  previewUrl = `https://admin.hlx.page/preview/${previewUrl}`;
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'text/html',
      Authorization: `Bearer ${window.streamConfig.token}`,
      accept: '*/*',
    },
  };
  try {
    const response = await safeFetch(previewUrl, options);
    return await response.json();
  } catch (error) {
    handleError(error, ' previewing DA page');
    throw error;
  }
}
