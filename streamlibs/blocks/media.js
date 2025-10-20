import { handleActionButtons, handleComponents } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { divSwap, extractByPattern } from '../utils/utils.js';

function handleSwap(blockContent, properties) {
  if (properties?.layout === 'image - copy') {
    divSwap(blockContent, 'div > div:last-child > div:first-child:has(> h2)', 'div > div:last-child > div:last-child:has( > picture)');
  }
}

function handleForegroundImage(value, areaEl) {
  if (!value) return;
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = value; });
  areaEl.querySelector('img').src = value;
}

function handleCompact(blockContent, properties) {
  const compact = extractByPattern(properties?.miloTag, 'compact');
  if (compact?.raw) {
    blockContent?.classList.add('medium-compact');
  }
}

function handleProduct(blockContent, properties) {
  const product = extractByPattern(properties?.miloTag, 'prod');
  if (product?.raw) {
    blockContent?.classList.add('merch');
  }
}

function handleSizes(blockContent, properties) {
  const lg = extractByPattern(properties?.miloTag, 'lg');
  const sm = extractByPattern(properties?.miloTag, 'sm');
  if (sm?.raw) {
    blockContent?.classList.add('small');
  }
  if (lg?.raw) {
    blockContent?.classList.add('large');
  }
}

function handlePersona(blockContent, properties) {
  const persona = extractByPattern(properties?.miloTag, 'prsn');
  if (persona?.raw) {
    blockContent?.classList.add('bio');
  }
}

function handleHighlights(blockContent, properties) {
  const highlights = extractByPattern(properties?.miloTag, 'hglt');
  if (highlights?.raw) {
    blockContent?.classList.add('checklist');
  }
}

function handleAppStore(blockContent, properties) {
  const app = extractByPattern(properties?.miloTag, 'app');
  if (app?.raw) {
    blockContent?.classList.add('qr-code');
  }
}

function handleVariants(blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  handleCompact(blockContent, properties);
  handleProduct(blockContent, properties);
  handleSizes(blockContent, properties);
  handlePersona(blockContent, properties);
  handleHighlights(blockContent, properties);
  handleAppStore(blockContent, properties);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;

  try {
    const mappingData = await safeJsonFetch('media.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'actions':
          handleActionButtons(blockContent, properties, value, areaEl);
          break;
        case 'foregroundImage':
          handleForegroundImage(value, areaEl);
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(blockContent, properties);
    handleSwap(blockContent, properties);
  } catch (error) {
    // Could not load media block
  }
}
