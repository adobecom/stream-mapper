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
    console.error(`Error ${context}:`, error);
    showErrorPage();
}

export async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response;
    } catch (error) {
        handleError(error, 'fetching data');
        throw error;
    }
}
