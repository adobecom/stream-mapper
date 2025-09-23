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
