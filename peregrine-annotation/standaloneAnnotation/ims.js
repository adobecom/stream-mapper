// Adapted from forge chitchat project: milo-logs-deploy/src/annotations/client/ims.js
const IMS_INSTANCE = 'peregrine_annotationIMS';
const IMS_SCOPES = 'AdobeID,openid,email';

export const IMS_CLIENT_ID = 'milo-logs-claude-mcp';

let imsProfile = null;
let initPromise = null;
let serverOriginRef = '';
let onChangeCallback = null;

function getImsEnv() {
  const param = new URLSearchParams(window.location.search).get('pc_ims_env');
  if (param === 'prod' || param === 'stg1') return param;
  let host;
  try { host = serverOriginRef ? new URL(serverOriginRef).hostname : window.location.hostname; }
  catch { host = window.location.hostname; }
  return (host === 'localhost' || host.includes('stage')) ? 'stg1' : 'prod';
}

function getImsHost() {
  return getImsEnv() === 'prod' ? 'ims-na1.adobelogin.com' : 'ims-na1-stg1.adobelogin.com';
}

async function fetchProfile() {
  try {
    const token = getImsToken();
    if (!token) return;
    let raw = await window[IMS_INSTANCE]?.getProfile?.() ?? null;
    if (!raw) {
      const res = await fetch(`https://${getImsHost()}/ims/profile/v1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) raw = await res.json();
    }
    if (!raw) return;
    const name = raw.displayName || `${raw.first_name || ''} ${raw.last_name || ''}`.trim() || null;
    const email = raw.email || null;
    if (!name && !email) return;
    imsProfile = { email, name: name || email, picture: raw.avatar || null };
  } catch { /* profile is supplementary */ }
}

async function bootstrap() {
  try {
    await new Promise((resolve, reject) => {
      if (window.adobeImsFactory) { resolve(); return; }
      let el = document.getElementById('peregrine-imslib');
      if (!el) {
        el = document.createElement('script');
        el.id = 'peregrine-imslib';
        el.src = 'https://auth.services.adobe.com/imslib/imslib.min.js';
        document.head.appendChild(el);
      }
      el.addEventListener('load', () => resolve(), { once: true });
      el.addEventListener('error', () => reject(new Error('failed to load IMS library')), { once: true });
    });

    if (!window[IMS_INSTANCE]) {
      window.adobeImsFactory.createIMSLib({
        client_id: IMS_CLIENT_ID,
        scope: IMS_SCOPES,
        environment: getImsEnv(),
        redirect_uri: serverOriginRef ? `${serverOriginRef}/imslib-callback` : undefined,
        autoValidateToken: true,
        useLocalStorage: false,
        logsEnabled: false,
        modalMode: true,
        onAccessToken: async () => { await fetchProfile(); onChangeCallback?.(getImsToken(), imsProfile); },
        onReauthAccessToken: async () => { await fetchProfile(); onChangeCallback?.(getImsToken(), imsProfile); },
        onAccessTokenHasExpired: () => { imsProfile = null; onChangeCallback?.(null, null); },
        onError: (type, msg) => { console.warn(`[peregrine-annotation] IMS error [${type}]: ${msg}`); },
      }, IMS_INSTANCE);
    }

    await window[IMS_INSTANCE].initialize();
  } catch (e) {
    console.warn('[peregrine-annotation] IMS bootstrap error:', e);
  }
}

export function initIms(serverOrigin, onChange) {
  if (serverOrigin) serverOriginRef = serverOrigin;
  if (onChange) onChangeCallback = onChange;
  initPromise ??= bootstrap();
  return initPromise;
}

export function getImsToken() { return window[IMS_INSTANCE]?.getAccessToken?.()?.token ?? null; }

export function getImsProfile() { return imsProfile; }

export function signIn() {
  if (window[IMS_INSTANCE]) { window[IMS_INSTANCE].signIn(); return; }
  initIms();
}
