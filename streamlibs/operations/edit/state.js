export default function createEditState() {
  return {
    draggedPanelBlock: null,
    draggedMainBlock: null,
    dropPlaceholder: null,
    currentDropContainer: null,
    originalFigmaBlocks: [],
    originalDABlocks: [],
  };
}
