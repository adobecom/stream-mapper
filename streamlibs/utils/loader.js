import {
  LOADER_MSG_LIST,
  LOADER_PROGRESS_EVENT,
  LOADER_PROGRESS_STEPS,
  LOADER_STEP_MESSAGES,
  getBlocksCreationMessage,
} from './constants.js';

let loaderPercentage = LOADER_PROGRESS_STEPS.START;
let loaderMessage = LOADER_STEP_MESSAGES.INITIAL;
let isListenerAttached = false;

function getLoaderElements() {
  return {
    messageArea: document.querySelector('#loader-content'),
    progressArea: document.querySelector('#loader-progress'),
    progressFill: document.querySelector('#loader-progress-fill'),
    container: document.querySelector('#loader-container'),
  };
}

function normalizePercentage(percentage) {
  if (typeof percentage !== 'number' || Number.isNaN(percentage)) return LOADER_PROGRESS_STEPS.START;
  return Math.max(0, Math.min(100, Math.round(percentage)));
}

function renderLoader() {
  const {
    messageArea, progressArea, progressFill, container,
  } = getLoaderElements();
  if (!container || !messageArea) return;

  const fallbackMessage = LOADER_MSG_LIST[Math.floor(Math.random() * LOADER_MSG_LIST.length)];
  messageArea.textContent = loaderMessage || fallbackMessage;
  if (progressArea) progressArea.textContent = `${loaderPercentage}%`;
  if (progressFill) {
    progressFill.style.width = `${loaderPercentage}%`;
    progressFill.setAttribute('aria-valuenow', `${loaderPercentage}`);
  }

  container.style.display = 'flex';
  container.classList.add('is-visible');
}

function onLoaderProgressEvent(event) {
  const detail = event?.detail || {};
  if (typeof detail.percentage === 'number') loaderPercentage = normalizePercentage(detail.percentage);
  if (detail.message) loaderMessage = detail.message;
  renderLoader();
}

export function emitLoaderProgress(percentage, message) {
  window.dispatchEvent(new CustomEvent(LOADER_PROGRESS_EVENT, {
    detail: { percentage, message },
  }));
}

export function notifyParentPreviewInteractive(ready) {
  try {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({ type: 'STREAM_PREVIEW_INTERACTIVE', ready: !!ready }, '*');
  } catch {
    /* cross-origin or detached */
  }
}

export function initializeLoader() {
  if (!isListenerAttached) {
    window.addEventListener(LOADER_PROGRESS_EVENT, onLoaderProgressEvent);
    isListenerAttached = true;
  }
  loaderPercentage = LOADER_PROGRESS_STEPS.START;
  loaderMessage = LOADER_STEP_MESSAGES.INITIAL;
  renderLoader();
  notifyParentPreviewInteractive(false);
}

export function updateLoader({ percentage, message } = {}) {
  if (typeof percentage === 'number') loaderPercentage = normalizePercentage(percentage);
  if (message) loaderMessage = message;
  renderLoader();
}

export function hideLoader() {
  const { container } = getLoaderElements();
  if (!container) {
    notifyParentPreviewInteractive(true);
    return;
  }
  container.style.display = 'none';
  container.classList.remove('is-visible');
  notifyParentPreviewInteractive(true);
}

export function createFigmaLoaderReporter() {
  let mappingProgressInterval = null;
  let mappingProgress = LOADER_PROGRESS_STEPS.START;

  const stopMappingTimer = () => {
    if (mappingProgressInterval) {
      window.clearInterval(mappingProgressInterval);
      mappingProgressInterval = null;
    }
  };

  const setMappingProgress = (value) => {
    mappingProgress = Math.max(
      mappingProgress,
      Math.min(LOADER_PROGRESS_STEPS.FIGMA_DESIGN_DONE, Math.round(value)),
    );
    emitLoaderProgress(mappingProgress, LOADER_STEP_MESSAGES.FIGMA_DESIGN_LOADING);
  };

  return {
    startDesignLoading() {
      emitLoaderProgress(LOADER_PROGRESS_STEPS.START, LOADER_STEP_MESSAGES.FIGMA_DESIGN_LOADING);
      mappingProgressInterval = window.setInterval(() => {
        if (mappingProgress < LOADER_PROGRESS_STEPS.FIGMA_DESIGN_DONE) {
          setMappingProgress(mappingProgress + 1);
        }
      }, 1000);
    },
    completeDesignLoading() {
      stopMappingTimer();
      setMappingProgress(LOADER_PROGRESS_STEPS.FIGMA_DESIGN_DONE);
      emitLoaderProgress(LOADER_PROGRESS_STEPS.FIGMA_DESIGN_DONE, LOADER_STEP_MESSAGES.FIGMA_DESIGN_LOADED);
    },
    markNoComponents() {
      emitLoaderProgress(LOADER_PROGRESS_STEPS.BLOCKS_DONE, LOADER_STEP_MESSAGES.NO_COMPONENTS);
    },
    markNoBlocks() {
      emitLoaderProgress(LOADER_PROGRESS_STEPS.BLOCKS_DONE, LOADER_STEP_MESSAGES.NO_BLOCKS);
    },
    createBlocksTracker(totalDetailsCalls) {
      let detailsResponses = 0;
      const hasDetailCalls = totalDetailsCalls > 0;
      const detailRange = LOADER_PROGRESS_STEPS.BLOCKS_DONE - LOADER_PROGRESS_STEPS.BLOCKS_START;
      const detailIncrement = hasDetailCalls ? (detailRange / totalDetailsCalls) : detailRange;

      return {
        markDetailResponse() {
          if (!hasDetailCalls) {
            emitLoaderProgress(LOADER_PROGRESS_STEPS.BLOCKS_DONE, LOADER_STEP_MESSAGES.NO_BLOCKS);
            return;
          }

          detailsResponses += 1;
          const nextProgress = Math.min(
            LOADER_PROGRESS_STEPS.BLOCKS_DONE,
            LOADER_PROGRESS_STEPS.BLOCKS_START + (detailsResponses * detailIncrement),
          );
          emitLoaderProgress(nextProgress, getBlocksCreationMessage(detailsResponses, totalDetailsCalls));
        },
      };
    },
  };
}
