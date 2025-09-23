import {fetchFigmaContent} from './sources/figma.js';
import {renderEditableHtml} from './editor.js';
import {targetCompatibleHtml} from './target.js';
import {persistOnTarget} from './target.js';
import {mapGenerativeContent} from './sources/generativeContent.js';
import { setDOM, getDOM } from './utils.js';
import { fetchDAContent } from './sources/da.js';

const CONFIGS = {
    'figmaMappingUrl': 'https://440859-genesis-dev.adobeio-static.net/api/v1/web/genesis-aio/fig-comps',
    'figmaAuthToken': '',
    'daToken': '',
    'figmaBlockContentUrl': 'https://runtime.adobe.io/api/v1/web/440859-genesis-dev/genesis-aio/fig-comp-details'
}

const donotmodify = getQueryParam('donotmodify');
const storedFigmaAuthToken = window.localStorage.getItem('figmaAuthToken');
const storedDaToken = window.localStorage.getItem('daToken');
if (storedFigmaAuthToken && !CONFIGS.figmaAuthToken) {
  CONFIGS.figmaAuthToken = storedFigmaAuthToken;
}
if (storedDaToken && !CONFIGS.daToken) {
  CONFIGS.daToken = storedDaToken;
}

const msgList = [
  "Fueling the creative engine ",
  "Words are forming. Stand by for brilliance.",
  "Spinning up something sharp ",
  "Bringing the words to life ",
  "Not just loading — creating.",
  "Crafting brilliance behind the scenes ",
  "Building bold content as we chat",
  "Constructing the masterpiece. Stay tuned.",
  "On it — content coming right up",
  "Loading genius... please remain calm.",
  "Ideas loading. Stand by for impact.",
  "Verbs locked. Nouns loaded. Brilliance imminent."
];

const idNameMap = {
  "marquee": "Marquee",
  "text": "Text",
  "media": "Media",
  "howto": "HowTo",
  "aside": "Aside",
  "notification": "Notification",
}

let CONTEXT = null;
window.addEventListener("message", (e) => {
  const eventData = e.data;
  // console.log(eventData);
  if (eventData.hasOwnProperty('chatContext')) {
      CONTEXT = {
        chat: {
          "context": eventData.chatContext,
        }
      }
    }
}, '*');

window.parent.postMessage({'iframeReady': true}, '*');

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
    CONFIGS.figmaAuthToken = token.startsWith('Bearer ') ? token : 'Bearer ' + token;
    CONFIGS.daToken = token.startsWith('Bearer ') ? token : 'Bearer ' + token;

    if (!source || !contentUrl || !target || !targetUrl) {
        throw new Error("Source, content Url, target url or target cannot be empty! Stoppping all processing!");
    }

    // handle the content injection and WYSIWYG editor painting
    await initiatePreviewer(source, contentUrl, editable, target, targetUrl);
    // await persist(source, contentUrl, target, targetUrl);
}

export async function persist(source, contentUrl, target, targetUrl) {
    await persistOnTarget(contentUrl, target, targetUrl, CONFIGS);
    console.log('Successfully persisted on DA');
}

