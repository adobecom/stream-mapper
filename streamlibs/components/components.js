export function handleComponents(componentType, el, selector, value) {
  switch (componentType) { 
    case 'text':
      handleTextComponent(el, selector, value);
      break;
    case 'image':
      handleImageComponent(el, selector, value);
      break;
    case 'container':
      handleContainerComponent(el, selector, value);
      break;
    default:
      console.warn(`Unknown mapping type: ${componentType}`);
  }
}

function handleTextComponent(el, selector, value) {
  const textEl = el.querySelector(selector);
  if (!value) return textEl.remove();
  textEl.innerHTML = value;
}

function handleImageComponent(el, selector, value) {
  const picEl = el.querySelector(selector);
  if (!value) return picEl.remove();
  picEl.querySelector('img').src = value;
}

function handleContainerComponent(el, selector, value) {
  const containerEl = el.querySelector(selector);
  if (!value) return containerEl.remove();
  containerEl.innerHTML = '';
}