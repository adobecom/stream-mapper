/* eslint-disable max-len */
import {
  handleBackground,
  handleComponents,
  handleSpacerWithSectionMetadata,
  handleMasonrysWithSectionMetadata,
  handleBackgroundWithSectionMetadata,
  handleActionButtons,
  replaceImage,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { LOGOS, SVG_ICONS } from '../utils/constants.js';

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.topSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.bottomSpacer.name, 'bottom');
}

function handleBrickProductLockups(value, areaEl) {
  const tile1 = value?.tiles[0]?.name;
  const tile2 = value?.tiles[1]?.name;
  const lockupText = value?.name;
  if (tile1) {
    const a = document.createElement('a');
    a.href = LOGOS[tile1] || LOGOS.placeholder;
    a.innerText = a.href;
    areaEl.append(a);
  }
  if (tile2) {
    const a = document.createElement('a');
    a.href = LOGOS[tile2] || LOGOS.placeholder;
    a.innerText = a.href;
    areaEl.append(a);
  }
  if (lockupText) {
    areaEl.innerHTML += lockupText;
  }
}

function handlePhoto(value, brickProperties, blockTemplate, selectors) {
  const selector = selectors.split(',').map((s) => s.trim());
  let keepImg = null;
  let removeImg = null;
  if (brickProperties.brickType.toLowerCase().includes('horizontal')) {
    [removeImg, keepImg] = selector;
  } else if (brickProperties.brickType.toLowerCase().includes('vertical')) {
    [keepImg, removeImg] = selector;
  }

  if (keepImg) {
    const keepImgEl = blockTemplate.querySelector(`${keepImg} picture`);
    if (keepImgEl) replaceImage(keepImgEl, value);
    if (removeImg) {
      const removeImgEl = blockTemplate.querySelector(removeImg);
      if (removeImgEl) removeImgEl?.classList.add('to-remove');
    }
  } else {
    blockTemplate.querySelector(selector[0])?.classList.add('to-remove');
    blockTemplate.querySelector(selector[1])?.classList.add('to-remove');
  }
}

function handleAppList(appList, appListEl) {
  appList.forEach((app) => {
    if (!app.isEnabled) return;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = LOGOS[app.icon.name] || LOGOS.placeholder;
    a.innerText = a.href;
    li.append(a);
    const appText = app.name;
    if (appText) li.innerHTML += appText;
    appListEl.append(li);
  });
}

function isLoadableItemIconUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:')) return true;
  if (!/^https?:\/\//.test(url)) return false;
  if (url.includes('...') || /figma-\d+:/.test(url)) return false;
  return true;
}

function resolveItemIconUrl(icon) {
  let candidate = '';
  if (!icon) {
    candidate = '';
  } else if (typeof icon === 'string') {
    if (/^(https?:)?\/\//.test(icon) || icon.startsWith('data:')) candidate = icon;
    else candidate = LOGOS[icon] || SVG_ICONS[icon] || '';
  } else if (typeof icon === 'object') {
    const ref = icon.imageRef || icon.url;
    if (ref && (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:'))) candidate = ref;
    else if (icon.name) candidate = LOGOS[icon.name] || SVG_ICONS[icon.name] || '';
  }
  return isLoadableItemIconUrl(candidate) ? candidate : SVG_ICONS.placeholder;
}

function createIconPicture(src, alt = '') {
  const picture = document.createElement('picture');
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = alt;
  img.src = src;
  picture.appendChild(img);
  return picture;
}

function handleItemList(itemList, itemListEl, blockTemplate) {
  itemListEl.classList.add('icon-stack-area', 'body-s');
  blockTemplate?.classList.add('icon-stack');
  itemList.forEach((item) => {
    const li = document.createElement('li');
    li.appendChild(createIconPicture(resolveItemIconUrl(item?.icon)));
    if (item.text) {
      const textEl = document.createElement('span');
      textEl.className = 'list-text';
      textEl.textContent = item.text;
      li.appendChild(textEl);
    }
    itemListEl.appendChild(li);
  });
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('brick.json');
    properties.masonryArrangement = [];
    properties.bricks.forEach((brick) => {
      if (!brick.brickType || !brick.spanLayout) return;
      if (!brick.productLockup) brick.productLockup = {};
      if (!Array.isArray(brick.appList)) brick.appList = [];
      if (!Array.isArray(brick.itemList)) brick.itemList = [];
      const blockTemplate = blockContent.cloneNode(true);
      if (brick.colorTheme) blockTemplate.classList.add(brick.colorTheme);
      properties.masonryArrangement.push(brick.spanLayout.toLowerCase());
      sectionWrapper.appendChild(blockTemplate);
      mappingData.data.forEach((mappingConfig) => {
        const value = brick[mappingConfig.key];
        const areaEl = handleComponents(blockTemplate, value, mappingConfig);
        switch (mappingConfig.key) {
          case 'hasProductLockup':
            handleBrickProductLockups(brick, areaEl);
            break;
          case 'backgroundColor':
            handleBackground(value, blockTemplate.querySelector(mappingConfig.selector));
            break;
          case 'backgroundImage':
            if (!value) blockTemplate.querySelector(`${mappingConfig.selector} picture`).classList.add('to-remove');
            else replaceImage(blockTemplate.querySelector(`${mappingConfig.selector} picture`), value);
            break;
          case 'photo':
            handlePhoto(value, brick, blockTemplate, mappingConfig.selector);
            break;
          case 'actions':
            handleActionButtons(blockTemplate, brick, true, areaEl);
            break;
          case 'layout':
            if (brick.layout === 'center') blockTemplate.classList.add('center');
            break;
          case 'appList': {
            const appListEl = blockTemplate.querySelector(mappingConfig.selector);
            if (brick.appList.length) {
              appListEl.innerHTML = '';
              handleAppList(brick.appList, appListEl);
            } else appListEl.classList.add('to-remove');
          }
            break;
          case 'itemList': {
            const itemListEl = blockTemplate.querySelector(mappingConfig.selector);
            if (brick.itemList.length) {
              itemListEl.innerHTML = '';
              handleItemList(brick.itemList, itemListEl, blockTemplate);
            } else itemListEl.classList.add('to-remove');
          }
            break;
          default:
            break;
        }
      });
    });
    blockContent.classList.add('to-remove');
    sectionWrapper.querySelectorAll('.to-remove').forEach((el) => el.remove());
    const allBricks = sectionWrapper.querySelectorAll('.brick');
    if (allBricks.length) handleMasonrysWithSectionMetadata(sectionWrapper, allBricks[allBricks.length - 1], properties.masonryArrangement);
    if (properties.background) handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, properties.background);
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
