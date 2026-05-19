import { setLibs, getMapperEnv } from './utils/utils.js';
import { CONFIG } from './utils/constants.js';

// eslint-disable-next-line no-unused-vars
function decorateArea(area = document) {
  const eagerLoad = (parent, selector) => {
    const img = parent.querySelector(selector);
    img?.removeAttribute('loading');
  };
  (async function loadLCPImage() {
    const marquee = document.querySelector('.marquee');
    if (!marquee) {
      eagerLoad(document, 'img');
      return;
    }
    eagerLoad(marquee, 'div:first-child img');
    eagerLoad(marquee, 'div:last-child > div:last-child img');
  }());
}

const STYLES = '';
const LIBS = '/libs';

decorateArea();

const miloLibs = setLibs(LIBS);

(function loadStyles() {
  const paths = [`${miloLibs}/styles/styles.css`];
  if (STYLES) { paths.push(STYLES); }
  paths.forEach((path) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', path);
    document.head.appendChild(link);
  });
}());

(async function loadPage() {
  const { loadArea, setConfig } = await import(`${miloLibs}/utils/utils.js`);
  // eslint-disable-next-line no-unused-vars
  const config = setConfig({
    ...CONFIG, ...CONFIG[getMapperEnv()], decorateArea, miloLibs,
  });
  await loadArea();
  const metaTag = document.querySelector('meta[name="initiate-previewer"]');
  if (metaTag && metaTag.getAttribute('content') === 'off') return;
  const { default: initPreviewer } = await import('./previewer.js');
  await initPreviewer();
}());
