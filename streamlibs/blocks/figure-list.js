import {
  handleComponents,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleCaption(caption, blockContent) {
  if (!caption) return;
  const textArea = blockContent.querySelector(':scope > div');
  const captionTxt = caption.split('\n').map((line) => `<p><em>${line}</em></p>`);
  captionTxt.forEach((txt) => textArea.innerHTML += txt);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('figure.json');
    blockContent.classList.remove('figure-list');
    const figureTemplate = blockContent.querySelector(":scope > div");
    properties.figures.forEach((figure) => {
      const figureCopy = figureTemplate.cloneNode(true);
      blockContent.appendChild(figureCopy);
      mappingData.data.forEach((mappingConfig) => {
        const value = figure[mappingConfig.key];
        const areaEl = handleComponents(figureCopy, value, mappingConfig);
        switch (mappingConfig.key) {
          case 'caption':
            if (value) handleCaption(value, figureCopy);
            break;
          default:
            break;
        }
      });
    });
    figureTemplate.classList.add('to-remove');
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
