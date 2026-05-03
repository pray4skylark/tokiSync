import { BaseParser } from './BaseParser.js';

export class TokiParser extends BaseParser {
    constructor(protocolDomain) {
        super(protocolDomain);
    }

    getListItems() {
        const listBody = document.querySelector('.list-body');
        if (listBody) {
            return Array.from(listBody.querySelectorAll('li')).reverse();
        }

        const novelEpisodeLinks = this._getNovelEpisodeLinks(document);
        if (novelEpisodeLinks.length > 0) {
            console.log(`[TokiParser] novel episode links detected: ${novelEpisodeLinks.length}`);
            return novelEpisodeLinks.reverse();
        }

        console.warn('[TokiParser] supported episode list not found');
        return [];
    }

    parseListItem(li) {
        // Extract Number
        const numEl = li.querySelector('.wr-num');
        const linkEl = li.matches && li.matches('a') ? li : li.querySelector('a');
        const hrefNum = this._extractEpisodeNumber(linkEl);
        const textNum = this._extractEpisodeNumberFromText((linkEl && linkEl.textContent) || li.textContent || '');
        const rawNum = numEl ? numEl.innerText.trim() : (hrefNum || textNum || "0");
        const num = rawNum.toString().padStart(4, '0');

        // Extract Title & Link
        let title = "Unknown";
        let src = "";
        
        if (linkEl) {
            // Clean title: Remove spans and fix redundant patterns
            const rawTitle = li.classList && li.classList.contains('list-body')
                ? linkEl.innerHTML
                : (linkEl.innerText || linkEl.textContent || linkEl.innerHTML);
            title = this._cleanEpisodeTitle(rawTitle, rawNum);
            src = linkEl.href;
        }

        return { num, title, src, element: li };
    }

    getNovelContent(iframeDocument) {
        const contentEl = iframeDocument.querySelector('#novel_content');
        if (contentEl) return contentEl.innerText;

        const fallback = this._getBestNovelTextContainer(iframeDocument);
        return fallback ? fallback.text : "";
    }

    _getNovelEpisodeLinks(rootDocument) {
        let pageUrl = null;
        try {
            pageUrl = new URL(rootDocument.location.href);
        } catch (e) {
            return [];
        }

        const seriesMatch = pageUrl.pathname.match(/^\/novel\/([0-9]+)/);
        if (!seriesMatch) return [];

        const seriesId = seriesMatch[1];
        const seen = new Set();
        const links = Array.from(rootDocument.querySelectorAll(`a[href*="/novel/${seriesId}/"]`));

        return links.filter((link) => {
            let hrefUrl = null;
            try {
                hrefUrl = new URL(link.href, pageUrl.origin);
            } catch (e) {
                return false;
            }

            if (hrefUrl.origin !== pageUrl.origin) return false;
            if (!hrefUrl.pathname.match(new RegExp(`^/novel/${seriesId}/[0-9]+/?$`))) return false;

            const text = (link.innerText || link.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text) return false;

            // Quick action links duplicate real episodes on ntk pages.
            if (/(?:부터|정주행|최신화)/.test(text)) return false;

            const key = hrefUrl.pathname.replace(/\/$/, '');
            if (seen.has(key)) return false;
            seen.add(key);

            return true;
        });
    }

    _extractEpisodeNumber(linkEl) {
        if (!linkEl || !linkEl.href) return null;
        try {
            const hrefUrl = new URL(linkEl.href);
            const match = hrefUrl.pathname.match(/^\/novel\/[0-9]+\/([0-9]+)\/?$/);
            return match ? match[1] : null;
        } catch (e) {
            return null;
        }
    }

    _extractEpisodeNumberFromText(text) {
        const match = (text || '').match(/([0-9]+)\s*화/);
        return match ? match[1] : null;
    }

    _cleanEpisodeTitle(rawTitle, num) {
        let title = (rawTitle || '')
            .replace(/<span[\s\S]*?<\/span>/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\bNEW\b/g, ' ')
            .replace(/[▶›→]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/(\d+)\s*-\s*(\1)/, '$1')
            .trim();

        title = title
            .replace(/\s*\d{2}\.\s*\d{2}\.\s*\d{2}\.?\s*$/g, '')
            .replace(/\s*\d{4}\.\s*\d{2}\.\s*\d{2}\.?\s*$/g, '')
            .replace(/\s*(방금|[0-9]+시간 전|[0-9]+분 전)\s*$/g, '')
            .trim();

        if (!title && num !== undefined && num !== null) {
            title = `${parseInt(num, 10)}화`;
        }

        return title || "Unknown";
    }

