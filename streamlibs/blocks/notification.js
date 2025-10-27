/* eslint-disable max-len */
import {
  handleComponents,
  handleActionButtons,
  handleBackground,
  handleAccentBar,
  handleGridLayout,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleSwap(blockContent) {
  const foregroundDiv = blockContent.querySelector(':scope > div:last-child');
  const copyDiv = blockContent.querySelector(':scope > div:last-child > div:first-child');
  foregroundDiv.append(copyDiv);
}

export function handleForegroundImage(el, value, selector) {
  const picParentEl = el.querySelector(selector);
  if (!value) return picParentEl.classList.add('to-remove');
  const picEl = picParentEl.querySelector('picture');
  picEl.querySelectorAll('source').forEach((source) => { source.srcset = value; });
  picEl.querySelector('img').src = value;
  return picEl;
}

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.desktopLayout) handleGridLayout(properties.desktopLayout, blockContent, 'desktop');
  if (properties?.accentBar?.name) handleAccentBar(sectionWrapper, blockContent, properties.accentBar.name);
  if (properties?.layout === 'center') blockContent.classList.add('center');
  if (properties?.layout.startsWith('image')) handleSwap(blockContent, properties);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('notification.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'background':
          handleBackground(value, areaEl);
          break;
        case 'photo':
          handleForegroundImage(blockContent, value, mappingConfig.selector);
          break;
        case 'actions':
          handleActionButtons(blockContent, properties, value, areaEl);
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
