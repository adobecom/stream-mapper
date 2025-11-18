/* eslint-disable max-len */
import {
  handleComponents,
  handleSpacer,
  handleBackground,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleList(listItems, areaEl) {
  if (!listItems || listItems.length < 1 || !areaEl) return;
  listItems.forEach((item) => {
    const liTag = document.createElement('li');
    liTag.innerHTML = item;
    areaEl.appendChild(liTag);
  });
}

function handleVariants(blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.topSpacer) handleSpacer(blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacer(blockContent, properties.bottomSpacer.name, 'bottom');
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('long-form-standard.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'background':
          if (!value || value.startsWith('#fff')) {
            areaEl.classList.add('to-remove');
            return;
          }
          handleBackground(value, areaEl);
          break;
        case 'hasList': 
          if (!value) {
            areaEl.classList.add('to-remove');
            return;
          }
          handleList(properties.list, areaEl);
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
