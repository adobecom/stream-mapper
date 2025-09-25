export function handleComponents(el, value, mappingConfig) {
  switch (mappingConfig.type) { 
    case 'text':
      handleTextComponent({el, selector: mappingConfig.selector, value});
      break;
    case 'image':
      handleImageComponent({el, selector: mappingConfig.selector, value});
      break;
    case 'container':
      handleContainerComponent({el, selector: mappingConfig.selector, value});
      break;
    default:
      console.warn(`Unknown mapping type: ${componentType}`);
      return false;
  }
  return true;
}

function handleTextComponent({el, value, selector}) {
  const textEl = el.querySelector(selector);
  if (!value) return textEl.remove();
  textEl.innerHTML = value;
}

function handleImageComponent({el, value, selector}) {
  const picEl = el.querySelector(selector);
  if (!value) return picEl.remove();
  picEl.querySelector('img').src = value;
}

function handleContainerComponent({el, value, selector}) {
  const containerEl = el.querySelector(selector);
  if (!value) return containerEl.remove();
  containerEl.innerHTML = '';
}