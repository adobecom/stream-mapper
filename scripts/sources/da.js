
export async function fetchDAContent(daUrl, CONFIGS, showerrorscreen = true) {
    let html = await getDAContent(daUrl, CONFIGS, showerrorscreen);
    // window.sessionStorage.setItem('previewer-html', htmlAndMapping.html);
    console.log(html);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelector('.metadata')?.remove();
    html = [...doc.querySelectorAll("body > main > div > div")];
    return html;
}

async function getDAContent(daUrl, CONFIGS, showerrorscreen = true) {
    let url = daUrl;
    if (!url.startsWith('/')) {
        url = '/' + url;
    }
    if (!url.endsWith(".html")) 
    {
        url += ".html";
    }
    
    const options = {
        method: 'GET',
        headers: {
          'Content-Type': 'text/html',
          Authorization: CONFIGS.figmaAuthToken // add a valid token
        }
    };
      
    const response = await fetch(`https://admin.da.live/source${url}`, options)

    if (!response.ok) {
      if (showerrorscreen) {
        document.body.innerHTML = `<div class="enigma-error-page">
                                  <img src = "https://enigma--cc--aishwaryamathuria.aem.live/enigma/assets/errorgif.webp">
                                  <div>
                                    <h1> Oops!! Something broke.</h1>
                                    <h1> Give it another go?</h1>
                                  </div>
                                </div>`;
      }
      return {};
    }

    const html = await response.text();
    return html;
}
