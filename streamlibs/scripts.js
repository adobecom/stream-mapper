import { setLibs, getLibs } from './utils/utils.js';

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

const CONFIG = {
  decorateArea,
  locales: {
    '': { ietf: 'en-US', tk: 'hah7vzn.css' },
    de: { ietf: 'de-DE', tk: 'hah7vzn.css' },
    kr: { ietf: 'ko-KR', tk: 'zfo3ouc' },
  },
  streamMapper: {
    // figmaMappingUrl: 'https://440859-genesis-dev.adobeio-static.net/api/v1/web/genesis-aio/fig-comps',
    // figmaBlockContentUrl: 'https://runtime.adobe.io/api/v1/web/440859-genesis-dev/genesis-aio/fig-comp-details',
    figmaMappingUrl: 'http://localhost:8080/api/fig-comps',
    figmaBlockContentUrl: 'http://localhost:8080/api/fig-comp-details',
    figmaAuthToken: '',
    daToken: '',
    blockMappingsUrl: 'https://main--stream-mapper--adobecom.aem.page/block-mappings',
    idNameMap: {
      "marquee": "Marquee",
      "icon-block": "IconBlock",
      "text": "Text",
      "media": "Media",
      "howto": "HowTo",
      "aside": "Aside",
      "notification": "Notification",
    }
  },
};

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
  const config = setConfig({ ...CONFIG, miloLibs });
  console.log(config);
  await loadArea();
  const metaTag = document.querySelector('meta[name="initiate-previewer"]');
  if (metaTag && metaTag.getAttribute('content') === 'off') return;
  const { default: initPreviewer } = await import('./previewer.js');
  await initPreviewer();
}());
