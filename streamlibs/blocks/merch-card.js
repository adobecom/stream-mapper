import {
  handleComponents,
  handleActionButtons,
  handleProductLockup,
  handleColorThemeWithSectionMetadata,
  handleSpacerWithSectionMetadata,
  handleBackgroundWithSectionMetadata,
  addOrUpdateSectionMetadata,
} from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';
import { DEFAULT_TMP_URL } from '../utils/constants.js';

// Fallback only. Where the template authors its own info icon (plans, special-offers)
// that node is cloned instead, which preserves its #tooltip-text fragment. This
// covers the variants whose template has no callout slot at all.
const INFO_ICON = '/assets/info-icon.svg';

function rowCells(row) {
  return row ? Array.from(row.querySelectorAll(':scope > div')) : [];
}

function anchor(text, href = DEFAULT_TMP_URL) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  return a;
}

const ANCHORED_KEYS = ['callout'];

function captureTemplateAnchor(blockTemplate, mappingConfig) {
  const { key, selector } = mappingConfig;
  if (!ANCHORED_KEYS.includes(key)) return null;
  const el = blockTemplate.querySelector(selector);
  return el?.querySelector('a[href]') ?? null;
}

function isEmptyList(value) {
  return !Array.isArray(value) || value.length === 0;
}

function handleBadge(value, rowEl) {
  if (!value?.text) {
    rowEl.classList.add('to-remove');
    return;
  }
  const [colorCell, textCell] = rowCells(rowEl);
  if (colorCell) {
    colorCell.textContent = [value.backgroundColor, value.textColor, value.borderColor]
      .filter(Boolean)
      .join(', ');
  }
  if (textCell) textCell.textContent = value.text;
}

// handleProductLockup keys LOGOS off value.productTile.name;
// the guideline emits { componentId, name }.
function handleIcon(icon, areaEl) {
  if (!icon?.name) return;
  handleProductLockup({ productTile: { name: icon.name } }, areaEl);
}

function handleLinks(value, areaEl) {
  const links = Array.isArray(value) ? value : [value];
  links.forEach((text, index) => {
    if (index) areaEl.append(' | ');
    areaEl.append(anchor(text));
  });
}

function handleCallout(card, areaEl, iconAnchor) {
  const em = document.createElement('em');
  em.textContent = card.callout;
  // The template authors the info icon inline, and its #fragment is the tooltip
  // copy Milo renders — reuse that node rather than rebuilding the href here.
  if (card.hasCalloutIcon) {
    em.append(' ', iconAnchor ? iconAnchor.cloneNode(true) : anchor('#ICON', INFO_ICON));
  }
  areaEl.append(em);
}

function handlePriorPrice(card, areaEl) {
  if (!card.priorPrice) {
    areaEl.classList.add('to-remove');
    return;
  }
  const em = document.createElement('em');
  const del = document.createElement('del');
  del.append(anchor(card.priorPrice));
  em.append('Price : ', del, ' ');
  if (card.price) em.append(anchor(card.price));
  areaEl.append(em);
}

function handleSpecialOffersHeading(card, areaEl) {
  if (card.heading) areaEl.append(card.heading);
  if (!card.price) return;
  if (card.heading) areaEl.append(document.createElement('br'));
  areaEl.append(card.price);
}

function handleChecklistHeader(value, rowEl) {
  if (!value) {
    rowEl.classList.add('to-remove');
    return;
  }
  const textCell = rowCells(rowEl)[1];
  if (textCell) textCell.textContent = value;
}

function handleChecklist(items, rowEl, bulletCta) {
  if (isEmptyList(items)) {
    rowEl.classList.add('to-remove');
    return;
  }
  const parent = rowEl.parentElement;
  items.forEach((item, index) => {
    const row = rowEl.cloneNode(true);
    // The mini-compare shape gives every row its own product tile; the full-compare
    // shape sets icon:false and keeps whatever checkmark the template authored.
    const [iconCell, textCell] = rowCells(row);
    if (iconCell && item?.icon?.name) {
      iconCell.replaceChildren();
      handleIcon(item.icon, iconCell);
    }
    if (textCell) {
      textCell.replaceChildren(typeof item === 'string' ? item : (item?.text || ''));
      if (bulletCta && index === items.length - 1) {
        textCell.append(' ', anchor(bulletCta));
      }
    }
    parent.insertBefore(row, rowEl);
  });
  rowEl.classList.add('to-remove');
}

