import { handleError, safeFetch } from '../utils/error-handler.js';

function restoreImgToPicture(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.querySelectorAll('p').forEach((p) => {
    const img = p.querySelector(':scope > img');
    const hasOnlyImg = img && p.childNodes.length === 1;
    if (hasOnlyImg) {
      const picture = document.createElement('picture');
      const newImg = document.createElement('img');
      Array.from(img.attributes).forEach((attr) => {
        newImg.setAttribute(attr.name, attr.value);
      });
      picture.appendChild(newImg);
      p.replaceWith(picture);
    }
  });
  return doc.body.innerHTML;
}

function restoreColonTextToSpan(html) {
  // eslint-disable-next-line arrow-body-style
  return html.replace(/:([a-zA-Z0-9_-]+):/g, (_, iconText) => {
    return `<span class="icon icon-${iconText}"></span>`;
  });
}

export function getMiloCompatibleHtml(html) {
  const htmlWithRestoredColonText = restoreColonTextToSpan(html);
  return restoreImgToPicture(htmlWithRestoredColonText);
}

async function getDAContent(path = false) {
  let url = window.streamConfig.targetUrl;
  if (path) url = path;
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
  let html = await response.text();
  html = getMiloCompatibleHtml(html);
  return html;
}

// eslint-disable-next-line import/prefer-default-export
export async function fetchDAContent(path = false) {
  const doc = await getDAContent(path);
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
