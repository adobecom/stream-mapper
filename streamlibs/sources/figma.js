import { mapMarqueeContent } from '../blocks/marquee.js';
import { mapTextContent } from '../blocks/text.js';
import {mapMediaContent} from "../blocks/media.js";
import {mapNotificationContent} from "../blocks/notification.js";

export async function fetchFigmaContent(figmaUrl) {
    const htmlAndMapping = await getFigmaContent(figmaUrl);
    // window.sessionStorage.setItem('previewer-html', htmlAndMapping.html);
    return htmlAndMapping;
}

async function getFigmaContent(figmaUrl) {
    const blockMapping = await fetchFigmaMapping(figmaUrl);
    let html = "";

    if (blockMapping?.details?.components) {
        html = await createHTML(blockMapping, figmaUrl);
        // html = fixRelativeLinks(html);
        // pushToStorage({'url': figmaUrl, 'html': html});
    }

    return {
      html,
      blockMapping
    };
}


async function fetchFigmaMapping(figmaUrl) {
    const config = await import('../utils.js').then(m => m.getConfig());
    const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: config.streamMapper.figmaAuthToken // add a valid token
        },
        body: JSON.stringify({ figmaUrl: figmaUrl }) 
      };
      
      const response = await fetch(config.streamMapper.figmaMappingUrl, options)

      if (!response.ok) {
        document.body.innerHTML = `<div class="enigma-error-page">
                                    <img src = "https://enigma--cc--aishwaryamathuria.aem.live/enigma/assets/errorgif.webp">
                                    <div>
                                      <h1> Oops!! Something broke.</h1>
                                      <h1> Give it another go?</h1>
                                    </div>
                                  </div>`
        console.error("Error getting figma mapping");
        throw new Error("Error getting figma mapping");
      }

      const mapping = await response.json();
      return mapping;
}

async function createHTML(blockMapping, figmaUrl) {
    const blocks = blockMapping.details.components;

    document.querySelector("#loader-content").innerText = "Building the map—block by block ";
    const htmlParts = await Promise.all(
        blocks.map(async (obj) => {
            if (obj.id !== null && obj.path !== null) {
                console.log('found a valid block with id: ', obj.id);

                // Fetch doc and figContent in parallel
                const [doc, figContent] = await Promise.all([
                    fetchContent(obj.path, obj.id),
                    fetchBlockContent(obj.figId, obj.id, figmaUrl)
                ]);

                let blockContent = getHtml(doc, obj.id, obj.variant);
                
                // Map figma content
                blockContent = mapFigmaContent(blockContent, obj.properties, obj.id, figContent);
                obj.blockDomEl = blockContent;
                if (blockContent) return blockContent
                else return '';
            }
            return ''; // If id or path is null, return empty string
        })
    );

    // Join all HTML parts in order
    // return htmlParts.join('');
    return htmlParts;
}

async function fetchBlockContent(figId, id, figmaUrl) {
    const config = await import('../utils.js').then(m => m.getConfig());
    const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: config.streamMapper.figmaAuthToken // add a valid token
        },
        body: JSON.stringify({ figmaUrl: figmaUrl, figId: figId, id: id}) 
      };
      
      const response = await fetch(config.streamMapper.figmaBlockContentUrl, options)

      if (!response.ok) {
        document.body.innerHTML = `<div class="enigma-error-page">
                                    <img src = "https://enigma--cc--aishwaryamathuria.aem.live/enigma/assets/errorgif.webp">
                                    <div>
                                      <h1> Oops!! Something broke.</h1>
                                      <h1> Give it another go?</h1>
                                    </div>
                                  </div>`
        console.error("Error getting block content");
        return {};
      }

      const mapping = await response.json();
      return mapping;
}

function mapFigmaContent(blockContent, props, name, figContent) {
    console.log('inside mapFigmaContent');
    // const elements = getLevelElements(blockContent);
    switch(name){
        case 'marquee': 
            mapMarqueeContent(blockContent, figContent);
            break;
        case 'text':
            mapTextContent(blockContent, figContent);
            break;
        case 'media':
            mapMediaContent(blockContent, figContent);
            break;
        case 'notification':
            mapNotificationContent(blockContent, figContent);
            break;
        default:
            break;
    }

    return blockContent;
}

function getLevelElements(parent) {
    const levelElements = [];
    
    // Recursively find all non-div child elements
    function findElements(node) {
        node.childNodes.forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() !== 'div') {
                levelElements.push(child);
            }
            // Recurse if the child is an element (including div)
            if (child.nodeType === Node.ELEMENT_NODE && child.nodeType !== 'picture') {
                findElements(child);
            }
        });
    }
    
    findElements(parent);
    return levelElements;
}

function getHtml(resp, id, variant) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(resp, 'text/html');
    if (id === 'editorial-card') {
        return doc.querySelector('div')
    } else {
        return doc.querySelectorAll("." + id)[variant];
    }
}


async function fetchContent(contentUrl) {
    try {
        const response = await fetch(contentUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const content = await response.text();
        return content;
    } catch (error) {
          try {
            const response = await fetch(contentUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const content = await response.text();
            return content;
        } catch (error) {
            document.body.innerHTML = `<div class="enigma-error-page">
                                        <img src = "https://enigma--cc--aishwaryamathuria.aem.live/enigma/assets/errorgif.webp">
                                        <div>
                                          <h1> Oops!! Something broke.</h1>
                                          <h1> Give it another go?</h1>
                                        </div>
                                      </div>`
            console.error('Error fetching content:', error);
            return null;
        }
    }
}
