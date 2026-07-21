import {
  handleAccentBar, handleActionButtons, handleBackgroundWithSectionMetadata, handleComponents,
  handleSpacer, resolveImageValue,
} from '../components/components.js';
import { LOGOS } from '../utils/constants.js';
import { safeJsonFetch } from '../utils/error-handler.js';

// Logo values reach <a href> and <img src>: allow only http(s) or same-origin, which
// rejects javascript:, protocol-relative //host, and Figma refs like "1:209".
const SAFE_URL = /^(https?:\/\/|\/(?!\/))/;

function isBioBlock(properties) {
  return properties?.miloTag?.includes('bio') || properties?.bio;
}

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
  // Optional: bio blocks and detached lockups can arrive without a size-bearing name.
  const sizeName = properties?.[sizeKey]?.name;
  const sizeValue = typeof sizeName === 'string' ? sizeName.toLowerCase().trim() : '';
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
  handleIconSize(blockContent, properties, properties?.miloTag, isBioBlock(properties) ? 'bioDetails' : 'productLockup');
}

function handleProductLockup(value, areaEl) {
  if (!value) return;

  const anchorElement = areaEl.querySelector('a');
  const productName = value?.productTile?.name;
  const { image } = value;
  const overrideImage = typeof image === 'string' && SAFE_URL.test(image) ? image : '';
  const productLogo = overrideImage || LOGOS[productName];

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
  const { url, altText } = resolveImageValue(value);
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = url; });
  const imgEl = areaEl.querySelector('img');
  imgEl.src = url;
  if (altText) imgEl.alt = altText;
}

function handleLogo(value, areaEl) {
  if (!areaEl || !value) return;
  const asset = [value.image, value.imageRef].find((v) => typeof v === 'string' && v);
  const { url, altText } = asset
    ? resolveImageValue({ url: asset, altText: value.altText })
    : resolveImageValue(value);
  if (!SAFE_URL.test(url)) return;

  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = url; });
  const imgEl = areaEl.querySelector('img');
  if (imgEl) {
    imgEl.src = url;
    if (altText) imgEl.alt = altText;
    return;
  }

  // Icon Block variant 0 uses <p><a href="...svg"> — no <img> until we inject one
  const anchorElement = areaEl.querySelector('a');
  if (anchorElement) {
    anchorElement.setAttribute('href', url);
    anchorElement.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    if (altText) img.alt = altText;
    anchorElement.appendChild(img);
  }
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
      if (isBioBlock(properties)) {
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
          if (value) {
            handleProductLockup(value, areaEl);
          } else if (properties.logo) {
            const logoArea = areaEl || blockContent.querySelector(mappingConfig.selector);
            logoArea?.classList.remove('to-remove');
            handleLogo(properties.logo, logoArea);
          }
          break;
        case 'actions': {
          const hasActions = value || properties.action1 || properties.action2 || properties.action3;
          if (!hasActions) break;
          const actionArea = areaEl || blockContent.querySelector(mappingConfig.selector);
          actionArea?.classList.remove('to-remove');
          if (!value) actionArea.innerHTML = '';
          handleActionButtons(blockContent, properties, true, actionArea);
          break;
        }
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
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
