export default function createEditDragDropController({
  editState,
  attachSectionDeleteControls,
}) {
  let handlePointerUp = () => {};

  function ensureDropPlaceholder() {
    if (!editState.dropPlaceholder) {
      editState.dropPlaceholder = document.createElement('div');
      editState.dropPlaceholder.classList.add('da-drop-placeholder');
    }
    return editState.dropPlaceholder;
  }

  function clearDragState() {
    if (editState.draggedPanelBlock) {
      editState.draggedPanelBlock.classList.remove('is-dragging');
    }
    if (editState.draggedMainBlock) {
      editState.draggedMainBlock.classList.remove('is-dragging');
    }

    editState.draggedPanelBlock = null;
    editState.draggedMainBlock = null;
    editState.currentDropContainer?.classList.remove('da-drop-active');
  }

  function getBlockToInsert() {
    if (editState.draggedPanelBlock) {
      const clonedBlock = editState.draggedPanelBlock.cloneNode(true);
      clonedBlock.classList.remove('figma-panel-block', 'is-dragging');
      return clonedBlock;
    }
    return editState.draggedMainBlock;
  }

  function handlePointerMove(event) {
    if (!editState.draggedPanelBlock && !editState.draggedMainBlock) return;
    const { currentDropContainer } = editState;
    if (!currentDropContainer) return;

    event.preventDefault();
    currentDropContainer.classList.add('da-drop-active');
    const dropPlaceholder = ensureDropPlaceholder();

    const pointElement = document.elementFromPoint(event.clientX, event.clientY);
    let targetBlock = pointElement && pointElement.closest('[data-source="da"], [data-source="figma"]');
    while (targetBlock && targetBlock.parentNode !== currentDropContainer) {
      targetBlock = targetBlock.parentNode;
    }

    if (targetBlock && currentDropContainer.contains(targetBlock)) {
      const rect = targetBlock.getBoundingClientRect();
      const shouldInsertBefore = event.clientY < rect.top + rect.height / 2;
      if (shouldInsertBefore && targetBlock.previousSibling !== dropPlaceholder) {
        currentDropContainer.insertBefore(dropPlaceholder, targetBlock);
      } else if (!shouldInsertBefore && targetBlock.nextSibling !== dropPlaceholder) {
        currentDropContainer.insertBefore(dropPlaceholder, targetBlock.nextSibling);
      }
      return;
    }

    if (dropPlaceholder.parentNode !== currentDropContainer || dropPlaceholder !== currentDropContainer.lastChild) {
      currentDropContainer.appendChild(dropPlaceholder);
    }
  }

  function enableMainReorder(container) {
    const figmaInMain = Array.from(container.querySelectorAll(':scope > [data-source="figma"]'));
    figmaInMain.forEach((block) => {
      if (block.dataset.reorderEnabled === 'true') return;
      block.dataset.reorderEnabled = 'true';

      block.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('.da-section-delete')) return;
        event.preventDefault();
        editState.draggedMainBlock = block;
        editState.draggedPanelBlock = null;
        editState.currentDropContainer = container;
        block.classList.add('is-dragging');

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
      });
    });
  }

  function teardownPointerListeners() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }

  handlePointerUp = function pointerUpHandler() {
    if (!editState.draggedPanelBlock && !editState.draggedMainBlock) {
      editState.currentDropContainer?.classList.remove('da-drop-active');
      teardownPointerListeners();
      return;
    }

    const { currentDropContainer } = editState;
    const blockToInsert = getBlockToInsert();

    if (
      blockToInsert
      && currentDropContainer
      && editState.dropPlaceholder
      && editState.dropPlaceholder.parentNode === currentDropContainer
    ) {
      if (editState.draggedPanelBlock?.dataset?.modified === 'true') {
        editState.draggedPanelBlock.dataset.modified = 'false';
      }
      currentDropContainer.insertBefore(blockToInsert, editState.dropPlaceholder);
      currentDropContainer.removeChild(editState.dropPlaceholder);
      editState.dropPlaceholder = null;
    }

    clearDragState();

    if (currentDropContainer) {
      enableMainReorder(currentDropContainer);
      attachSectionDeleteControls(currentDropContainer);
    }

    teardownPointerListeners();
  };

  function enablePanelDragAndDrop(sourcePanel, targetPanel) {
    sourcePanel.querySelectorAll('div[data-source="figma"]:not([data-placeholder])').forEach((block) => {
      if (block.querySelector('.broken-placeholder')) {
        block.closest('.section').classList.add('do-not-drag');
        return;
      }
      block.classList.add('figma-panel-block');
      block.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        editState.draggedPanelBlock = block;
        editState.draggedMainBlock = null;
        editState.currentDropContainer = targetPanel;
        block.classList.add('is-dragging');

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
      });
    });
  }

  return {
    enableMainReorder,
    enablePanelDragAndDrop,
  };
}