// Milo stacks the optional one-line slots under the price in a fixed order:
// promo (h5) then callout (h6). Only the plans template ships both, so on the
// other variants we create whichever the sheet has no row for and place it after
// the nearest preceding slot the sheet does resolve. Listed in render order —
// each entry may anchor off the one before it.
const SYNTH_SLOTS = [
  { key: 'promo', tag: 'h5', anchors: ['priceAddendum', 'subheading', 'price', 'heading'] },
  { key: 'links', tag: 'p', anchors: ['body', 'promo', 'priceAddendum', 'price'] },
  { key: 'callout', tag: 'h6', anchors: ['links', 'body', 'promo', 'price', 'heading'] },
];

function resolveAnchor(keys, blockTemplate, configData, synthesised) {
  let found = null;
  keys.some((key) => {
    const row = configData.data.find((item) => item.key === key);
    found = synthesised[key] ?? (row ? blockTemplate.querySelector(row.selector) : null);
    return !!found;
  });
  return found;
}

// Returns the elements it created so the caller can keep them out of the sweep.
function handleSynthSlots(card, blockTemplate, configData, templateAnchors) {
  const synthesised = {};
  SYNTH_SLOTS.forEach(({ key, tag, anchors }) => {
    if (!card[key] || (Array.isArray(card[key]) && !card[key].length)) return;
    if (configData.data.some((row) => row.key === key)) return;
    const anchorEl = resolveAnchor(anchors, blockTemplate, configData, synthesised);
    if (!anchorEl) return;
    const el = document.createElement(tag);
    if (key === 'callout') handleCallout(card, el, templateAnchors[key]);
    else if (key === 'links') handleLinks(card.links, el);
    else el.textContent = card[key];
    anchorEl.after(el);
    synthesised[key] = el;
  });
  return Object.values(synthesised);
}

function sweepUnmapped(mappedEls) {
  const slots = [...mappedEls];
  const cells = new Set();
  slots.forEach((el) => {
    const cell = el.closest('div[data-valign]');
    if (cell) cells.add(cell);
  });
  cells.forEach((cell) => {
    Array.from(cell.children).forEach((child) => {
      const claimed = slots.some((el) => child === el || child.contains(el));
      if (!claimed) child.classList.add('to-remove');
    });
  });
}

function handleVariants(sectionWrapper, blockContent, properties) {
  if (properties?.sectionStyle) {
    const styleLoc = addOrUpdateSectionMetadata(sectionWrapper, blockContent, 'style');
    if (styleLoc.innerHTML) styleLoc.innerHTML += ', ';
    styleLoc.innerHTML += properties.sectionStyle;
  }
  if (properties?.colorTheme) {
    handleColorThemeWithSectionMetadata(sectionWrapper, blockContent, properties.colorTheme);
  }
  if (properties?.topSpacer) {
    handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.topSpacer.name, 'top');
  }
  if (properties?.bottomSpacer) {
    handleSpacerWithSectionMetadata(sectionWrapper, blockContent, properties.bottomSpacer.name, 'bottom');
  }
  if (properties?.background) {
    handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, properties.background);
  }
}

// The guideline emits compare-card `checklist`/`checklistHeader` and TWP `bullets`/`bulletTitle`
// separately, but Milo authors both with the identical two-cell row shape — only the
// `bullet-list` modifier class differs, and that arrives via properties.styles.
function resolveValue(key, card, variant) {
  switch (key) {
    case 'image': return { url: card.image, altText: card.imageAlt };
    // special-offers writes title AND price into one h3, so the slot must survive
    // when only the price is present.
    case 'heading':
      return variant === 'special-offers' ? card.heading || card.price : card.heading;
    case 'actions': return card.action1 || card.action2;
    case 'checklist': return card.checklist || card.bullets;
    case 'checklistHeader': return card.checklistHeader || card.bulletTitle;
    default: return card[key];
  }
}

