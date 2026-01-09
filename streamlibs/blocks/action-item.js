import { handleComponents, replaceImage } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { LOGOS, SVG_ICONS } from '../utils/constants.js';

function handleIcon(value, areaEl) {
  if (!value || !areaEl) return;
  let iconUrl = value;
  // If it's an object, extract the icon name and look it up
  if (typeof value === 'object') {
    const iconName = value.name || value.productTile?.name;
    // Try to find the icon in LOGOS first, then SVG_ICONS
    iconUrl = LOGOS[iconName] || SVG_ICONS[iconName]
      || SVG_ICONS.placeholder || LOGOS.placeholder;
  }
  // Use the shared replaceImage function to set the icon URL
  if (iconUrl) {
    const picEl = areaEl.querySelector('picture') || areaEl;
    replaceImage(picEl, iconUrl);
  }
}

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
      const areaEl = handleComponents(blockContent, value, mappingConfig);

      // Handle icon objects similar to how productLockup is handled in icon-block.js
      if (mappingConfig.key === 'icon' || mappingConfig.key === 'iconQuick' || mappingConfig.key === 'iconFloating') {
        handleIcon(value, areaEl);
      }
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
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
