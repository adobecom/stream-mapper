export function handleComponents(el, value, mappingConfig) {
  switch (mappingConfig.type) {
    case 'text':
      handleTextComponent({ el, selector: mappingConfig.selector, value });
      break;
    case 'image':
      handleImageComponent({ el, selector: mappingConfig.selector, value });
      break;
    case 'container':
      handleContainerComponent({ el, selector: mappingConfig.selector, value });
      break;
    default:
      break
  }
  return true;
}

function handleTextComponent({ el, value, selector }) {
  const textEl = el.querySelector(selector);
  if (!value) return textEl.classList.add('to-remove');
  textEl.innerHTML = value;
}

function handleImageComponent({ el, value, selector }) {
  const picEl = el.querySelector(selector);
  if (!value) return picEl.classList.add('to-remove');
  picEl.querySelector('img').src = value;
}

function handleContainerComponent({ el, value, selector }) {
  const containerEl = el.querySelector(selector);
  if (!value) return containerEl.classList.add('to-remove');
  containerEl.innerHTML = '';
}