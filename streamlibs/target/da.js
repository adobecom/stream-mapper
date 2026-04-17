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

function removePlaceholderBlocks(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.querySelectorAll('.stream-placeholder, [data-placeholder]').forEach((el) => el.remove());
  doc.querySelectorAll('.block-action-btn').forEach((b) => b.remove());
  doc.querySelectorAll('.has-block-action').forEach((el) => el.classList.remove('has-block-action'));
  return doc.body.innerHTML;
}

export function getDACompatibleHtml(html) {
  html = removePlaceholderBlocks(html);
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
  const payloadUrl = url || pageUrl;
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

/**
 * Extract repo path from user input. Accepts plain paths or da.live/#/… URLs.
 * Only da.live hosts are allowed for URL inputs to prevent SSRF.
 */
export function extractRepoPath(raw) {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return '';
  if (!/^https?:\/\//i.test(t)) {
    return t.replace(/\\/g, '/').replace(/^\/+/, '');
  }
  let u;
  try { u = new URL(t); } catch { throw new Error('Invalid URL.'); }
  const host = u.hostname.toLowerCase();
  if (host !== 'da.live' && !host.endsWith('.da.live')) {
    throw new Error('Only da.live links are supported.');
  }
  if (!u.hash || u.hash === '#') {
    throw new Error('Use a da.live link with a path, e.g. https://da.live/#/org/repo/drafts/…');
  }
  const raw2 = u.hash.startsWith('#/') ? u.hash.slice(2) : u.hash.slice(1).replace(/^\//, '');
  try { return decodeURIComponent(raw2).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, ''); } catch { return raw2; }
}

/**
 * Check whether a DA document already exists at the given path.
 * Returns true if the document exists (HTTP 2xx), false otherwise.
 */
export async function fragmentExistsOnDa(rawPath) {
  const repoPath = extractRepoPath(rawPath);
  if (!repoPath) return false;
  let url = `/${repoPath}`;
  if (!url.endsWith('.html')) url += '.html';
  try {
    const response = await fetch(`https://admin.da.live/source${url}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/html',
        Authorization: window.streamConfig.token,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Push a single block's HTML to a new DA document.
 * Uses the same push API + format as the full-page Push to DA.
 *
 * @param {string} rawPath - repo path or da.live URL
 * @param {string} blockHtml - Milo block innerHTML (will be DA-converted)
 */
export async function pushBlockFragmentToDa(rawPath, blockHtml) {
  const repoPath = extractRepoPath(rawPath);
  if (!repoPath) throw new Error('Fragment path is required.');
  if (/\.\.|%2e%2e/i.test(repoPath)) throw new Error('Invalid path.');
  await postData(repoPath, blockHtml);
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
