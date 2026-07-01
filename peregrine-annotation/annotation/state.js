export function createAnnotationState() {
  return {
    store: {
      threads: [],
      easyEdits: [],
      assets: [],
      localAssets: [],
    },
    selectedElement: null,
    selectedElementPath: '',
    selectedElementRef: '',
    activeThreadId: '',
    activeMessageId: '',
    activeEditId: '',
    latestSavedEditsUpdatedAt: null,
    latestSelfSavedEditsHash: '',
    latestSelfSavedEditsCount: 0,
    pendingRemoteEditsSnapshot: null,
    hasLoadedInitialEditsSnapshot: false,
    latestRemoteCollabSnapshot: null,
    floatingUiFrameId: null,
    threadTargetCache: new Map(),
    mainClickHandler: null,
    layerClickHandler: null,
    panelClickHandler: null,
    panelInputHandler: null,
    panelKeydownHandler: null,
    panelFocusoutHandler: null,
    panelChangeHandler: null,
    inlineAssetsToggleClickHandler: null,
    documentClickHandler: null,
    windowResizeHandler: null,
    mainScrollHandler: null,
    canvasRefreshBarClickHandler: null,
  };
}

export function createAnnotationUI() {
  return {
    mainEl: null,
    layerEl: null,
    popupEl: null,
    panelEl: null,
    panelListEl: null,
    canvasRefreshBarEl: null,
    inlineCommentsToggleEl: null,
    annotationMode: 'comments',
    assetSelectMode: false,
    assetSelectHandler: null,
    appliedAssets: new Map(),
  };
}
