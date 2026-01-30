/* eslint-disable import/prefer-default-export */
import { getConfig, ackCodeGeneration } from '../utils/utils.js';
import { handleError } from '../utils/error-handler.js';
import { previewDAPage } from '../sources/da.js';

async function isSidekickLoginRequired(url) {
  if (new URL(url).host.includes('aem.live')) return false;
  try {
    const response = await fetch(url, { mode: 'no-cors' });
    return response.status !== 200;
  } catch (error) {
    return true;
  }
}

async function getPreviewUrl() {
  try {
    const response = await previewDAPage(window.streamConfig.targetUrl);
    return response.preview.url;
  } catch (error) {
    handleError(error, ' executing preview operation');
    throw error;
  }
}

async function loadPreflightController(origin, previewUrl) {
  const config = await getConfig();
  window.location.href = `${origin}${config.streamMapper.preflightUrl}&url=${encodeURIComponent(previewUrl)}`;
}

async function startSidekickLogin(origin, previewUrl) {
  const config = await getConfig();
  const redirectRef = encodeURIComponent(window.location.origin);
  const ackCode = ackCodeGeneration();
  const loginUrl = config.streamMapper.sidekickLoginUrl;
  // Try to open and attach opener
  document.querySelector('#retry-preflight-check-btn').addEventListener('click', () => {
    window.location.reload();
  });
  document.querySelector('#login-with-sidekick-btn').addEventListener('click', () => {
    window.open(`${origin}${loginUrl}&redirectRef=${redirectRef}&ackCode=${ackCode}`, '_blank');
  });
  window.open(`${origin}${loginUrl}&redirectRef=${redirectRef}&ackCode=${ackCode}`, '_blank');
  const handler = async (event) => {
    if (
      (event.origin === origin)
      && (event.data.source === 'stream-preflight')
      && (event.data.code === ackCode)) {
      window.removeEventListener('message', handler);
      await loadPreflightController(origin, previewUrl);
    }
  };
  window.addEventListener('message', handler);
}

// eslint-disable-next-line consistent-return
export async function preflightOperation() {
  let previewUrl = window.streamConfig.operation === 'preflight' && window.streamConfig.preflightUrl ? window.streamConfig.preflightUrl : null;
  if (!previewUrl) previewUrl = await getPreviewUrl();
  const { origin } = new URL(previewUrl);
  if (origin.includes('aem.page')) {
    const isLoginRequired = await isSidekickLoginRequired(origin);
    if (isLoginRequired) {
      document.querySelector('#preflight-operation-container').style.display = 'flex';
      setTimeout(async () => {
        await startSidekickLogin(origin, previewUrl);
      }, 2000);
      return;
    }
  }
  await loadPreflightController(origin, previewUrl);
}
