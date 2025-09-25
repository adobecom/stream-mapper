import { handleComponents } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

export async function mapMarqueeContent(blockContent, figContent) {
    const properties = figContent?.details?.properties;
    if (!properties) return;
    try {
        const mappingData = await safeJsonFetch("marquee.json");
        mappingData.data.forEach(mappingConfig => {
            const value = properties[mappingConfig.key];
            const isHandled = handleComponents(blockContent, value, mappingConfig);
            if (!isHandled) return;
            switch (mappingConfig.key) {
              case 'background':
                handleMarqueeBackground({ el: blockContent, value, selector: mappingConfig.selector });
                break;
              default:
                break;
            }
         });
         blockContent.querySelectorAll('.to-remove').forEach(el => el.remove());
    } catch (error) {
        console.warn('Could not load marquee mapping:', error);
    }
}

function handleMarqueeBackground({ el, value, selector }) {
  const backgroundEl = el.querySelector(selector);
  if (value.startsWith('http')) {
    const img = document.createElement('img');
    img.src = value;
    const pic = document.createElement('picture');
    const source = document.createElement('source');
    source.srcset = value;
    source.type = 'image/webp';
    pic.append(...[source, img]);
    backgroundEl.append(pic);
  } else {
    backgroundEl.innerHTML = value;
  }
}