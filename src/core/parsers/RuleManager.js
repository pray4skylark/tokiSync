import { CFG_PARSER_RULES } from '../config.js';

/**
 * RuleManager
 * Manages parsing rules from built-in templates and user definitions.
 */
export class RuleManager {
    // Built-in sample rules as fallback/templates (Offline Seeding)
    static #builtInRules = [
        {
            id: "toki_common",
            name: "토끼 계열 (뉴토끼/마나토끼) 통합 규칙",
            urlPattern: ".*(newtoki|manatoki|comic|booktoki).*",
            category: "Webtoon",
            meta: {
                title: "meta[name=\"subject\"]",
                author: ".view-content",
                thumb: {
                    selector: "img[itemprop=\"image\"]",
                    attr: "src"
                }
            },
            list: {
                container: ".list-body",
                item: "li",
                num: "span.no",
                title: "a",
                link: {
                    selector: "a",
                    attr: "href"
                }
            },
            viewer: {
                fetchMethod: "iframe",
                imageRegex: "https?:\\\\/\\\\/[a-zA-Z0-9_\\\\.\\\\/-]+\\\\.(?:jpg|png|webp|gif)",
                imageContainer: "div.view-padding, div.viewer",
                imageItem: "img",
                lazyAttrOptions: [
                    "data-src",
                    "data-lazy",
                    "src"
                ]
            }
        }
    ];

    /**
     * Get all merged rules: Custom > Built-in
     * @returns {Promise<Array>}
     */
    static async getRules() {
        let parserRules = this.getParserRules();

        // 최초 구동 시 (파서 규칙이 완전히 비어있는 경우) 내장 샘플 규칙을 자동으로 스토리지에 주입(Seed)
        if (parserRules.length === 0) {
            console.log("[RuleManager] 🚀 초기 구동 감지 -> 정적 기본 샘플 규칙을 TOKI_PARSER_RULES에 이식(Seed)합니다.");
            parserRules = [...this.#builtInRules];
            this.saveParserRules(parserRules);
        }

        return parserRules;
    }

    /**
     * Get only custom/parser rules from GM storage
     */
    static getParserRules() {
        if (typeof GM_getValue === 'undefined') return [];
        const str = GM_getValue(CFG_PARSER_RULES, '[]');
        try {
            return JSON.parse(str) || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Save parser rules to GM storage
     */
    static saveParserRules(rules) {
        if (typeof GM_setValue === 'undefined') return;
        GM_setValue(CFG_PARSER_RULES, JSON.stringify(rules, null, 2));
    }

    /**
     * Add a new rule
     */
    static addRule(rule) {
        const rules = this.getParserRules();
        if (rules.find(r => r.id === rule.id)) return false;
        rules.push(rule);
        this.saveParserRules(rules);
        return true;
    }

    /**
     * Update an existing rule
     */
    static updateRule(id, updatedRule) {
        const rules = this.getParserRules();
        const idx = rules.findIndex(r => r.id === id);
        if (idx === -1) return false;
        rules[idx] = updatedRule;
        this.saveParserRules(rules);
        return true;
    }

    /**
     * Delete a rule
     */
    static deleteRule(id) {
        const rules = this.getParserRules();
        const filtered = rules.filter(r => r.id !== id);
        this.saveParserRules(filtered);
        return true;
    }

    /**
     * Bulk import rules
     */
    static bulkImport(newRules, mode = 'merge') {
        const current = this.getParserRules();
        let imported = 0, updated = 0, skipped = 0;

        newRules.forEach(rule => {
            if (!rule.id) { skipped++; return; }
            const idx = current.findIndex(r => r.id === rule.id);
            if (idx === -1) {
                current.push(rule);
                imported++;
            } else if (mode === 'overwrite') {
                current[idx] = rule;
                updated++;
            } else {
                skipped++;
            }
        });

        this.saveParserRules(current);
        return { imported, updated, skipped };
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
