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

export async function getIdNameMap() {
  const config = await getConfig();
  return config.streamMapper.idNameMap || {};
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
