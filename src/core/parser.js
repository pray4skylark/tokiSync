export function getListItems() {
    const listBody = document.querySelector('.list-body');
    if (!listBody) {
        console.warn('[Parser] .list-body not found - unsupported page structure');
        return [];
    }
    return Array.from(listBody.querySelectorAll('li')).reverse();
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

    return imgLists.map(img => {
        try {
            const isDummyUrl = (url) => {
                if (!url) return true;
                if (url.startsWith('data:image')) return true;
                const lower = url.toLowerCase();
                return lower.includes('blank.gif') || lower.includes('loading.gif') || lower.includes('pixel.gif');
            };

            let foundUrl = null;

            // 1순위: 흔히 쓰이는 lazy-load data 속성
            const lazyAttrs = ['data-src', 'data-original', 'data-lazy', 'data-url', 'data-img'];
            for (const attr of lazyAttrs) {
                const val = img.getAttribute(attr);
                if (val) {
                    let absoluteUrl = "";
                    if (val.startsWith('/')) absoluteUrl = `${protocolDomain}${val}`;
                    else if (val.startsWith('http')) absoluteUrl = val;
                    
                    if (absoluteUrl && !isDummyUrl(absoluteUrl)) {
                        foundUrl = absoluteUrl;
                        break;
                    }
                }
            }

            // 2순위: src가 실제 이미지 URL인 경우
            if (!foundUrl) {
                const directSrc = img.src;
                if (directSrc && !isDummyUrl(directSrc)) {
                    foundUrl = directSrc;
                }
            }
            
            // 3순위: 전체 data-* 속성 순회
            if (!foundUrl) {
                for (const attr of img.attributes) {
                    if (attr.name.startsWith('data-')) {
                        const val = attr.value;
                        if (val && val.match(/\.(jpe?g|png|gif|webp)/i)) {
                            let absoluteUrl = "";
                            if (val.startsWith('/')) absoluteUrl = `${protocolDomain}${val}`;
                            else if (val.startsWith('http')) absoluteUrl = val;
                            
                            if (absoluteUrl && !isDummyUrl(absoluteUrl)) {
                                foundUrl = absoluteUrl;
                                break;
                            }
                        }
                    }
                }
            }
            
            // 4순위(폴백): outerHTML 정규식
            if (!foundUrl) {
                const match = img.outerHTML.match(/\/data[^"]+/);
                if (match) {
                    const absoluteUrl = `${protocolDomain}${match[0]}`;
                    if (!isDummyUrl(absoluteUrl)) foundUrl = absoluteUrl;
                }
            }

            return {
                url: foundUrl || img.src || "",
                isDummy: isDummyUrl(foundUrl || img.src)
            };
            
        } catch (e) {
            console.warn('Image src parse failed:', e);
            return { url: img.src || "", isDummy: true };
        }
    });
}

/**
 * Extract thumbnail URL from series detail page
 * @returns {string|null} Thumbnail URL or null if not found
 */
export function getThumbnailUrl() {
    // Target: <img itemprop="image" content="[ORIGINAL_URL]" src="[THUMB_URL]">
    const img = document.querySelector('img[itemprop="image"]');
    if (!img) {
        console.warn('[Parser] Thumbnail image not found');
        return null;
    }
    
    // Prefer 'content' attribute (original quality), fallback to 'src' (thumbnail)
    return img.getAttribute('content') || img.src;
}

/**
 * Extract Series Title from metadata
 * @returns {string|null} Series Title
 */
export function getSeriesTitle() {
    // 1. Try 'subject' meta tag (Cleanest, No site suffix)
    // <meta name="subject" content="파티피플 공명(인싸 공명)">
    const subjectMeta = document.querySelector('meta[name="subject"]');
    if (subjectMeta && subjectMeta.content) {
        return subjectMeta.content.trim();
    }

    // 2. Try diverse meta tags (Priority: OpenGraph > Standard > Twitter)
    const metaSelectors = [
        'meta[property="og:title"]',
        'meta[name="title"]',
        'meta[name="twitter:title"]'
    ];

    for (const selector of metaSelectors) {
        const metaTag = document.querySelector(selector);
        if (metaTag && metaTag.content) {
            let title = metaTag.content;
            // Remove site suffix " > 마나토끼 ..." or similar patterns
            const splitIndex = title.indexOf(' >');
            if (splitIndex > 0) {
                return title.substring(0, splitIndex).trim();
            }
            return title.trim();
        }
    }

    // 3. Try parse HTML content (broader search)
    // <div class="view-content"><span style="..."><b>Title</b></span></div>
    // Also check h1, strong, .view-title
    const viewContent = document.querySelectorAll('.view-content');
    for (const div of viewContent) {
        // Priority: b > strong > h1 > .view-title
        const titleEl = div.querySelector('b, strong, h1, .view-title');
        if (titleEl && titleEl.innerText.trim().length > 0) {
            return titleEl.innerText.trim();
        }
    }

    return null;
}

/**
 * [v1.7.0] Extract full series metadata for Phase 3 Persistence
 * @returns {Object} { author: string, status: string, summary: string }
 */
export function getSeriesMetadata() {
    const meta = {
        author: "",
        status: "연재중",
        summary: ""
    };

    try {
        // 1. Extract Author & Status from .view-content (ManaToki/BookToki common)
        const viewContent = document.querySelector('.view-content');
        if (viewContent) {
            const text = viewContent.innerText;
            
            // Regex for Author: "작가 : 이름", "저자 : 이름", "글작가 : 이름" 등 대응
            const authorMatch = text.match(/(?:작가|저자|글작가|글)\s*:\s*([^ \n\r,·/]+)/);
            if (authorMatch) meta.author = authorMatch[1].trim();

            // Regex for Status: "분류 : 연재중", "분류 : 완결"
            if (text.includes('완결')) meta.status = '완결';
            else if (text.includes('연재')) meta.status = '연재중';
        }

        // 2. Extract Summary (og:description or specific div)
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc && ogDesc.content) {
            meta.summary = ogDesc.content.trim();
        }
    } catch (e) {
        console.warn('[Parser] Metadata extraction failed:', e);
    }

    return meta;
}
