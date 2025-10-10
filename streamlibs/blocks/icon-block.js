import {
  handleAccentBar, handleActionButtons, handleBackgroundWithSectionMetadata, handleComponents,
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
  if (value === 'horizontal') {
    blockContent?.classList.add('inline');
  }
}

function handleIconSize(blockContent, properties, tag, sizeKey) {
  let size = '';
  const sizeValue = properties?.[sizeKey]?.name?.toLowerCase().trim();
  if (sizeValue.includes('m')) size = 'm';
  if (sizeValue.includes('l')) size = 'm';
  if (sizeValue.includes('xl')) size = 'l';
  if (size) {
    blockContent?.classList.add(`${size}-icon`);
  }
}

function handleVariants(sectionWrapper, blockContent, properties) {
  handleBlockVariants(blockContent, properties);
  if (properties?.topSpacer) handleSpacer(blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacer(blockContent, properties.bottomSpacer.name, 'bottom');
  if (properties?.accentBar?.name) {
    handleAccentBar(sectionWrapper, blockContent, properties.accentBar.name);
  }
  handleAlign(blockContent, properties.align);
  handleIconSize(blockContent, properties, properties?.miloTag, properties?.miloTag?.includes('bio') ? 'bioDetails' : 'productLockup');
}

function handleProductLockup(value, areaEl) {
  if (!value) return;

  const anchorElement = areaEl.querySelector('a');
  const productName = value?.productTile?.name;
  const productLogo = LOGOS[productName];

  if (anchorElement && productLogo) {
    anchorElement.setAttribute('href', productLogo);
    anchorElement.textContent = productLogo;
  } else {
    const src = productLogo;
    if (src) {
      areaEl.querySelectorAll('source').forEach((source) => {
        source.srcset = src;
      });
      const imgEl = areaEl.querySelector('img');
      if (imgEl) imgEl.src = src;
    }
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
  mapConfig,
) {
  const properties = figContent?.details?.properties;
  let mappingData = {};
  if (!properties) return;
  try {
    if (!mapConfig) {
      let configJson = 'icon-block.json';
      if (properties?.miloTag?.includes('bio')) {
        configJson = 'icon-bio-block.json';
      }
      mappingData = await safeJsonFetch(configJson);
    } else {
      mappingData = mapConfig;
    }
    mappingData?.data.forEach((mappingConfig) => {
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
        case 'background':
          handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, value);
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
