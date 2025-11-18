/* eslint-disable max-len */
import {
  handleComponents,
  handleBackground,
} from '../components/components.js';
import { DEFAULT_TMP_URL } from '../utils/constants.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleColumns(hasCol, listProperty, areaEl) {
  if (!hasCol) areaEl.classList.add('to-remove');
  areaEl.innerHTML = '';
  const heading = listProperty.heading ? listProperty.heading : null;
  if (heading) {
    const headingEl = document.createElement('h3');
    headingEl.innerHTML = heading;
    areaEl.appendChild(headingEl);
  }
  for (let i = 1; i <= 30; i++) {
    if (!listProperty[`link${i}`]) break;
    const aRow = document.createElement('p');
    const aTag = document.createElement('a');
    aTag.href = DEFAULT_TMP_URL;
    aTag.innerHTML = listProperty[`link${i}`];
    aRow.appendChild(aTag);
    areaEl.appendChild(aRow);
  }
}

function handleVariants(blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('long-form-link-farm.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'background':
          if (!value || value.startsWith('#fff')) {
            areaEl.classList.add('to-remove');
            return;
          }
          handleBackground(value, areaEl);
          break;
        case 'hasListCol1':
          handleColumns(value, properties.linkList[0], areaEl);
          break;
        case 'hasListCol2':
          handleColumns(value, properties.linkList[1], areaEl);
          break;
        case 'hasListCol3':
          handleColumns(value, properties.linkList[2], areaEl);
          break;
        case 'hasListCol4':
          handleColumns(value, properties.linkList[3], areaEl);
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
