export function mapTextContent(blockContent, figContent) {

    const x = figContent?.details?.properties;

    const ks = Object.keys(x);
    ks.forEach((k) => {
        switch(k) {
        case  "detail":
            const detail = blockContent.querySelector(':scope div div p');
            if (x.detail === '') detail.remove();
            else detail.innerHTML = x.detail;
            break;
        case 'heading':
            const heading = blockContent.querySelector(':scope h3');
            if (x.heading === '') heading.remove();
            else heading.innerHTML = x.heading;
            break;
        case 'body':
            const body = blockContent.querySelector(':scope h3 + p');
            if (x.body === '') body.remove();
            else body.innerHTML = x.body;
            break;
        case 'actions':
            const action = blockContent.querySelector(':scope em a, :scope a em').closest('p');
            if (!x.actions) {
                action.remove();
            }
        }
    });
    
}

export function changeTextContent(html, blockEl, newContent) {
    const ks = Object.keys(newContent);
    ks.forEach((k) => {
        switch(k) {
        case "heading":
            const h = blockEl?.querySelector('h1, h2, h3, h4, h5');
            if (h) h.innerText = newContent["heading"];
            break;
        case "body":
            const b = blockEl?.querySelector('h1 + p, h2 + p, h3 + p, h4 + p, h5 + p');
            if (b) b.innerText = newContent["body"];
            break;
        }
    });
    return html;
  }
