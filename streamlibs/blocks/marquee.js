import {
  handleComponents,
  handleActionButtons,
  handleBackground,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

const SETTING_SPLIT_HALF = 'half';
const SETTING_SPLIT_THIRD = 'third';
const VARIANT_SPLIT_THIRD = 'one-third';
const LAYOUT_IMAGE_COPY = 'image';
const SETTING_LG = '-lg';
const SETTING_SM = '-sm';
const VARIANT_LARGE = 'large';
const VARIANT_SMALL = 'small';

function handleForegroundPhoto(value, areaEl) {
  if (!areaEl) return;
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = value; });
  areaEl.querySelector('img').src = value;
}

function handlePhotoCredits(value, areaEl) {
  if (!value) return;
  areaEl.insertAdjacentHTML('afterend', value);
}

function handleVariants(blockContent, properties) {
  if (properties?.isSplit === SETTING_SPLIT_HALF) blockContent.classList.add(SETTING_SPLIT_HALF);
  if (properties?.isSplit === SETTING_SPLIT_THIRD) blockContent.classList.add(VARIANT_SPLIT_THIRD);
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.miloTag.toLowerCase().includes(SETTING_SM)) {
    blockContent.classList.add(VARIANT_SMALL);
  }
  if (properties?.miloTag.toLowerCase().includes(SETTING_LG)) {
    blockContent.classList.add(VARIANT_LARGE);
  }
  if (properties?.layout.startsWith(LAYOUT_IMAGE_COPY)) {
    const foregroundContainer = blockContent.querySelector(':scope > div:nth-child(2)');
    const textContainer = foregroundContainer.querySelector(':scope > div');
    foregroundContainer.append(textContainer);
  }
}

export default async function mapBlockContent(blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const fullMappingData = await safeJsonFetch('marquee.json');
    const mappingData = properties.isSplit ? fullMappingData.split : fullMappingData.standard;
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'split-background':
          if (properties.isSplit) handleBackground(value, areaEl);
          break;
        case 'standard-background':
          if (!properties.isSplit) handleBackground(value, areaEl);
          break;
        case 'split-photo':
          if (properties.isSplit) handleForegroundPhoto(value, areaEl);
          break;
        case 'standard-photo':
          if (!properties.isSplit) handleForegroundPhoto(value, areaEl);
          break;
        case 'actions':
          handleActionButtons(blockContent, properties, value, areaEl);
          break;
        case 'photoCredit':
          handlePhotoCredits(value, areaEl);
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(blockContent, properties);
  } catch (error) {
    // Could not load marquee mapping
  }
}
