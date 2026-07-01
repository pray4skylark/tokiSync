/**
 * SubscriptionManager for TokiSync
 * Manages remote parser rule subscriptions stored in GM storage.
 * Subscribed rules are merged into TOKI_PARSER_RULES with _subscribed marker.
 */

import { RuleManager } from './RuleManager.js';
import { CFG_RULE_SUBSCRIPTIONS } from '../config.js';

const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24h

export class SubscriptionManager {

    static getSubscriptions() {
        if (typeof GM_getValue === 'undefined') return [];
        const raw = GM_getValue(CFG_RULE_SUBSCRIPTIONS, '[]');
        try { return JSON.parse(raw) || []; } catch (e) { return []; }
    }

    static saveSubscriptions(subs) {
        if (typeof GM_setValue === 'undefined') return;
        GM_setValue(CFG_RULE_SUBSCRIPTIONS, JSON.stringify(subs, null, 2));
    }

    static addSubscription(url, name) {
        const subs = this.getSubscriptions();
        if (subs.some(s => s.url === url)) return { ok: false, reason: '이미 등록된 URL입니다' };
        subs.push({ url, name, enabled: true, lastFetched: null, etag: null, lastModified: null });
        this.saveSubscriptions(subs);
        return { ok: true };
    }

    static removeSubscription(url) {
        const subs = this.getSubscriptions().filter(s => s.url !== url);
        this.saveSubscriptions(subs);
        // Remove rules that came from this subscription
        const rules = RuleManager.getParserRules();
        const filtered = rules.filter(r => r._subscribed !== url);
        RuleManager.saveParserRules(filtered);
    }

    static async fetchSingle(sub) {
        const url = sub.url;
        return new Promise((resolve, reject) => {
            const headers = {};
            if (sub.etag) headers['If-None-Match'] = sub.etag;
            if (sub.lastModified) headers['If-Modified-Since'] = sub.lastModified;

            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers,
                timeout: 15000,
                onload: (res) => {
                    if (res.status === 304) {
                        resolve({ status: 'unchanged' });
                        return;
                    }
                    if (res.status < 200 || res.status >= 300) {
                        reject(new Error(`HTTP ${res.status}`));
                        return;
                    }
                    try {
                        const parsed = JSON.parse(res.responseText);
                        const rules = Array.isArray(parsed) ? parsed : (parsed.rules || []);
                        if (!Array.isArray(rules) || rules.length === 0) {
                            reject(new Error('유효한 규칙이 없습니다'));
                            return;
                        }
                        // Get response headers for caching
                        const etag = (res.responseHeaders.match(/etag:\s*([^\r\n]+)/i) || [])[1]?.trim() || null;
                        const lastModified = (res.responseHeaders.match(/last-modified:\s*([^\r\n]+)/i) || [])[1]?.trim() || null;

                        resolve({ status: 'updated', rules, etag, lastModified });
                    } catch (e) {
                        reject(new Error('JSON 파싱 실패'));
                    }
                },
                onerror: () => reject(new Error('네트워크 오류')),
                ontimeout: () => reject(new Error('타임아웃'))
            });
        });
    }

    static async checkAll() {
        const subs = this.getSubscriptions();
        const results = [];

        for (const sub of subs) {
            if (!sub.enabled) continue;

            // Skip if checked within 24h
            if (sub.lastFetched && (Date.now() - sub.lastFetched) < CHECK_INTERVAL) {
                results.push({ url: sub.url, status: 'skipped' });
                continue;
            }

            try {
                const result = await this.fetchSingle(sub);

                if (result.status === 'unchanged') {
                    sub.lastFetched = Date.now();
                    results.push({ url: sub.url, status: 'unchanged' });
                } else {
                    // Merge into TOKI_PARSER_RULES
                    this.mergeRules(result.rules, sub.url);
                    sub.lastFetched = Date.now();
                    sub.etag = result.etag || sub.etag;
                    sub.lastModified = result.lastModified || sub.lastModified;
                    results.push({ url: sub.url, status: 'updated', count: result.rules.length });
                }
            } catch (err) {
                sub.lastFetched = Date.now() - 86400000 + 300000; // 5min cooldown instead of 24h
                results.push({ url: sub.url, status: 'error', error: err.message });
            }
        }

        this.saveSubscriptions(subs);
        return results;
    }

    static mergeRules(remoteRules, sourceUrl) {
        const current = RuleManager.getParserRules();
        const version = RuleManager._version;
        let added = 0, updated = 0, skipped = 0;

        remoteRules.forEach(remote => {
            if (!remote.id) { skipped++; return; }
            // Ensure _version on incoming rules
            if (!remote._version) remote._version = version;
            remote._subscribed = sourceUrl;

            const idx = current.findIndex(r => r.id === remote.id);
            if (idx === -1) {
                current.push(remote);
                added++;
            } else {
                const existing = current[idx];
                if (existing._subscribed === sourceUrl || !existing._subscribed) {
                    current[idx] = remote;
                    updated++;
                } else {
                    skipped++;
                }
            }
        });

        RuleManager.saveParserRules(current);
        return { added, updated, skipped };
    }

    static async checkOnce() {
        // Called on page load — runs silently in background
        try {
            const results = await this.checkAll();
            const updated = results.filter(r => r.status === 'updated');
            const errors = results.filter(r => r.status === 'error');
            if (updated.length > 0) {
                console.log(`[Subscription] ${updated.length}개 구독 업데이트 완료`);
            }
            if (errors.length > 0) {
                console.warn(`[Subscription] ${errors.length}개 구독 실패:`, errors.map(e => e.error));
            }
        } catch (e) {
            console.warn('[Subscription] 체크 중 오류:', e);
        }
    }
}
