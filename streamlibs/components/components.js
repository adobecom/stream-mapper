import {
  ACCENT_BARS,
  GRID_SIZES,
} from '../utils/constants.js';

function handleTextComponent({ el, value, selector }) {
  const textEl = el.querySelector(selector);
  if (!value) return textEl.classList.add('to-remove');
  textEl.innerHTML = value;
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
  if (btnType.includes('accent')) {
    actionArea.innerHTML += `<strong><a href='https://www.adobe.com'>${buttonText}</a></strong>`;
  } else if (btnType.includes('outline')) {
    actionArea.innerHTML += `<em><a href='https://www.adobe.com'>${buttonText}</a></em>`;
  } else {
    actionArea.innerHTML += `<a href='https://www.adobe.com'>${buttonText}</a>`;
  }
  // Button size
  if (btnType.includes('xxl button')) {
    el.classList.add('xxl-button');
  } else if (btnType.includes('xl button')) {
    el.classList.add('xl-button');
  } else if (btnType.includes('l button')) {
    el.classList.add('l-button');
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
      buttonType: configData.action1.btnType,
      buttonText: configData.action1.text,
    });
  }
  if (configData.action2) {
    handleButtonComponent({
      el,
      actionArea: areaEl,
      buttonType: configData.action2.btnType,
      buttonText: configData.action2.text,
    });
  }
  if (configData.action3) {
    handleButtonComponent({
      el,
      actionArea: areaEl,
      buttonType: configData.action2.btnType,
      buttonText: configData.action2.text,
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
  debugger
}

export function handleGridLayout(gridSize, blockEl, device) {
  for (const size in gridSize) {
    if (size in gridSize) {
      blockEl.classList.add(`${GRID_SIZES[size]}-${device}`);
      return;
    }
  }
}

export function handleBackgroundWithSectionMetadata(secEl, blockEl, value) {
  if (!value || value.startsWith('#fff')) return;
  const sectionMetadata = document.createElement('div');
  sectionMetadata.classList.add('section-metadata');
  sectionMetadata.innerHTML += `<div><div>background</div><div></div></div>`;
  const backgroundValue = sectionMetadata.querySelector(':scope > div > div:last-child');
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
    backgroundValue.innerHTML = value
  }
  secEl.insertBefore(sectionMetadata, blockEl.nextSibling);
}
