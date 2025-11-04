export const [setLibs, getLibs] = (() => {
  let libs;
  return [
    (prodLibs, location) => {
      libs = (() => {
        const { hostname, search } = location || window.location;
        if (!(hostname.includes('.aem.') || hostname.includes('local'))) return prodLibs;
        const branch = new URLSearchParams(search).get('milolibs') || 'main';
        if (branch === 'local') return 'http://localhost:6456/libs';
        return branch.includes('--') ? `https://${branch}.aem.live/libs` : `https://${branch}--milo--adobecom.aem.live/libs`;
      })();
      return libs;
    }, () => libs,
  ];
})();

export function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

export function fixRelativeLinks(html) {
  return html.replaceAll('./media', 'https://main--milo--adobecom.aem.page/media');
}

export async function getConfig() {
  const { getConfig: miloGetConfig } = await import(`${getLibs()}/utils/utils.js`);
  return miloGetConfig();
}

export async function initializeTokens(token) {
  const config = await getConfig();
  config.streamMapper.figmaAuthToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  config.streamMapper.daToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

export function extractByPattern(tag, pattern) {
  const parts = tag.split('-');
  const match = parts.find((p) => (pattern instanceof RegExp
    ? pattern.test(p) : p.includes(pattern)));
  if (!match) return null;
  const numMatch = match.match(/^([a-zA-Z]+)?(\d+)?([a-zA-Z]+)?$/);
  if (numMatch) {
    const [, prefix, number, suffix] = numMatch;
    return {
      raw: match,
      prefix: prefix || null,
      number: number ? parseInt(number, 10) : null,
      suffix: suffix || null,
    };
  }
  return { raw: match };
}

export function divSwap(blockContent, divSelector, divSelector2) {
  const div1 = blockContent.querySelector(divSelector);
  const div2 = blockContent.querySelector(divSelector2);

  if (!div1 || !div2) return;

  const placeholder = document.createElement('div');
  div1.replaceWith(placeholder);
  div2.replaceWith(div1);
  placeholder.replaceWith(div2);
}

export const compose = (...fns) => (initialArg) => fns.reduce((acc, fn) => fn(acc), initialArg);

export const getFirstType = (text) => {
  const cleaned = text
    .toLowerCase()
    .replace(/->|-/g, ' ')
    .replace(/_/g, ' ')
    .trim();

  const words = cleaned.split(/\s+/);

  const copyIndex = words.indexOf('copy');
  const imageIndex = words.indexOf('image');

  if (copyIndex === -1 && imageIndex === -1) {
    return 'neither';
  } if (copyIndex === -1) {
    return 'image';
  } if (imageIndex === -1) {
    return 'copy';
  }

  return copyIndex < imageIndex ? 'copy' : 'image';
};

export function getIconSize(sizeValue) {
  let size = 'm';
  if (sizeValue.includes('s')) size = 's';
  if (sizeValue.includes('m')) size = 'm';
  if (sizeValue.includes('l')) size = 'l';
  if (sizeValue.includes('xl')) size = 'xl';
  if (sizeValue.includes('xxl')) size = 'xxl';
  return size;
}
