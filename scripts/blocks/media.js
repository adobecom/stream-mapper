export function mapMediaContent(blockContent, figContent) {
    blockContent.classList.remove('small');
    const x = figContent?.details?.properties;

    if (!x) return;

    const ks = Object.keys(x);
    ks.forEach((k) => {
        switch(k) {
            case "layout":
                if (x.layout === 'image - copy') {
                    swapMediaDivs(blockContent);
                }
                break;
            case "foregroundImage":
                if (x.foregroundImage !== '') {
                    const img = blockContent.querySelector(':scope div div picture');
                    img.querySelector('img').src = x.foregroundImage;
                    img.querySelectorAll('div picture source').forEach((s) => {s.srcset = x.foregroundImage;});
                }
                break;
            case "detail":
                const detail = blockContent.querySelector(':scope div div p strong');
                if (x.detail !== '') {
                    detail.innerHTML = x.detail;
                } else {
                    detail.remove();
                }
            case "heading":
                const heading = blockContent.querySelector(':scope div h2');
                if (x.heading !== '') {
                    heading.innerHTML = x.heading;
                } else {
                    heading.remove();
                }
                break;
            case "body":
                const body = blockContent.querySelector(':scope div h2 + p');
                if (x.body !== '') {
                    body.innerHTML = x.body;
                } else {
                    body.remove();
                }
                break;
            case "action":
                const action = blockContent.querySelector(':scope strong a, :scope a strong');
                if (!x.action) action.remove();
                break;
            case "action2":
                const action2 = blockContent.querySelector(':scope em a, :scope a em');
                if (!x.action2) action2.remove();
                break;
            default:
                break;
        }
    });
}

function swapMediaDivs(blockContent) {  
    const innerDivs = blockContent.querySelectorAll(':scope div div');
    if (innerDivs.length != 2) return;
    
    // Swap elements
    const firstDiv = innerDivs[0];
    const secondDiv = innerDivs[1];
    
    firstDiv.parentNode.insertBefore(secondDiv, firstDiv);
}

export function changeMediaContent(html, blockEl, newContent) {
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
        case "thumbnail":
            const img = blockEl?.querySelector('img');
            if (img) {
              img.src = newContent["thumbnail"]["message"];
              const pic = img.closest('picture');
              pic.querySelectorAll("source").forEach((s) => s.srcset = newContent["thumbnail"]["message"]);
            }
            break;
        }
    });
    return html;
}
