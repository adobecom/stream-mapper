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

function handleLayout(blockContent, properties) {
  if (getFirstType(properties?.layout) === 'image') {
    blockContent?.classList.add('media-first');
  }
}

function handleVariants(sectionWrapper, blockContent, properties) {
  blockContent?.classList.add('seo');
  if (properties?.miloTag?.includes('media')) blockContent?.classList.add('large-media');
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
    let configData = mappingData.mini;
    if (properties?.miloTag?.includes('media')) configData = mappingData.media;

    configData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
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
