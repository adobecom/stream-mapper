import { setLibs } from './utils/utils.js';

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

function getMapperEnv() {
  const { origin } = window.location;
  if (origin.includes('dev--')) return 'dev';
  if (origin.includes('stage--')) return 'stage';
  if (origin.includes('main--')) return 'prod';
  return 'dev';
}

const CONFIG = {
  decorateArea,
  locales: {
    '': { ietf: 'en-US', tk: 'hah7vzn.css' },
    de: { ietf: 'de-DE', tk: 'hah7vzn.css' },
    kr: { ietf: 'ko-KR', tk: 'zfo3ouc' },
  },
  prod: {
    streamMapper: {
      serviceEP: 'https://adobe-acom-stream-service-deploy-ethos502-prod-or2-1de07c.cloud.adobe.io',
      figmaMappingUrl: '/api/fig-comps',
      figmaBlockContentUrl: '/api/fig-comp-details',
      pushToDaUrl: '/api/push-html',
      blockMappingsUrl: 'https://main--stream-mapper--adobecom.aem.live/block-mappings',
      figmaAuthToken: '',
      daToken: '',
      preflightUrl: '/drafts/stream/tools/preflight-controller?milolibs=stream-prod',
      sidekickLoginUrl: '/drafts/stream/tools/sidekick-controller?milolibs=stream-prod',
      allowMessagesFromDomains: ['https://440859-stream.adobeio-static.net'],
    },
  },
  stage: {
    streamMapper: {
      serviceEP: 'https://adobe-acom-stream-service-deploy-ethos502-prod-or2-1de07c.cloud.adobe.io',
      figmaMappingUrl: '/api/fig-comps',
      figmaBlockContentUrl: '/api/fig-comp-details',
      pushToDaUrl: '/api/push-html',
      blockMappingsUrl: 'https://stage--stream-mapper--adobecom.aem.page/block-mappings',
      figmaAuthToken: '',
      daToken: '',
      preflightUrl: '/drafts/stream/tools/preflight-controller?milolibs=stream-stage',
      sidekickLoginUrl: '/drafts/stream/tools/sidekick-controller?milolibs=stream-stage',
      allowMessagesFromDomains: ['https://440859-stream*.adobeio-static.net'],
    },
  },
  dev: {
    streamMapper: {
      serviceEP: 'https://adobe-acom-stream-service-deploy-ethos502-prod-or2-1de07c.cloud.adobe.io',
      figmaMappingUrl: '/api/fig-comps',
      figmaBlockContentUrl: '/api/fig-comp-details',
      pushToDaUrl: '/api/push-html',
      blockMappingsUrl: 'https://stage--stream-mapper--adobecom.aem.page/block-mappings',
      figmaAuthToken: '',
      daToken: '',
      preflightUrl: '/drafts/stream/tools/preflight-controller?milolibs=stream-dev',
      sidekickLoginUrl: '/drafts/stream/tools/sidekick-controller?milolibs=stream-dev',
      allowMessagesFromDomains: ['*', 'https://440859-stream*.adobeio-static.net'],
    },
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
  // eslint-disable-next-line no-unused-vars
  const config = setConfig({ ...CONFIG, ...CONFIG[getMapperEnv()], miloLibs });
  await loadArea();
  const metaTag = document.querySelector('meta[name="initiate-previewer"]');
  if (metaTag && metaTag.getAttribute('content') === 'off') return;
  const { default: initPreviewer } = await import('./previewer.js');
  await initPreviewer();
}());
