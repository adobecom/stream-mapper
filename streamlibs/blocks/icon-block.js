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

function handleAlign(blockContent, value) {
  if (value === 'center') {
    blockContent?.classList.add('center');
  }
}

function handleIconSize(blockContent, properties, tag, sizeKey) {
  if (properties?.miloTag?.includes(tag)) {
    let size = '';
    const sizeValue = properties?.[sizeKey]?.name?.toLowerCase().trim();
    if (sizeValue.includes(' m ')) size = 'm';
    if (sizeValue.includes('l')) size = 'l';
    if (size) {
      blockContent?.classList.add(`${size}-icon`);
    }
  }
}

function handleVariants(sectionWrapper, blockContent, properties) {
  handleBlockVariants(blockContent, properties);
  if (properties?.topSpacer) handleSpacer(blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacer(blockContent, properties.bottomSpacer.name, 'bottom');
  if (properties?.accentBar?.name) {
    handleAccentBar(sectionWrapper, blockContent, properties.accentBar.name);
  }
  if (properties?.miloTag?.includes('bio')) handleAlign(blockContent, properties.align);
  handleIconSize(blockContent, properties, properties?.miloTag, properties?.miloTag?.includes('bio') ? 'bioDetails' : 'productLockup');
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

function handleAvatar(value, areaEl) {
  if (!value) return;
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = value; });
  areaEl.querySelector('img').src = value;
}

export default async function mapBlockContent(
  sectionWrapper,
  blockContent,
  figContent,
) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    let configJson = 'icon-block.json';
    if (properties?.miloTag?.includes('bio')) {
      configJson = 'icon-bio-block.json';
    }
    const mappingData = await safeJsonFetch(configJson);
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
        case 'bio':
          handleAvatar(value, areaEl);
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
