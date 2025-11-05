import {
  handleActionButtons,
  handleBackground,
  handleComponents,
  handleImageComponent,
  handleProductLockup,
} from '../components/components.js';
import { LOGOS } from '../utils/constants.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import {
  compose, divSwap, extractByPattern, getFirstType,
} from '../utils/utils.js';

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
  let size = 'm';
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
  if (properties?.productLockup?.productName) {
    const size = handleIconSize(properties, 'appSizes');
    blockContent.classList.add(`${size ?? 'm'}-lockup`);
  }
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.layout?.includes('center')) blockContent.classList.add('center');
  handleBlockSizes(blockContent, properties);
  handleAvatarSizes(blockContent, properties);
  handleSplitHalf(blockContent, properties);
  handleInline(blockContent, properties);
}

function handleSwap(blockContent, properties) {
  if (getFirstType(properties?.layout) === 'image') {
    divSwap(blockContent, ':scope > div:last-child > div:first-child:has(> h3,h2)', ':scope > div:last-child > div:last-child:has( > picture ) ');
  }
  if (properties?.layout?.includes('center')) {
    const imageDiv = blockContent.querySelector(':scope > div:last-child > div:last-child')?.remove();
    imageDiv?.classList.add('to-remove');
  }
}

function handleAvatar(value, areaEl) {
  if (!areaEl || !value) return;
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = value || LOGOS.placeholder; });
  areaEl.querySelector('img').src = value || LOGOS.placeholder;
}

function handleSpacer(spacer, position) {
  if (!spacer) return '';
  const spacerName = spacer.toLowerCase().trim();
  let spacerClass = '';
  if (spacerName.includes(' m ')) spacerClass = 'm';
  else if (spacerName.includes(' xxxl ')) spacerClass = 'xxxl';
  else if (spacerName.includes('xxl')) spacerClass = 'xxl';
  else if (spacerName.includes(' xl ')) spacerClass = 'xl';
  else if (spacerName.includes(' l ')) spacerClass = 'l';
  else if (spacerName.includes(' xs ')) spacerClass = 'xs';
  else if (spacerName.includes(' s ')) spacerClass = 's';
  if (!spacerClass) return '';
  return `${spacerClass}-spacing-${position}`;
}

function handleSpacers(acc) {
  const { properties, finalArray } = acc;
  if (properties?.topSpacer && properties?.miloTag.includes('inline')) {
    const topSpace = handleSpacer(properties.topSpacer.name, 'top');
    finalArray.push(topSpace);
  }
  if (properties?.bottomSpacer && properties?.miloTag.includes('inline')) {
    const bottomSpace = handleSpacer(properties.bottomSpacer.name, 'bottom');
    finalArray.push(bottomSpace);
  }
  return acc;
}

function handleSectionMetadata(sectionWrapper, properties) {
  const sectionMetadata = document.createElement('div');
  sectionMetadata.classList.add('section-metadata');
  const div = document.createElement('div');
  const styleDiv = document.createElement('div');
  styleDiv.textContent = 'style';
  const attributes = compose(
    handleSpacers,
  )({ finalArray: [], properties });
  const attributeDiv = document.createElement('div');
  attributeDiv.textContent = attributes.finalArray.join(', ');
  div.appendChild(styleDiv);
  div.appendChild(attributeDiv);
  sectionMetadata.appendChild(div);
  sectionWrapper.appendChild(sectionMetadata);
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
      if ((mappingConfig.key === 'media' || mappingConfig.key === 'asideImage') && value && blockContent?.querySelector(mappingConfig.selector)?.classList.contains('to-remove')) {
        blockContent?.querySelector(mappingConfig.selector).classList.remove('to-remove');
      }
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
          handleAvatar(value?.image, areaEl);
          break;
        case 'media':
          handleImageComponent({
            el: blockContent,
            selector: mappingConfig.selector,
            value: value,
          });
          break;
        case 'productGrid':
          handleProductLinks(value, areaEl, properties?.productLinks);
          break;
        default:
          break;
      }
    });
    handleVariants(sectionWrapper, blockContent, properties);
    handleSwap(blockContent, properties);
    handleSectionMetadata(sectionWrapper, properties);
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
}
