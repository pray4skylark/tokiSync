export function getListItems() {
    return Array.from(document.querySelector('.list-body').querySelectorAll('li')).reverse();
}

export function parseListItem(li) {
    // Extract Number
    const numEl = li.querySelector('.wr-num');
    const num = numEl ? numEl.innerText.trim().padStart(4, '0') : "0000";

    // Extract Title & Link
    const linkEl = li.querySelector('a');
    let title = "Unknown";
    let src = "";
    
    if (linkEl) {
        // Clean title: Remove spans and fix redundant patterns
        title = linkEl.innerHTML.replace(/<span[\s\S]*?\/span>/g, '')
            .replace(/\s+/g, ' ')               // Remove extra spaces
            .replace(/(\d+)\s*-\s*(\1)/, '$1')  // Fix "255 - 255" -> "255"
            .trim();
        src = linkEl.href;
    }

    return { num, title, src, element: li };
}

export function getNovelContent(iframeDocument) {
    const contentEl = iframeDocument.querySelector('#novel_content');
    return contentEl ? contentEl.innerText : "";
}

export function getImageList(iframeDocument, protocolDomain) {
    // Select images in viewer
    let imgLists = Array.from(iframeDocument.querySelectorAll('.view-padding div img'));

    // Filter visible images
    imgLists = imgLists.filter(img => img.checkVisibility());

    // Extract valid Sources
    // data-l44925d0f9f="src" style lazy loading
    // Regex fallback to find data-path
    
    return imgLists.map(img => {
        let src = img.outerHTML; // Fallback strategy from original code
        try {
            // Find data attribute containing path
            const match = src.match(/\/data[^"]+/);
            if (match) {
                // Prepend domain for CORS / absolute path
                return `${protocolDomain}${match[0]}`;
            }
        } catch (e) {
            console.warn("Image src parse failed:", e);
        }
        return null;
    }).filter(src => src !== null); // Remove nulls
}
