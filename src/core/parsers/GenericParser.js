import { BaseParser } from './BaseParser.js';

/**
 * GenericParser
 * A dynamic parser that uses JSON rules to extract data from the DOM.
 */
export class GenericParser extends BaseParser {
    /**
     * @param {string} protocolDomain 
     * @param {Object} rule - The matched JSON rule object
     */
    constructor(protocolDomain, rule) {
        super(protocolDomain);
        this.rule = rule;
    }

    /**
     * Helper to extract value from DOM based on rule config (String selector or { selector, attr })
     * @private
     */
    _extractValue(root, config) {
        if (!config || !root) return null;
        
        const selector = typeof config === 'string' ? config : config.selector;
        const attr = typeof config === 'object' ? config.attr : null;
        const regexStr = typeof config === 'object' ? config.regex : null;

        const el = root.querySelector(selector);
        if (!el) return null;

        let val = null;
        if (attr) {
            val = el.getAttribute(attr)?.trim() || null;
        } else {
            val = el.innerText?.trim() || el.textContent?.trim() || null;
        }

        if (val && regexStr) {
            try {
                const regex = new RegExp(regexStr, 'i');
                const match = val.match(regex);
                if (match) {
                    val = match[1] || match[0];
                } else {
                    val = null;
                }
            } catch (e) {
                console.warn(`[GenericParser] Invalid regex pattern: ${regexStr}`, e);
            }
        }

        return val;
    }

    /**
     * [v1.8.1] 동적 레이지 키 탐지 (Toki 등 보안 우회용)
     * @private
     */
    _detectDynamicKey(doc, config) {
        if (!config || !config.regex) return null;
        
        try {
            // 1. 스크립트 태그 우선 스캔 (성능 및 정확도 최적화)
            const scripts = doc.querySelectorAll('script');
            const regex = new RegExp(config.regex, 'i');
            
            for (const script of scripts) {
                const match = (script.textContent || "").match(regex);
                if (match) {
                    const key = match[1] || match[0];
                    console.log(`[GenericParser] 스크립트 내 동적 키 탐지 성공: ${key}`);
                    return key;
                }
            }
            
            // 2. 전체 HTML 스캔 (폴백)
            const html = doc.documentElement.innerHTML || "";
            const match = html.match(regex);
            if (match) {
                const key = match[1] || match[0];
                console.log(`[GenericParser] HTML 내 동적 키 탐지 성공: ${key}`);
                return key;
            }
        } catch (e) {
            console.warn('[GenericParser] 동적 키 탐지 중 오류 발생:', e);
        }
        return null;
    }

    /**
     * Extracts the Series ID based on JSON rule, with a robust fallback.
     */
    getSeriesId() {
        const ext = this.rule.idExtraction;
        if (ext) {
            if (ext.source === 'url' && ext.regex) {
                try {
                    const regex = new RegExp(ext.regex, 'i');
                    const match = document.URL.match(regex);
                    if (match) return match[1] || match[0];
                } catch(e) {
                    console.warn('[GenericParser] Invalid idExtraction regex', e);
                }
            } else if (ext.source === 'query' && ext.param) {
                const params = new URLSearchParams(window.location.search);
                const val = params.get(ext.param);
                if (val) return val;
            } else if (ext.source === 'dom' && ext.selector) {
                const el = document.querySelector(ext.selector);
                if (el) {
                    return ext.attr ? el.getAttribute(ext.attr) : el.innerText?.trim();
                }
            }
        }
        
        // Fallback: Dynamic Category-Aware Extraction
        const category = (this.rule.category || 'webtoon').toLowerCase();
        const categorySynonyms = {
            manga: ['manga', 'manhwa', 'comic', 'toon'],
            webtoon: ['webtoon', 'toon', 'comic', 'manga', 'manhwa'],
            novel: ['novel', 'book']
        };
        const targetWords = categorySynonyms[category] || [category];
        const dynamicPattern = new RegExp(`\\/(${targetWords.join('|')})\\/([a-zA-Z0-9_\\-]+)`, 'i');
        const idMatch = document.URL.match(dynamicPattern);
        let seriesId = idMatch ? idMatch[2] : null;
        if (!seriesId) {
            const params = new URLSearchParams(window.location.search);
            seriesId = params.get('id') || params.get('no') || params.get('comic_id') || params.get('toon');
        }
        return seriesId || "0000";
    }

    async getListItems() {
        const listCfg = this.rule.list || {};
        let container = document.querySelector(listCfg.container);
        
        // [v1.8.1] 동적 로딩(Next.js 등) 대응: 컨테이너가 나타날 때까지 대기
        if (!container) {
            console.log(`[GenericParser] 컨테이너(${listCfg.container}) 대기 중...`);
            container = await this.waitForSelector(listCfg.container, 5000);
        }

        if (!container) {
            console.warn(`[GenericParser] Container not found: ${listCfg.container}`);
            return [];
        }

        const items = Array.from(container.querySelectorAll(listCfg.item));
        // Reverse if it's a typical episode list where latest is on top but we need chronological for some logic?
        // Actually, TokiParser reverses. Let's check if we should always reverse.
        // For now, return as is.
        return items;
    }

    parseListItem(el) {
        const listCfg = this.rule.list || {};
        const numRaw = this._extractValue(el, listCfg.num) || "0";
        const subRaw = this._extractValue(el, listCfg.sub) || "";
        const title = this._extractValue(el, listCfg.title) || "Unknown";
        const src = this._extractValue(el, listCfg.link) || "";

        // Extract numbers only for zero padding, if possible
        let num = numRaw;
        const match = numRaw.match(/(\d+)/);
        if (match) {
            num = match[1];
        }

        if (subRaw) {
            num = `${num}_${subRaw}`;
        }

        return {
            num: num,
            title: title,
            src: this.getAbsoluteUrl(src),
            element: el
        };
    }

