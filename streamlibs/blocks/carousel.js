import {
  handleImageComponent,
  handleTextComponent,
  addOrUpdateSectionMetadata,
} from '../components/components.js';
import { safeTemplateFetch } from '../utils/error-handler.js';
import mapTextBlockContent from './text.js';
import mapCardEditorialContent from './card-editorial.js';

const CAROUSEL_TEXT_PREFIX = 'carousel';
let carouselCounter = 0;

async function fetchTemplateElement(url, selector) {
  const templateHtml = await safeTemplateFetch(url);
  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, 'text/html');
  return doc.querySelector(selector);
}

async function processItemsWithTemplate(items, div, templateElement, figContent, mapper) {
  return Promise.all(
    items.map(async (item) => {
      const itemDiv = div.cloneNode(true);
      itemDiv.querySelectorAll('p').forEach((p) => p.remove());
      const itemBlock = templateElement?.cloneNode(true);
      if (itemBlock) {
        itemDiv.insertBefore(itemBlock, itemDiv.firstChild);
      }
      itemDiv.classList.add('section');
      await mapper(itemDiv, itemBlock, figContent, item);
      return itemDiv;
    }),
  );
}

export default async function mapcarousel(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return undefined;
  const carouselDivs = Array.from(blockContent);
  const sections = [];

  try {
    for (let index = 0; index < carouselDivs.length; index += 1) {
      const div = carouselDivs[index];
      if (index === 0) {
        const carouselEl = div.querySelector('.carousel');
        if (carouselEl) {
          if (properties?.miloTag === 'carousel-show') {
            carouselEl.classList.add('show-3');
            carouselEl.classList.add('m-gap');
          }
          carouselCounter += 1;
          const containerDiv = carouselEl.querySelector(':scope > div > div:first-child');
          if (containerDiv) {
            containerDiv.textContent = `${CAROUSEL_TEXT_PREFIX}-${carouselCounter}`;
          }
        }
        div.classList.add('section');
        sections.push(div);
      } else if (index === 1) {
        const metadata = div.querySelector('.section-metadata');
        if (metadata) {
          const carouselValueDiv = addOrUpdateSectionMetadata(div, div, 'carousel');
          if (carouselValueDiv) {
            carouselValueDiv.textContent = `${CAROUSEL_TEXT_PREFIX}-${carouselCounter}`;
          }
        }
        if (properties.medias.length > 0 && properties.cards.length === 0) {
          properties.medias.forEach((media) => {
            const mediaDiv = div.cloneNode(true);
            handleImageComponent({
              el: mediaDiv,
              selector: 'p picture',
              value: media.image.imageRef,
            });
            handleTextComponent({
              el: mediaDiv,
              selector: 'p:nth-child(2)',
              value: media.text,
            });
            mediaDiv.classList.add('section');
            sections.push(mediaDiv);
          });
        } else if (properties.texts.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          const templateElement = await fetchTemplateElement(
            'https://main--stream-mapper--adobecom.aem.live/block-templates/text.plain.html',
            '.text',
          );
          if (properties.textBlock?.name && !properties.textBlock.name.toLowerCase().includes('center')) {
            templateElement.classList.remove('center');
          }
          // eslint-disable-next-line no-await-in-loop
          const textSections = await processItemsWithTemplate(
            properties.texts,
            div,
            templateElement,
            figContent,
            async (textDiv, textBlock, baseFigContent, textItem) => {
              const textFigContent = {
                ...baseFigContent,
                details: {
                  ...baseFigContent.details,
                  properties: textItem,
                },
              };
              await mapTextBlockContent(textDiv, textBlock, textFigContent);
            },
          );
          sections.push(...textSections);
        } else if (properties.cards && properties.cards.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          const templateElement = await fetchTemplateElement(
            'https://main--stream-mapper--adobecom.aem.live/block-templates/editorial-card.plain.html',
            '.card-editorial',
          );
          if (properties.card.name.toLowerCase().includes('open')) {
            templateElement.classList.add('open');
          }
          if (properties.card.name.toLowerCase().includes('center')) {
            templateElement.classList.add('center');
          }
          // eslint-disable-next-line no-await-in-loop
          const cardSections = await processItemsWithTemplate(
            properties.cards,
            div,
            templateElement,
            figContent,
            async (cardDiv, cardBlock, baseFigContent, cardItem) => {
              const cardFigContent = {
                ...baseFigContent,
                details: {
                  ...baseFigContent.details,
                  properties: {
                    ...properties,
                    cards: [cardItem],
                  },
                },
              };
              await mapCardEditorialContent(cardDiv, cardBlock, cardFigContent);
            },
          );
          sections.push(...cardSections);
        }
      }
    }
    return sections;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
    return undefined;
  }
}
