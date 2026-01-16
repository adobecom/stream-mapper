import {
  replaceImage,
  handleSpacerWithSectionMetadata,
} from '../components/components.js';

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.topSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.bottomSpacer.name, 'bottom');
}

function addActionScroller(sectionWrapper) {
  const actionScroller = document.createElement('div');
  actionScroller.classList.add('action-scroller');
  actionScroller.innerHTML = `<div class="action-scroller">
    <div>
      <div data-valign="middle">Item width</div>
      <div data-valign="middle">250</div>
    </div>
  </div>`;
  sectionWrapper.prepend(actionScroller);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    addActionScroller(sectionWrapper);
    properties['logo-items'].forEach((logo) => {
      const actionItem = blockContent.cloneNode(true);
      replaceImage(actionItem.querySelector('picture'), logo.image);
      sectionWrapper.appendChild(actionItem);
    });
    blockContent.classList.add('to-remove');
    sectionWrapper.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