function mapCard(blockTemplate, card, configData, variant) {
  const mappedEls = new Set();
  // Anchors lifted out of the template before handleComponents overwrites them,
  // keyed by sheet row so the synthesised slots can reuse them.
  const templateAnchors = {};

  // Rows 5+ of the compare template are extra copies of the feature row; the mapped items
  // are cloned from row 4 and inserted ahead of it, so the originals always go.
  if (variant === 'mini-compare-chart') {
    blockTemplate.querySelectorAll(':scope > div:nth-child(n+5)')
      .forEach((row) => row.classList.add('to-remove'));
  }

  configData.data.forEach((mappingConfig) => {
    const { key } = mappingConfig;
    const value = resolveValue(key, card, variant);
    const templateAnchor = captureTemplateAnchor(blockTemplate, mappingConfig);
    if (templateAnchor) templateAnchors[key] = templateAnchor;
    const areaEl = handleComponents(blockTemplate, value, mappingConfig);
    if (!areaEl) return;
    mappedEls.add(areaEl);

    switch (key) {
      case 'icon':
        areaEl.replaceChildren();
        handleIcon(card.icon, areaEl);
        // Only the plans template holds a second mnemonic in the same paragraph.
        if (card.icon2) {
          areaEl.append(' ');
          handleIcon(card.icon2, areaEl);
        }
        break;
      case 'badge':
        handleBadge(card.badge, areaEl);
        break;
      case 'divider':
        areaEl.textContent = '--- #DDD';
        break;
      case 'links':
        handleLinks(value, areaEl);
        break;
      case 'callout':
        handleCallout(card, areaEl, templateAnchor);
        break;
      case 'priorPrice':
        handlePriorPrice(card, areaEl);
        break;
      case 'price':
        // Plain text, no OST anchor. The template's link carries a placeholder osi, and
        // Milo resolves every link it finds — so keeping it would overwrite the Figma
        // price with that offer's amount on every card. An author adds the real link.
        areaEl.replaceChildren(card.price);
        if (card.priorPrice && card.priorPrice !== card.price
          && !configData.data.some((row) => row.key === 'priorPrice')) {
          const del = document.createElement('del');
          del.append(card.priorPrice);
          areaEl.prepend(del, ' ');
        }
        break;
      case 'heading':
        if (variant === 'special-offers') handleSpecialOffersHeading(card, areaEl);
        break;
      case 'priceAddendum':
        areaEl.replaceChildren(...String(value).split('\n').flatMap((line, i) => (
          i ? [document.createElement('br'), line] : [line]
        )));
        break;
      case 'checklistHeader':
        handleChecklistHeader(value, areaEl);
        break;
      case 'checklist':
        handleChecklist(value, areaEl, card.bulletCta);
        break;
      case 'actions':
        handleActionButtons(blockTemplate, card, true, areaEl);
        break;
      default:
        break;
    }
  });

  blockTemplate.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

  if (variant === 'catalog') {
    const deviceTypes = blockTemplate.querySelector(':scope > div:nth-child(2)');
    if (deviceTypes) deviceTypes.classList.add('to-remove');
  }

  handleSynthSlots(card, blockTemplate, configData, templateAnchors)
    .forEach((el) => mappedEls.add(el));

  sweepUnmapped(mappedEls);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const mappingData = await safeJsonFetch('merch-card.json');
    const { variant } = properties;
    const configData = mappingData[variant] || mappingData.segment;

    if (!configData?.data?.length) {
      // eslint-disable-next-line no-console
      console.error(
        `Error mapping merch-card block: mapping config for variant "${variant}" is missing/malformed`,
        mappingData,
      );
      return;
    }

    (properties.cards || []).forEach((card) => {
      const blockTemplate = blockContent.cloneNode(true);
      const styles = new Set(properties.styles || []);
      if (variant === 'mini-compare-chart' && properties.compareShape === 'compare') {
        styles.add('bullet-list');
      }
      blockTemplate.className = ['merch-card', variant, ...styles].filter(Boolean).join(' ');
      sectionWrapper.appendChild(blockTemplate);
      mapCard(blockTemplate, card, configData, variant);
    });

    blockContent.classList.add('to-remove');
    sectionWrapper.querySelectorAll('.to-remove').forEach((el) => el.remove());
    handleVariants(sectionWrapper, blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
