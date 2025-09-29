import { handleComponents } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

export default async function mapBlockContent(blockContent, figContent) {
    const properties = figContent?.details?.properties;
    if (!properties) return;
    try {
        const mappingData = await safeJsonFetch("marquee.json");
        mappingData.data.forEach(mappingConfig => {
            const value = properties[mappingConfig.key];
            handleComponents(blockContent, value, mappingConfig);
            switch (mappingConfig.key) {
              case 'colorTheme':
                if (value == 'light') blockContent.classList.add('light');
                break;
              case 'isSplit':
                blockContent.classList.add('split');
                break;
              case 'background':
                handleBackground({ el: blockContent, value, selector: mappingConfig.selector });
                break;
              case 'photoCredit':
                handlePhotoCredits({ el: blockContent, value, selector: mappingConfig.selector });
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

function handleBackground({ el, value, selector }) {
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

function handlePhotoCredits({ el, value, selector }) {
  if (!value) return;
  const pictureCreditsEl = el.querySelector(selector);
  pictureCreditsEl.insertAdjacentHTML('afterend', value);
}