function handleTextComponent({ el, value, selector }) {
  const textEl = el.querySelector(selector);
  if (!value) return textEl.classList.add('to-remove');
  textEl.innerHTML = value;
  return textEl;
}

function handleImageComponent({ el, value, selector }) {
  const picEl = el.querySelector(selector);
  if (!value) return picEl.classList.add('to-remove');
  picEl.querySelector('img').src = value;
  return picEl;
}

function handleContainerComponent({ el, value, selector }) {
  const containerEl = el.querySelector(selector);
  if (!value) return containerEl.classList.add('to-remove');
  containerEl.innerHTML = '';
  return containerEl;
}

export function handleButtonComponent({ actionArea, buttonType, buttonText }) {
  if (buttonType.toLowerCase().includes('accent')) {
    actionArea.innerHTML += `<strong><a href='https://www.adobe.com'>${buttonText}</a></strong>`;
  } else if (buttonType.toLowerCase().includes('outline')) {
    actionArea.innerHTML += `<em><a href='https://www.adobe.com'>${buttonText}</a></em>`;
  } else {
    actionArea.innerHTML += `<a href='https://www.adobe.com'>${buttonText}</a>`;
  }
}

export function handleComponents(el, value, mappingConfig) {
  switch (mappingConfig.type) {
    case 'text':
      return handleTextComponent({ el, selector: mappingConfig.selector, value });
    case 'image':
      return handleImageComponent({ el, selector: mappingConfig.selector, value });
    case 'container':
      return handleContainerComponent({ el, selector: mappingConfig.selector, value });
    default:
      return null;
  }
}