function fixRelativeLinks(html) {
    let updatedHtml = html.replaceAll("./media","https://main--milo--adobecom.aem.page/media");
    return updatedHtml;
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
        const pageComponents = await fetchFigmaContent(contentUrl, CONFIGS);
        html = pageComponents.html;
        html.forEach((h, idx) => {
          if (typeof h == 'object') {
            h.id = `block-${idx}`;
          }
        });
        blockMapping = pageComponents.blockMapping;
    } else if (source === 'da') {
      html = await fetchDAContent(contentUrl, CONFIGS);
    }

    document.querySelector("#loader-content").innerText = "Building your HTML—precision in progress ";

    if (CONTEXT) {
        let blockNames = "";
        blockMapping.details.components.forEach((b) => {
          blockNames += `
                - ${b.name}`;
        });

        window.parent.postMessage({
          blockList: blockNames,
        }, '*');

        function changeLoaderContent() {
          document.querySelector("#loader-content").innerText = msgList[0];
          msgList.shift();
          if(msgList.length) setTimeout( () => { changeLoaderContent(); }, 15000);
        }
        changeLoaderContent();

        window.addEventListener("message", async (e) => {
          const eventData = e.data;
          if (e.data.hasOwnProperty('generativeContent')) {
            const generativeContent = eventData.generativeContent;
            await processGenerativeContent(generativeContent);
            await mapGenerativeContent(html, blockMapping, eventData.generativeContent);
            let metadataMap = null;
            for (const key in eventData.generativeContent) {
              if (eventData.generativeContent[key].hasOwnProperty("Metadata")) {
                metadataMap = eventData.generativeContent[key]["Metadata"];
                window.sessionStorage.setItem('metadataMap', JSON.stringify(metadataMap));
                break;
              }
            }
            setDOM(html);
            html = html.map((h) => h.outerHTML).join('');
            html = fixRelativeLinks(html);
            html = wrapDivs(html);
            targetCompatibleHtml(html, target, CONFIGS);
            document.querySelector("#loader-content").innerText = "Bringing blocks to life ";
            await startHTMLPainting(html, source, contentUrl, target, targetUrl);
            document.querySelector("#loader-container").remove();
            targetCompatibleHtml(html, target, CONFIGS);
            if (editable && html) {
                html = renderEditableHtml(html);
            }
          }
      }, '*');
    } else {
      try {
        const dahtml = await fetchDAContent(targetUrl, CONFIGS, false);
        if (!donotmodify && typeof dahtml === 'object' && dahtml.length > 0) {
          console.log("Starting the modification workflow");
          
          console.log(html);
          console.log(dahtml);
          blockMapping.details.components.forEach((component) => {
            const componentId = component.id;
            const currentElementIndex = html.findIndex(domElement => domElement.classList.contains(componentId));
            const prevurlElementIndex = dahtml.findIndex(domElement => domElement.classList.contains(componentId));
            if (currentElementIndex > -1 && prevurlElementIndex > -1) {
              dahtml[prevurlElementIndex] = html[currentElementIndex];
            }
          });
          html = dahtml;
          console.log(html);
        }
      } catch (err) {
        console.log("Not a modification workflow");
      }
      
      setDOM(html);
      html = html.map((h) => h.outerHTML).join('');
      html = fixRelativeLinks(html);
      html = wrapDivs(html);

      window.localStorage.setItem(
        'previewer-html',
        JSON.stringify({
          figmaUrl: contentUrl,
          html
        })
      );
      targetCompatibleHtml(html, target, CONFIGS);
      await startHTMLPainting(html, source, contentUrl, target, targetUrl);
      document.querySelector("#loader-container").remove();
      targetCompatibleHtml(html, target, CONFIGS);
      if (editable && html) {
          html = renderEditableHtml(html);
      }
    }
}


async function startHTMLPainting(html, source, contentUrl, target, targetUrl) {
    paintHtmlOnPage(html, source, contentUrl, target, targetUrl);
    window["page-load-ok-milo"]?.remove();
    // finally call the Milo loadarea function to paint the WYSIWYG page
    document.querySelector('head').innerHTML += '<meta name="martech" content="off">';
    const upload = document.createElement('input');
    upload.type = "file"
    upload.id = "imgUpload";
    upload.accept = "image/*";
    upload.style = "display: none;";
    document.body.append(upload);
    const { loadArea } = await import(
        `https://main--milo--adobecom.aem.live/libs/utils/utils.js`
      );
    await loadArea();

    function checkAndRun(fn, delay = 1000, pollInterval = 200) {
      const intervalId = setInterval(() => {
        const decoratedExists = document.querySelector('.section[data-decorated]') !== null;
        if (!decoratedExists) {
          clearInterval(intervalId);
          setTimeout(() => {
            fn();
          }, delay);
        }
      }, pollInterval);
    }
    checkAndRun(() => {
      const allElements = document.querySelectorAll('*');

      function hasTextNode(element) {
        for (const node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
            return true;
          }
        }
        return false;
      }

      allElements.forEach(el => {
        if (el.nodeName === "IMG") {
          el.addEventListener('click', (e) => {
            // console.log('Clicked img:', e.target);
            const currSrc = e.target.src;
            // console.log(currSrc);
            let imgTarget = e.target;
            window["imgUpload"].click();
            window["imgUpload"].addEventListener('change', async () => {
              imgTarget.classList.add('da-process-wait');
              const s3url = await uploadToDA(imgTarget.src, window["imgUpload"].files[0]);
              imgTarget.src = s3url;
              const pic = imgTarget.closest('picture');
              if (pic) pic.querySelectorAll('source').forEach((s) => s.srcset = s3url);
              const closestBlock = e.target.closest('[id^="block-"]');
              const currHTML = getDOM();
              const index = currHTML.findIndex(el => el.id === closestBlock.id);
              const orgpic = currHTML[index].querySelector('picture');
              orgpic.querySelector('img').src = s3url;
              orgpic.querySelectorAll('source').forEach((s) => s.srcset = s3url);
              let tmphtml = currHTML.map((h) => h.outerHTML).join('');
              tmphtml = fixRelativeLinks(tmphtml);
              tmphtml = wrapDivs(tmphtml);
              targetCompatibleHtml(tmphtml, target, CONFIGS);
              imgTarget.classList.remove('da-process-wait');
            }, { once: true});
          });
        } else if (hasTextNode(el)) {
          el.addEventListener('click', (e) => {
            // console.log('Clicked parent with text node', el);
            const oldTxt = e.target.innerText;
            e.target.contentEditable = true;
            e.target.addEventListener('blur', (ev) => {
              e.target.removeAttribute('contenteditable');
              const closestBlock = e.target.closest('[id^="block-"]');
              const currHTML = getDOM();
              const index = currHTML.findIndex(el => el.id === closestBlock.id);
              [...currHTML[index].querySelectorAll('*')].forEach(node => {
                if (hasTextNode(node) && node.innerText.trim() === oldTxt) {
                  node.innerText = e.target.innerText;
                  let tmphtml = currHTML.map((h) => h.outerHTML).join('');
                  tmphtml = fixRelativeLinks(tmphtml);
                  tmphtml = wrapDivs(tmphtml);
                  targetCompatibleHtml(tmphtml, target, CONFIGS);
                }
              });
            }, { once: true });
          });
        }
      });

    }, 1000, 200);
}

