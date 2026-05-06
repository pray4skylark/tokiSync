import { CFG_CUSTOM_RULES } from '../config.js';

/**
 * RuleManager
 * Manages parsing rules from built-in templates and user custom definitions.
 */
export class RuleManager {
    // Built-in rules as fallback/templates
    static #builtInRules = [];

    /**
     * Get all merged rules: Custom > Built-in
     * @returns {Promise<Array>}
     */
    static async getRules() {
        let rules = [...this.#builtInRules];

        // 1. Load Custom Rules from GM storage
        if (typeof GM_getValue !== 'undefined') {
            const customStr = GM_getValue(CFG_CUSTOM_RULES, '[]');
            try {
                const customRules = JSON.parse(customStr);
                if (Array.isArray(customRules)) {
                    // Custom rules at the beginning to take precedence during matching
                    rules = [...customRules, ...rules];
                }
            } catch (e) {
                console.error('[RuleManager] Failed to parse custom rules:', e);
            }
        }

        return rules;
    }

    /**
     * Find a matching rule for the current URL
     * @param {string} url 
     * @returns {Promise<Object|null>}
     */
    static async matchRule(url) {
        const rules = await this.getRules();
        for (const rule of rules) {
            if (!rule.urlPattern) continue;
            try {
                const regex = new RegExp(rule.urlPattern, 'i');
                if (regex.test(url)) {
                    console.log(`[RuleManager] Matched rule: ${rule.name || rule.id}`);
                    return rule;
                }
            } catch (e) {
                console.warn(`[RuleManager] Invalid regex pattern: ${rule.urlPattern}`, e);
            }
        }
        return null;
    }
}
