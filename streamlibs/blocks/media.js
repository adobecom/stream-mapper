import {
  handleActionButtons,
  handleBackground,
  handleComponents,
  handleSpacerWithSectionMetadata,
} from '../components/components.js';
import { LOGOS } from '../utils/constants.js';
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

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.topSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.bottomSpacer.name, 'bottom');
  handleCompact(blockContent, properties);
  handleProduct(blockContent, properties);
  handleSizes(blockContent, properties);
  handlePersona(blockContent, properties);
  handleHighlights(blockContent, properties);
  handleAppStore(blockContent, properties);
}

function handleNormalList(items, areaEl) {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item?.text ?? 'placeholder';
    fragment.appendChild(li);
  });
  areaEl.appendChild(fragment);
}

function handleFooterList(items, areaEl, properties) {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const p = document.createElement('p');
    const a = document.createElement('a');
    const span = document.createElement('span');
    a.href = 'www.adobe.com';
    if (properties?.miloTag?.includes('plylst')) {
      span.classList.add('icon');
      span.classList.add('icon-play-circle');
    }
    a.appendChild(span);
    a.innerHTML += item?.name ?? 'placeholder';
    p.appendChild(a);
    fragment.appendChild(p);
  });
  const parenNode = areaEl.parentNode;
  parenNode.appendChild(fragment);
}

function handleList(items, areaEl, properties, blockContent) {
  if (properties?.miloTag?.includes('plylst')) {
    handleFooterList(items, areaEl, properties, blockContent);
  } else {
    handleNormalList(items, areaEl);
  }
}

function handleAppList(items, areaEl) {
  const fragment = document.createDocumentFragment();
  if (items?.length) {
    items.forEach((item) => {
      const li = document.createElement('li');
      const picAnchor = document.createElement('a');
      const textAnchor = document.createElement('a');
      picAnchor.href = 'www.adobe.com';
      picAnchor.textContent = LOGOS[item?.mappingKey ?? 'placeholder'];
      textAnchor.href = 'www.adobe.com';
      textAnchor.textContent = item?.text ?? 'placeholder';
      li.appendChild(picAnchor);
      li.appendChild(textAnchor);
      fragment.appendChild(li);
    });
    areaEl.appendChild(fragment);
  }
}

function handleQRCode(value, areaEl) {
  if (!value || !areaEl) return;
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = value; });
  areaEl.querySelector('img').src = value;
  areaEl.querySelector('img').style.width = '140px';
  areaEl.querySelector('img').style.height = '140px';
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;

  try {
    const mappingData = await safeJsonFetch('media.json');
    let configData = mappingData.list;
    if (properties?.miloTag?.includes('plylst')) configData = mappingData.playlist;
    if (properties?.miloTag?.includes('app')) configData = mappingData.appstore;
    configData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'actions':
          handleActionButtons(
            blockContent,
            properties,
            value,
            areaEl,
          );
          break;
        case 'foregroundImage':
          handleForegroundImage(value, areaEl);
          break;
        case 'listItems':
          handleList(value, areaEl, properties, blockContent);
          break;
        case 'appListItems':
          handleAppList(value, areaEl, properties);
          break;
        case 'background':
          handleBackground(value, areaEl);
          break;
        case 'qrCode':
          handleQRCode(value, areaEl);
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(sectionWrapper, blockContent, properties);
    handleSwap(blockContent, properties);
  } catch (error) {
    console.error(error);
  }
}
