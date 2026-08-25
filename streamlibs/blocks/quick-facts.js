import {
  addOrUpdateSectionMetadata,
  handleComponents,
  handleSpacerWithSectionMetadata,
  handleBackgroundWithSectionMetadata,
  handleActionButtons,
  resolveImageValue,
} from '../components/components.js';
import { LOGOS } from '../utils/constants.js';
import { safeJsonFetch } from '../utils/error-handler.js';

function asNodeArray(blockContent) {
  if (blockContent instanceof NodeList || Array.isArray(blockContent)) {
    return Array.from(blockContent).filter(Boolean);
  }
  return blockContent ? [blockContent] : [];
}

function hasQuoteContent(properties) {
  if (properties.quoteBlock === false || properties.hasQuote === false) return false;
  return Boolean(properties.quote || properties.author || properties.caption || properties.avatar);
}

function hasCopyContent(properties) {
  if (properties.action1 || properties.actions === true) return true;
  if (properties.copyBlock === false || properties.hasCopy === false) return false;
  return Boolean(properties.heading || properties.body || properties.detail);
}

function scrubStatsBleedFromCopy(properties) {
  if (!properties) return;
  const stats = [properties.stat1, properties.stat2, properties.stat3]
    .map((v) => `${v || ''}`.trim()).filter(Boolean);
  const bodies = [properties.body1, properties.body2, properties.body3]
    .map((v) => `${v || ''}`.trim()).filter(Boolean);
  const heading = `${properties.heading || ''}`.trim();
  const body = `${properties.body || ''}`.trim();
  if (heading && (stats.includes(heading) || /^key stat\b/i.test(heading))) {
    delete properties.heading;
  }
  if (body && (bodies.includes(body) || /^body copy for key stat/i.test(body))) {
    delete properties.body;
  }
  const ctaText = `${properties.action1?.text || properties.action1?.value || ''}`.trim();
  if (ctaText && heading && heading.toLowerCase() === ctaText.toLowerCase()) {
    delete properties.heading;
  }
  if (ctaText && body && body.toLowerCase() === ctaText.toLowerCase()) {
    delete properties.body;
  }
}

function handleAvatar(value, areaEl) {
  if (!value || !areaEl) return;
  const { url, altText } = resolveImageValue(value);
  areaEl.querySelectorAll('source').forEach((source) => { source.srcset = url; });
  const imgEl = areaEl.querySelector('img');
  if (imgEl) {
    imgEl.src = url;
    if (altText) imgEl.alt = altText;
  }
}

function createPicture(src, alt = '') {
  const picture = document.createElement('picture');
  const img = Object.assign(document.createElement('img'), {
    loading: 'lazy',
    alt,
    src,
  });
  picture.appendChild(img);
  return picture;
}

function resolveProductIconUrl(rawIcon) {
  if (rawIcon == null || rawIcon === false) return '';
  if (rawIcon === true) return LOGOS.placeholder;
  if (typeof rawIcon === 'string' && LOGOS[rawIcon]) return LOGOS[rawIcon];
  const { url } = resolveImageValue(rawIcon);
  if (!url) return LOGOS.placeholder;
  if (LOGOS[url]) return LOGOS[url];
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return url;
  return LOGOS.placeholder;
}

function handleProductLinks(links, areaEl) {
  if (!areaEl) return;
  const items = Array.isArray(links) ? links : [];
  const usable = items
    .map((link) => {
      if (typeof link === 'string') return { text: link, url: '#', iconUrl: '' };
      const rawIcon = link?.icon ?? link?.image ?? link?.linkType;
      const hasIcon = rawIcon != null && rawIcon !== false;
      return {
        text: link?.text || link?.name || '',
        url: link?.url || link?.href || '#',
        iconUrl: hasIcon || link?.hasIcon ? resolveProductIconUrl(rawIcon ?? true) : '',
      };
    })
    .filter((link) => link.text);
  if (!usable.length) {
    areaEl.classList.add('to-remove');
    return;
  }
  areaEl.innerHTML = '';
  usable.forEach((link) => {
    const li = document.createElement('li');
    if (link.iconUrl) {
      li.appendChild(createPicture(link.iconUrl, link.text));
    }
    const a = document.createElement('a');
    a.href = link.url;
    a.textContent = link.text;
    li.appendChild(a);
    areaEl.appendChild(li);
  });
}

const KEY_GROUPS = {
  logo: 'stats',
  stat1: 'stats',
  body1: 'stats',
  stat2: 'stats',
  body2: 'stats',
  stat3: 'stats',
  body3: 'stats',
  productsHeading: 'stats',
  productsLayout: 'stats',
  productLinks: 'stats',
  avatar: 'quote',
  quote: 'quote',
  author: 'quote',
  caption: 'quote',
  heading: 'copy',
  body: 'copy',
  detail: 'copy',
  actions: 'copy',
  action1: 'copy',
};

