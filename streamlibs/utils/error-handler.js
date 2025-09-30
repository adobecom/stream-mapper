export function showErrorPage() {
    document.body.innerHTML = `
        <div class="enigma-error-page">
            <img src="https://enigma--cc--aishwaryamathuria.aem.live/enigma/assets/errorgif.webp">
            <div>
                <h1>Oops!! Something broke.</h1>
                <h1>Give it another go?</h1>
            </div>
        </div>`;
}

export function handleError(error, context = '') {
    showErrorPage();
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
    const { getConfig } = await import('../utils/utils.js');
    const config = await getConfig();
    const url = `${config.streamMapper.blockMappingsUrl}/${componentJSONUrl}`;
    const response = await safeFetch(url, options, {donotShowErrorPage: true});
    return await response.json();
}