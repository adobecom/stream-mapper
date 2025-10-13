import {
  handleComponents,
  handleBackgroundWithSectionMetadata,
  handleTextComponent,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

const CONTAINED_CLASS = 'contained';

function handleRows(cols, colTemplate, isEnabled, properties) {
  const rowEl = colTemplate.parentNode;
  cols.forEach((col, idx) => {
    if (!properties[isEnabled[idx]]) return;
    const colEl = colTemplate.cloneNode(true);
    handleTextComponent({el: colEl, value: col.heading, selector: 'h3'});
    handleTextComponent({el: colEl, value: col.body, selector: 'p'});
    rowEl.appendChild(colEl);
  });
  colTemplate.remove();
}

function handleVariants(blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.miloTag.toLowerCase().includes(CONTAINED_CLASS)) blockContent.classList.add(CONTAINED_CLASS);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('columns.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'colEnabled':
          const isEnabled = mappingConfig.selector.split(',').map((col) => col.trim());
          const colTemplate = blockContent.querySelector(':scope > div:last-child > div');
          handleRows(properties["rows"], colTemplate, isEnabled, properties);
          break;
        case 'background':
          handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, value);
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(blockContent, properties);
  } catch (error) {
    // Could not load columns mapping
  }
}