function mappingGroup(mappingConfig) {
  return mappingConfig.group || KEY_GROUPS[mappingConfig.key];
}

function applyMappings(el, mappingData, properties, group) {
  if (!el) return;
  mappingData.data.forEach((mappingConfig) => {
    if (mappingGroup(mappingConfig) !== group) return;
    const value = properties[mappingConfig.key];
    const config = mappingConfig.key === 'productsHeading'
      ? { ...mappingConfig, selector: ':scope > div:nth-child(5) :is(h2, h3)' }
      : mappingConfig;
    if (mappingConfig.key === 'productLinks') {
      handleProductLinks(value, el.querySelector(mappingConfig.selector));
      return;
    }
    const areaEl = handleComponents(el, value, config);
    if (mappingConfig.key === 'avatar') handleAvatar(value, areaEl);
  });
}

function applyCopyFields(textEl, mappingData, properties) {
  if (!textEl) return;

  applyMappings(textEl, mappingData, properties, 'copy');

  const headingStillPlaceholder = /text block with icon|heading ipsum/i
    .test(textEl.querySelector('h1, h2, h3, h4, h5, h6')?.textContent || '');
  const bodyStillPlaceholder = /lorem ipsum|body ipsum/i
    .test(textEl.querySelector('p')?.textContent || '');

  if (properties.heading && headingStillPlaceholder) {
    handleComponents(textEl, properties.heading, {
      type: 'text',
      selector: ':scope :is(h1, h2, h3, h4, h5, h6)',
    });
  }
  if (properties.body && bodyStillPlaceholder) {
    const headingEl = textEl.querySelector(':scope :is(h1, h2, h3, h4, h5, h6)');
    const bodyEl = headingEl?.nextElementSibling?.tagName === 'P'
      ? headingEl.nextElementSibling
      : textEl.querySelector(':scope p');
    if (bodyEl) {
      handleComponents(textEl, properties.body, {
        type: 'text',
        selector: headingEl
          ? ':scope :is(h1, h2, h3, h4, h5, h6) + p'
          : ':scope p',
      });
    }
  }
  if (properties.detail) {
    handleComponents(textEl, properties.detail, {
      type: 'text',
      selector: ':scope :is(h1, h2, h3, h4, h5, h6) + p + p',
    });
  }

  applyCopyActions(textEl, properties);
}

function applyQuoteBackground(quoteEl, quoteBackground) {
  if (!quoteEl || !quoteBackground) return;
  const color = typeof quoteBackground === 'string' ? quoteBackground.trim() : '';
  if (!color || color === 'false') return;
  quoteEl.style.background = color;
  quoteEl.style.width = '100%';
  quoteEl.style.boxSizing = 'border-box';
  quoteEl.style.padding = quoteEl.style.padding || '2rem';
  quoteEl.classList.add('rounded-corners');
}

function applyQuoteAlign(quoteEl, quoteAlign) {
  if (!quoteEl) return;
  const align = `${quoteAlign || 'center'}`.toLowerCase();
  quoteEl.classList.remove('align-left', 'align-right');
  if (align.includes('left')) quoteEl.classList.add('align-left');
  else if (align.includes('right')) quoteEl.classList.add('align-right');
}

function applyCopyActions(textEl, properties) {
  if (!textEl || !properties?.action1) return;
  const contentDiv = textEl.querySelector(':scope > div > div') || textEl;
  const ctaOnly = !properties.heading && !properties.body && !properties.detail;
  if (ctaOnly) {
    contentDiv.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > p')
      .forEach((el) => el.remove());
    textEl.classList.add('center');
  }
  const actionArea = document.createElement('p');
  contentDiv.appendChild(actionArea);
  handleActionButtons(textEl, properties, true, actionArea);
}

function gridWidthStyle(desktopLayout) {
  const match = `${desktopLayout || '12 col'}`.match(/(\d+)\s*col/);
  return `grid width ${match?.[1] || '12'}`;
}

function isStatsRight(properties) {
  const colLayout = `${properties.colLayout || properties.layout || ''}`.toLowerCase();
  if (colLayout.includes('right') || colLayout.includes('2 | 1') || colLayout.includes('2|1')) {
    return true;
  }
  const colMatch = colLayout.match(/(\d+)\s*col\s*\/\s*(\d+)\s*col/);
  if (colMatch) return Number(colMatch[1]) > Number(colMatch[2]);
  return false;
}

