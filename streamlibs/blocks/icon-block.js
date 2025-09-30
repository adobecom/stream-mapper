import { handleComponents } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

// eslint-disable-next-line no-unused-vars
function handleIconBlockBackground({ el, value, selector }) {
  // pass
}
export default async function mapBlockContent(blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('icon-block.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const isHandled = handleComponents(blockContent, value, mappingConfig);
      if (!isHandled) return;
      switch (mappingConfig.key) {
        case 'background':
          handleIconBlockBackground({ el: blockContent, value, selector: mappingConfig.selector });
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
  } catch (error) {
    // Could not load icon-block mapping
  }
}
