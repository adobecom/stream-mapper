/* eslint-disable no-use-before-define */
/* eslint-disable no-console */
import { fetchFigmaContent } from '../sources/figma.js';

export async function createStreamOperation() {
  // eslint-disable-next-line prefer-const
  const headerMeta = document.head.querySelector('meta[name="header"]');
  if (headerMeta) headerMeta.remove();
  let { htmlDom: html, html: htmlArray } = await fetchFigmaContent();
  return html;
}
