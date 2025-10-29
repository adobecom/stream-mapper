import { handleComponents } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

export default async function mapActionItemContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    // Apply fallback logic for missing properties
    // If body is not present, replace it with cta text
    if (!properties.body && properties.cta) {
      properties.body = properties.cta.text || properties.cta;
    }

    // If icon is not present, replace it with iconQuick
    if (!properties.icon && properties.iconQuick) {
      properties.icon = properties.iconQuick;
    }

    const mappingData = await safeJsonFetch('action-item.json');
    mappingData.data.forEach((mappingConfig) => {
      // If iconFloating is not present, skip its mapping
      if (mappingConfig.key === 'iconFloating' && !properties.iconFloating) {
        return;
      }

      const value = properties[mappingConfig.key];
      handleComponents(blockContent, value, mappingConfig);
    });
    // Remove elements marked for removal when property is not present
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    if (!properties?.iconFloating) {
      const iconFloatingSelector = ':scope > div > div > p:nth-child(2)';
      const iconFloatingEl = blockContent.querySelector(iconFloatingSelector);
      if (iconFloatingEl) iconFloatingEl.remove();
    } else {
      blockContent.classList.add('float-icon');
    }
  } catch (error) {
    console.log(error);
  }
}
