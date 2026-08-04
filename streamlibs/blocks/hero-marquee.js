import {
  handleActionButtons,
  handleBackground, handleComponents, handleImageComponent, handleProductLockup,
} from '../components/components.js';
import { LOGOS } from '../utils/constants.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { divSwap, getFirstType, getIconSize } from '../utils/utils.js';

// prefer the explicit isCover flag; fall back to the tag when it is missing/untagged
const isCoverHero = (properties) => properties?.isCover ?? properties?.miloTag?.includes('cover');

function handleSwap(blockContent, properties) {
  if (getFirstType(properties?.layout) === 'image') {
    divSwap(blockContent, ':scope > div:nth-child(2) > div:first-child', ':scope > div:nth-child(2) > div:last-child');
  }
  if (properties?.layout === 'centered') {
    const imageDiv = blockContent.querySelector(':scope > div:nth-child(2) > div:last-child');
    imageDiv?.classList.add('to-remove');
  }
}

function handleProductLockups(value, areaEl) {
  if (!value) return;
  value.forEach((productLockup) => {
    handleProductLockup(productLockup, areaEl);
  });
}

function handleMedia(blockContent, selector, value, areaEl) {
  if (!value || !areaEl) return;
  handleImageComponent({
    el: blockContent,
    selector,
    value,
  });
}

function handleCheckList(items, areaEl, properties) {
  if (!items || !areaEl) return;
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const li = document.createElement('li');
    if (properties?.checkmarks) {
      const span = document.createElement('span');
      span.classList.add('icon');
      span.classList.add('icon-checkmark');
      li.appendChild(span);
    }
    li.innerHTML += item?.text ?? 'placeholder';
    fragment.appendChild(li);
  });
  areaEl.appendChild(fragment);
}

function handleMinHeight(blockContent, properties) {
  switch (properties?.minHeight) {
    case '560px':
      blockContent?.classList.add('m-min-height');
      break;
    case '360px':
      blockContent?.classList.add('s-min-height');
      break;
    case '700px':
      blockContent?.classList.add('l-min-height');
      break;
    default:
      break;
  }
}
function handleProductLockupSize(blockContent, properties) {
  if (properties?.productLockups?.length > 0) {
    const [productLockup] = properties.productLockups;
    const size = getIconSize(productLockup?.name);
    blockContent.classList.add(`${size ?? 'm'}-lockup`);
  }
}

function handleVariants(sectionWrapper, blockContent, properties) {
  handleProductLockupSize(blockContent, properties);
  handleMinHeight(blockContent, properties);
  if (properties?.layout === 'centered') blockContent.classList.add('center');
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (isCoverHero(properties)) blockContent.classList.add('media-cover');
}

const THEME_BACKGROUNDS = { dark: '#000000', light: '#FFFFFF' };
const CONFLICTING_COLORS = {
  dark: ['#fff', '#ffffff', 'white'],
  light: ['#000', '#000000', 'black'],
};

function getThemeSafeBackground(value, colorTheme) {
  const theme = colorTheme?.toLowerCase().trim();
  if (!THEME_BACKGROUNDS[theme]) return value;
  const authored = (typeof value === 'string' ? value : value?.url) || '';
  const color = authored.toLowerCase().trim();
  // nothing authored: only a dark theme needs a fallback, light sits fine on the page
  if (!color) return theme === 'dark' ? THEME_BACKGROUNDS.dark : value;
  return CONFLICTING_COLORS[theme].includes(color) ? THEME_BACKGROUNDS[theme] : value;
}

function blockBackground(value, areaEl, properties) {
  if (!areaEl || isCoverHero(properties)) return;
  handleBackground(value, areaEl);
}

function handleLogo(value, areaEl) {
  if (!areaEl || !value) return;
  const url = (typeof value === 'object' && value.url) ? value.url : value;
  const altText = (typeof value === 'object' && value.altText) ? value.altText : '';
  const isImageUrl = typeof url === 'string' && (/^(https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('/'));
  if (!isImageUrl) return areaEl.classList.add('to-remove');
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = url; });
  const imgEl = areaEl.querySelector('img');
  if (!imgEl) return;
  imgEl.src = url;
  if (altText) imgEl.alt = altText;
}

function handleSupplemental(blockContent, selector, value) {
  const areaEl = blockContent?.querySelector(selector);
  if (!areaEl) return;
  if (value) {
    areaEl.innerHTML = value;
  } else {
    areaEl.innerHTML = '';
  }
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;

  try {
    const mappingData = await safeJsonFetch('hero-marquee.json');
    const isCover = isCoverHero(properties);
    const configData = isCover ? mappingData.split : mappingData.standard;
    // the backdrop the block paints itself with, standard vs split
    const blockBgKey = isCover ? 'coverBackground' : 'background';
    configData.data.forEach((mappingConfig) => {
      const value = mappingConfig.key === blockBgKey
        ? getThemeSafeBackground(properties[blockBgKey], properties.colorTheme)
        : properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'productLockups':
          handleProductLockups(value, areaEl);
          break;
        case 'background':
          blockBackground(value, areaEl, properties);
          break;
        case 'coverBackground':
          handleBackground(value, areaEl);
          break;
        case 'media':
          handleMedia(blockContent, mappingConfig?.selector, value?.imageRef, areaEl);
          break;
        case 'actions': {
          const actionEL = blockContent?.querySelector(mappingConfig?.selector);
          if (actionEL) {
            actionEL.innerHTML = '';
            handleActionButtons(
              blockContent,
              properties,
              value,
              actionEL,
            );
          }
          break;
        }
        case 'checklistItems':
          handleCheckList(value, areaEl, properties, blockContent);
          break;
        case 'logoImage':
          handleLogo(value, areaEl);
          break;
        case 'supplemental':
          handleSupplemental(blockContent, mappingConfig?.selector, value);
          break;
        default:
          break;
      }
    });
    handleVariants(sectionWrapper, blockContent, properties);
    handleSwap(blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  } finally {
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
  }
}
