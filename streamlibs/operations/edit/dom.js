function togglePanelVisibility(panelSelector, isHidden) {
  const panel = document.querySelector(panelSelector);
  if (!panel) return;
  panel.classList.toggle('hidden', isHidden);
}

function toggleTrackedPanelVisibility(panel, isHidden) {
  if (!panel?.isConnected) return;
  panel.classList.toggle('hidden', isHidden);
}

export function attachSectionDeleteControls(container) {
  const sections = Array.from(
    container.querySelectorAll(':scope > [data-source="figma"], :scope > [data-source="da"]'),
  );

  sections.forEach((section) => {
    if (section.dataset.deleteEnabled === 'true') return;
    section.dataset.deleteEnabled = 'true';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'da-section-delete';
    button.setAttribute('aria-label', 'Remove section');

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const isRemoved = section.classList.toggle('da-section-removed');
      button.classList.toggle('is-removed', isRemoved);
      section.dataset.removed = String(isRemoved);
      button.setAttribute('aria-label', isRemoved ? 'Undo remove section' : 'Remove section');
    });

    section.appendChild(button);
  });
}

export function startEditorMode(editState) {
  document.body.classList.add('editor-mode');
  if (editState) {
    toggleTrackedPanelVisibility(editState.daPanelEl, false);
    toggleTrackedPanelVisibility(editState.figmaPanelEl, false);
    return;
  }
  togglePanelVisibility('.da-panel', false);
  togglePanelVisibility('.figma-panel', false);
}

export function exitEditorMode(editState) {
  document.body.classList.remove('editor-mode');
  if (editState) {
    toggleTrackedPanelVisibility(editState.daPanelEl, true);
    toggleTrackedPanelVisibility(editState.figmaPanelEl, true);
    return;
  }
  togglePanelVisibility('.da-panel', true);
  togglePanelVisibility('.figma-panel', true);
}

export function handleBackToEditor(editState) {
  const main = editState?.mainEl?.isConnected ? editState.mainEl : document.querySelector('main');
  if (main) main.innerHTML = '';
  startEditorMode(editState);
}

function createPanelLocationHeader(source, location) {
  const header = document.createElement('div');
  header.className = 'panel-location-header';
  const sourceLocationLabel = source === 'figma' ? 'Figma Location' : 'DA Location';

  const box = document.createElement('div');
  box.className = 'panel-location-searchbox';

  const icon = document.createElement('span');
  icon.className = 'panel-location-search-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>';

  const sourceText = document.createElement('span');
  sourceText.className = 'panel-location-source';
  sourceText.textContent = sourceLocationLabel;

  const input = document.createElement('input');
  input.className = 'panel-location-input';
  input.type = 'text';
  input.readOnly = true;
  input.tabIndex = -1;
  input.value = location || 'Location not available';
  input.setAttribute('aria-label', `${sourceLocationLabel} value`);

  box.append(icon, sourceText, input);
  header.append(box);
  return header;
}

function createSourcePanel(panelClassName, source, location) {
  document.querySelectorAll(`.${panelClassName}`).forEach((panel) => panel.remove());

  const panel = document.createElement('div');
  panel.classList.add(panelClassName);
  panel.appendChild(createPanelLocationHeader(source, location));

  const blocks = document.body.querySelectorAll(`main > div[data-source="${source}"]`);
  blocks.forEach((block) => {
    panel.appendChild(block);
  });

  document.body.prepend(panel);
  return panel;
}

export function createFigmaPanel() {
  return createSourcePanel('figma-panel', 'figma', window.streamConfig?.contentUrl);
}

export function createDAPanel() {
  return createSourcePanel('da-panel', 'da', window.streamConfig?.targetUrl);
}

export function ensureSingleEditorMain(editState) {
  const mains = Array.from(document.body.querySelectorAll(':scope > main'));
  let main = editState.mainEl?.isConnected ? editState.mainEl : mains[0] || null;

  if (!main) {
    main = document.createElement('main');
    document.body.appendChild(main);
  }

  mains.forEach((existingMain) => {
    if (existingMain !== main) existingMain.remove();
  });

  main.innerHTML = '';
  editState.mainEl = main;
  return main;
}

export function normalizeDAImages(root) {
  root.querySelectorAll('img').forEach((img) => {
    if (img.src.includes('content.da.live') && img.parentElement.tagName !== 'PICTURE') {
      const picture = document.createElement('picture');
      img.parentElement.replaceWith(picture);
      picture.appendChild(img);
    }
  });
}

export function getIdxFromId(id) {
  if (!id) return null;

  const parts = id.split('-');
  return parts.length > 1 ? parts[1] : null;
}

export function hasModified(tag) {
  return Boolean(tag?.includes('-modified'));
}
