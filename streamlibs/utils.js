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
    return html.replaceAll("./media", "https://main--milo--adobecom.aem.page/media");
}

export function wrapDivs(htmlString) {
    const container = document.createElement('div');
    container.innerHTML = htmlString;
    const children = Array.from(container.children);
    const result = document.createElement('div');
    let wrapper = null;
    children.forEach(child => {
        const needsWrapper = child.tagName === 'DIV' && child.classList.length > 0;
        if (needsWrapper) {
            wrapper = wrapper || document.createElement('div');
            wrapper.appendChild(child);
        } else {
            if (wrapper) {
                result.appendChild(wrapper);
                wrapper = null;
            }
            result.appendChild(child);
        }
    });
    if (wrapper) result.appendChild(wrapper);
    return result.innerHTML;
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
    config.streamMapper.figmaAuthToken = token.startsWith('Bearer ') ? token : 'Bearer ' + token;
    config.streamMapper.daToken = token.startsWith('Bearer ') ? token : 'Bearer ' + token;
}
