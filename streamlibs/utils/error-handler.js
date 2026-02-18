export function showErrorPage(context = '') {
  const safeContext = (context || 'processing your request').replace(/[<>]/g, '');
  document.body.innerHTML = `
      <div class="enigma-error-page">
          <div class="enigma-error-card">
            <div class="enigma-error-image-wrap">
              <img
                src="${window.location.origin}/streamlibs/assets/error-image.webp"
                alt="Something went wrong"
              >
            </div>
            <div class="enigma-error-copy">
                <h1 class="enigma-error-title">Oops! Something broke while ${safeContext}</h1>
                <p class="enigma-retry-line">
                  <span class="enigma-retry-text">Give it another go?</span>
                  <button type="button" id="enigma-retry-btn" class="enigma-retry-btn">Yes Retry</button>
                </p>
            </div>
          </div>
      </div>`;
  const retryButton = document.querySelector('#enigma-retry-btn');
  retryButton?.addEventListener('click', () => {
    retryButton.disabled = true;
    retryButton.classList.add('is-loading');
    retryButton.setAttribute('aria-busy', 'true');
    retryButton.setAttribute('aria-label', 'Retrying');
    retryButton.textContent = '';
    window.setTimeout(() => {
      window.location.reload();
    }, 500);
  });
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
      throw new Error(`HTTP error! Status: ${url} ${response.status}`);
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
