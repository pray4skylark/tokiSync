/**
 * BaseParser (Abstract)
 * Provides common logic and defines interface for site-specific parsers.
 */
export class BaseParser {
    constructor(protocolDomain) {
        this.protocolDomain = protocolDomain;
    }

    /**
     * Common: Dummy image detection
     */
    isDummyUrl(url) {
        if (!url) return true;
        if (url.startsWith('data:image')) return true;
        const lower = url.toLowerCase();

        // 알려진 더미 파일명 패턴
        const dummyFilenames = [
            'blank.gif', 'loading.gif', 'loading-image.gif',
            'pixel.gif', 'spacer.gif', 'transparent.gif',
            '1x1.gif', 'dot.gif',
        ];
        if (dummyFilenames.some(p => lower.includes(p))) return true;

        // 경로 기반 패턴: /img/loading*, /img/placeholder*
        if (/\/img\/loading/.test(lower)) return true;
        if (/\/img\/placeholder/.test(lower)) return true;

        return false;
    }

    /**
     * Interface: Extract list elements (li or similar)
     * @returns {HTMLElement[]}
     */
    getListItems() {
        throw new Error('getListItems() must be implemented');
    }

    /**
     * Interface: Parse single list item into normalized object
     * @param {HTMLElement} element 
     * @returns {Object} { num, title, src, element }
     */
    parseListItem(element) {
        throw new Error('parseListItem() must be implemented');
    }

    /**
     * Interface: Extract novel content from iframe
     */
    getNovelContent(iframeDocument) {
        throw new Error('getNovelContent() must be implemented');
    }

    /**
     * Interface: Extract image list for webtoon/manga
     */
    getImageList(iframeDocument) {
        throw new Error('getImageList() must be implemented');
    }

    /**
     * Interface: Extract thumbnail URL
     */
    getThumbnailUrl() {
        throw new Error('getThumbnailUrl() must be implemented');
    }

    /**
     * Interface: Extract series title
     */
    getSeriesTitle() {
        throw new Error('getSeriesTitle() must be implemented');
    }

    /**
     * Interface: Extract series metadata
     */
    getSeriesMetadata() {
        throw new Error('getSeriesMetadata() must be implemented');
    }
    /**
     * Common: Generate unified folder name / series title
     * @param {string} seriesId - Unique ID from URL
     * @param {string} firstTitle - Title of first episode in list
     * @param {string} lastTitle - Title of last episode in list
     * @param {function} getCommonPrefixFn - Callback to calculate prefix
     * @returns {string} "[ID] Title"
     */
    getFormattedTitle(seriesId, firstTitle, lastTitle, getCommonPrefixFn) {
        let seriesTitle = this.getSeriesTitle();
        let formatted = "";

        if (seriesTitle) {
            formatted = `[${seriesId}] ${seriesTitle}`;
        } else {
            // Fallback Logic
            let listPrefixTitle = "";
            if (firstTitle && lastTitle && getCommonPrefixFn) {
                listPrefixTitle = getCommonPrefixFn(firstTitle, lastTitle);
            }

            if (listPrefixTitle && listPrefixTitle.length > 2) {
                formatted = `[${seriesId}] ${listPrefixTitle}`;
            } else if (firstTitle) {
                // Single item or distinct titles: fallback to regex or full title
                const cleanTitle = firstTitle.replace(/\s+\d+화$/, '').trim();
                formatted = `[${seriesId}] ${cleanTitle || firstTitle}`;
            } else {
                formatted = `[${seriesId}] Unknown Series`;
            }
        }

        // Final cleanup for filesystem compatibility
        return formatted.replace(/[<>:"/\\|?*]/g, '').trim();
    }
}
