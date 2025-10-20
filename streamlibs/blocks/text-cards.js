import {
  handleComponents,
  handleSpacerWithSectionMetadata,
  handleActionButtons,
  handleUpsWithSectionMetadata,
  handleBackgroundWithSectionMetadata,
  handleGridLayout,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.topSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.bottomSpacer.name, 'bottom');
  if (properties?.desktopLayout) handleGridLayout(properties.desktopLayout, blockContent, 'desktop');
}

function handleListItems(blockTemplate, block, listItems, areaEl) {
  listItems.forEach((listItem) => {
    const liTag = document.createElement('li');
    liTag.innerHTML = listItem;
    areaEl.appendChild(liTag);
  });
  if (!block.hasBullets) blockTemplate.classList.add('unstyled-list');
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('text-cards.json');
    blockContent.classList.remove('text-cards');
    properties.blocks.forEach((block, idx) => {
      const blockTemplate = blockContent.cloneNode(true);
      sectionWrapper.appendChild(blockTemplate);
      mappingData.data.forEach((mappingConfig) => {
        const value = block[mappingConfig.key];
        const areaEl = handleComponents(blockTemplate, value, mappingConfig);
        switch (mappingConfig.key) {
          case 'actions':
            handleActionButtons(blockTemplate, block, value, areaEl);
            break;
          case 'list':
            handleListItems(blockTemplate, block, value, areaEl);
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
    console.log(error); // Could not load text mapping
  }
}