    getNovelContent(iframeDocument) {
        const viewerCfg = this.rule.viewer || {};
        const selector = viewerCfg.novelContent || 'body';
        const el = iframeDocument.querySelector(selector);
        return el ? el.innerText : "";
    }

    getImageList(iframeDocument) {
        const viewerCfg = this.rule.viewer || {};

        // [v1.8.1] 동적 키 탐지 수행
        let dynamicLazyAttr = null;
        if (viewerCfg.keyDiscovery) {
            const key = this._detectDynamicKey(iframeDocument, viewerCfg.keyDiscovery);
            if (key) {
                dynamicLazyAttr = (viewerCfg.keyDiscovery.prefix || 'data-') + key;
            }
        }

        // 1. 헤드리스(Headless) 정규식 추출 지원 (Next.js 페이로드 등 DOM 미렌더링 대응)
        if (viewerCfg.imageRegex) {
            const html = iframeDocument.documentElement.innerHTML || iframeDocument.body.innerHTML;
            const regex = new RegExp(viewerCfg.imageRegex, 'g');
            const urls = [];
            let match;
            
            while ((match = regex.exec(html)) !== null) {
                // 캡처 그룹이 있으면 그것을, 없으면 전체 매치(match[0])를 사용
                let url = match[1] || match[0];
                url = url.replace(/\\/g, ''); // 불필요한 이스케이프 백슬래시(\) 제거
                
                if (!this.isDummyUrl(url)) {
                    urls.push(this.getAbsoluteUrl(url));
                }
            }
            
            // 중복 제거 후 리턴 (정규식 특성상 중복 캡처 가능성 높음)
            const uniqueUrls = Array.from(new Set(urls));
            if (uniqueUrls.length > 0) {
                console.log(`[GenericParser] Regex 기반 이미지 추출 성공: ${uniqueUrls.length}개 발견`);
                return uniqueUrls.map(url => ({ url, isDummy: false }));
            } else {
                console.warn(`[GenericParser] Regex 설정이 있으나 매칭되는 이미지를 찾지 못했습니다.`);
            }
        }

        // 2. DOM 기반 추출 (기본)
        let container = iframeDocument;
        if (viewerCfg.imageContainer) {
            container = iframeDocument.querySelector(viewerCfg.imageContainer);
            if (!container) {
                console.warn(`[GenericParser] 지정된 imageContainer(${viewerCfg.imageContainer})를 DOM에서 찾지 못했습니다.`);
                return [];
            }
        }

        // [v1.9.5] 광고 및 불필요 요소 제거 (exclude / remove)
        const excludeRule = viewerCfg.exclude || viewerCfg.remove;
        if (excludeRule) {
            const excludeSelectors = Array.isArray(excludeRule) ? excludeRule : [excludeRule];
            for (const selector of excludeSelectors) {
                try {
                    const targets = container.querySelectorAll(selector);
                    targets.forEach(el => el.remove());
                } catch (e) {
                    console.warn(`[GenericParser] 요소 제거 실패 (셀렉터: ${selector}):`, e);
                }
            }
        }

        const imgs = Array.from(container.querySelectorAll(viewerCfg.imageItem || 'img'));

        return imgs.map(img => {
            let foundUrl = null;
            // [v1.8.1] 동적 키가 발견되면 최우선 순위로 설정하여 탐지 성공률 극대화
            const lazyAttrs = [
                ...(dynamicLazyAttr ? [dynamicLazyAttr] : []),
                ...(viewerCfg.lazyAttrOptions || ['data-src', 'data-lazy', 'src'])
            ];

            for (const attr of lazyAttrs) {
                const val = img.getAttribute(attr);
                if (val) {
                    const absoluteUrl = this.getAbsoluteUrl(val);
                    if (absoluteUrl && !this.isDummyUrl(absoluteUrl)) {
                        foundUrl = absoluteUrl;
                        break;
                    }
                }
            }

            const finalUrl = foundUrl || this.getAbsoluteUrl(img.src) || "";
            return {
                url: finalUrl,
                isDummy: this.isDummyUrl(finalUrl)
            };
        });
    }

    getThumbnailUrl() {
        const meta = this.rule.meta || {};
        const thumb = this._extractValue(document, meta.thumb);
        return thumb ? this.getAbsoluteUrl(thumb) : null;
    }

    getSeriesTitle() {
        const meta = this.rule.meta || {};
        return this._extractValue(document, meta.title);
    }

    getSeriesMetadata() {
        const meta = this.rule.meta || {};
        return {
            author: this._extractValue(document, meta.author) || "",
            status: this._extractValue(document, meta.status) || "연재중",
            summary: this._extractValue(document, meta.summary) || "",
            vendor: (this.rule.name || "").toLowerCase().replace(/[^a-z0-9]/g, '')
        };
    }

    getViewerMetadata(viewerDocument) {
        const viewerCfg = this.rule.viewer || {};
        
        let seriesTitle = this._extractValue(viewerDocument, viewerCfg.seriesTitle) || "UnknownSeries";
        let episodeTitle = this._extractValue(viewerDocument, viewerCfg.episodeTitle) || "UnknownEpisode";
        let episodeNum = this._extractValue(viewerDocument, viewerCfg.episodeNum) || "0000";

        // Clean up episodeNum
        const match = episodeNum.match(/(\d+)/);
        if (match) {
            episodeNum = match[1];
        }

        return {
            seriesTitle,
            episodeTitle,
            episodeNum
        };
    }
}
