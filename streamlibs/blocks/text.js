import {
  handleComponents,
  handleSpacer,
  handleActionButtons,
  handleBackground,
  handleAccentBar,
  handleGridLayout,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleMediaCaption(caption, areaEl) {
  if (!caption) return;
  const captionTxt = `<em>${caption}</em>`;
  areaEl.closest('p').innerHTML += captionTxt;
}

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.topSpacer) handleSpacer(blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacer(blockContent, properties.bottomSpacer.name, 'bottom');
  if (properties?.desktopLayout) handleGridLayout(properties.desktopLayout, blockContent, 'desktop');
  if (properties?.accentBar?.name) {
    handleAccentBar(sectionWrapper, blockContent, properties.accentBar.name);
  }
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('text.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'background':
          if (value) handleBackground(value, areaEl);
          break;
        case 'media': {
          const caption = properties.caption ? properties.caption : null;
          if (value) handleMediaCaption(caption, areaEl);
          break;
        }
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
    // Could not load text mapping
  }
}
