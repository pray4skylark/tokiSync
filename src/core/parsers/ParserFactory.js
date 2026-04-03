import { TokiParser } from './TokiParser.js';
import { detectSite } from '../detector.js';

export class ParserFactory {
    static #instance = null;

    /**
     * Get the appropriate parser for the current site (Singleton)
     * @returns {BaseParser|null}
     */
    static getParser() {
        if (this.#instance) return this.#instance;

        const siteInfo = detectSite();
        if (!siteInfo) {
            console.error('[ParserFactory] Failed to detect site');
            return null;
        }

        const { site, protocolDomain } = siteInfo;

        // Currently, ManaToki, NewToki, and BookToki all use the same structure
        if (site === '마나토끼' || site === '뉴토끼' || site === '북토끼') {
            this.#instance = new TokiParser(protocolDomain);
            return this.#instance;
        }

        // Future GenericParser or other site-specific parsers can be added here
        return null;
    }
}

