/**
 * EventBus Listeners for TokiSync
 * Handles cross-layer events (UI → Core/Parser) that were previously direct imports.
 * This module is auto-loaded at startup via index.js.
 */

import { EventBus, EVT } from './EventBus.js';
import { ParserFactory } from './parsers/ParserFactory.js';

// ── Parser Verify (FormRuleEditor 🔍 button) ──
EventBus.on(EVT.PARSE_VERIFY, async ({ _requestId, targetId, rule, domain }) => {
    try {
        const { GenericParser } = await import('./parsers/GenericParser.js');
        const parser = new GenericParser(domain, rule);
        let msg = '';

        if (targetId === 'rule-meta-title') {
            const val = parser.getSeriesTitle();
            if (val) msg = `✓ 추출 성공: "${val}"`;
            else throw new Error('타이틀을 추출하지 못했습니다. 셀렉터가 틀렸거나 페이지에 없습니다.');
        }
        else if (targetId === 'rule-meta-author') {
            const val = parser.getSeriesMetadata().author;
            if (val) msg = `✓ 추출 성공: "${val}"`;
            else throw new Error('작가를 추출하지 못했습니다.');
        }
        else if (targetId === 'rule-meta-thumb-selector') {
            const val = parser.getThumbnailUrl();
            if (val) msg = `✓ 추출 성공: ${val}`;
            else throw new Error('썸네일 이미지 URL을 추출하지 못했습니다.');
        }
        else if (targetId === 'rule-list-container' || targetId === 'rule-list-item') {
            const items = await parser.getListItems();
            if (items && items.length > 0) msg = `✓ 검증 성공: 총 ${items.length}개의 회차 아이템 감지됨.`;
            else throw new Error('회차 아이템을 전혀 찾지 못했습니다. 목록 컨테이너나 아이템 셀렉터를 다시 확인하세요.');
        }
        else if (targetId === 'rule-list-num') {
            const items = await parser.getListItems();
            if (!items || items.length === 0) throw new Error('회차 목록(container/item)을 먼저 찾을 수 있어야 세부 필드를 검증할 수 있습니다.');
            const firstItem = parser.parseListItem(items[0].element || items[0]);
            if (firstItem.num !== undefined && firstItem.num !== null) msg = `✓ 첫 항목 회차 번호 파싱 성공: "${firstItem.num}"`;
            else throw new Error('회차 번호(num) 추출 실패.');
        }
        else if (targetId === 'rule-list-link-selector' || targetId === 'rule-list-title') {
            const items = await parser.getListItems();
            if (!items || items.length === 0) throw new Error('회차 목록(container/item)을 먼저 찾을 수 있어야 세부 필드를 검증할 수 있습니다.');
            const firstItem = parser.parseListItem(items[0].element || items[0]);
            if (targetId === 'rule-list-link-selector') {
                if (firstItem.src) msg = `✓ 첫 항목 링크: ${firstItem.src}`;
                else throw new Error('회차 링크(href) 추출 실패.');
            } else {
                if (firstItem.title) msg = `✓ 첫 항목 제목: "${firstItem.title}"`;
                else throw new Error('회차 제목(innerText) 추출 실패.');
            }
        }
        else if (targetId === 'rule-viewer-imageContainer' || targetId === 'rule-viewer-imageItem') {
            const isNovel = (rule.category === 'Novel' || rule.category === 'novel');
            if (isNovel) {
                const content = parser.getNovelContent(document);
                if (content && content.trim().length > 0) msg = `✓ 본문 텍스트 검증 성공: (총 ${content.trim().length}자 추출됨) -> "${content.trim().substring(0, 50)}..."`;
                else throw new Error('소설 본문 텍스트를 추출하지 못했습니다.');
            } else {
                const imgs = parser.getImageList(document);
                if (imgs && imgs.length > 0) msg = `✓ 뷰어 이미지 검증 성공: 총 ${imgs.length}개 이미지 감지됨 (첫 이미지: ${imgs[0].url || 'src없음'})`;
                else throw new Error('뷰어 내에서 이미지를 검출하지 못했습니다.');
            }
        }
        else if (targetId === 'rule-viewer-exclude') {
            if (!rule.viewer?.exclude) msg = 'ℹ 제외 셀렉터가 비어 있습니다.';
            else {
                const targets = document.querySelectorAll(rule.viewer.exclude);
                msg = `✓ 검증 완료: 총 ${targets.length}개의 제외 대상 요소를 매칭했습니다.`;
            }
        }

        EventBus.respond(EVT.PARSE_VERIFY, _requestId, { ok: true, data: { msg } });
    } catch (err) {
        EventBus.respond(EVT.PARSE_VERIFY, _requestId, { ok: false, error: err.message });
    }
});

// ── Parser Test (FormRuleEditor 🧪 button) ──
EventBus.on(EVT.PARSE_TEST, async ({ _requestId, url, rule, category }) => {
    try {
        const [{ GenericParser }, { extractEpisodeData }] = await Promise.all([
            import('./parsers/GenericParser.js'),
            import('./extractor.js')
        ]);
        const domain = new URL(url).origin;
        const parser = new GenericParser(domain, rule);
        const result = await extractEpisodeData(document, parser, { site: 'test', category: category || 'Webtoon' }, false);

        const html = `
            <div class="toki-text-success" style="font-weight:800;">성공! (Virtual Match)</div>
            <div>• 제목: <strong>${result.title || '미추출'}</strong></div>
            <div>• 총 에피소드 수: <strong>${result.urls?.length || (result.content ? '1 (Text)' : '0')}개</strong></div>
        `;
        EventBus.respond(EVT.PARSE_TEST, _requestId, { ok: true, data: { html } });
    } catch (e) {
        EventBus.respond(EVT.PARSE_TEST, _requestId, { ok: false, error: e.message });
    }
});

// ── Parser Cache Clear ──
EventBus.on(EVT.RULE_CACHE_CLEAR, () => {
    ParserFactory.clearCache();
});
