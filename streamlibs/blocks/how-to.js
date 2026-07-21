import { handleBackgroundWithSectionMetadata, handleComponents } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { compose, extractByPattern, getFirstType } from '../utils/utils.js';

function handleGrid(acc) {
  const { properties, finalArray } = acc;
  const grid = extractByPattern(properties?.width, /\d+/);
  if (grid?.number) {
    finalArray.push(`grid width ${grid?.number}`);
  }
  return acc;
}

function handleNumberedList(items, areaEl) {
  if (!items || items.length < 1 || !areaEl) return;
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item?.text ?? 'placeholder';
    fragment.appendChild(li);
  });
  areaEl.appendChild(fragment);
}

function getEnabledListItems(items) {
  if (!Array.isArray(items)) return items;
  return items.filter(
    (item) => item?.enabled !== false && String(item?.text ?? '').trim(),
  );
}

function isImageFirstLayout(layout) {
  return getFirstType(layout) === 'image';
}

function handleLayout(blockContent, properties) {
  if (isImageFirstLayout(properties?.layout)) {
    blockContent?.classList.add('media-first');
  }
}

function hasMediaContent(properties) {
  return Boolean(properties?.media || properties?.mediaDetails);
}

function isMediaVariant(properties) {
  if (properties?.miloTag?.includes('media')) return true;
  if (hasMediaContent(properties)) return true;
  return isImageFirstLayout(properties?.layout);
}

function getMappingValue(properties, key) {
  if (key === 'numberedList') {
    return getEnabledListItems(properties?.numberedList ?? properties?.numberedListItems);
  }
  if (key === 'miniImage') {
    return properties?.miniImage || properties?.media;
  }
  if (key === 'media') {
    return properties?.media || properties?.miniImage;
  }
  return properties?.[key];
}

function handleVariants(sectionWrapper, blockContent, properties) {
  blockContent?.classList.add('seo');
  if (isMediaVariant(properties)) {
    blockContent?.classList.add('large-image');
  }
  handleLayout(blockContent, properties);
}

function handleSectionMetadata(sectionWrapper, properties) {
  const sectionMetadata = document.createElement('div');
  sectionMetadata.classList.add('section-metadata');
  const div = document.createElement('div');
  const styleDiv = document.createElement('div');
  styleDiv.textContent = 'style';
  const attributes = compose(handleGrid)({ finalArray: [], properties });
  if (attributes.finalArray.length > 0) {
    const attributeDiv = document.createElement('div');
    attributeDiv.textContent = attributes.finalArray.join(', ');
    div.appendChild(styleDiv);
    div.appendChild(attributeDiv);
    sectionMetadata.appendChild(div);
    sectionWrapper.appendChild(sectionMetadata);
  }
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;

  try {
    const mappingData = await safeJsonFetch('how-to.json');
    const configData = isMediaVariant(properties) ? mappingData.media : mappingData.mini;

    configData.data.forEach((mappingConfig) => {
      const value = getMappingValue(properties, mappingConfig.key);
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'numberedList':
          handleNumberedList(value, areaEl);
          break;
        default:
          break;
      }
    });
    handleVariants(sectionWrapper, blockContent, properties);
    handleSectionMetadata(sectionWrapper, properties);
    handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, properties?.background);
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
}