    _getBestNovelTextContainer(iframeDocument) {
        const selectors = [
            '.novel-content',
            '.novel_view',
            '.novel-view',
            '.episode-content',
            '.episode_view',
            '.viewer-content',
            '.reading-content',
            '.post-content',
            '.content-view',
            '.view-content',
            'article',
            'main'
        ];

        let best = null;
        for (const selector of selectors) {
            const candidates = Array.from(iframeDocument.querySelectorAll(selector));
            for (const candidate of candidates) {
                const text = this._extractCleanText(candidate);
                const anchorCount = candidate.querySelectorAll('a').length;
                const buttonCount = candidate.querySelectorAll('button').length;
                const score = text.length - (anchorCount * 80) - (buttonCount * 50);

                if (text.length > 100 && (!best || score > best.score)) {
                    best = { text, score };
                }
            }
        }

        if (best) return best;

        const bodyText = this._extractCleanText(iframeDocument.body, true);
        return bodyText.length > 100 ? { text: bodyText, score: bodyText.length } : null;
    }

    _extractCleanText(element, filterUiLines = false) {
        if (!element) return "";

        const clone = element.cloneNode(true);
        clone.querySelectorAll([
            'script',
            'style',
            'noscript',
            'nav',
            'header',
            'footer',
            'aside',
            'form',
            'button',
            'input',
            'textarea',
            '[class*="comment"]',
            '[id*="comment"]',
            '[class*="reply"]',
            '[id*="reply"]'
        ].join(',')).forEach((el) => el.remove());

        let text = (clone.innerText || clone.textContent || '')
            .replace(/\r/g, '')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        if (filterUiLines) {
            const uiLinePattern = /^(홈|웹툰|완결웹툰|만화|완결만화|소설|랭킹|이벤트|공지사항|자유게시판|즐겨찾기|최근본웹툰|로그인|회원가입|검색|댓글|목록|이전화|다음화|별점|평가|뉴토끼|뉴 토끼)$/;
            text = text
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line && !uiLinePattern.test(line))
                .join('\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        return text;
    }

    /**
     * [v1.7.2] 동적 LazyKey 탐지
     * 전략 A: 스크립트 내 data_attribute 선언 추출
     */
    _detectLazyKeyFromScript(iframeDoc) {
        try {
            const scripts = iframeDoc.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent || '';
                const match = text.match(/data_attribute\s*:\s*['"]([^'"]+)['"]/);
                if (match) {
                    console.log('[TokiParser] 스크립트에서 LazyKey 탐지:', match[1]);
                    return match[1];
                }
            }
        } catch (e) {
            console.warn('[TokiParser] LazyKey 스크립트 탐지 실패:', e);
        }
        return null;
    }

    /**
     * [v1.7.2] 동적 LazyKey 탐지
     * 전략 B: img 요소 속성 역추적
     */
    _detectLazyKeyFromImg(img) {
        if (!img || !img.attributes) return null;
        for (const attr of img.attributes) {
            if (!attr.name.startsWith('data-')) continue;
            const val = attr.value;
            // http로 시작하고 이미지 확장자를 가진 속성값 탐지
            if (val && val.startsWith('http') && /\.(jpe?g|png|webp)/i.test(val)) {
                const key = attr.name.replace('data-', '');
                console.log('[TokiParser] 이미지 요소에서 LazyKey 탐지:', key);
                return key;
            }
        }
        return null;
    }

