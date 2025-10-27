import { safeJsonFetch } from '../utils/error-handler.js';
import { compose } from '../utils/utils.js';
import mapAccordionChildContent from './accordion-child.js';

function handleVariant(sectionWrapper, blockContent, properties) {
  if (properties?.miloTag?.includes('gr12')) {
    blockContent.classList.add('max-width-12-desktop');
  }
}

function handleSpacer(spacer, position) {
  if (!spacer) return '';
  const spacerName = spacer.toLowerCase().trim();
  let spacerClass = '';
  if (spacerName.includes(' m ')) spacerClass = 'm';
  else if (spacerName.includes(' xxxl ')) spacerClass = 'xxxl';
  else if (spacerName.includes('xxl')) spacerClass = 'xxl';
  else if (spacerName.includes(' xl ')) spacerClass = 'xl';
  else if (spacerName.includes(' l ')) spacerClass = 'l';
  else if (spacerName.includes(' xs ')) spacerClass = 'xs';
  else if (spacerName.includes(' s ')) spacerClass = 's';
  if (!spacerClass) return '';
  return `${spacerClass}-spacing-${position}`;
}

function handleSpacers(acc) {
  const { properties, finalArray } = acc;
  if (properties?.topSpacer) {
    const topSpace = handleSpacer(properties.topSpacer.name, 'top');
    finalArray.push(topSpace);
  }
  if (properties?.bottomSpacer) {
    const bottomSpace = handleSpacer(properties.bottomSpacer.name, 'bottom');
    finalArray.push(bottomSpace);
  }
  return acc;
}

function handleSectionMetadata(sectionWrapper, properties) {
  const sectionMetadata = document.createElement('div');
  sectionMetadata.classList.add('section-metadata');
  const div = document.createElement('div');
  const styleDiv = document.createElement('div');
  styleDiv.textContent = 'style';
  const attributes = compose(
    handleSpacers,
  )({ finalArray: [], properties });
  const attributeDiv = document.createElement('div');
  attributeDiv.textContent = attributes.finalArray.join(', ');
  div.appendChild(styleDiv);
  div.appendChild(attributeDiv);
  sectionMetadata.appendChild(div);
  sectionWrapper.appendChild(sectionMetadata);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;

  try {
    const configJson = 'accordion.json';
    const mappingData = await safeJsonFetch(configJson);
    const configData = properties?.miloTag === 'acd-rm' ? mappingData.rich : mappingData.basic;

    const accordions = (properties?.accordions || []).filter(
      (accChild) => accChild.body && accChild.heading,
    );

    if (!accordions.length) return;

    if (properties?.heading) {
      const outerDiv = document.createElement('div');
      outerDiv.className = 'text';
      if (properties?.miloTag?.includes) {
        outerDiv.classList.add('max-width-10-desktop');
      }

      const div1 = document.createElement('div');
      const div2 = document.createElement('div');
      div2.setAttribute('data-valign', 'middle');

      const h2 = document.createElement('h2');
      h2.id = properties?.heading;

      h2.textContent = properties?.heading;

      div2.appendChild(h2);
      div1.appendChild(div2);
      outerDiv.appendChild(div1);
      sectionWrapper.prepend(outerDiv);
    }

    const innerElements = Array.from(blockContent.children);

    blockContent.innerHTML = '';

    const childFragments = accordions.map(() => {
      const fragment = document.createDocumentFragment();
      innerElements.forEach((el) => fragment.appendChild(el.cloneNode(true)));
      return fragment;
    });

    const childPromises = childFragments.map((childFragment, index) => mapAccordionChildContent(
      sectionWrapper,
      blockContent, // parent is the accordion div itself
      childFragment, // fragment of inner elements
      {
        details: {
          properties: {
            ...accordions[index],
            miloTag: properties?.miloTag,
            media: properties?.media,
          },
        },
      },
      configData,
    ));

    await Promise.all(childPromises);

    childFragments.forEach((frag) => blockContent.appendChild(frag));
    handleVariant(sectionWrapper, blockContent, properties);
    handleSectionMetadata(sectionWrapper, properties);
    // Clean up any marked-to-remove elements
    sectionWrapper.querySelectorAll('.to-remove').forEach((el) => el.remove());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error mapping accordion block:', error);
  }
}
