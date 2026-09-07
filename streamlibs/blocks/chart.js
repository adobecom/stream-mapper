import { handleComponents } from '../components/components.js';
import { safeJsonFetch } from '../utils/error-handler.js';

const CHART_TYPES = ['area', 'bar', 'column', 'donut', 'line', 'list', 'oversized-number', 'pie'];
const CHART_COLORS = ['blue', 'indigo', 'purple', 'magenta', 'seafoam', 'green', 'orange'];

// Ensure the block carries exactly the extracted chart-type class. The template
// block already ships with the right type (variant selection), but the Figma
// `chartType` is authoritative, so normalise here.
function handleChartType(blockContent, chartType) {
  if (!chartType || !CHART_TYPES.includes(chartType)) return;
  blockContent.classList.add(chartType);
}

function handleColor(blockContent, color) {
  if (color && CHART_COLORS.includes(color)) blockContent.classList.add(color);
}

function handleLabelDirection(blockContent, direction) {
  if (direction === 'diagonal') blockContent.classList.add('diagonal');
}

function handleBackground(sectionWrapper, background) {
  if (!background) return;
  const sectionMetadata = document.createElement('div');
  sectionMetadata.classList.add('section-metadata');
  const row = document.createElement('div');
  const keyDiv = document.createElement('div');
  keyDiv.textContent = 'Background';
  const valueDiv = document.createElement('div');
  valueDiv.textContent = background;
  row.appendChild(keyDiv);
  row.appendChild(valueDiv);
  sectionMetadata.appendChild(row);
  sectionWrapper.appendChild(sectionMetadata);
}

// The data-source row holds a link to the external chart JSON. Keep the row in
// place (Milo reads chart rows positionally: title > subtitle > data > footnote).
// When Figma has no real JSON (PM supplies it later) leave the template link so
// the author can replace it.
const MILO_DOC_ORIGIN = 'https://main--milo--adobecom.aem.page';

function handleDataSource(blockContent, selector, value) {
  const linkEl = blockContent.querySelector(selector);
  if (!linkEl) return;
  if (value) {
    linkEl.href = value;
    linkEl.textContent = value;
    return;
  }
 
  const raw = linkEl.getAttribute('href') || '';
  if (raw.startsWith('/')) {
    const abs = `${MILO_DOC_ORIGIN}${raw}`;
    linkEl.setAttribute('href', abs);
    linkEl.textContent = abs;
  } else if (raw.includes('--milo--adobecom.hlx.page')) {
    const abs = raw.replace('--milo--adobecom.hlx.page', '--milo--adobecom.aem.page');
    linkEl.setAttribute('href', abs);
    linkEl.textContent = abs;
  }
}

export default async function mapBlockContent(
  sectionWrapper,
  blockContent,
  figContent,
) {
  const properties = figContent?.details?.properties;
  if (!properties) return;

  try {
    // Strip all template-inherited classes (kitchen-sink colors, border, diagonal-label
    // variants, etc.) so only Figma-driven classes end up on the block.
    blockContent.className = 'chart';

    const mappingData = await safeJsonFetch('chart.json');
    mappingData.data.forEach((mappingConfig) => {
      const value = properties[mappingConfig.key];
      switch (mappingConfig.key) {
        case 'dataSource':
          handleDataSource(blockContent, mappingConfig.selector, value);
          break;
        default:
          if (value) handleComponents(blockContent, value, mappingConfig);
          break;
      }
    });
    // Drop emptied text rows' inner cells (placeholder + to-remove); the outer
    // row div stays so Milo's positional row parsing is preserved.
    blockContent.querySelectorAll('.to-remove').forEach((el) => el.remove());

    handleChartType(blockContent, properties.chartType);
    handleColor(blockContent, properties.color);
    handleLabelDirection(blockContent, properties.labelDirection);
    if (properties.colorTheme === 'dark') blockContent.classList.add('dark');
    handleBackground(sectionWrapper, properties.background);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
}
