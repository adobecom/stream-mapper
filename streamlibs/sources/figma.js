import { handleError, safeFetch } from '../utils/error-handler.js';
import { createFigmaLoaderReporter } from '../utils/loader.js';
import { appendBlockActionButton } from '../utils/block-action-button.js';

const PLACEHOLDER_URL = 'https://main--stream-mapper--adobecom.aem.live/fragments/stream-block-placeholder';
const METADATA_KEYS = new Set(['colorTheme', 'miloTag', 'layout']);
const SUPPORTED_BLOCKS_URL = 'https://main--stream-mapper--adobecom.aem.page/configuration/supported-blocks.json';

function isEmptyBlockContent(properties) {
  if (!properties || typeof properties !== 'object') return true;
  const entries = Object.entries(properties);
  if (entries.length === 0) return true;
  return entries.every(([key, value]) => {
    if (METADATA_KEYS.has(key)) return true;
    if (value === false || value === '' || value == null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  });
}

function createPlaceholder() {
  const div = document.createElement('div');
  div.classList.add('stream-placeholder');
  div.dataset.placeholder = 'true';
  div.innerHTML = `<p><a href='${PLACEHOLDER_URL}'>${PLACEHOLDER_URL}</a></p>`;
  return div;
}

function getFigmaRetryConfig() {
  return window.streamConfig.figmaServiceRetry;
}

function getRetryDelay(delays, attempt) {
  if (!Array.isArray(delays) || delays.length === 0) return 0;
  const idx = Math.min(attempt, delays.length - 1);
  return delays[idx];
}

async function fetchJsonWithRetry(url, options) {
  const { retryCount, retryDelaysMs } = await getFigmaRetryConfig();
  const maxRetries = Number.isInteger(retryCount) && retryCount >= 0 ? retryCount : 0;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response;
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await fetch(url, options);
    } catch (networkError) {
      lastError = networkError;
      if (attempt === maxRetries) throw networkError;
      const delay = getRetryDelay(retryDelaysMs, attempt);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, delay); });
      // eslint-disable-next-line no-continue
      continue;
    }
    if (response.ok) {
      // eslint-disable-next-line no-await-in-loop, no-return-await
      return await response.json();
    }
    if (response.status === 503) {
      lastError = new Error(`HTTP 503 from ${url}`);
      lastError.is503Exhausted = attempt === maxRetries;
      if (attempt === maxRetries) {
        handleError(lastError, 'We are experiencing high server load. Please try again later', '');
        throw lastError;
      }
      const delay = getRetryDelay(retryDelaysMs, attempt);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, delay); });
      // eslint-disable-next-line no-continue
      continue;
    }
    throw new Error(`HTTP error! Status: ${url} ${response.status}`);
  }
  if (lastError) throw lastError;
  return {};
}

async function fetchFigmaMapping(figmaUrl) {
  try {
    const { streamMapper } = window.streamConfig;
    const pagePath = window.streamConfig.targetUrl.startsWith('/') ? window.streamConfig.targetUrl.slice(1) : window.streamConfig.targetUrl;
    return await fetchJsonWithRetry(
      `${streamMapper.serviceEP}${streamMapper.figmaMappingUrl}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: streamMapper.figmaAuthToken,
        },
        body: JSON.stringify({
          figmaUrl,
          pagePath,
        }),
      },
    );
  } catch (error) {
    if (!error?.is503Exhausted) handleError(error, 'getting figma mapping');
    throw error;
  }
}

const SPECIAL_OVERRIDES = {
  'icon-action-gallery': ({ doc }) => doc.querySelector('div'),
  carousel: ({ doc }) => doc.body.querySelectorAll(':scope > div'),
  'quick-facts': ({ doc }) => doc.querySelectorAll('.quick-facts, .quote, .text'),
};

function getHtml(resp, miloId, variant, figContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(resp, 'text/html');
  const overrideFunction = SPECIAL_OVERRIDES[miloId];
  if (overrideFunction) {
    return overrideFunction({
      doc, miloId, variant, figContent,
    });
  }
  return doc.querySelectorAll(`.${miloId}`)[variant];
}

// eslint-disable-next-line consistent-return
async function fetchWithRetry(url, retries = 1) {
  for (let i = 0; i <= retries; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await safeFetch(url);
      // eslint-disable-next-line no-await-in-loop
      return await response.text();
    } catch (error) {
      if (i === retries) throw error;
    }
  }
}

async function fetchContent(contentUrl) {
  try {
    return await fetchWithRetry(contentUrl);
  } catch (error) {
    handleError(error, 'fetching content');
    return null;
  }
}

async function fetchBlockContent(figId, id, figmaUrl, aiMapping) {
  try {
    const { streamMapper } = window.streamConfig;
    const contentUrl = aiMapping
      ? streamMapper.figmaAIBlockContentUrl
      : streamMapper.figmaBlockContentUrl;
    return await fetchJsonWithRetry(
      `${streamMapper.serviceEP}${contentUrl}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: streamMapper.figmaAuthToken,
        },
        body: JSON.stringify({ figmaUrl, figId, id }),
      },
    );
  } catch (error) {
    if (error?.is503Exhausted) throw error;
    return { _failed: true };
  }
}

