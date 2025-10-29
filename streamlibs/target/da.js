/* eslint-disable no-param-reassign */
import { handleError, safeFetch } from '../utils/error-handler.js';
import { fetchTargetHtmlFromStore } from '../store/store.js';

function replacePictureWithImg(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.querySelectorAll('picture').forEach((picture) => {
    const img = picture.querySelector('img');
    if (img) {
      const newImg = document.createElement('img');
      Array.from(img.attributes).forEach((attr) => {
        newImg.setAttribute(attr.name, attr.value);
      });
      const wrapperP = document.createElement('p');
      wrapperP.appendChild(newImg);
      picture.replaceWith(wrapperP);
    }
  });
  return doc.body.innerHTML;
}

export function getDACompatibleHtml(html) {
  html = replacePictureWithImg(html);
  html = html.replaceAll('\n', '');
  html = html.replaceAll('"', "'");
  html = html.replaceAll("alt= ','");
  return html;
}

function wrapHTMLForDA(html) {
  return `<body><header></header><main>${html}</main><footer></footer>`;
}

export async function postData(url, html) {
  const wrappedHtml = wrapHTMLForDA(html);
  try {
    const response = await safeFetch(`https://admin.da.live/source/${url}.html`, {
      method: 'POST',
      headers: {
        Authorization: window.streamConfig.token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ data: wrappedHtml }),
    });
    await response.json();
  } catch (error) {
    handleError(error, 'posting to DA');
    throw error;
  }
}

export function targetCompatibleHtml(html) {
  if (!window.streamConfig.target === 'da') return html;
  const modifiedHtml = getDACompatibleHtml(html);
  return modifiedHtml;
}

export async function persistOnTarget() {
  if (!window.streamConfig.target === 'da') return;
  // eslint-disable-next-line consistent-return, no-return-await
  return await postData(
    window.streamConfig.targetUrl,
    fetchTargetHtmlFromStore(window.streamConfig.contentUrl),
  );
}
