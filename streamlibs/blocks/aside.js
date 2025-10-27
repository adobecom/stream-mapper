import {
  handleActionButtons,
  handleBackground,
  handleComponents,
  handleImageComponent,
  handleProductLockup,
} from '../components/components.js';
import { LOGOS } from '../utils/constants.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { divSwap, extractByPattern, getFirstType } from '../utils/utils.js';

function handleProductLinks(value, areaEl, productLinks = []) {
  if (!value || !areaEl) {
    if (areaEl) areaEl.innerHTML = '';
    return;
  }
  const createPicture = (src, alt = '') => {
    const picture = document.createElement('picture');

    const sources = [
      { type: 'image/webp', srcset: src, media: '(min-width: 600px)' },
      { type: 'image/webp', srcset: src },
      { type: 'image/png', srcset: src, media: '(min-width: 600px)' },
    ];

    sources.forEach(({ type, srcset, media }) => {
      const source = Object.assign(document.createElement('source'), { type, srcset });
      if (media) source.media = media;
      picture.appendChild(source);
    });

    const img = Object.assign(document.createElement('img'), {
      loading: 'lazy',
      alt,
      src,
    });

    picture.appendChild(img);
    return picture;
  };

  const ul = document.createElement('ul');

  productLinks.forEach((product) => {
    const key = Object.keys(product)[0];
    const { linkTitle = 'Adobe', linkType = 'placeholder' } = product[key] || {};

    const li = document.createElement('li');
    li.appendChild(createPicture(LOGOS[linkType], linkTitle));

    const linkText = linkTitle;

    const a = document.createElement('a');
    a.href = 'www.adobe.com';
    a.textContent = linkText;
    li.appendChild(a);

    ul.appendChild(li);
  });

  areaEl.innerHTML = '';
  areaEl.appendChild(ul);
}
function handleInline(blockContent, properties) {
  const inline = extractByPattern(properties?.miloTag, 'inline');
  if (inline?.raw) {
    blockContent?.classList.add('inline');
  }
}

function handleSplitHalf(blockContent, properties) {
  const half = extractByPattern(properties?.miloTag, 'half');
  if (half?.raw) {
    blockContent?.classList.add('half');
  }
}
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
  handleSplitHalf(blockContent, properties);
  handleInline(blockContent, properties);
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
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = LOGOS.placeholder; });
  areaEl.querySelector('img').src = LOGOS.placeholder;
}

export default async function mapBlockContent(
  sectionWrapper,
  blockContent,
  figContent,
) {
  const properties = figContent?.details?.properties;

  try {
    const mappingData = await safeJsonFetch('aside.json');
    const configData = properties?.miloTag.includes('inline') ? mappingData.inline : mappingData.split;
    configData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'actions':
          handleActionButtons(blockContent, properties, value, areaEl);
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
        case 'avatar':
          handleAvatar(value, areaEl);
          break;
        case 'media':
          handleImageComponent({
            el: blockContent,
            selector: mappingConfig.selector,
            value: value?.imageRef,
          });
          break;
        case 'productGrid':
          handleProductLinks(value, areaEl, properties?.productLinks);
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(sectionWrapper, blockContent, properties);
    handleSwap(blockContent, properties);
  } catch (error) {
    console.error(error);
  }
}