async function mapFigmaContent(blockContent, block, figContent) {
  try {
    const { default: mapBlockContent } = await import(`../blocks/${block.id}.js`);
    const sectionWrapper = document.createElement('div');
    if (!(blockContent instanceof NodeList)) {
      sectionWrapper.append(blockContent);
    }
    const res = await mapBlockContent(sectionWrapper, blockContent, figContent);
    if (Array.isArray(res)) {
      return res;
    // eslint-disable-next-line no-else-return
    } else {
      return sectionWrapper;
    }
  } catch (error) {
    return '<div></div>';
  }
}

async function processBlock(block, figmaUrl, onDetailResponse = () => {}) {
  if (!block.id || !block.path) return { _failed: true, block };
  const [doc, figContent] = await Promise.all([
    fetchContent(block.path),
    fetchBlockContent(block.figId, block.id, figmaUrl, block.aiMapping).finally(() => onDetailResponse()),
  ]);
  if (figContent._failed) return { _failed: true, block };
  if (!figContent.details) return '';

  const properties = figContent?.details?.properties;
  if (figContent?.success && isEmptyBlockContent(properties)) {
    const placeholder = createPlaceholder();
    block.blockDomEl = placeholder;
    return placeholder;
  }

  let blockContent = getHtml(doc, block.miloId, block.variant);
  const props = figContent.details.properties;
  props.miloTag = block.tag;
  blockContent = await mapFigmaContent(blockContent, block, figContent);
  block.blockDomEl = blockContent;
  return blockContent || '';
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  let stopped = false;
  let firstError = null;
  const limit = Math.max(1, concurrency);
  async function runner() {
    while (cursor < items.length && !stopped) {
      const current = cursor;
      cursor += 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        results[current] = await worker(items[current], current);
      } catch (error) {
        stopped = true;
        if (!firstError) firstError = error;
        return;
      }
    }
  }
  const runnerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: runnerCount }, () => runner()));
  if (firstError) throw firstError;
  return results;
}

function showFailedBlocksPopover(failedBlocks) {
  const popover = document.createElement('div');
  popover.className = 'stream-failed-blocks-popover';

  const header = document.createElement('div');
  header.className = 'stream-failed-blocks-header';
  header.innerHTML = `
    <span class="stream-failed-blocks-title">Lost Without a Match</span>
    <button type="button" class="stream-failed-blocks-close">&times;</button>`;
  popover.appendChild(header);

  const list = document.createElement('div');
  list.className = 'stream-failed-blocks-list';
  failedBlocks.forEach(({ block }) => {
    const item = document.createElement('div');
    item.className = 'stream-failed-blocks-item';
    if (block.sectionSnapshot) {
      const a = document.createElement('a');
      a.href = block.sectionLink || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const img = document.createElement('img');
      img.src = block.sectionSnapshot;
      img.alt = block.name || 'Section';
      img.className = 'stream-failed-blocks-img';
      a.appendChild(img);
      item.appendChild(a);
    }
    const name = document.createElement('span');
    name.className = 'stream-failed-blocks-name';
    name.textContent = block.name || block.id || 'Unknown';
    item.appendChild(name);
    list.appendChild(item);
  });
  popover.appendChild(list);

  document.body.appendChild(popover);
  requestAnimationFrame(() => popover.classList.add('is-visible'));

  popover.querySelector('.stream-failed-blocks-close').addEventListener('click', () => {
    popover.classList.remove('is-visible');
    popover.addEventListener('transitionend', () => popover.remove(), { once: true });
  });
}

