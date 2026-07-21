/* eslint-disable max-len */
import {
  handleComponents,
  handleSpacerWithSectionMetadata,
  handleBackgroundWithSectionMetadata,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleList(listItems, areaEl) {
  if (!listItems || listItems.length < 1 || !areaEl) return;
  listItems.forEach((item) => {
    const liTag = document.createElement('li');
    liTag.innerHTML = item;
    areaEl.appendChild(liTag);
  });
}

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.topSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.bottomSpacer.name, 'bottom');
}

function handleBody2(sectionWrapper, blockContent, properties) {
  if (!properties.body2) return;
  const divText = document.createElement('div');
  divText.classList.add(...['text', 'long-form', 'm-spacing', 'large']);
  const divRow = document.createElement('div');
  const container = document.createElement('div');
  const lines = properties.body2.split('\n');
  lines.forEach((line) => {
    const p = document.createElement('p');
    p.innerHTML = line;
    container.appendChild(p);
  });
  divRow.appendChild(container);
  divText.appendChild(divRow);
  sectionWrapper.insertBefore(divText, blockContent.nextSibling);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('long-form-standard.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      if (!areaEl) return;
      switch (mappingConfig.key) {
        case 'background':
          areaEl.classList.add('to-remove');
          if (value && !value.startsWith('#fff')) {
            handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, value);
          }
          break;
        case 'hasList':
          if (!value) {
            areaEl.classList.add('to-remove');
            return;
          }
          handleList(properties.list, areaEl);
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleBody2(sectionWrapper, blockContent, properties);
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
