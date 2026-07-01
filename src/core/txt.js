/**
 * 소설 본문의 HTML 태그를 제거하고 가독성 좋게 줄바꿈을 문단 단위로 정제하는 함수
 */
function cleanNovelParagraphs(html) {
    if (!html) return "";

    // 1. HTML 태그를 줄바꿈 및 공백으로 치환
    let text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<(?:\/?(?:br|p|div|span|a|b|strong|i|em|u|font|img|style|script)(?:\s+[^>]*)?)>/gi, ''); // 나머지 HTML 태그 완전 제거

    // 2. HTML 엔티티 치환
    text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"');

    // 3. 각 줄의 좌우 공백 트리밍 및 유령 문자 정리
    text = text
        .split('\n')
        .map(line => line.trim())
        .join('\n');

    // 4. 3개 이상 과도한 연속 줄바꿈을 2개(\n\n, 빈 줄 1개)로 제한
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
}

import { EventBus, EVT } from './EventBus.js';

export class TxtBuilder {
    constructor() {
        this.content = "";
    }

    addChapter(title, textContent) {
        this.content += `\n\n=== ${title} ===\n\n`;
        this.content += cleanNovelParagraphs(textContent);
    }

    async build(metadata = {}) {
        try {
            // Return an object that duck-types JSZip's generateAsync
            return {
                generateAsync: async () => {
                    // Prepend metadata title at the top if available
                    let finalContent = this.content;
                    if (metadata.title) {
                        finalContent = `[ ${metadata.title} ]\n` + finalContent;
                    }
                    return new Blob([finalContent], { type: 'text/plain;charset=utf-8' });
                }
            };
        } catch (e) {
            EventBus.emit(EVT.LOG, { msg: `TXT 빌드 실패: ${e.message} (${metadata.title || 'unknown'})`, level: 'critical', tag: 'Builder:TXT' });
            throw e;
        }
    }
}
