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

    // Extract valid Sources
    // [Fix] checkVisibility() 제거: 숨겨진 iframe(-9999px)에서 일부 환경이 전체를 "not visible"로
    // 판단해 이미지 전체 누락시키는 버그가 있었음 → 필터 없이 전체 수집
    // data-l44925d0f9f="src" style lazy loading
    // Regex fallback to find data-path
    
    return imgLists.map(img => {
        // [Fix] 시나리오 2: outerHTML 정규식(/data) 의존 제거
        // 우선순위: src 직접 → 주요 data-* 속성 → outerHTML 정규식 폴백
        try {
            // 1순위: src가 실제 이미지 URL인 경우 (이미 로드 완료)
            const directSrc = img.src;
            if (directSrc && !directSrc.includes('data:') && directSrc.startsWith('http')) {
                return directSrc;
            }
            
            // 2순위: 흔히 쓰이는 lazy-load data 속성
            const lazyAttrs = ['data-src', 'data-original', 'data-lazy', 'data-url', 'data-img'];
            for (const attr of lazyAttrs) {
                const val = img.getAttribute(attr);
                if (val && val.startsWith('/')) return `${protocolDomain}${val}`;
                if (val && val.startsWith('http')) return val;
            }
            
            // 3순위: 전체 data-* 속성을 순회해 경로로 보이는 값 추출
            for (const attr of img.attributes) {
                if (attr.name.startsWith('data-')) {
                    const val = attr.value;
                    if (val && val.match(/\.(jpe?g|png|gif|webp)/i)) {
                        if (val.startsWith('/')) return `${protocolDomain}${val}`;
                        if (val.startsWith('http')) return val;
                    }
                }
            }
            
            // 4순위(폴백): outerHTML 정규식 — 기존 방식 유지
            const match = img.outerHTML.match(/\/data[^"]+/);
            if (match) return `${protocolDomain}${match[0]}`;
            
        } catch (e) {
            console.warn('Image src parse failed:', e);
        }
        return null;
    }).filter(src => src !== null && !src.startsWith('data:image')); // Remove nulls and placeholder data URLs
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
