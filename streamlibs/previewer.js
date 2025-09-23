import { fetchFigmaContent } from './sources/figma.js';
import { renderEditableHtml } from './editor.js';
import {
  persistOnTarget,
  targetCompatibleHtml
} from './target.js';
import { fetchDAContent } from './sources/da.js';
import {
  getQueryParam,
  fixRelativeLinks,
  wrapDivs,
  initializeTokens,
  getIdNameMap
} from './utils.js';

async function initPreviewer() {
    window.localStorage.removeItem('previewer-html');
    window.sessionStorage.removeItem('targetHtml');
    window.sessionStorage.removeItem('editor-html');
    
    const source = getQueryParam('source');
    const contentUrl = getQueryParam('contentUrl');
    const editable = getQueryParam('editable');
    const target = getQueryParam('target');
    const targetUrl = getQueryParam('targetUrl');
    const token = getQueryParam('token');
    
    // Initialize tokens
    await initializeTokens(token);

    if (!source || !contentUrl || !target || !targetUrl) {
        throw new Error("Source, content Url, target url or target cannot be empty! Stoppping all processing!");
    }

    // handle the content injection and WYSIWYG editor painting
    await initiatePreviewer(source, contentUrl, editable, target, targetUrl);
    // await persist(source, contentUrl, target, targetUrl);
}

export async function persist(source, contentUrl, target, targetUrl) {
    await persistOnTarget(contentUrl, target, targetUrl);
    console.log('Successfully persisted on DA');
}


async function initiatePreviewer(source, contentUrl, editable, target, targetUrl, context) {
    let html = '';
    let blockMapping = '';
    let storedHTML = null;
    if (window.localStorage.getItem('previewer-html')) {
      storedHTML = JSON.parse(window.localStorage.getItem('previewer-html'))
    }
    if (storedHTML && storedHTML.figmaUrl == contentUrl) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(storedHTML.html, "text/html");
      html = [...doc.querySelectorAll("body > div > div")];
      blockMapping = {
        success: true,
        details: {
          components: []
        }
      }
      const idNameMap = await getIdNameMap();
      html.forEach((d) => {
        blockMapping.details.components.push({
          id: d.classList[0],
          name: idNameMap[d.classList[0]] ? idNameMap[d.classList[0]] : d.classList[0],
          blockDomEl: d,
        })
      });

      function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
      await wait(2000);

    } else if (source === 'figma') {
        window.localStorage.removeItem('previewer-html');
        const pageComponents = await fetchFigmaContent(contentUrl);
        html = pageComponents.html;
        html.forEach((h, idx) => {
          if (typeof h == 'object') {
            h.id = `block-${idx}`;
          }
        });
        blockMapping = pageComponents.blockMapping;
    } else if (source === 'da') {
      html = await fetchDAContent(contentUrl);
    }

    document.querySelector("#loader-content").innerText = "Building your HTML—precision in progress ";

    // Process and render HTML
    html = html.map((h) => h.outerHTML).join('');
    html = fixRelativeLinks(html);
    html = wrapDivs(html);

    // Cache the HTML
    window.localStorage.setItem(
      'previewer-html',
      JSON.stringify({
        figmaUrl: contentUrl,
        html
      })
    );

    targetCompatibleHtml(html, target);
    await startHTMLPainting(html, source, contentUrl, target, targetUrl);
    document.querySelector("#loader-container").remove();
    
    if (editable && html) {
        html = renderEditableHtml(html);
    }
}


async function startHTMLPainting(html, source, contentUrl, target, targetUrl) {
    paintHtmlOnPage(html, source, contentUrl, target, targetUrl);
    window["page-load-ok-milo"]?.remove();
    
    // Add meta tag and load Milo
    document.querySelector('head').innerHTML += '<meta name="martech" content="off">';
    
    const { loadArea } = await import(
        `https://main--milo--adobecom.aem.live/libs/utils/utils.js`
      );
    await loadArea();
}

  

async function paintHtmlOnPage(html, source, contentUrl, target, targetUrl) {
    const mainEle = document.createElement('main');
    mainEle.innerHTML = html;
    document.body.appendChild(mainEle);

    const pushToDABtn = document.createElement('a');
    pushToDABtn.href = '#';
    pushToDABtn.classList.add('cta-button');
    pushToDABtn.innerHTML = '<span class="da-push-icon loader"></span>Push to DA';

    document.body.append(pushToDABtn);

    await persist(source, contentUrl, target, targetUrl);
    pushToDABtn.querySelector('span.da-push-icon').classList.remove("loader");
    pushToDABtn.querySelector('span.da-push-icon').classList.add("not-sending");

    const message = { daUrl: `https://da.live/edit#/${targetUrl}` };

    // Send the message to the parent window
    window.parent.postMessage({
      "daUrl": message,
    }, '*');

    pushToDABtn.addEventListener('click', async () => {
        pushToDABtn.querySelector('span.da-push-icon').classList.add("loader");
        pushToDABtn.querySelector('span.da-push-icon').classList.remove("not-sending");
        
        await persist(source, contentUrl, target, targetUrl);
        pushToDABtn.querySelector('span.da-push-icon').classList.remove("loader");
        pushToDABtn.querySelector('span.da-push-icon').classList.add("not-sending");
    });
}



initPreviewer();
