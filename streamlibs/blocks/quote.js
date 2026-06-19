import {
  handleComponents,
  handleSpacer,
  handleGridLayout,
  handleBackgroundWithSectionMetadata,
  resolveImageValue,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleLayout(layout, blockEl) {
  switch (layout) {
    case 'inline':
      blockEl.classList.add('inline');
      break;
    case 'right':
      blockEl.classList.add('align-right');
      break;
    default:
      break;
  }
}

function handleVariants(blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.borders) blockContent.classList.add('borders');
  if (properties?.topSpacer) handleSpacer(blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacer(blockContent, properties.bottomSpacer.name, 'bottom');
  if (properties?.desktopLayout) handleGridLayout(properties.desktopLayout, blockContent, 'desktop');
  if (properties?.layout) handleLayout(properties.layout, blockContent);
}

function handleAvatar(value, areaEl) {
  if (!value) return;
  const { url, altText } = resolveImageValue(value);
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = url; });
  const imgEl = areaEl.querySelector('img');
  imgEl.src = url;
  if (altText) imgEl.alt = altText;
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('quote.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'avatar':
          handleAvatar(value, areaEl);
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
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
