import { handleBackgroundWithSectionMetadata } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { extractByPattern } from '../utils/utils.js';
import mapIconBlockContent from './icon-block.js';

const compose = (...fns) => (initialArg) => fns.reduce((acc, fn) => fn(acc), initialArg);

function handleUps(acc) {
  const { properties, finalArray } = acc;
  const numberUps = properties?.blocks?.length;
  const NUM_TO_WORD = {
    2: 'two',
    3: 'three',
    4: 'four',
  };
  if (numberUps > 1) {
    finalArray.push(`${NUM_TO_WORD[numberUps]}-up`);
    return acc;
  }
  return acc;
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

function handleGrid(acc) {
  const { properties, finalArray } = acc;
  const grid = extractByPattern(properties?.miloTag, /gr\d+/);
  if (grid?.number) {
    finalArray.push(`grid width ${grid?.number}`);
  }
  return acc;
}

function handlePositioning(properties) {
  const positioningHorizontal = extractByPattern(properties?.miloTag, 'hz');
  const positionCenter = extractByPattern(properties?.miloTag, 'ctr');
  if (positioningHorizontal?.raw) {
    return 'horizontal';
  }
  if (positionCenter?.raw) {
    return 'center';
  }
  return '';
}

function handleSectionMetadata(sectionWrapper, properties) {
  const sectionMetadata = document.createElement('div');
  sectionMetadata.classList.add('section-metadata');
  const div = document.createElement('div');
  const styleDiv = document.createElement('div');
  styleDiv.textContent = 'style';
  const attributes = compose(
    handleUps,
    handleSpacers,
    handleGrid,
  )({ finalArray: [], properties });
  const attributeDiv = document.createElement('div');
  attributeDiv.textContent = attributes.finalArray.join(', ');
  div.appendChild(styleDiv);
  div.appendChild(attributeDiv);
  sectionMetadata.appendChild(div);
  sectionWrapper.appendChild(sectionMetadata);
}
export default async function mapBlockContent(
  sectionWrapper,
  blockContent,
  figContent,
) {
  const properties = figContent?.details?.properties;
  if (!properties) return;

  try {
    const configJson = 'icon-card-block.json';
    const mappingData = await safeJsonFetch(configJson);

    const numberOfBlocks = properties?.blocks?.length;

    const blockCopies = [];
    for (let i = 0; i < numberOfBlocks; i += 1) {
      const blockCopy = blockContent.cloneNode(true);
      blockCopies.push(blockCopy);
    }
    const existingIconBlock = sectionWrapper.querySelector('div.icon-block');
    if (existingIconBlock) {
      existingIconBlock.classList.add('to-remove');
    }

    const align = handlePositioning(properties);

    const iconBlockPromises = blockCopies
      .map((blockCopy, index) => mapIconBlockContent(
        sectionWrapper,
        blockCopy,
        { details: { properties: { ...properties?.blocks[index], align } } },
        mappingData,
      ));

    // Wait for all mapping to complete
    await Promise.all(iconBlockPromises);

    // Append each copy to the sectionWrapper after mapping is complete
    blockCopies.forEach((blockCopy) => {
      sectionWrapper.appendChild(blockCopy);
    });

    sectionWrapper.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleSectionMetadata(sectionWrapper, properties);
    handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, properties?.background);
  } catch (error) {
    console.log('saurabh', error);
  }
}
