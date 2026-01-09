/* eslint-disable max-len */
import {
  handleComponents,
  handleSpacer,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties.tabs[0]?.colorTheme) blockContent.classList.add(properties.tabs[0].colorTheme);
  if (properties?.topSpacer) handleSpacer(blockContent, properties.topSpacer.name, 'top');
  if (properties?.bottomSpacer) handleSpacer(blockContent, properties.bottomSpacer.name, 'bottom');
  if (properties?.layout === 'center') blockContent.classList.add('center');
  if (properties?.name.toLowerCase().includes('radio')) blockContent.classList.add('radio');
  if (properties?.name.toLowerCase().includes('quiet')) blockContent.classList.add('quiet');
}

function handleTabList(tabList, tabListEl) {
  tabList.forEach((tab) => {
    const li = document.createElement('li');
    li.innerHTML = tab.label;
    tabListEl.append(li);
  });
}

function handleActiveTab(tabList, activeTabEl) {
  tabList.forEach((tab, idx) => {
    if (tab.state === 'selected') activeTabEl.innerHTML = `${idx + 1}`;
  });
}

function handleTabId(tabId, tabIdEl) {
  tabIdEl.innerHTML = tabId;
}

function handleRadioPretext(tabType, radioPretext, radioPretextEl) {
  if (tabType.includes('radio')) radioPretextEl.querySelector(':scope div:last-child').innerHTML += radioPretext;
  else radioPretextEl.classList.add('to-remove');
}

function createTabsSections(tabId, tabs, sectionWrapper) {
  const tabsSections = [sectionWrapper];
  tabs.forEach((tab, idx) => {
    const div = document.createElement('div');
    div.innerHTML = `
                <p>
                  <a href='https://main--stream-mapper--adobecom.aem.live/fragments/stream-block-placeholder'>${tab.label}</a>
                </p>
                <div class="section-metadata">
                  <div>
                    <div>tab</div>
                    <div>${tabId}, ${idx + 1}</div>
                  </div>
                </div>`;
    tabsSections.push(div);
  });
  return tabsSections;
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('tabs.json');
    const tabId = `tab-${(Math.floor(Math.random() * 10) + 1).toString()}`;
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      const areaEl = handleComponents(blockContent, value, mappingConfig);
      switch (mappingConfig.key) {
        case 'tabs':
          handleTabList(properties.tabs, areaEl);
          break;
        case 'promptText':
          handleRadioPretext(properties.name.toLowerCase(), value, blockContent.querySelector(mappingConfig.selector));
          break;
        case 'tabId':
          handleTabId(tabId, blockContent.querySelector(mappingConfig.selector));
          break;
        case 'activeTab':
          handleActiveTab(properties.tabs, blockContent.querySelector(mappingConfig.selector));
          break;
        default:
          break;
      }
    });
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(sectionWrapper, blockContent, properties);
    // eslint-disable-next-line consistent-return
    return createTabsSections(tabId, properties.tabs, sectionWrapper);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
