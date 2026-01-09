/* eslint-disable max-len */
import {
  handleBackground,
  handleComponents,
  handleColorThemeWithSectionMetadata,
  handleSpacerWithSectionMetadata,
  handleUpsWithSectionMetadata,
  handleBackgroundWithSectionMetadata,
  handleGridLayoutWithSectionMetadata,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) handleColorThemeWithSectionMetadata(sectionWrapper, blockContent, properties.colorTheme);
  if (properties?.topSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.bottomSpacer.name, 'bottom');
  if (properties.layout) handleGridLayoutWithSectionMetadata(sectionWrapper, blockContent, properties.layout, undefined);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('card-editorial-media.json');
    properties.cards.forEach((card) => {
      blockContent.classList.remove('card-editorial-media');
      const blockTemplate = blockContent.cloneNode(true);
      sectionWrapper.appendChild(blockTemplate);
      mappingData.data.forEach((mappingConfig) => {
        const value = card[mappingConfig.key];
        const areaEl = handleComponents(blockTemplate, value, mappingConfig);
        switch (mappingConfig.key) {
          case 'background':
            handleBackground(value, areaEl);
            break;
          default:
            break;
        }
      });
    });
    blockContent.classList.add('to-remove');
    sectionWrapper.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleUpsWithSectionMetadata(sectionWrapper, blockContent, properties.miloTag.toLowerCase());
    if (properties.background) handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, properties.background);
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
