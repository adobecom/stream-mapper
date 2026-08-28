import {
  handleSpacer,
  handleBackgroundWithSectionMetadata,
  handleColorThemeWithSectionMetadata,
  addOrUpdateSectionMetadata,
} from '../components/components.js';
import { LOGOS } from '../utils/constants.js';

const DEFAULT_URL = 'https://www.adobe.com/';

// Milo comparison-table parses the block DOM directly:
//  - the first row (before the first "+++") is the header row
//  - "+++" in the first cell starts a new collapsible section
//  - inside a header column, "<p>-</p>" splits the 3 sub-containers
//    (mnemonic+heading | pricing | subcopy+CTAs)
//  - the row after a "+++" is that section's heading row; "primary" text in a
//    column cell turns that column's checkmarks green
//  - feature cells use <span class="icon icon-checkmark"> / icon-close, or text
// We rebuild the whole block from the extracted properties so it works for any
// column count (2/3/4) and any number of sections/rows.

// Build one structural row: an array of innerHTML strings, one <div> per cell.
function makeRow(cells) {
  const row = document.createElement('div');
  cells.forEach((html) => {
    const cell = document.createElement('div');
    if (html) cell.innerHTML = html;
    row.appendChild(cell);
  });
  return row;
}

function iconCell(type) {
  if (type === 'checkmark') return '<span class="icon icon-checkmark"></span>';
  if (type === 'close') return '<span class="icon icon-close"></span>';
  return '';
}

// A resolved image URL (already-uploaded imageRef, or an absolute link) is
// used as-is. Otherwise the mnemonic is a swapped icon *component*
// (productTile), the same shape hero-marquee's product lockup uses —
// resolve it through the same LOGOS table via handleProductLockup.
function isRealImageUrl(value) {
  return typeof value === 'string' && /^(https?:\/\/|\/libs\/img\/mnemonics\/|data:)/.test(value);
}

function resolveMnemonicUrl(col) {
  if (isRealImageUrl(col.image)) return col.image;
  const tileName = col.productTile?.name;
  if (tileName) return LOGOS[tileName] || LOGOS.placeholder;
  return '';
}

// One header column = 3 sub-containers separated by <p>-</p>.
function buildHeaderColumn(col = {}) {
  const parts = [];
  // 1) mnemonic + heading — the mnemonic goes in its OWN <p> ABOVE the <h3>,
  // matching the kitchen-sink template's stacked column (icon on its own line,
  // heading below). Emitting the link inside the <h3> would render it inline.
  const mnemonic = resolveMnemonicUrl(col);
  if (mnemonic) parts.push(`<p><a href="${mnemonic}">${mnemonic}</a></p>`);
  if (col.heading) parts.push(`<h3>${col.heading}</h3>`);
  parts.push('<p>-</p>');
  // 2) pricing
  if (col.hasPriorPrice && col.priorPrice) parts.push(`<p>${col.priorPrice}</p>`);
  if (col.price) parts.push(`<p>${col.price}</p>`);
  parts.push('<p>-</p>');
  // 3) sub copy + CTAs (Buy Now renders before Free trial, matching Figma order)
  if (col.hasSubCopy && col.subCopy) {
    const readMore = col.hasReadMore ? ` <a href="${DEFAULT_URL}">Read more</a>` : '';
    parts.push(`<p><em>${col.subCopy}</em>${readMore}</p>`);
  }
  if (col.hasBuyNow) parts.push(`<p><strong><a href="${DEFAULT_URL}">Buy Now</a></strong></p>`);
  if (col.hasFreeTrial) parts.push(`<p><em><a href="${DEFAULT_URL}">Free trial</a></em></p>`);
  return parts.join('');
}

function buildHeaderRow(columns) {
  // empty corner cell (row-label column) + one cell per data column
  return makeRow(['', ...columns.map(buildHeaderColumn)]);
}

function buildSeparatorRow(count) {
  return makeRow(['+++', ...Array(count).fill('')]);
}

function buildSectionHeadingRow(section, count) {
  const cells = [`<h3><strong>${section.title || ''}</strong></h3>`];
  for (let i = 1; i <= count; i += 1) {
    // primaryColumn is a 1-based data-column index (0/undefined = none)
    cells.push(Number(section.primaryColumn) === i ? 'primary' : '');
  }
  return makeRow(cells);
}

