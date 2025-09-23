export function getDACompatibleHtml(html) {
    console.log('inside da get da compatible html');
    html = replacePictureWithImg(html);
    html = html.replaceAll('\n', '');
    html = html.replaceAll('"', "'");
    html = html.replaceAll('alt= ','');
    return html;
}

function replacePictureWithImg(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    doc.querySelectorAll('picture').forEach(picture => {
        const img = picture.querySelector('img');
        if (img) {
            const newImg = document.createElement('img');
            Array.from(img.attributes).forEach(attr => {
                newImg.setAttribute(attr.name, attr.value);
            });
            const wrapperP = document.createElement('p');
            wrapperP.appendChild(newImg);
            picture.replaceWith(wrapperP);
        }
    });

    return doc.body.innerHTML;
}

export async function postData(url, html, CONFIGS) {
    html = wrapHTMLForDA(html);
    try {
        const response = await fetch('https://admin.da.live/source/' + url + ".html", {
            method: "POST",
            headers: {
                "Authorization": `${CONFIGS.daToken}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({ data: html }) // Encoding data as application/x-www-form-urlencoded
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Response:', JSON.stringify(result));

        // Dispatch custom event for UI to handle
        const daContentPushedEvent = new CustomEvent('daContentPushed', {
            detail: {
                url: url,
                result: result,
                timestamp: new Date().toISOString()
            }
        });
        document.dispatchEvent(daContentPushedEvent);

        firePreviewRequest(url, CONFIGS);
        // window.open(result.source.editUrl, '_blank');
    } catch (error) {
        console.error("Error:", error);
    }
}

function firePreviewRequest(url, CONFIGS) {
    const parts = url.split('/');
    if (parts.length >= 3) {
        parts.splice(2, 0, 'main');
    }
    const updatedPath = parts.join('/');
    const response = fetch('https://admin.hlx.page/preview/' + updatedPath, {
        method: "POST",
        headers: {
            "Authorization": `${CONFIGS.daToken}`,
            "accept": "*/*"
        },
    });
}

function wrapHTMLForDA(html) {
    return "<body><header></header><main>" + html + "</main><footer></footer>";
}
