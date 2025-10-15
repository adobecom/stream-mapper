import { handleActionButtons, handleComponents } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { extractByPattern } from '../utils/utils.js';

function handleForegroundImage(value, areaEl) {
  if (!value) return;
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = value; });
  areaEl.querySelector('img').src = value;
}

function handleCompact(sectionWrapper, blockContent, properties) {
  const compact = extractByPattern(properties?.miloTag, 'compact');
  if (compact?.raw) {
    blockContent?.classList.add('medium-compact');
  }
}

function handleVariants(sectionWrapper, blockContent, properties) {
  handleCompact(blockContent, properties);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;

  try {
    const mappingData = await safeJsonFetch('media.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'actions':
          handleActionButtons(blockContent, properties, value, areaEl);
          break;
        case 'foregroundImage':
          handleForegroundImage(value, areaEl);
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    // Could not load media block

  }
}