function buildFeatureRow(row, count) {
  let feature = row.feature || '';
  if (row.tooltip) {
    const pos = row.tooltipPosition ? `| ${row.tooltipPosition}| ` : '';
    feature += ` <em><span class="icon icon-tooltip"></span>${pos}${row.tooltip}</em>`;
  }
  // The feature label (row-header cell) is a single line. A secondary
  // "Description text" line belongs to the VALUE cell, below it — but NOT
  // inside the same box. Milo's processCellContent() looks for a "-" separator
  // among the cell's children: everything BEFORE "-" goes into a bordered
  // cellDiv (.table-cell div, 1px border via CSS), everything AFTER "-" is
  // appended as a direct child <p> of .table-cell, which CSS styles as a
  // plain caption (.table-cell > p:nth-child(2), no border). So a "-" <p>
  // between the value and description is what splits box vs. plain caption —
  // omitting it would merge both lines into one bordered box.
  const cells = [feature];
  for (let i = 0; i < count; i += 1) {
    const cell = Array.isArray(row.cells) ? row.cells[i] : null;
    if (!cell) {
      cells.push('');
    } else if (cell.type === 'checkmark' || cell.type === 'close') {
      cells.push(iconCell(cell.type));
    } else {
      const text = cell.text || '';
      cells.push(cell.description ? `<p>${text}</p><p>-</p><p>${cell.description}</p>` : text);
    }
  }
  return makeRow(cells);
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties || !blockContent) return;

  try {
    const columns = Array.isArray(properties.columns) ? properties.columns : [];
    const sections = Array.isArray(properties.sections) ? properties.sections : [];

    // Column count drives every structural row. Prefer header columns; fall back
    // to the widest feature row when there is no header.
    let count = columns.length;
    if (!count) {
      sections.forEach((s) => (s.rows || []).forEach((r) => {
        const len = Array.isArray(r.cells) ? r.cells.length : 0;
        if (len > count) count = len;
      }));
    }
    if (!count) return; // no columns and no cells → nothing to render

    blockContent.innerHTML = '';

    // Header row (everything before the first "+++").
    if (columns.length) blockContent.appendChild(buildHeaderRow(columns));

    // Sections: each is a "+++" separator, a heading row, then feature rows.
    sections.forEach((section) => {
      blockContent.appendChild(buildSeparatorRow(count));
      blockContent.appendChild(buildSectionHeadingRow(section, count));
      (section.rows || []).forEach((row) => {
        blockContent.appendChild(buildFeatureRow(row, count));
      });
    });

    // static-header variant is a block class toggle on the same template.
    if (properties.staticHeader) blockContent.classList.add('static-header');

    // The template block can carry a baked-in standalone spacing class (e.g.
    // 'xl-spacing' from the doc's block name) which Milo renders as XL padding
    // on both sides via '.con-block.xl-spacing'. Spacing must come from the
    // Figma spacers, so strip any standalone '*-spacing' class first (keeps the
    // positional '*-spacing-top/-bottom' classes untouched).
    [...blockContent.classList]
      .filter((cls) => /^(xxxl|xxl|xl|l|m|s|xs|xxs)-spacing$/.test(cls))
      .forEach((cls) => blockContent.classList.remove(cls));

    // Spacers → block-level spacing classes (same mechanism as table.js).
    if (properties.topSpacer) handleSpacer(blockContent, properties.topSpacer.name, 'top');
    if (properties.bottomSpacer) handleSpacer(blockContent, properties.bottomSpacer.name, 'bottom');

    // Dark mode is driven by the section (style: dark), matching the Milo
    // kitchen-sink fragment — not a block class.
    if (properties.colorTheme === 'dark') {
      handleColorThemeWithSectionMetadata(sectionWrapper, blockContent, 'dark');
    }

    // Background → section-metadata background row (#fff is skipped by the helper).
    if (properties.background) {
      handleBackgroundWithSectionMetadata(sectionWrapper, blockContent, properties.background);
    }

    // expand → section-metadata "expand" row (e.g. "all", "1", "1,3").
    if (properties.expand) {
      const expandValue = addOrUpdateSectionMetadata(sectionWrapper, blockContent, 'expand');
      expandValue.textContent = String(properties.expand);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
