import { GenericParser } from './GenericParser.js';
import { detectSite } from '../detector.js';

/**
 * ParserFactory
 * Creates and provides the appropriate parser for the current site.
 */
export class ParserFactory {
    static #instance = null;

    /**
     * Get the appropriate parser for the current site (Singleton)
     * @returns {Promise<BaseParser|null>}
     */
    static async getParser() {
        if (this.#instance) return this.#instance;

        const siteInfo = await detectSite();
        if (!siteInfo) {
            console.error('[ParserFactory] Failed to detect site');
            console.error('TokiSync 파서 에러: 매칭되는 파싱 룰이 없습니다. 사이트 업데이트 또는 수동 룰 추가가 필요합니다.');
            return null;
        }

        const { site, protocolDomain, matchedRule } = siteInfo;

        // Dynamic Generic Parser
        if (site === 'generic' && matchedRule) {
            this.#instance = new GenericParser(protocolDomain, matchedRule);
            return this.#instance;
        }

        return null;
    }

    /**
     * Clear the cached parser instance to force reload rules.
     */
    static clearCache() {
        this.#instance = null;
        console.log('[ParserFactory] Parser cache cleared.');
    }
}
