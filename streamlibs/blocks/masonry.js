/* eslint-disable max-len */
import {
  handleBackground,
  handleComponents,
  handleColorThemeWithSectionMetadata,
  handleSpacerWithSectionMetadata,
  handleMasonrysWithSectionMetadata,
  handleBackgroundWithSectionMetadata,
  handleActionButtons,
  handleGridLayoutWithSectionMetadata,
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
    a.href = LOGOS[tileName] || LOGOS.placeholder;
    a.innerText = a.href;
    areaEl.append(a);
  }
  if (tile2) {
    const a = document.createElement('a');
    a.href = LOGOS[tileName] || LOGOS.placeholder;
    a.innerText = a.href;
    areaEl.append(a);
  }
  if (lockupText) {
    areaEl.innerHTML += lockupText;
  }
}

function handlePhoto(value, brickProperties, blockTemplate, selectors) {
  const selector = selectors.split(',').map((selector) => selector.trim());
  let keepImg = null;
  let removeImg = null;
  if (brickProperties.brickType.toLowerCase().includes('horizontal')) {
    removeImg = selector[0];
    keepImg = selector[1];
  } else if (brickProperties.brickType.toLowerCase().includes('vertical')) {
    removeImg = selector[1];
    keepImg = selector[0];
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

function handleItemList(itemList, itemListEl) {
  itemList.forEach((item) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = SVG_ICONS.placeholder;
    a.innerText = a.href;
    li.append(a);
    if (item.text) li.innerHTML += item.text;
    itemListEl.append(li);
  });
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('brick.json');
    properties.masonryArrangement = [];
    properties.bricks.forEach((brick) => {
      if (!brick.brickType) return;
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
              }
              else appListEl.classList.add('to-remove');
            }
            break;
          case 'itemList': {
              const itemListEl = blockTemplate.querySelector(mappingConfig.selector);
              if (brick.itemList.length) {
                itemListEl.innerHTML = '';
                handleItemList(brick.itemList, itemListEl);
              }
              else itemListEl.classList.add('to-remove');
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
    handleMasonrysWithSectionMetadata(sectionWrapper, allBricks[allBricks.length - 1], properties.masonryArrangement);
    if (properties.background) handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, properties.background);
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
