/* eslint-disable max-len */
import {
  handleComponents,
  handleActionButtons,
  handleBackground,
  handleProductLockup,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleProductLockupArea(blockContent, properties) {
  if (!properties?.productLockup) return;
  const pTag = document.createElement('p');
  if (properties.hasProductLockup1) handleProductLockup(properties.productLockups[0], pTag);
  if (properties.hasProductLockup2) handleProductLockup(properties.productLockups[1], pTag);
  if (properties.hasProductLockup3) handleProductLockup(properties.productLockups[2], pTag);
  blockContent.querySelector(':scope > div:last-child > div').prepend(pTag);
}

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.justify.startsWith('center')) blockContent.classList.add('center');
  if (properties?.justify.startsWith('space between')) blockContent.classList.add('space-between');
  if (!properties?.closeBtn) blockContent.classList.add('no-closure');
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('notification-ribbon.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'background':
          handleBackground(value, areaEl);
          break;
        case 'productLockup':
          handleProductLockupArea(blockContent, properties);
          break;
        case 'actions':
          handleActionButtons(blockContent, properties, value, areaEl);
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