async function createHTML(blockMapping, figmaUrl, tracker) {
  const blocks = blockMapping.details.components;
  const { blockContentConcurrency } = await getFigmaRetryConfig();
  const htmlParts = await runWithConcurrency(
    blocks,
    blockContentConcurrency,
    (block) => processBlock(block, figmaUrl, () => tracker.markDetailResponse()),
  );
  const failedBlocks = htmlParts.filter((r) => r?._failed);
  if (failedBlocks.length) showFailedBlocksPopover(failedBlocks);
  return htmlParts.filter((r) => r && !r._failed);
}

async function fetchSupportedBlocks() {
  try {
    const resp = await fetch(SUPPORTED_BLOCKS_URL);
    if (!resp.ok) return [];
    const json = await resp.json();
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json)) return json;
    const sheetKey = Object.keys(json).find((k) => !k.startsWith(':') && Array.isArray(json[k]?.data));
    if (sheetKey) return json[sheetKey].data;
    return [];
  } catch {
    return [];
  }
}

function getBlockProp(block, ...keys) {
  for (const key of keys) {
    if (block[key] !== undefined && block[key] !== null && block[key] !== '') return block[key];
  }
  return '';
}

function getBlockVariant(match) {
  const variant = getBlockProp(match, 'variant', 'Variant');
  return variant !== '' ? Number(variant) : 0;
}

function findSupportedBlock(comp, supportedBlocks) {
  return supportedBlocks.find((b) => getBlockProp(b, 'name', 'Name') === comp.name)
    || supportedBlocks.find((b) => getBlockProp(b, 'id', 'Id', 'ID') === comp.id);
}

