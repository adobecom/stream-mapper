
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

export async function daPageExists(path) {
  const serviceEP = window.streamConfig?.streamMapper?.serviceEP;
  const token = window.streamConfig?.token;
  try {
    const response = await fetch(
      `${serviceEP}/api/da/page-exists?path=${encodeURIComponent(path)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return false;
    const data = await response.json();
    return data.exists === true;
  } catch (error) {
    // pass
  }
  return false;
}

export async function copyDaPage(fromPath, toPath) {
  const serviceEP = window.streamConfig?.streamMapper?.serviceEP;
  const token = window.streamConfig?.token;
  try {
    const response = await safeFetch(`${serviceEP}/api/da/copy-page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fromPath, toPath }),
    });
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    return false;
  }
}

async function getDAContent(path = false) {
  const url = path || window.streamConfig.targetUrl;
  const serviceEP = window.streamConfig?.streamMapper?.serviceEP;
  const token = window.streamConfig?.token;
  let response = null;
  try {
    response = await safeFetch(
      `${serviceEP}/api/da/content?path=${encodeURIComponent(url)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (error) {
    handleError(error, 'getting html from DA page');
    throw error;
  }
  let html = await response.text();
  html = getMiloCompatibleHtml(html);
  return html;
}

function restoreNewlinesInMasonryCell(doc) {
  doc.querySelectorAll('.section-metadata > div').forEach((row) => {
    const propertyCell = row.children[0];
    const valueCell = row.children[1];
    if (!propertyCell || !valueCell) return;
    if (propertyCell.textContent.trim().toLowerCase() !== 'masonry') return;
    [...valueCell.querySelectorAll(':scope > p')].forEach((p, i) => {
      if (i === 0) return;
      const prev = p.previousSibling;
      const hasNewline = prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.includes('\n');
      if (!hasNewline) valueCell.insertBefore(doc.createTextNode('\n'), p);
    });
  });
}

// eslint-disable-next-line import/prefer-default-export
export async function fetchDAContent(path = false) {
  const doc = await getDAContent(path);
  const parser = new DOMParser();
  const html = parser.parseFromString(doc, 'text/html');
  restoreNewlinesInMasonryCell(html);
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
