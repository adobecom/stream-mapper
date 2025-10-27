import { handleComponents } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('breadcrumbs.json');
    let crumbsRemaining = parseInt(properties.crumbCount, 10);
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      if (crumbsRemaining <= 0) areaEl.classList.add('to-remove');
      crumbsRemaining -= 1;
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
  } catch (error) {
    console.log(error);
  }
}
