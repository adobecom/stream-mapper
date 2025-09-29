import { handleComponents, handleButtonComponent } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

export default async function mapBlockContent(blockContent, figContent) {
    const properties = figContent?.details?.properties;
    if (!properties) return;
    try {
        const mappingData = await safeJsonFetch("marquee.json");
        mappingData.data.forEach(mappingConfig => {
            const value = properties[mappingConfig.key];
            const areaEl = handleComponents(blockContent, value, mappingConfig);
            switch (mappingConfig.key) {
              case 'colorTheme':
                if (value == 'light') blockContent.classList.add('light');
                break;
              case 'isSplit':
                blockContent.classList.add('split');
                break;
              case 'background':
                handleBackground({ el: blockContent, value, areaEl });
                break;
              case 'actions':
                handleActionButtons({ configData: properties, el: blockContent, value, areaEl });
                break;
              case 'photoCredit':
                handlePhotoCredits({ el: blockContent, value, areaEl });
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

function handleBackground({ el, value, areaEl }) {
  if (value.startsWith('http')) {
    const img = document.createElement('img');
    img.src = value;
    const pic = document.createElement('picture');
    const source = document.createElement('source');
    source.srcset = value;
    source.type = 'image/webp';
    pic.append(...[source, img]);
    areaEl.append(pic);
  } else {
    areaEl.innerHTML = value;
  }
}

function handlePhotoCredits({ mappingData, el, value, areaEl }) {
  if (!value) return;
  areaEl.insertAdjacentHTML('afterend', value);
}

function handleActionButtons({ configData, el, value, areaEl }) {
  if (!value) return;
  if (configData.action1) {
    handleButtonComponent({ actionArea: areaEl, buttonType: configData.action1.btnType, buttonText: configData.action1.btnText });
  }
  if (configData.action2) {
    handleButtonComponent({ actionArea: areaEl, buttonType: configData.action2.btnType, buttonText: configData.action2.btnText });
  }
}