// eslint-disable-next-line object-curly-newline
function createSearchableSelect({ options, selected, disabled, onChange }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'searchable-select';
  if (selected === 'NA') wrapper.classList.add('is-na');
  if (disabled) wrapper.classList.add('is-disabled');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'searchable-select-trigger';
  trigger.textContent = selected || 'Select block';
  wrapper.appendChild(trigger);

  const dropdown = document.createElement('div');
  dropdown.className = 'searchable-select-dropdown';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'searchable-select-search';
  searchInput.placeholder = 'Search blocks…';
  dropdown.appendChild(searchInput);

  const optionsList = document.createElement('div');
  optionsList.className = 'searchable-select-options';
  dropdown.appendChild(optionsList);
  wrapper.appendChild(dropdown);

  let highlightIdx = -1;

  function getFilteredOptions() {
    const query = (searchInput.value || '').toLowerCase();
    return options.filter((n) => !query || n.toLowerCase().includes(query));
  }

  function refreshHighlight() {
    const items = optionsList.querySelectorAll('.searchable-select-option');
    items.forEach((el, i) => el.classList.toggle('is-highlighted', i === highlightIdx));
  }

  function close() {
    wrapper.classList.remove('is-open');
    searchInput.value = '';
    highlightIdx = -1;
  }

  function selectValue(val) {
    trigger.textContent = val;
    wrapper.classList.toggle('is-na', val === 'NA');
    close();
    if (onChange) onChange(val);
  }

  function renderOptions(filter) {
    optionsList.innerHTML = '';
    const query = (filter || '').toLowerCase();
    const filtered = options.filter((n) => !query || n.toLowerCase().includes(query));
    if (!filtered.length) {
      const noRes = document.createElement('div');
      noRes.className = 'searchable-select-no-results';
      noRes.textContent = 'No matches';
      optionsList.appendChild(noRes);
      highlightIdx = -1;
      return;
    }
    filtered.forEach((n, i) => {
      const opt = document.createElement('div');
      opt.className = 'searchable-select-option';
      if (n === selected) opt.classList.add('is-selected');
      if (n === 'NA') opt.classList.add('is-na');
      if (i === highlightIdx) opt.classList.add('is-highlighted');
      opt.textContent = n;
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectValue(n);
      });
      opt.addEventListener('mouseenter', () => {
        highlightIdx = i;
        refreshHighlight();
      });
      optionsList.appendChild(opt);
    });
  }

  function positionDropdown() {
    const rect = trigger.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.minWidth = `${Math.max(200, rect.width)}px`;
  }

  function open() {
    if (disabled) return;
    wrapper.classList.add('is-open');
    searchInput.value = '';
    highlightIdx = -1;
    positionDropdown();
    renderOptions('');
    requestAnimationFrame(() => searchInput.focus());
  }

  trigger.addEventListener('click', () => {
    if (wrapper.classList.contains('is-open')) close();
    else open();
  });

  searchInput.addEventListener('input', () => {
    highlightIdx = 0;
    renderOptions(searchInput.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    const filtered = getFilteredOptions();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, filtered.length - 1);
      refreshHighlight();
      const items = optionsList.querySelectorAll('.searchable-select-option');
      if (items[highlightIdx]) {
        items[highlightIdx].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      refreshHighlight();
      const items = optionsList.querySelectorAll('.searchable-select-option');
      if (items[highlightIdx]) {
        items[highlightIdx].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        selectValue(filtered[highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      close();
      trigger.focus();
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (!wrapper.contains(e.target) && !dropdown.contains(e.target)) close();
  });

  window.addEventListener('resize', () => {
    if (wrapper.classList.contains('is-open')) positionDropdown();
  });

  window.addEventListener('scroll', () => {
    if (wrapper.classList.contains('is-open')) positionDropdown();
  }, true);

  wrapper.getValue = () => trigger.textContent;
  wrapper.setValue = (val) => {
    trigger.textContent = val;
    wrapper.classList.toggle('is-na', val === 'NA');
  };

  return wrapper;
}

function applyBlockSelection(comp, name, supportedBlocks) {
  comp.name = name;
  const match = supportedBlocks.find((b) => getBlockProp(b, 'name', 'Name') === name);
  if (!match) return;
  const id = getBlockProp(match, 'id', 'Id', 'ID');
  const miloId = getBlockProp(match, 'miloId', 'milo-id', 'MiloId');
  const path = getBlockProp(match, 'path', 'Path');
  if (id) comp.id = id;
  if (miloId) comp.miloId = miloId;
  if (path) comp.path = path;
  comp.variant = getBlockVariant(match);
}

// eslint-disable-next-line no-async-promise-executor
async function showBlockMappingReview(blockMapping) {
  const supportedBlocks = await fetchSupportedBlocks();
  const components = blockMapping.details.components.map((c) => {
    const match = findSupportedBlock(c, supportedBlocks);
    return {
      ...c,
      aiMapping: c.aiMapping !== undefined ? c.aiMapping : (!c.c1lib && c.name !== 'NA'),
      variant: match ? getBlockVariant(match) : (c.variant ?? 0),
    };
  });

  const loaderContainer = document.querySelector('#loader-container');
  if (loaderContainer) {
    loaderContainer.style.display = 'none';
    loaderContainer.classList.remove('is-visible');
  }

  const allNames = supportedBlocks
    .map((b) => getBlockProp(b, 'name', 'Name'))
    .filter(Boolean);
  const uniqueNames = [...new Set(allNames)];

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'stream-block-review-overlay';

    const hoverPreview = document.createElement('div');
    hoverPreview.className = 'fig-snapshot-hover-preview';
    const hoverImg = document.createElement('img');
    hoverPreview.appendChild(hoverImg);
    document.body.appendChild(hoverPreview);

    function showHoverPreview(e, src) {
      hoverImg.src = src;
      hoverPreview.classList.add('is-visible');
      positionHoverPreview(e);
    }
    function positionHoverPreview(e) {
      const pad = 16;
      const rect = hoverPreview.getBoundingClientRect();
      const pw = rect.width || 608;
      const ph = rect.height || 458;
      let x = e.clientX + pad;
      let y = e.clientY - ph / 2;
      if (x + pw > window.innerWidth) x = e.clientX - pw - pad;
      if (y + ph > window.innerHeight) y = window.innerHeight - ph - 8;
      if (y < 8) y = 8;
      hoverPreview.style.left = `${Math.max(0, x)}px`;
      hoverPreview.style.top = `${y}px`;
    }
    function hideHoverPreview() {
      hoverPreview.classList.remove('is-visible');
      hoverImg.src = '';
    }

    const panel = document.createElement('div');
    panel.className = 'stream-block-review-panel';

    const header = document.createElement('div');
    header.className = 'stream-block-review-header';
    header.innerHTML = `
      <h2>Block Mapping Review</h2>
      <p>Review and adjust the detected blocks before proceeding with content mapping.</p>`;
    panel.appendChild(header);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'stream-block-review-table-wrap';
    const table = document.createElement('table');
    table.className = 'stream-block-review-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>
      <th class="col-num">#</th>
      <th class="col-snapshot">Preview</th>
      <th>Tag</th>
      <th class="col-name">Name</th>
      <th class="col-ai">AI Mapping
        <label class="ai-toggle-all" title="Toggle all">
          <input type="checkbox" />
          <span class="ai-toggle-all-track"></span>
        </label>
      </th>
      <th class="col-actions">Actions</th>
    </tr>`;

    const aiToggleAllInput = thead.querySelector('.ai-toggle-all input');
    aiToggleAllInput.addEventListener('change', () => {
      const enabled = aiToggleAllInput.checked;
      components.forEach((comp) => {
        if (!comp._deleted && comp.name !== 'NA') {
          comp.aiMapping = enabled;
        }
      });
      renderRows();
    });
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    panel.appendChild(tableWrap);

    const addSection = document.createElement('div');
    addSection.className = 'stream-block-review-add';
    addSection.innerHTML = `
      <span class="add-section-label">Add Section</span>
      <input type="text" class="add-section-url" placeholder="Paste Figma section URL" />
      <span class="add-section-select-slot"></span>
      <button type="button" class="add-section-btn" disabled>Add</button>`;
    const addUrlInput = addSection.querySelector('.add-section-url');
    const addBtn = addSection.querySelector('.add-section-btn');
    let addSelectedName = '';
    const addSearchSelect = createSearchableSelect({
      options: uniqueNames,
      selected: 'Block name',
      disabled: false,
      onChange: (val) => {
        addSelectedName = val;
        validateAddForm();
      },
    });
    addSection.querySelector('.add-section-select-slot').replaceWith(addSearchSelect);
    function validateAddForm() {
      addBtn.disabled = !addUrlInput.value.trim() || !addSelectedName;
    }
    addUrlInput.addEventListener('input', validateAddForm);
    addBtn.addEventListener('click', () => {
      const url = addUrlInput.value.trim();
      if (!url || !addSelectedName) return;
      let figId = '';
      let sectionLink = url;
      try {
        const parsed = new URL(url);
        const nodeId = parsed.searchParams.get('node-id') || '';
        figId = nodeId.replace(/-/g, ':');
      } catch {
        figId = '';
      }
      const name = addSelectedName;
      const match = supportedBlocks.find((b) => getBlockProp(b, 'name', 'Name') === name);
      const id = match ? getBlockProp(match, 'id', 'Id', 'ID') : '';
      const miloId = match ? getBlockProp(match, 'miloId', 'milo-id', 'MiloId') : '';
      const path = match ? getBlockProp(match, 'path', 'Path') : '';
      components.push({
        id,
        miloId,
        figId,
        name,
        path,
        tag: '',
        variant: match ? getBlockVariant(match) : 0,
        c1lib: false,
        sectionLink,
        aiMapping: true,
      });
      addUrlInput.value = '';
      addSelectedName = '';
      addSearchSelect.setValue('Block name');
      addBtn.disabled = true;
      appendRow(components.length - 1);
    });
    panel.appendChild(addSection);

    const footer = document.createElement('div');
    footer.className = 'stream-block-review-footer';
    const proceedBtn = document.createElement('button');
    proceedBtn.className = 'stream-block-review-proceed';
    proceedBtn.textContent = 'Proceed with Block Mapping';
    footer.appendChild(proceedBtn);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    let dragIdx = null;

    const mkBtn = (svg, title, cls) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `review-action-btn${cls ? ` ${cls}` : ''}`;
      btn.innerHTML = svg;
      btn.title = title;
      return btn;
    };

    function createExternalLink(href, className) {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = className;
      return a;
    }

    function refreshRowNumbers() {
      const rows = tbody.querySelectorAll('tr');
      rows.forEach((row, i) => {
        row.querySelector('.col-num').textContent = i + 1;
        const upBtn = row.querySelector('[title="Move up"]');
        const downBtn = row.querySelector('[title="Move down"]');
        if (upBtn) upBtn.disabled = i === 0;
        if (downBtn) downBtn.disabled = i === rows.length - 1;
      });
    }

    function updateProceedState() {
      const hasNA = components.some((c) => !c._deleted && c.name === 'NA');
      proceedBtn.disabled = hasNA;
    }

    function moveRow(fromIdx, toIdx) {
      const rows = [...tbody.querySelectorAll('tr')];
      const row = rows[fromIdx];
      const ref = toIdx < fromIdx ? rows[toIdx] : rows[toIdx].nextSibling;
      tbody.insertBefore(row, ref);
      refreshRowNumbers();
    }

    function replaceRow(idx, tr) {
      const newTr = buildRow(components[idx], idx);
      tr.replaceWith(newTr);
      updateProceedState();
    }

    function buildRow(comp, idx) {
      const isDeleted = !!comp._deleted;
      const tr = document.createElement('tr');
      tr.draggable = !isDeleted;
      if (isDeleted) tr.classList.add('is-deleted');

      if (!isDeleted) {
        tr.addEventListener('dragstart', (e) => {
          dragIdx = idx;
          tr.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        tr.addEventListener('dragend', () => {
          tr.classList.remove('is-dragging');
          dragIdx = null;
          tbody.querySelectorAll('.drag-over').forEach((r) => r.classList.remove('drag-over'));
        });
        tr.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dragIdx !== null && dragIdx !== idx) tr.classList.add('drag-over');
        });
        tr.addEventListener('dragleave', () => tr.classList.remove('drag-over'));
        tr.addEventListener('drop', (e) => {
          e.preventDefault();
          tr.classList.remove('drag-over');
          if (dragIdx === null || dragIdx === idx) return;
          const fromIdx = dragIdx;
          const [moved] = components.splice(fromIdx, 1);
          components.splice(idx, 0, moved);
          moveRow(fromIdx, idx);
        });
      }

      let td = document.createElement('td');
      td.className = 'col-num';
      td.textContent = idx + 1;
      tr.appendChild(td);

      td = document.createElement('td');
      td.className = 'col-snapshot';
      if (comp.sectionSnapshot) {
        const a = createExternalLink(comp.sectionLink || '#', 'fig-snapshot-link');
        const img = document.createElement('img');
        img.src = comp.sectionSnapshot;
        img.alt = comp.name || comp.figId || 'Section preview';
        img.className = 'fig-snapshot-img';
        a.addEventListener('mouseenter', (ev) => showHoverPreview(ev, comp.sectionSnapshot));
        a.addEventListener('mousemove', positionHoverPreview);
        a.addEventListener('mouseleave', hideHoverPreview);
        a.appendChild(img);
        td.appendChild(a);
      } else if (comp.sectionLink) {
        const a = createExternalLink(comp.sectionLink, 'fig-link');
        a.textContent = comp.figId || '';
        td.appendChild(a);
      } else {
        td.textContent = comp.figId || '';
      }
      tr.appendChild(td);

      td = document.createElement('td');
      if (comp.tag) {
        const pill = document.createElement('span');
        pill.className = `tag-pill${comp.tag === 'NA' ? ' tag-pill-na' : ''}`;
        pill.textContent = comp.tag;
        td.appendChild(pill);
      }
      tr.appendChild(td);

      td = document.createElement('td');
      td.className = 'col-name';
      const nameOpts = [...uniqueNames];
      if (comp.name && !nameOpts.includes(comp.name)) nameOpts.unshift(comp.name);
      const searchSelect = createSearchableSelect({
        options: nameOpts,
        selected: comp.name || '',
        disabled: isDeleted,
        onChange: (val) => {
          applyBlockSelection(components[idx], val, supportedBlocks);
          if (val === 'NA' || components[idx].c1lib) {
            components[idx].aiMapping = false;
          }
          replaceRow(idx, tr);
        },
      });
      td.appendChild(searchSelect);
      tr.appendChild(td);

      td = document.createElement('td');
      td.className = 'col-ai';
      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'ai-toggle';
      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = comp.aiMapping;
      toggleInput.disabled = isDeleted || comp.name === 'NA';
      toggleInput.addEventListener('change', () => {
        components[idx].aiMapping = toggleInput.checked;
      });
      const toggleTrack = document.createElement('span');
      toggleTrack.className = 'ai-toggle-track';
      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleTrack);
      td.appendChild(toggleLabel);
      tr.appendChild(td);

      td = document.createElement('td');
      td.className = 'col-actions';

      if (isDeleted) {
        const restoreBtn = mkBtn(
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 1 9 9"/><path d="M3 21v-6h6"/></svg>',
          'Restore',
          'restore-btn',
        );
        restoreBtn.addEventListener('click', () => {
          delete components[idx]._deleted;
          replaceRow(idx, tr);
        });
        td.appendChild(restoreBtn);
      } else {
        const upBtn = mkBtn(
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>',
          'Move up',
        );
        if (idx === 0) upBtn.disabled = true;
        upBtn.addEventListener('click', () => {
          if (idx > 0) {
            [components[idx - 1], components[idx]] = [components[idx], components[idx - 1]];
            moveRow(idx, idx - 1);
          }
        });

        const downBtn = mkBtn(
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>',
          'Move down',
        );
        if (idx === components.length - 1) downBtn.disabled = true;
        downBtn.addEventListener('click', () => {
          if (idx < components.length - 1) {
            [components[idx], components[idx + 1]] = [components[idx + 1], components[idx]];
            moveRow(idx, idx + 1);
          }
        });

        const delBtn = mkBtn(
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>',
          'Remove',
          'delete-btn',
        );
        delBtn.addEventListener('click', () => {
          components[idx]._deleted = true;
          replaceRow(idx, tr);
        });

        td.appendChild(upBtn);
        td.appendChild(downBtn);
        td.appendChild(delBtn);
      }
      tr.appendChild(td);

      return tr;
    }

    function appendRow(idx) {
      tbody.appendChild(buildRow(components[idx], idx));
      refreshRowNumbers();
      updateProceedState();
    }

    function renderRows() {
      tbody.innerHTML = '';
      components.forEach((comp, idx) => {
        tbody.appendChild(buildRow(comp, idx));
      });
      updateProceedState();
    }

    renderRows();

    proceedBtn.addEventListener('click', () => {
      overlay.remove();
      hoverPreview.remove();
      blockMapping.details.components = components
        .filter((c) => !c._deleted)
        .map(({ _deleted, ...rest }) => rest);
      resolve(blockMapping);
    });
  });
}

async function getFigmaContent(figmaUrl) {
  const loaderReporter = createFigmaLoaderReporter();
  loaderReporter.startDesignLoading();

  let blockMapping = null;
  try {
    blockMapping = await fetchFigmaMapping(figmaUrl);
  } finally {
    loaderReporter.completeDesignLoading();
  }
  if (!blockMapping?.details?.components) {
    loaderReporter.markNoComponents();
    return { html: [], blockMapping };
  }

  blockMapping = await showBlockMappingReview(blockMapping);

  const validBlocksCount = blockMapping.details.components
    .filter((block) => block.id && block.path).length;
  if (!validBlocksCount) {
    loaderReporter.markNoBlocks();
    return { html: [], blockMapping };
  }

  const tracker = loaderReporter.createBlocksTracker(validBlocksCount);
  const html = await createHTML(blockMapping, figmaUrl, tracker);
  return { html, blockMapping };
}

// eslint-disable-next-line import/prefer-default-export
export async function fetchFigmaContent() {
  // eslint-disable-next-line no-return-await
  const pageComponents = await getFigmaContent(window.streamConfig.contentUrl);
  let htmlDom = '';
  pageComponents.html.forEach((h, idx) => {
    if (Array.isArray(h)) {
      h.forEach((hdash, idxx) => {
        appendBlockActionButton(hdash);
        hdash.id = `block-${idx}-${idxx}`;
        htmlDom += hdash.outerHTML;
      });
    } else if (typeof h === 'object') {
      appendBlockActionButton(h);
      h.id = `block-${idx}`;
      htmlDom += h.outerHTML;
    }
  });
  pageComponents.htmlDom = htmlDom;
  return {
    htmlDom: pageComponents.htmlDom,
    html: pageComponents.html,
    blockMapping: pageComponents?.blockMapping,
  };
}
