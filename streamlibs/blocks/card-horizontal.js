import {
  handleComponents,
  handleColorThemeWithSectionMetadata,
  handleSpacerWithSectionMetadata,
  handleUpsWithSectionMetadata,
  handleBackgroundWithSectionMetadata,
  handleGridLayout,
  replaceImage,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) {
    handleColorThemeWithSectionMetadata(sectionWrapper, blockContent, properties.colorTheme);
  }
  if (properties?.topSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.bottomSpacer.name, 'bottom');
  if (properties?.desktopLayout) handleGridLayout(properties.desktopLayout, blockContent, 'desktop');
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('card-horizontal.json');
    properties.cards.forEach((card) => {
      if (card.name.toLowerCase().includes('container')) return;
      const blockTemplate = blockContent.cloneNode(true);
      sectionWrapper.appendChild(blockTemplate);
      mappingData.data.forEach((mappingConfig) => {
        const value = card[mappingConfig.key];
        const areaEl = handleComponents(blockTemplate, value, mappingConfig);
        switch (mappingConfig.key) {
          case 'image':
            if (areaEl) {
              replaceImage(blockTemplate.querySelector('picture'), value);
            }
            break;
          default:
            break;
        }
      });
    });
    blockContent.classList.add('to-remove');
    sectionWrapper.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleUpsWithSectionMetadata(sectionWrapper, blockContent, properties.miloTag.toLowerCase());
    if (properties.background){
      handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, properties.background);
    }
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    console.log(error); // Could not load card mapping
  }
}