function handleSectionMetadata(sectionWrapper, statsEl, properties) {
  if (!statsEl) return;
  if (properties?.topSpacer) {
    handleSpacerWithSectionMetadata(sectionWrapper, statsEl, properties.topSpacer.name, 'top');
  }
  if (properties?.bottomSpacer) {
    handleSpacerWithSectionMetadata(sectionWrapper, statsEl, properties.bottomSpacer.name, 'bottom');
  }
  if (properties?.background) {
    handleBackgroundWithSectionMetadata(sectionWrapper, statsEl, properties.background);
  }

  const styleLoc = addOrUpdateSectionMetadata(sectionWrapper, statsEl, 'style');
  const styles = [gridWidthStyle(properties?.desktopLayout), 'two up', 'one up tablet', 'm-gap'];
  if (properties?.colorTheme) styles.push(properties.colorTheme);
  styleLoc.textContent = styles.join(', ');

  const layoutLoc = addOrUpdateSectionMetadata(sectionWrapper, statsEl, 'layout');
  layoutLoc.textContent = isStatsRight(properties) ? '2 | 1' : '1 | 2';
}

function applyStatsCardLayout(statsEl, productsLayout) {
  if (!statsEl || productsLayout !== 'beside') return;
  const rows = [...statsEl.querySelectorAll(':scope > div')];
  if (rows.length < 2) return;

  const logoRow = rows[0]?.querySelector('picture') ? rows[0] : null;
  const productsRow = rows.find((row) => row.querySelector('ul'));
  const metricRows = rows.filter((row) => row !== logoRow && row !== productsRow);

  if (!productsRow || !metricRows.length) return;

  const grid = document.createElement('div');
  grid.className = 'quick-facts-stats-grid';
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;align-items:start;';

  const metricsCol = document.createElement('div');
  metricRows.forEach((row) => metricsCol.appendChild(row));

  const productsCol = document.createElement('div');
  productsCol.appendChild(productsRow);

  grid.append(metricsCol, productsCol);

  if (logoRow) {
    statsEl.append(logoRow, grid);
  } else {
    statsEl.append(grid);
  }
}

function stackContentColumn(sectionWrapper, statsEl, quoteEl, textEl, statsRight) {
  if (!statsEl || !quoteEl || !textEl) return;

  statsEl.style.gridRow = 'span 2';

  if (statsRight) {
    sectionWrapper.insertBefore(quoteEl, statsEl);
    statsEl.after(textEl);
  } else {
    statsEl.after(quoteEl);
    quoteEl.after(textEl);
  }
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;

  try {
    asNodeArray(blockContent).forEach((node) => {
      if (!sectionWrapper.contains(node)) sectionWrapper.append(node);
    });

    const statsEl = sectionWrapper.querySelector('.quick-facts');
    const quoteEl = sectionWrapper.querySelector('.quote');
    const textEl = sectionWrapper.querySelector('.text');
    const mappingData = await safeJsonFetch('quick-facts.json');

    applyMappings(statsEl, mappingData, properties, 'stats');
    applyStatsCardLayout(statsEl, properties?.productsLayout);

    scrubStatsBleedFromCopy(properties);

    const showQuote = hasQuoteContent(properties);
    const showCopy = hasCopyContent(properties);

    if (!showQuote) quoteEl?.remove();
    else {
      applyMappings(quoteEl, mappingData, properties, 'quote');
      applyQuoteBackground(quoteEl, properties.quoteBackground);
      applyQuoteAlign(quoteEl, properties.quoteAlign);
    }

    if (!showCopy) textEl?.remove();
    else applyCopyFields(textEl, mappingData, properties);

    const quoteCentered = !`${properties.quoteAlign || 'center'}`.toLowerCase().includes('left')
      && !`${properties.quoteAlign || ''}`.toLowerCase().includes('right');
    if (showCopy && properties?.action1 && quoteCentered) {
      sectionWrapper.querySelector('.text')?.classList.add('center');
    }

    if (properties?.colorTheme) {
      statsEl?.classList.add(properties.colorTheme);
      sectionWrapper.querySelector('.quote')?.classList.add(properties.colorTheme);
      sectionWrapper.querySelector('.text')?.classList.add(properties.colorTheme);
    }

    stackContentColumn(
      sectionWrapper,
      statsEl,
      sectionWrapper.querySelector('.quote'),
      sectionWrapper.querySelector('.text'),
      isStatsRight(properties),
    );

    handleSectionMetadata(sectionWrapper, statsEl, properties);
    sectionWrapper.querySelectorAll('.to-remove').forEach((el) => el.remove());
  } catch (error) {
    console.log(error);
  }
}
