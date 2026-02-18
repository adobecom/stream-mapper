import { fetchFigmaContent } from '../sources/figma.js';
import { fetchDAContent } from '../sources/da.js';
import { transformImages } from '../utils/utils.js';
import { getLibs } from '../utils/utils.js';

async function getDADom() {
  const { source } = window.streamConfig;
  if (source === 'figma') {
    const { htmlDom: html } = await fetchFigmaContent();
    return html;
  } else if (source === 'da') {
    const { htmlDom: html } = await fetchDAContent();
    return html;
  }
}

export async function miloLoadArea() {
  await transformImages();
  window['page-load-ok-milo']?.remove();
  const { loadArea } = await import(`${getLibs()}/utils/utils.js`);
  await loadArea();
}

async function initializePreview() {
  const htmlDom = await getDADom();
  const headerEle = document.createElement('header');
  const mainEle = document.createElement('main');
  mainEle.innerHTML = htmlDom;
  document.body.prepend(mainEle);
  document.body.prepend(headerEle);
}

export async function annotationOperation() {
  document.body.classList.add('annotation-mode');
  await initializePreview();
  await miloLoadArea();
}