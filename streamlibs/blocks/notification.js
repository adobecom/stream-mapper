export function mapNotificationContent(blockContent, figContent) {
    blockContent.classList.remove('space-between');
    const x = figContent?.details?.properties;
    if (!x) return;

    const ks = Object.keys(x);
    ks.forEach((k) => {
        switch(k) {
            case "background":
                if (!x.background.startsWith('http')) {
                    const p = blockContent.querySelector(':scope div div');
                    if (p) {
                      p.innerHTML = x.background;
                    }
                } else {
                    blockContent.querySelector('div picture img').src = x.background;
                }
                break;
            case "action":
                if (x.action && x.action.label){
                    if (blockContent.querySelector('em a, a em')) {
                        blockContent.querySelector('em a, a em').innerHTML = x.action.label;
                    }
                } else {
                    blockContent.querySelector('em a, a em').remove();
                }
                break;
            case "action2":
                if (x.action2 && x.action2.label){
                    if (blockContent.querySelector('a strong, strong a')) {
                        blockContent.querySelector('a strong, strong a').innerHTML = x.action2.label;
                    }
                } else {
                    blockContent.querySelector('a strong, strong a').remove();
                }
                break;
            case "justify":
                if (x.justify) {
                    if (x.justify.startsWith('space between')) {
                        blockContent.classList.add('space-between');
                    }
                }
                break;
            case "heading":
                blockContent.querySelector('h3').innerHTML = x.heading;
                break;
            case "body":
                blockContent.querySelector('h3 + p').innerHTML = x.body;
                break;
        }
    })

}
