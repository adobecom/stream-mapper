export function createAnnotationState() {
  return {
    store: { threads: [], easyEdits: [] },
    selectedElement: null,
    selectedElementPath: '',
    selectedElementRef: '',
    activeThreadId: '',
    activeMessageId: '',
    activeEditId: '',
    mediumEditorLoadPromise: null,
  };
}

export function createAnnotationUI() {
  return {
    mainEl: null,
    layerEl: null,
    popupEl: null,
    panelEl: null,
    panelListEl: null,
    inlineToggleEl: null,
    inlineCommentsToggleEl: null,
    inlineAssetsToggleEl: null,
    inlineMode: false,
    annotationMode: 'comments',
    mediumEditorInstance: null,
    editableElements: [],
    editableImages: [],
    inlineElementSnapshot: new Map(),
    inlineImageAltSnapshot: new Map(),
    inlineBlurHandlers: new Map(),
    inlineSelectedImageEl: null,
    inlineImageSelectHandler: null,
    inlineAltPopupEl: null,
    inlineAltOutsideClickHandler: null,
  };
}