function wrapDivs(htmlString) {
  const container = document.createElement('div');
  container.innerHTML = htmlString;

  const children = Array.from(container.children);
  const newContainer = document.createElement('div');
  let wrapper = null;

  for (const child of children) {
    if (child.tagName === 'DIV') {
      if (child.classList.length > 0) {
        if (!wrapper) wrapper = document.createElement('div');
        wrapper.appendChild(child);
      } else {
        if (wrapper) {
          newContainer.appendChild(wrapper);
          wrapper = null;
        }
        newContainer.appendChild(child);
      }
    } else {
      if (wrapper) {
        newContainer.appendChild(wrapper);
        wrapper = null;
      }
      newContainer.appendChild(child);
    }
  }

  if (wrapper) {
    newContainer.appendChild(wrapper);
  }

  return newContainer.innerHTML;
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

// TODO: manage error handling
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

export function generate6CharGUID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function presignedToDA(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  const file = new File([blob], `image-${generate6CharGUID()}.jpg`, { type: blob.type });
  return await uploadToDA(url, file, false);
}

async function uploadToDA(url, file, fromUpload=true) {
  try {
    const form = new FormData();
    form.append("data", file);
    const options = {
      method: 'POST',
      headers: {
        accept: '*/*',
        Authorization: `${CONFIGS.daToken}`,
      }
    };
    options.body = form;
    let filename = `image-${generate6CharGUID()}.jpg`;
    if (fromUpload) {
      const ext = file.name.split('.').pop().toLowerCase();
      filename = `image-${generate6CharGUID()}.${ext}`;
    }
    const res = await fetch(`https://admin.da.live/source/adobecom/da-cc-sandbox/drafts/mathuria/images/${filename}`, options);
    const data = await res.json();

    const preview_options = {
      method: 'POST',
      headers: {
        Authorization: `${CONFIGS.daToken}`,
      }
    };
    await fetch(`https://admin.hlx.page/preview/adobecom/da-cc-sandbox/main/drafts/mathuria/images/${filename}`, preview_options);
    return data.aem.previewUrl;
  } catch (err) {
    console.log("Failed to push following to DA! ", )
  }
  return url
}

async function processGenerativeContent(generativeContent) {
  const tasks = [];
  for (const k1 in generativeContent) {
    for (const k2 in generativeContent[k1]) {
      const item = generativeContent[k1][k2];
      if (item.thumbnail) {
        const task = presignedToDA(item.thumbnail.message).then(preview => {
          item.thumbnail.message = preview;
        });
        tasks.push(task);
      }
    }
  }
  await Promise.all(tasks);
}

initPreviewer();
