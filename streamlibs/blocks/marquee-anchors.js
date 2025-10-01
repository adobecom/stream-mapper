import { handleComponents, handleButtonComponent } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleBackground(value, areaEl) {
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
function handleForegroundPhoto(value, areaEl) {
  if (!areaEl) return;
  const pic = areaEl.querySelector('picture');
  pic.querySelectorAll('source').forEach((source) => { source.srcset = value; });
  pic.querySelector('img').src = value;
}

function handleAnchorTitle(blockContent, value) {
  const div = document.createElement('div');
  div.innerHTML = `<div><h3>${value}</h3></div>`;
  blockContent.append(div);
}

function handleAnchorFooter(blockContent, value) {
  const div = document.createElement('div');
  div.innerHTML = `<div>${value}</div>`;
  blockContent.append(div);
}

function handleAnchorFooterLink(blockContent, value) {
  const lastDiv = blockContent.querySelector(':scope > div:last-child > div');
  lastDiv.innerHTML += ` <a href='https://www.adobe.com'>${value}</a>`;
}

function handleAnchorField(blockContent, value) {
  const div = document.createElement('div');
  if(value.heading) div.innerHTML += `<h4>${value.heading}</h4>`;
  if(value.text) div.innerHTML += `<p>${value.text}</p>`;
  div.innerHTML += `<p><a href='#'>#Bookmark to section</a></p>`;
  const divOuter = document.createElement('div');
  divOuter .append(div);
  blockContent.append(divOuter);
}

function handleVariants(blockContent, properties) {
  if (properties['anchor-background']) blockContent.classList.add('transparent');
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
}

function handleActionButtons(el, configData, value, areaEl) {
  if (!value) return;
  if (configData.action1) {
    handleButtonComponent({
      el,
      actionArea: areaEl,
      buttonType: configData.action1.btnType,
      buttonText: configData.action1.btnText,
    });
  }
  if (configData.action2) {
    handleButtonComponent({
      el,
      actionArea: areaEl,
      buttonType: configData.action2.btnType,
      buttonText: configData.action2.btnText,
    });
  }
}

export default async function mapBlockContent(blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('marquee-anchors.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'background':
          handleBackground(value, areaEl);
          break;
        case 'photo':
          handleForegroundPhoto(value, areaEl);
          break;
        case 'actions':
          handleActionButtons(blockContent, properties, value, areaEl);
          break;
        case 'anchor-info':
          const anchorFields = mappingConfig['selector'].split(',').map(field => field.trim());
          for (const anchorField of anchorFields) {
            switch (anchorField) {
              case 'anchor-title':
                handleAnchorTitle(blockContent, properties[anchorField]);
                break;
              case 'anchor-footer':
                handleAnchorFooter(blockContent, properties[anchorField]);
                break;
              case 'anchor-footer-link':
                handleAnchorFooterLink(blockContent, properties[anchorField]);
                break;
              default:
                if (properties[anchorField]) handleAnchorField(blockContent, properties[anchorField]);
                break;
            }
          }
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(blockContent, properties);
    console.log(blockContent);
  } catch (error) {
    console.log(error);
    // Could not load anchor marquee mapping
  }
}
