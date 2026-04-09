/* eslint-disable no-param-reassign */
import { handleError, safeFetch } from '../utils/error-handler.js';
import { fetchTargetHtmlFromStore } from '../store/store.js';
import { getConfig } from '../utils/utils.js';

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

function replaceSpanWithColonText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.querySelectorAll('span.icon').forEach((ele) => {
    const classes = ele.classList[1];
    const iconText = classes.split('icon-')[1];
    ele.after(`:${iconText}:`);
    ele.remove();
  });
  return doc.body.innerHTML;
}
// TODO: check span tag with icon and add in html

export function getDACompatibleHtml(html) {
  html = replacePictureWithImg(html);
  html = replaceSpanWithColonText(html);
  html = html.replaceAll('\n', '');
  html = html.replaceAll('"', "'");
  return html;
}

function wrapHTMLForDA(html) {
  return `<body><header></header><main>${html}</main><footer></footer>`;
}

export async function postData(url, html, options = {}) {
  const config = await getConfig();
  const wrappedHtml = wrapHTMLForDA(html);
  const { suppressErrorPage = false } = options;
  const { pageUrl } = window.streamConfig || {};
  const payloadUrl = pageUrl || url;
  try {
    const response = await safeFetch(`${config.streamMapper.serviceEP}${config.streamMapper.pushToDaUrl}`, {
      method: 'POST',
      headers: {
        Authorization: config.streamMapper.daToken,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        htmlContent: wrappedHtml,
        url: payloadUrl,
      }),
    }, {
      donotShowErrorPage: suppressErrorPage,
    });
    await response.json();
  } catch (error) {
    if (!suppressErrorPage) {
      handleError(error, 'posting to DA');
    }
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
  const { pageUrl, targetUrl, contentUrl } = window.streamConfig || {};
  // eslint-disable-next-line consistent-return, no-return-await
  return await postData(
    pageUrl || targetUrl,
    fetchTargetHtmlFromStore(contentUrl),
  );
}
