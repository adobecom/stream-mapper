/* eslint-disable max-len */
import {
  handleComponents,
  handleBackgroundWithSectionMetadata,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('long-form-legal.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      if (!areaEl) return;
      switch (mappingConfig.key) {
        case 'background':
          areaEl.classList.add('to-remove');
          if (value && !value.startsWith('#fff')) {
            handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, value);
          }
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
