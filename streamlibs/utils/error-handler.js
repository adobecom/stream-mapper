export function showErrorPage(context = '', preMessage = 'Oops! Something broke while') {
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
                <h1 class="enigma-error-title">${preMessage} ${safeContext}</h1>
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
export function handleError(error, context = '', preMessage = 'Oops! Something broke while') {
  // eslint-disable-next-line no-console
  console.log(error);
  showErrorPage(context, preMessage);
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
  const { streamMapper } = window.streamConfig || {};
  const url = `${streamMapper?.blockMappingsUrl}/${componentJSONUrl}`;
  const response = await safeFetch(url, options, { donotShowErrorPage: true });
  // eslint-disable-next-line no-return-await
  return await response.json();
}

export async function safeTemplateFetch(templateUrl, options = {}) {
  const { streamMapper } = window.streamConfig || {};
  // If templateUrl is already a full URL, use it directly; otherwise construct from config
  const url = templateUrl.startsWith('http://') || templateUrl.startsWith('https://')
    ? templateUrl
    : `${streamMapper?.blockTemplatesUrl}/${templateUrl}`;
  const response = await safeFetch(url, options, { donotShowErrorPage: true });
  // eslint-disable-next-line no-return-await
  return await response.text();
}
