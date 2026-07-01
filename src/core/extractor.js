import { waitForContent, scrollToLoad, sleep } from './utils.js';
import { logger } from './logger.js';
import { fetchNovelText } from './worker-controller.js';

/**
 * 뷰어 페이지(또는 팝업 워커) 내에서 직접 데이터를 추출하는 범용 모듈
 * 
 * @param {Document} targetDoc 대상 문서 객체 (현재 창의 document 또는 iframe 내부 document)
 * @param {Object} parser 선택된 사이트의 GenericParser 인스턴스
 * @param {Object} siteInfo 사이트 메타데이터 (category 등)
 * @param {boolean} isStaticDoc XHR로 가져온 정적 HTML인지 여부
 * @param {string} episodeUrl 에피소드 URL (API 복호화 폴백용)
 * @returns {Promise<Object>} 추출 결과 { urls: string[], content: string, title: string, episodeTitle: string }
 */
export async function extractEpisodeData(targetDoc, parser, siteInfo, isStaticDoc = false, episodeUrl = null) {
    const isNovel = (siteInfo.category === 'Novel' || siteInfo.category === 'novel');
    const viewerCfg = parser.rule.viewer || {};

    let extractedData = {
        urls: [],
        content: "",
        seriesTitle: "",
        episodeTitle: "",
        episodeNum: ""
    };

    // 1. 소설 텍스트 추출 로직
    if (isNovel) {
        extractedData.content = parser.getNovelContent(targetDoc);

        // [전략 B] DOM 추출 실패 + API 복호화 설정이 있는 경우 폴백 시도
        if (!extractedData.content && viewerCfg.decryptApi && episodeUrl) {
            logger.log('[Extractor] DOM 추출 실패 - API 복호화 폴백 시도...', 'Extractor');
            extractedData.content = await fetchNovelText(episodeUrl, viewerCfg.decryptApi);
            if (extractedData.content) {
                logger.log('✅ API 복호화 폴백 성공', 'Extractor');
            }
        }
    } 
    // 2. 웹툰 이미지 추출 로직
    else {
        // 초기 파싱 (정규식/DOM)
        const initialUrls = parser.getImageList(targetDoc);

        // 물리 스크롤 대기 (정적 문서는 스킵)
        if (!isStaticDoc && targetDoc.defaultView) {
            await scrollToLoad(targetDoc, 20000, viewerCfg);
        } else {
            console.log('[Extractor] 정적 문서이거나 Window 객체가 없어 스크롤을 건너뜁니다.');
        }

        // 스크롤 후 최종 파싱
        let finalUrls = isStaticDoc ? initialUrls : parser.getImageList(targetDoc);

        // Dummy(Placeholder) 우회 병합
        const mergedUrls = finalUrls.map((final, idx) => {
            const initial = initialUrls[idx];
            if (final.isDummy && initial && !initial.isDummy) {
                console.log(`[Extractor] Placeholder 우회: ${final.url.split('/').pop()} -> ${initial.url.split('/').pop()}`);
                return initial.url;
            }
            return final.url;
        }).filter(url => url !== "");

        logger.log(`[Extractor] 이미지 ${mergedUrls.length}개 감지`, 'Extractor');

        // 이미지 감지 0개 시 1.5초 대기 후 재시도
        if (mergedUrls.length === 0 && !isStaticDoc) {
            logger.warn('[Extractor] 이미지 0개 — 1.5초 후 재파싱 시도', 'Extractor');
            await sleep(1500);
            const retryUrls = parser.getImageList(targetDoc);
            if (retryUrls.length > 0) mergedUrls.push(...retryUrls.map(u => u.url).filter(u => u !== ""));
            logger.log(`[Extractor] 재파싱 결과: ${mergedUrls.length}개`, 'Extractor');
        }

        extractedData.urls = mergedUrls;
    }

    // 3. 메타데이터 (작품명, 에피소드 제목) 자체 추출 시도
    // 뷰어 페이지에서 직접 단건 실행하거나 팝업 워커일 경우를 대비함
    try {
        if (parser.getViewerMetadata) {
            const metadata = parser.getViewerMetadata(targetDoc);
            extractedData.seriesTitle = metadata.seriesTitle;
            extractedData.episodeTitle = metadata.episodeTitle;
            extractedData.episodeNum = metadata.episodeNum;
        }
    } catch (e) {
        console.warn("[Extractor] 뷰어 메타데이터 추출 실패:", e);
    }

    return extractedData;
}
