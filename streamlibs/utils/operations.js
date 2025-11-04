/* eslint-disable no-console */
import { fetchFigmaContent } from '../sources/figma.js';
import { fetchDAContent } from '../sources/da.js';

export async function createStreamOperation() {
  const { html } = await fetchFigmaContent();
  return html;
}

export async function editStreamOperation() {
  const daHtml = await fetchDAContent();
  let { html } = await fetchFigmaContent();
  const parser = new DOMParser();
  html = parser.parseFromString(html, 'text/html');
  window.streamConfig.selectedPageBlocks.forEach((block, idx) => {
    let oldHTML = null;
    let newHTML = null;
    try {
      oldHTML = daHtml.querySelectorAll(`.${block}`)[idx];
      newHTML = html.querySelectorAll(`.${block}`)[idx] ? html.querySelectorAll(`.${block}`)[idx] : html.querySelector(`.${block}`);
      oldHTML.replaceWith(newHTML);
    } catch (error) {
      if (!oldHTML) console.log(`Block ${block} not found in DA page`);
      if (!newHTML) console.log(`Block ${block} not found in Figma`);
    }
  });
  return daHtml.innerHTML;
}

export async function addStreamOperation() {
  const daHtml = await fetchDAContent();
  let { html } = await fetchFigmaContent();
  const parser = new DOMParser();
  html = parser.parseFromString(html, 'text/html');
  html.querySelectorAll('body > div').forEach((div) => {
    daHtml.appendChild(div);
  });
  return daHtml.innerHTML;
}
