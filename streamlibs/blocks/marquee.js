import { handleComponents } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

export async function mapMarqueeContent(blockContent, figContent) {
    const properties = figContent?.details?.properties;
    if (!properties) return;
    try {
        const mappingData = await safeJsonFetch("marquee.json");
        mappingData.data.forEach(mappingConfig => {
            if (properties[mappingConfig.key] === 'undefined') return;
            const value = properties[mappingConfig.key];
            const element = blockContent.querySelector(mappingConfig.selector);
            if (!element) return;
            // debugger;
            const isHandled = handleComponents(blockContent, value, mappingConfig);
            if (!isHandled) return;
            switch (mappingConfig.type) {
              case 'background':
                handleMarqueeBackground({el: blockContent, value, selector: mappingConfig.selector});
                break;
              default:
                break;
            }
        });
    } catch (error) {
        console.warn('Could not load marquee mapping:', error);
    }
}

function handleMarqueeBackground({el, value, selector}) {
  const backgroundEl = el.querySelector(selector);
  if (value.startsWith('http')) {
    const p = document.createElement('p');
    const img = document.createElement('img');
    p.innerHTML = img;
    img.src = value;
    backgroundEl.innerHTML = p;
  } else {
    backgroundEl.innerHTML = value;
  }
}