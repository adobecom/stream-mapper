import mapActionItemContent from './action-item.js';

// eslint-disable-next-line max-len
export default async function mapActionScrollerBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const { actionScroller } = properties;
    const actionItem = blockContent.querySelector('.action-item');
    const actionScrollerEL = blockContent.querySelector('.action-scroller');
    sectionWrapper.appendChild(actionScrollerEL);
    const Items = actionScroller ? actionScroller[0].Items : properties.Items;
    if (actionItem) {
      // eslint-disable-next-line no-restricted-syntax
      for (const item of Items) {
        const clonedActionItem = actionItem.cloneNode(true);
        const actionItemFigContent = {
          ...figContent,
          details: {
            ...figContent.details,
            properties: item,
          },
        };
        // eslint-disable-next-line no-await-in-loop
        await mapActionItemContent(sectionWrapper, clonedActionItem, actionItemFigContent);
        sectionWrapper.appendChild(clonedActionItem);
      }
      actionItem.remove();
    }
    if (actionScroller[0]?.leftNav || actionScroller[0]?.rightNav) actionScrollerEL.classList.add('navigation');
    if (actionScroller[0]?.align) actionScrollerEL.classList.add(actionScroller[0]?.align);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
