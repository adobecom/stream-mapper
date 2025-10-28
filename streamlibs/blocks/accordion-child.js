import {
  handleActionButtons,
  handleComponents,
} from '../components/components.js';

function handleImage(value, areaEl, properties, type) {
  if (!value) return;
  // Done this change as in figma of rich media accordian is not changing
  //  image according to the accordian open
  const imgVal = properties?.miloTag === 'acd-rm' ? properties.media : value;
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = imgVal; });
  areaEl.querySelector('img').src = imgVal;
  if (type === 'media-thumbnail' && properties?.miloTag !== 'acd-rm') {
    areaEl.querySelector('img').style.width = '300px';
    areaEl.querySelector('img').style.height = '225px';
  }
}

export default async function mapAccordionChildContent(
  sectionWrapper,
  blockContent,
  childContent,
  figContent,
  mapConfig,
) {
  const properties = figContent?.details?.properties;
  if (!properties) return;

  try {
    mapConfig?.data?.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(childContent, value, mappingConfig);

      switch (mappingConfig.key) {
        case 'actions':
          handleActionButtons(blockContent, properties, value, areaEl);
          break;
        case 'media-thumbnail':
          handleImage(value, areaEl, properties, 'media-thumbnail');
          break;
        case 'media-full':
          handleImage(value, areaEl);
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error mapping accordion child block:', error);
  }
}
