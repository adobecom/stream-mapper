import {
  handleActionButtons,
  handleBackground,
  handleButtonComponent,
  handleComponents,
  handleImageComponent,
  handleProductLockup,
} from '../components/components.js';
import { LOGOS } from '../utils/constants.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { divSwap, extractByPattern, getFirstType } from '../utils/utils.js';

function handleIconSize(properties, sizeKey) {
  let size = '';
  const sizeValue = properties?.[sizeKey]?.name?.toLowerCase().trim() ?? 'm';
  if (sizeValue.includes('s')) size = 's';
  if (sizeValue.includes('m')) size = 'm';
  if (sizeValue.includes('l')) size = 'l';
  if (sizeValue.includes('xl')) size = 'xl';
  if (sizeValue.includes('xxl')) size = 'xxl';
  return size;
}
function handleBlockSizes(blockContent, properties) {
  const lg = extractByPattern(properties?.miloTag, 'lg');
  const sm = extractByPattern(properties?.miloTag, 'sm');
  const md = extractByPattern(properties?.miloTag, 'md');
  if (lg?.raw) {
    blockContent?.classList.add('large');
  }
  if (sm?.raw) {
    blockContent?.classList.add('small');
  }
  if (md?.raw) {
    blockContent?.classList.add('medium');
  }
}
function handleAvatarSizes(blockContent, properties) {
  if (properties?.avatar?.name) {
    const size = handleIconSize(properties, 'avatar');
    blockContent.classList.add(`${size ?? 'm'}-avatar`);
  }
}

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.productLockup?.productName && properties?.appSizes?.name) {
    const size = handleIconSize(properties, 'appSizes');
    blockContent.classList.add(`${size ?? 'm'}-lockup`);
  }
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.layout === 'center') blockContent.classList.add('center');
  handleBlockSizes(blockContent, properties);
  handleAvatarSizes(blockContent, properties);
}

function handleSwap(blockContent, properties) {
  if (getFirstType(properties?.layout) === 'image') {
    divSwap(blockContent, ':scope > div:last-child > div:first-child:has(> h3)', ':scope > div:last-child > div:last-child:has( > picture ) ');
  }
  if (properties?.layout === 'center') {
    const imageDiv = blockContent.querySelector(':scope > div:last-child > div:last-child')?.remove();
    imageDiv?.classList.add('to-remove');
  }
}

function handleAvatar(value, areaEl) {
  if (!areaEl || !value) return;
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = value || LOGOS.placeholder; });
  areaEl.querySelector('img').src = value || LOGOS.placeholder;
}
export function handleActionsArray(el, configData, value, areaEl) {
  if (!value) return;
  if (configData.ctaButtonLabels) {
    configData.ctaButtonLabels.forEach((ctaButton) => {
      handleButtonComponent({
        el,
        actionArea: areaEl,
        buttonType: ctaButton?.buttonName,
        buttonText: ctaButton?.label,
      });
    });
  }
}

export default async function mapBlockContent(
  sectionWrapper,
  blockContent,
  figContent,
) {
  const properties = figContent?.details?.properties;

  try {
    const mappingData = await safeJsonFetch('aside.json');
    mappingData.standard.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'actions':
          handleActionButtons(blockContent, properties, value, areaEl);
          break;
        case 'hasActionsArray':
          handleActionsArray(blockContent, properties, value, areaEl);
          break;
        case 'background':
          handleBackground(value, areaEl);
          break;
        case 'productLockup':
          if (areaEl) {
            handleProductLockup(value, areaEl);
          }
          break;
        case 'logo':
          handleAvatar(value, areaEl);
          break;
        case 'avatarImage':
          if (properties?.avatar) {
            handleAvatar(value, areaEl);
          }
          break;
        case 'media':
          handleImageComponent({
            el: blockContent,
            selector: mappingConfig.selector,
            value: value?.imageRef,
          });
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(sectionWrapper, blockContent, properties);
    handleSwap(blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
}
