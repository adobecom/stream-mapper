import {
  handleComponents,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleCaption(caption, blockContent) {
  if (!caption) return;
  const textArea = blockContent.querySelector(':scope > div > div');
  const captionTxt = caption.split('\n').map((line) => `<p><em>${line}</em></p>`);
  captionTxt.forEach((txt) => textArea.innerHTML += txt);
}

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.miloTag.toLowerCase().includes('full-height')) blockContent.classList.add('full-height');
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('figure.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'caption':
          if (value) handleCaption(value, blockContent);
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
