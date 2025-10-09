import {
  handleAccentBar, handleActionButtons, handleComponents,
  handleSpacer,
} from '../components/components.js';
import { LOGOS } from '../utils/constants.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleBlockVariants(blockContent, properties) {
  if (properties?.miloTag?.includes('intro')) {
    blockContent.classList.add('intro');
  }
}

function handleVariants(sectionWrapper, blockContent, properties) {
  handleBlockVariants(blockContent, properties);
  if (properties?.topSpacer) handleSpacer(blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacer(blockContent, properties.bottomSpacer.name, 'bottom');
  if (properties?.accentBar?.name) {
    handleAccentBar(sectionWrapper, blockContent, properties.accentBar.name);
  }
}

function handleProductLockup(value, areaEl) {
  const anchorElement = areaEl.querySelector('a');
  const productName = value?.productTile?.name;
  const productLogo = LOGOS[productName];

  if (productLogo && anchorElement) {
    anchorElement.setAttribute('href', productLogo);
    anchorElement.textContent = productLogo;
  }
}
export default async function mapBlockContent(
  sectionWrapper,
  blockContent,
  figContent,
) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('icon-block.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'productLockup':
          handleProductLockup(value, areaEl);
          break;
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
    // Could not load icon-block mapping
  }
}
