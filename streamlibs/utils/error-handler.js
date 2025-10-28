export function showErrorPage(context = '') {
  document.body.innerHTML = `
      <div class="enigma-error-page">
          <img src="https://enigma--cc--aishwaryamathuria.aem.live/enigma/assets/errorgif.webp">
          <div>
              <h1>Oops!! Something broke while ${context}</h1>
              <h1>Give it another go?</h1>
          </div>
      </div>`;
}

// eslint-disable-next-line no-unused-vars
export function handleError(error, context = '') {
  // eslint-disable-next-line no-console
  console.log(error);
  showErrorPage(context);
}

export async function safeFetch(url, options = {}, customSettings = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response;
  } catch (error) {
    if (!customSettings.donotShowErrorPage) handleError(error, 'fetching data');
    throw error;
  }
}

export async function safeJsonFetch(componentJSONUrl, options = {}) {
  const { getConfig } = await import('./utils.js');
  const config = await getConfig();
  const url = `${config.streamMapper.blockMappingsUrl}/${componentJSONUrl}`;
  const response = await safeFetch(url, options, { donotShowErrorPage: true });
  // eslint-disable-next-line no-return-await
  return await response.json();
}
