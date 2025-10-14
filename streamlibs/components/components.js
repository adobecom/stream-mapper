import {
  ACCENT_BARS,
  GRID_SIZES,
  ACTION_BUTTONS_TYPES,
  ACTION_BUTTONS_SIZES,
} from '../utils/constants.js';

export function handleTextComponent({ el, value, selector }) {
  const textEl = el.querySelector(selector);
  if (!value) return textEl.classList.add('to-remove');
  textEl.innerHTML = '';
  const lines = value.split('\n');
  if (lines.length === 1) {
    textEl.innerHTML += value;
    return textEl;
  }
  lines.forEach((line) => {
    textEl.innerHTML += `<p>${line}</p>`;
  });
  return textEl;
}

function handleImageComponent({ el, value, selector }) {
  const picEl = el.querySelector(selector);
  if (!value) return picEl.classList.add('to-remove');
  picEl.querySelector('img').src = value;
  return picEl;
}

function handleContainerComponent({ el, value, selector }) {
  const containerEl = el.querySelector(selector);
  if (!value) return containerEl.classList.add('to-remove');
  containerEl.innerHTML = '';
  return containerEl;
}

function handleLogoContainerComponent({ el, value, selector }) {
  const containerEl = el.querySelector(selector);
  if (!value) return containerEl.classList.add('to-remove');
  return containerEl;
}

export function handleButtonComponent({
  el,
  actionArea,
  buttonType,
  buttonText,
}) {
  const btnType = buttonType ? buttonType.toLowerCase() : '';

  // Button type
  // eslint-disable-next-line no-restricted-syntax
  for (const type in ACTION_BUTTONS_TYPES) {
    if (btnType.includes(type)) {
      actionArea.innerHTML += ACTION_BUTTONS_TYPES[type].replace('/buttonText/', buttonText);
    }
  }

  // Button size
  // eslint-disable-next-line no-restricted-syntax
  for (const size in ACTION_BUTTONS_SIZES) {
    if (btnType.includes(size)) {
      el.classList.add(ACTION_BUTTONS_SIZES[size]);
    }
  }
}

export function handleComponents(el, value, mappingConfig) {
  switch (mappingConfig.type) {
    case 'text':
      return handleTextComponent({ el, selector: mappingConfig.selector, value });
    case 'image':
      return handleImageComponent({ el, selector: mappingConfig.selector, value });
    case 'container':
      return handleContainerComponent({ el, selector: mappingConfig.selector, value });
    case 'logoContainer':
      return handleLogoContainerComponent({ el, selector: mappingConfig.selector, value });
    default:
      return null;
  }
}

export function handleSpacer(el, spacer, position) {
  if (!spacer) return;
  const spacerName = spacer.toLowerCase().trim();
  let spacerClass = '';
  if (spacerName.includes(' m ')) spacerClass = 'm';
  else if (spacerName.includes(' xxxl ')) spacerClass = 'xxxl';
  else if (spacerName.includes('xxl')) spacerClass = 'xxl';
  else if (spacerName.includes(' xl ')) spacerClass = 'xl';
  else if (spacerName.includes(' l ')) spacerClass = 'l';
  else if (spacerName.includes(' xs ')) spacerClass = 'xs';
  else if (spacerName.includes(' s ')) spacerClass = 's';
  if (!spacerClass) return;
  el.classList.add(`${spacerClass}-spacing-${position}`);
}

export function handleActionButtons(el, configData, value, areaEl) {
  if (!value) return;
  if (configData.action1) {
    handleButtonComponent({
      el,
      actionArea: areaEl,
      buttonType: configData.action1.variant,
      buttonText: configData.action1.text,
    });
  }
  if (configData.action2) {
    handleButtonComponent({
      el,
      actionArea: areaEl,
      buttonType: configData.action2.variant,
      buttonText: configData.action2.text,
    });
  }
  if (configData.action3) {
    handleButtonComponent({
      el,
      actionArea: areaEl,
      buttonType: configData.action3.variant,
      buttonText: configData.action3.text,
    });
  }
}

export function handleBackground(value, areaEl) {
  if (value.startsWith('http')) {
    const img = document.createElement('img');
    img.src = value;
    const pic = document.createElement('picture');
    const source = document.createElement('source');
    source.srcset = value;
    source.type = 'image/webp';
    pic.append(...[source, img]);
    areaEl.append(pic);
  } else {
    areaEl.innerHTML = value;
  }
}

export function handleAccentBar(secEl, blockEl, accentType) {
  if (!ACCENT_BARS[accentType]) return;
  const accentBar = document.createElement('div');
  accentBar.classList.add(...['text', 'accent-bar']);
  accentBar.innerHTML += `<div>${ACCENT_BARS[accentType]}</div>`;
  secEl.insertBefore(accentBar, blockEl.nextSibling);
}

export function handleGridLayout(gridSize, blockEl, device) {
  // eslint-disable-next-line no-restricted-syntax
  for (const size in GRID_SIZES) {
    if (gridSize.includes(size)) {
      blockEl.classList.add(`${GRID_SIZES[size]}-${device}`);
      return;
    }
  }
}

export function handleUpsWithSectionMetadata(secEl, blockEl, value) {
  const sectionMetadata = document.createElement('div');
  sectionMetadata.classList.add('section-metadata');
  sectionMetadata.innerHTML += '<div><div>style</div><div></div></div>';
  const styleLoc = sectionMetadata.querySelector(':scope > div > div:first-child');
  switch (value) {
    case 1:
      styleLoc.innerHTML += 'one-up';
      break;
    case 2:
      styleLoc.innerHTML += 'two-up';
      break;
    case 3:
      styleLoc.innerHTML += 'three-up';
      break;
    case 4:
      styleLoc.innerHTML += 'four-up';
      break;
    case 5:
      styleLoc.innerHTML += 'five-up';
      break;
    default:
      break;
  }
  secEl.insertBefore(sectionMetadata, blockEl.nextSibling);
}

export function handleBackgroundWithSectionMetadata(secEl, blockEl, value) {
  if (!value || value.startsWith('#fff')) return;
  let sectionMetadata = document.createElement('div');
  if (secEl.querySelector('.section-metadata')) {
    sectionMetadata = secEl.querySelector('.section-metadata');
  } else {
    sectionMetadata.classList.add('section-metadata');
  }
  sectionMetadata.innerHTML += '<div><div>background</div><div></div></div>';

  const backgroundValue = sectionMetadata.querySelector(':scope > div:last-child > div:last-child');
  if (value.startsWith('http')) {
    const img = document.createElement('img');
    img.src = value;
    const pic = document.createElement('picture');
    const source = document.createElement('source');
    source.srcset = value;
    source.type = 'image/png';
    pic.append(...[source, img]);
    backgroundValue.append(pic);
  } else {
    backgroundValue.innerHTML = value;
  }
  secEl.insertBefore(sectionMetadata, blockEl.nextSibling);
}
