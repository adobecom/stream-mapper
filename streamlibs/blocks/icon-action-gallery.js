import mapIconBlockContent from './icon-block.js';
import mapActionScrollerBlockContent from './action-scroller.js';

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const { actionScroller, ...propertiesWithoutItems } = properties;
    const iconBlock = blockContent.querySelector('.icon-block');
    const actionScrollerEl = blockContent.querySelector('.action-scroller');
    if (iconBlock) {
      const galleryFigContent = {
        ...figContent,
        details: {
          ...figContent.details,
          properties: propertiesWithoutItems,
        },
      };
      await mapIconBlockContent(sectionWrapper, iconBlock, galleryFigContent, null);
      sectionWrapper.appendChild(iconBlock);
    }
    if (actionScrollerEl) {
      const galleryFigContent = {
        ...figContent,
        details: {
          ...figContent.details,
          properties,
        },
      };
      await mapActionScrollerBlockContent(sectionWrapper, blockContent, galleryFigContent, null);
    }
  } catch (error) {
    console.log(error);
  }
}