    getImageList(iframeDocument) {
        // [v1.7.3] 컨테이너 선별: .view-padding이 여러 개인 경우 이미지가 가장 많은 것을 선택
        const containers = Array.from(iframeDocument.querySelectorAll('.view-padding'));
        let mainContainer = iframeDocument;
        
        if (containers.length > 0) {
            mainContainer = containers.reduce((prev, current) => {
                const prevCount = prev.querySelectorAll('img').length;
                const currCount = current.querySelectorAll('img').length;
                return (prevCount >= currCount) ? prev : current;
            });
            console.log(`[TokiParser] 주요 컨테이너 선택됨 (이미지 ${mainContainer.querySelectorAll('img').length}개)`);
        }

        // [v1.7.3] LazyKey 동적 탐지
        const firstImg = mainContainer.querySelector('div img');
        const lazyKey = this._detectLazyKeyFromScript(iframeDocument)
                     || (firstImg && this._detectLazyKeyFromImg(firstImg))
                     || null;

        // Select images in viewer (선택된 컨테이너 내에서만 검색)
        let imgLists = Array.from(mainContainer.querySelectorAll('div img'));

        return imgLists.map(img => {
            try {
                let foundUrl = null;

                // 1순위: 동적 탐지된 키 또는 흔히 쓰이는 속성
                const lazyAttrs = [
                    ...(lazyKey ? [`data-${lazyKey}`] : []),
                    'data-src', 'data-original', 'data-lazy', 'data-url', 'data-img'
                ];
                
                for (const attr of lazyAttrs) {
                    const val = img.getAttribute(attr);
                    if (val) {
                        let absoluteUrl = "";
                        if (val.startsWith('/')) absoluteUrl = `${this.protocolDomain}${val}`;
                        else if (val.startsWith('http')) absoluteUrl = val;
                        
                        if (absoluteUrl && !this.isDummyUrl(absoluteUrl)) {
                            foundUrl = absoluteUrl;
                            break;
                        }
                    }
                }

                // 2순위: src가 실제 이미지 URL인 경우
                if (!foundUrl) {
                    const directSrc = img.src;
                    if (directSrc && !this.isDummyUrl(directSrc)) {
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
                                if (val.startsWith('/')) absoluteUrl = `${this.protocolDomain}${val}`;
                                else if (val.startsWith('http')) absoluteUrl = val;
                                
                                if (absoluteUrl && !this.isDummyUrl(absoluteUrl)) {
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
                        const absoluteUrl = `${this.protocolDomain}${match[0]}`;
                        if (!this.isDummyUrl(absoluteUrl)) foundUrl = absoluteUrl;
                    }
                }

                return {
                    url: foundUrl || img.src || "",
                    isDummy: this.isDummyUrl(foundUrl || img.src)
                };
                
            } catch (e) {
                console.warn('[TokiParser] Image src parse failed:', e);
                return { url: img.src || "", isDummy: true };
            }
        });
    }

    getThumbnailUrl() {
        const img = document.querySelector('img[itemprop="image"]') || document.querySelector('.view-img img');
        if (!img) return null;
        return img.getAttribute('content') || img.src;
    }

    getSeriesTitle() {
        // [Refactor] Use metadata selectors or parse HTML content
        const subjectMeta = document.querySelector('meta[name="subject"]');
        if (subjectMeta && subjectMeta.content) {
            return subjectMeta.content.trim();
        }

        const metaSelectors = [
            'meta[property="og:title"]',
            'meta[name="title"]',
            'meta[name="twitter:title"]'
        ];

        for (const selector of metaSelectors) {
            const metaTag = document.querySelector(selector);
            if (metaTag && metaTag.content) {
                let title = metaTag.content;
                const splitIndex = title.indexOf(' >');
                if (splitIndex > 0) return title.substring(0, splitIndex).trim();
                return title.trim();
            }
        }

        const heading = document.querySelector('h1');
        if (heading && heading.innerText.trim().length > 0) {
            return heading.innerText.trim();
        }

        const viewContent = document.querySelectorAll('.view-content');
        for (const div of viewContent) {
            const titleEl = div.querySelector('b, strong, h1, .view-title');
            if (titleEl && titleEl.innerText.trim().length > 0) {
                return titleEl.innerText.trim();
            }
        }

        return null;
    }

    getSeriesMetadata() {
        const meta = {
            author: "",
            status: "연재중",
            summary: ""
        };

        try {
            const viewContent = document.querySelector('.view-content');
            if (viewContent) {
                const text = viewContent.innerText;
                const authorMatch = text.match(/(?:작가|저자|글작가|글)\s*:\s*([^ \n\r,·/]+)/);
                if (authorMatch) meta.author = authorMatch[1].trim();

                if (text.includes('완결')) meta.status = '완결';
                else if (text.includes('연재')) meta.status = '연재중';
            }

            const ogDesc = document.querySelector('meta[property="og:description"]');
            if (ogDesc && ogDesc.content) {
                meta.summary = ogDesc.content.trim();
            }
        } catch (e) {
            console.warn('[TokiParser] Metadata extraction failed:', e);
        }

        return meta;
    }
}
