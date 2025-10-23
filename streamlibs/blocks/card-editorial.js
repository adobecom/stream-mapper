import {
  handleBackground,
  handleComponents,
  handleColorThemeWithSectionMetadata,
  handleSpacerWithSectionMetadata,
  handleUpsWithSectionMetadata,
  handleBackgroundWithSectionMetadata,
  handleActionButtons,
  handleGridLayoutWithSectionMetadata,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { LOGOS } from '../utils/constants.js';

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) handleColorThemeWithSectionMetadata(sectionWrapper, blockContent, properties.colorTheme);
  if (properties?.topSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.bottomSpacer.name, 'bottom');
  if (properties.layout) handleGridLayoutWithSectionMetadata(sectionWrapper, blockContent, properties.layout, undefined);
}

function handleProductLockup(value, areaEl) {
  const tileName = value?.productTile?.name || 'placeholder';
  const a = document.createElement('a');
  a.href = LOGOS[tileName] || LOGOS['placeholder'];
  a.innerText = a.href;
  areaEl.append(a);
  const productName = value.productName;
  if (productName) areaEl.innerHTML += productName;
}

function handleCardProductLockups(card, areaEl) {
  areaEl.innerHTML = '';
  const productLockup1 = card.productLockups[0];
  handleProductLockup(productLockup1, areaEl);
  if (!card.hasMultipleProductLockups) return;
  const productLockup2 = card.productLockups[1];
  handleProductLockup(productLockup2, areaEl);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('card-editorial.json');
    properties.cards.forEach((card) => {
      blockContent.classList.remove('card-editorial');
      const blockTemplate = blockContent.cloneNode(true);
      if (properties?.miloTag?.toLowerCase().includes('open')) blockTemplate.classList.add('open');
      if (properties.cardLayout == 'center') blockTemplate.classList.add('center');
      sectionWrapper.appendChild(blockTemplate);
      mappingData.data.forEach((mappingConfig) => {
        const value = card[mappingConfig.key];
        const areaEl = handleComponents(blockTemplate, value, mappingConfig);
        blockTemplate.classList.add('open');
        switch (mappingConfig.key) {
          case 'hasProductLockup': 
            handleCardProductLockups(card, areaEl);
            break;
          case 'background':
            handleBackground(value, areaEl);
            break;
          case 'media':
            areaEl.innerHTML = '';
            handleBackground(value, areaEl);
            break;
          case 'divider':
            if (areaEl && card.divider) areaEl.innerHTML = '--- #686868';
            else if (areaEl) areaEl.closest('p').classList.add('to-remove');
            break;
          case 'actions':
            const actionArea = blockTemplate.querySelector(mappingConfig.selector);
            if (!card.action1 && !card.action2) {
              actionArea.classList.add('to-remove');
              return;
            }
            actionArea.innerHTML = '';
            handleActionButtons(blockTemplate, card, true, blockTemplate.querySelector(mappingConfig.selector));
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
