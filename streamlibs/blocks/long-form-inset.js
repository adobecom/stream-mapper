/* eslint-disable max-len */
import {
  handleComponents,
  handleBackgroundWithSectionMetadata,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleLists(listConfig, blockContent, idx) {
  const heading = blockContent.querySelectorAll('h3')[idx];
  if (listConfig.heading) {
    heading.innerHTML = listConfig.heading;
  } else {
    heading.classList.add('to-remove');
  }

  const body = blockContent.querySelectorAll('h3 + p')[idx];
  if (listConfig.body) {
    body.innerHTML = listConfig.body;
  } else {
    body.classList.add('to-remove');
  }

  const list = blockContent.querySelectorAll('ul')[idx];
  if (!listConfig.items || listConfig.items.length < 0) {
    list.classList.add('to-remove');
  } else {
    list.innerHTML = '';
    listConfig.items.forEach((item) => {
      const liTag = document.createElement('li');
      liTag.innerHTML = item;
      list.appendChild(liTag);
    });
    if (!listConfig.hasBullets) blockContent.classList.add('unstyled-list');
  }
}

function handleVariants(blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
}

function handlePreContent(sectionWrapper, properties) {
  if (!properties.detail && !properties.heading && !properties.body) return;
  const divText = document.createElement('div');
  divText.classList.add(...['text', 'long-form', 'm-spacing', 'large']);
  const divRow = document.createElement('div');
  const preLfContainer = document.createElement('div');
  if (properties.detail) {
    const detailEl = document.createElement('p');
    detailEl.innerHTML = properties.detail;
    preLfContainer.appendChild(detailEl);
  }
  if (properties.heading) {
    const headingEl = document.createElement('h2');
    headingEl.innerHTML = properties.heading;
    preLfContainer.appendChild(headingEl);
  }
  if (properties.body) {
    const bodyEl = document.createElement('p');
    bodyEl.innerHTML = properties.body;
    preLfContainer.appendChild(bodyEl);
  }
  divText.appendChild(divRow);
  divRow.appendChild(preLfContainer);
  sectionWrapper.prepend(divText);
}

function handlePostContent(sectionWrapper, properties) {
  if (!properties.body2) return;
  const divText = document.createElement('div');
  divText.classList.add(...['text', 'long-form', 'm-spacing', 'large']);
  const divRow = document.createElement('div');
  const postLfContainer = document.createElement('div');
  const bodyEl = document.createElement('p');
  bodyEl.innerHTML = properties.body;
  postLfContainer.appendChild(bodyEl);
  divText.appendChild(divRow);
  divRow.appendChild(postLfContainer);
  sectionWrapper.append(divText);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('long-form-inset.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      // eslint-disable-next-line no-unused-vars
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'lists':
          properties.lists.forEach((listConfig, idx) => {
            handleLists(listConfig, blockContent, idx);
          });
          break;
        case 'background':
          if (value && !value.startsWith('#fff')) {
            handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, value);
          }
          break;
        default:
          break;
      }
    });
    handlePreContent(sectionWrapper, properties);
    handlePostContent(sectionWrapper, properties);
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
