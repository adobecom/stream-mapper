import {
  handleComponents,
  handleColorThemeWithSectionMetadata,
  handleSpacerWithSectionMetadata,
  handleUpsWithSectionMetadata,
  handleBackgroundWithSectionMetadata,
  replaceImage,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { LOGOS } from '../utils/constants.js';

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) {
    handleColorThemeWithSectionMetadata(sectionWrapper, blockContent, properties.colorTheme);
  }
  if (properties?.topSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.bottomSpacer.name, 'bottom');
}

export function handleProductIcon(value, areaEl) {
  if (!value) return;
  // eslint-disable-next-line prefer-destructuring, no-param-reassign
  if (Array.isArray(value)) value = value[0];
  const tileName = value?.name || 'placeholder';
  const a = areaEl.querySelector('a');
  a.href = LOGOS[tileName] || LOGOS.placeholder;
  a.innerText = a.href;
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('card-horizontal.json');
    properties.cards.forEach((card) => {
      const blockTemplate = blockContent.cloneNode(true);
      if (properties?.cardType?.name.toLowerCase().includes('tile')) {
        blockContent.classList.add('tile');
      }
      sectionWrapper.appendChild(blockTemplate);
      mappingData.data.forEach((mappingConfig) => {
        const value = card[mappingConfig.key];
        const areaEl = handleComponents(blockTemplate, value, mappingConfig);
        switch (mappingConfig.key) {
          case 'image':
            if (areaEl) replaceImage(blockTemplate.querySelector('picture'), value);
            break;
          case 'icon':
            if (value) handleProductIcon(value, areaEl);
            break;
          default:
            break;
        }
      });
    });
    blockContent.classList.add('to-remove');
    sectionWrapper.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleUpsWithSectionMetadata(sectionWrapper, blockContent, properties.miloTag.toLowerCase());
    if (properties.background) {
      handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, properties.background);
    }
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
