import { sleep, waitIframeLoad, saveFile, getCommonPrefix, scrollToLoad } from './utils.js';
import { ParserFactory } from './parsers/ParserFactory.js';
import { detectSite } from './detector.js';
import { EpubBuilder } from './epub.js';
import { CbzBuilder } from './cbz.js';
import { LogBox, Notifier } from './ui.js';
import { getConfig } from './config.js';
import { startSilentAudio, stopSilentAudio } from './anti_sleep.js';
import { fetchHistory, refreshCacheAfterUpload, getBooksByCacheId, initUpdateUploadViaGASRelay, getMergeIndexFragment } from './gas.js';
import { fetchHistoryDirect, checkSingleHistoryDirect } from './network.js';

// Sleep Policy Presets
const SLEEP_POLICIES = {
    agile: { min: 1000, max: 3000 },      // 빠름 (1-3초)
    cautious: { min: 2000, max: 5000 },   // 신중 (2-5초)
    thorough: { min: 3000, max: 8000 }    // 철저 (3-8초)
};

// Processing Loop에 해당되는 로직을 분리 한다.
export async function processItem(item, builder, siteInfo, iframe, parser, seriesTitle = "") {
    const { site, category } = siteInfo;
    const isNovel = (category === "Novel");

    // Apply Dynamic Sleep based on Policy
    const config = getConfig();
    const policy = SLEEP_POLICIES[config.sleepMode] || SLEEP_POLICIES.agile;

    if (isNovel) {
        const novelDoc = await loadNovelDocument(item.src, iframe, parser);
        await sleep(policy.min, policy.max);
        const text = parser.getNovelContent(novelDoc);
        if (!text || text.trim().length === 0) {
            throw new Error("소설 본문을 찾을 수 없습니다.");
        }
        builder.addChapter(item.title, text);
    } 
    else {
        await waitIframeLoad(iframe, item.src);
        await sleep(policy.min, policy.max);

        const iframeDoc = iframe.contentWindow.document;

        // Webtoon / Manga (v1.7.1 Hybrid Collection)
        const logger = LogBox.getInstance();
        
        // 1. 스크롤 전 URL 선점 수집 (프로토타입 방식의 장점: data-original 등에 숨은 진짜 URL 확보)
        const initialUrls = parser.getImageList(iframeDoc);
        
        // 2. 강제 스크롤을 통해 레이지 로딩 이미지 활성화
        await scrollToLoad(iframeDoc);

        // 3. 스크롤 후 최종 URL 수집
        let finalUrls = parser.getImageList(iframeDoc);
        
        // 4. 하이브리드 병합: 스크롤 전후 URL 중 더 신뢰도 높은 것을 선택
        // 만약 finalUrls가 placeholder(isDummy: true)라면 initialUrls를 사용
        const mergedUrls = finalUrls.map((final, idx) => {
            const initial = initialUrls[idx];
            if (final.isDummy && initial && !initial.isDummy) {
                console.log(`[Hybrid] Placeholder 우회: ${final.url.split('/').pop()} -> ${initial.url.split('/').pop()}`);
                return initial.url;
            }
            return final.url;
        }).filter(url => url !== ""); // 최종적으로 유효한 URL만 추출

        logger.log(`이미지 ${mergedUrls.length}개 감지`, 'Parser');

        // [Fix] 시나리오 C: 0개 감지 시 1.5초 추가 대기 후 재파싱 1회
        if (mergedUrls.length === 0) {
            logger.warn('[Parser] 이미지 0개 — 1.5초 후 재파싱 시도', 'Parser');
            await sleep(1500);
            const retryUrls = parser.getImageList(iframeDoc);
            if (retryUrls.length > 0) mergedUrls.push(...retryUrls);
            logger.log(`[Parser] 재파싱 결과: ${mergedUrls.length}개`, 'Parser');
        }

        if (mergedUrls.length === 0) {
            logger.error(`⚠️ 이미지 감지 실패: ${item.title} — 해당 챕터 건너점`, 'Parser');
            return;
        }

        // Fetch Images Parallel
        let images = await fetchImages(mergedUrls);
        
        // [v1.7.3] Deep Fallback: 기준 하향 (70KB -> 30KB) 및 누락 확인
        const suspiciousCount = images.filter(img => img.blob.size < 30000 || img.isMissing).length;
        if (suspiciousCount > mergedUrls.length / 2) {
            logger.warn(`[Deep Fallback] 다수의 저용량 이미지 감지 (${suspiciousCount}/${mergedUrls.length}). 2초 후 강제 재스크롤 재시도...`, 'System');
            await sleep(2000); // v1.7.2: 5s -> 2s
            await scrollToLoad(iframeDoc, 12000); // 더 길게 대기
            const finalRetryUrls = parser.getImageList(iframeDoc);
            images = await fetchImages(finalRetryUrls);
        }

        // Add chapter to builder
        let chapterTitleOnly = item.title;
        if (seriesTitle && chapterTitleOnly.startsWith(seriesTitle)) {
            chapterTitleOnly = chapterTitleOnly.replace(seriesTitle, '').trim();
        }

        const chapterMatch = chapterTitleOnly.match(/(\d+)화/);
        const chapterNum = chapterMatch ? chapterMatch[1].padStart(4, '0') : item.num;
        const cleanChapterTitle = `${chapterNum} ${chapterTitleOnly}`;
        builder.addChapter(cleanChapterTitle, images);
    }
}

async function loadNovelDocument(url, iframe, parser) {
    const logger = LogBox.getInstance();

    try {
        logger.log('[Novel] fetch 기반 본문 로드 시도', 'Parser');
        const response = await fetch(url, {
            credentials: 'include',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        if (/Just a moment|Enable JavaScript and cookies|cf-challenge|_cf_chl_opt/i.test(html)) {
            throw new Error('Cloudflare challenge page returned');
        }

        const parsedDoc = new DOMParser().parseFromString(html, 'text/html');
        const text = parser.getNovelContent(parsedDoc);
        if (text && text.trim().length > 0) {
            logger.log('[Novel] fetch 기반 본문 로드 성공', 'Parser');
            return parsedDoc;
        }

        throw new Error('본문 컨테이너 미감지');
    } catch (fetchErr) {
        logger.warn(`[Novel] fetch 로드 실패, iframe 새로고침 폴백 시도: ${fetchErr.message}`, 'Parser');
    }

    return await loadNovelDocumentFromIframe(url, iframe, parser, logger);
}

async function loadNovelDocumentFromIframe(url, iframe, parser, logger) {
    const MAX_ATTEMPTS = 3;

    await waitIframeLoad(iframe, url);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let iframeDoc = null;
        try {
            iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        } catch (frameErr) {
            throw new Error(`소설 페이지 DOM 접근 실패: ${frameErr.message}`);
        }

        const text = parser.getNovelContent(iframeDoc);
        if (text && text.trim().length > 0) {
            logger.log(`[Novel] iframe 본문 로드 성공 (${attempt}/${MAX_ATTEMPTS})`, 'Parser');
            return iframeDoc;
        }

        if (attempt === MAX_ATTEMPTS) break;

        logger.warn(`[Novel] 본문 미로드 상태 감지, 새로고침 재시도 (${attempt}/${MAX_ATTEMPTS})`, 'Parser');
        await refreshNovelFrame(iframe, iframeDoc);
    }

    throw new Error('소설 본문을 불러오지 못했습니다. 회차 페이지의 새로고침이 계속 실패했습니다.');
}

async function refreshNovelFrame(iframe, iframeDoc) {
    let clicked = false;

    try {
        const refreshControl = Array.from(iframeDoc.querySelectorAll('button, a, [role="button"]'))
            .find((el) => /새로고침/.test((el.innerText || el.textContent || '').trim()));

        if (refreshControl) {
            refreshControl.click();
            clicked = true;
        }
    } catch (e) {
        // Fall back to a normal reload below.
    }

    if (!clicked) {
        try {
            iframe.contentWindow.location.reload();
        } catch (e) {
            iframe.src = iframe.src;
        }
    }

    await sleep(2500);
}


/**
 * "1,2,4-10,15" 형식 문자열을 에피소드 번호 Set으로 변환
 * @param {string} spec - 범위 문자열. 빈 값이면 null 반환 (전체 의미)
 * @returns {Set<number>|null}
 */
export function parseRangeSpec(spec) {
    if (!spec || !spec.trim()) return null; // 빈 입력 = 전체
    const nums = new Set();
    const parts = spec.split(',');
    for (const part of parts) {
        const trimmed = part.trim();
        const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const from = parseInt(rangeMatch[1]);
            const to   = parseInt(rangeMatch[2]);
            for (let n = Math.min(from, to); n <= Math.max(from, to); n++) nums.add(n);
        } else if (/^\d+$/.test(trimmed)) {
            nums.add(parseInt(trimmed));
        }
    }
    return nums.size > 0 ? nums : null;
}

export async function tokiDownload(rangeSpec, policy = 'zipOfCbzs', forceOverwrite = false) {
    const logger = LogBox.getInstance();
    logger.init();
    logger.show();
    logger.log(`다운로드 시작 (정책: ${policy}, 강제 덮어쓰기: ${forceOverwrite})...`);

    // Auto-start Anti-Sleep mode
    try {
        startSilentAudio();
        logger.success('[Anti-Sleep] 백그라운드 모드 자동 활성화');
    } catch (e) {
        logger.log('[Anti-Sleep] 자동 시작 실패 (사용자 상호작용 필요)', 'error');
    }

    const siteInfo = detectSite();
    if (!siteInfo) {
        alert("지원하지 않는 사이트이거나 다운로드 페이지가 아닙니다.");
        stopSilentAudio();
        return;
    }

    const parser = ParserFactory.getParser();
    if (!parser) {
        alert("파서를 초기화할 수 없습니다.");
        stopSilentAudio();
        return;
    }

    const { site, category } = siteInfo;
    const isNovel = (category === "Novel");

    try {
        // Prepare Strategy Variables
        let mainBuilder = null;
        let masterZip = null;
        let extension = 'zip';
        let destination = 'local'; // 기본 저장 대상
        let buildingPolicy = 'individual'; // 기본 빌딩 정책
        
        // [v1.6.0] 4대 정책 라우팅
        if (policy === 'individual') {
            buildingPolicy = 'individual';
            destination = 'local';
        } else if (policy === 'zipOfCbzs') {
            buildingPolicy = 'zipOfCbzs';
            destination = 'local';
        } else if (policy === 'native') {
            buildingPolicy = 'individual'; // 빌딩은 개별 CBZ 단위로 동일
            destination = 'native';        // 저장 대상만 GM_download로 변경
        } else if (policy === 'drive') {
            buildingPolicy = 'individual'; // 빌딩은 개별 CBZ 단위
            destination = 'drive';         // 저장 대상은 Google Drive
        // 하위 호환: 구버전 정책 명칭 지원
        } else if (policy === 'gasUpload') {
            buildingPolicy = 'individual';
            destination = 'drive';
            logger.log('⚠️ gasUpload 정책은 drive로 대체되었습니다.', 'warn');
        } else if (policy === 'folderInCbz') {
            buildingPolicy = 'zipOfCbzs';
            destination = 'local';
            logger.log('⚠️ folderInCbz 정책이 폐기되어 zipOfCbzs(배치)로 전환되었습니다.', 'warn');
        }

        if (buildingPolicy === 'zipOfCbzs') {
            masterZip = new JSZip(); // Master Container for current batch
            extension = isNovel ? 'epub' : 'cbz';
        } else {
            // Individual / native / drive
            extension = isNovel ? 'epub' : 'cbz';
        }

        // Get List
        let list = parser.getListItems();

        // [v2.0] 커스텀 범위 필터 ("1,2,4-10" 형식)
        const rangeSet = parseRangeSpec(rangeSpec);
        if (rangeSet) {
            list = list.filter(li => {
                const item = parser.parseListItem(li);
                const num = parseInt(item.num);
                return rangeSet.has(num);
            });
            logger.log(`범위 필터 적용: ${rangeSpec} → ${list.length}개 항목`);
        }
        
        // Log episode range
        if (list.length > 0) {
            const first = parser.parseListItem(list[list.length - 1]); // usually reversed order
            const last = parser.parseListItem(list[0]);
            logger.log(`총 ${list.length}개 항목 처리 예정. (${first.title} ~ ${last.title})`, 'Downloader');
        } else {
            logger.log(`총 0개 항목 처리 예정.`, 'Downloader');
        }

        if (list.length === 0) {
            logger.warn('에피소드 목록이 0개입니다. 사이트 구조가 달라졌거나 올바른 목록 페이지인지 확인하세요.', 'Downloader');
            alert("다운로드할 항목이 없습니다.");
            return;
        }

        // Folder Name (Title) & Common Title Extraction
        const first = parser.parseListItem(list[0]);
        const last = parser.parseListItem(list[list.length - 1]);
        
        // Extract Series ID from URL
        // https://.../webtoon/123456?page=...
        // Pattern: /novel/(\d+) or /webtoon/(\d+) or /comic/(\d+)
        const idMatch = document.URL.match(/\/(novel|webtoon|comic)\/([0-9]+)/);
        const seriesId = idMatch ? idMatch[2] : "0000";

        // Determine Root Folder Name & Series Title
        const rootFolder = parser.getFormattedTitle(seriesId, first.title, last.title, getCommonPrefix);
        // Extract raw title from rootFolder (e.g., "[1234] Title" -> "Title")
        const seriesTitle = rootFolder.replace(/^\[[0-9]+\]\s*/, '');
        const listPrefixTitle = (list.length > 1) ? getCommonPrefix(first.title, last.title) : "";

        // [v1.7.0] Collect detailed metadata for Phase 3 Persistence
        const seriesMetadata = {
            ...parser.getSeriesMetadata(),
            title: seriesTitle || rootFolder,
            thumbnail: parser.getThumbnailUrl() || ""
        };

        // [Fix] Append Range [Start-End] for Local Merged Files (folderInCbz / zipOfCbzs)
        // GAS Upload uses individual files so no range needed in folder name
        // [v1.6.0 Update] Batch range is handled during saving, not in rootFolder variable
        if (buildingPolicy === 'zipOfCbzs') {
            const startNum = parseInt(first.num);
            const endNum = parseInt(last.num);
            // We'll append batch info later
        }

        // [v1.4.0] Upload Series Thumbnail (if uploading to Drive)
        if (destination === 'drive') {
            try {
                const thumbnailUrl = parser.getThumbnailUrl();
                if (thumbnailUrl) {
                    logger.log('📷 시리즈 썸네일 업로드 중...');
                    const thumbResponse = await fetch(thumbnailUrl);
                    const thumbBlob = await thumbResponse.blob();
                    
                    // Upload as 'cover.jpg' - network.js will auto-redirect to _Thumbnails/{ID}.jpg
                    // saveFile(data, filename, type, extension, metadata)
                    // → fullFileName = "cover.jpg"
                    await saveFile(thumbBlob, 'cover', 'drive', 'jpg', { 
                        category,
                        folderName: rootFolder  // Target folder for upload
                    });
                    logger.success('✅ 썸네일 업로드 완료');
                } else {
                    logger.log('⚠️  썸네일을 찾을 수 없습니다 (건너뜀)', 'warn');
                }
            } catch (thumbError) {
                logger.warn(`썸네일 업로드 실패 (계속 진행): ${thumbError.message}`, 'Downloader');
            }
        }

        // [v1.5.0 Smart Skip] Pre-load history for Drive uploads to skip already-uploaded episodes
        let uploadedHistorySet = new Set();
        // [v1.6.0 Fast Path] Pre-load episode cache
        let episodeCacheMap = new Map(); // key: "0001 - Title", value: "fileId"

        let historyCheckTimeoutFlag = false;
        let historyFolderId = null;

        if (destination === 'drive') {
            try {
                if (forceOverwrite) {
                    logger.log('⚠️ 강제 재다운로드 옵션 활성화: 기존 업로드 기록 무시 (전체 덮어쓰기)');
                } else {
                    logger.log('☁️ 드라이브 업로드 기록 및 용량 확인 중 (Smart Skip)...');
                    const histResult = await fetchHistoryDirect(rootFolder, category);
                    
                    if (histResult.success) {
                        // Normalize: accept padded ("0001") and plain ("1") forms
                        histResult.data.forEach(id => {
                            const plain = parseInt(id).toString();
                            uploadedHistorySet.add(id.toString());   // e.g. "0001"
                            uploadedHistorySet.add(plain);           // e.g. "1"
                        });
                        if (uploadedHistorySet.size > 0) {
                            logger.log(`⏭️ 조건 만족(기존 정상 업로드) 에피소드 ${histResult.data.length}개 감지 — 건너뜁니다.`);
                        }
                    } else {
                        historyCheckTimeoutFlag = true;
                        historyFolderId = histResult.folderId;
                        logger.log(`⚠️ 업로드 기록 조회 지연/타임아웃 감지. 개별 스킵(페일세이프) 모드로 전환합니다.`, 'warn');
                    }
                }
            } catch (histErr) {
                // Non-fatal: if history check fails unexpectedly
                logger.log(`⚠️ 업로드 기록 조회 실패: ${histErr.message}`, 'warn');
            }

            // [v1.6.0] Phase B-2: Load Master Index -> Cache File ID -> Episode List
            try {
                logger.log('⚡ 고속 업로드(Fast Path) 캐시 조회 중...');
                const config = getConfig();
                
                // 1. Fetch Complete Master Index
                const indexResponse = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "POST", url: config.gasUrl,
                        data: JSON.stringify({ type: "get_library", folderId: config.folderId, apiKey: config.apiKey }),
                        headers: { "Content-Type": "text/plain" },
                        onload: (r) => {
                            try { resolve(JSON.parse(r.responseText)); } 
                            catch(e) { reject(e); }
                        },
                        onerror: reject
                    });
                });

                if (indexResponse.status === 'success') {
                    // 2. Find Current Series in Index by ID or Title
                    // [Fix] Handle both indexResponse.body (cached) and indexResponse.list (rebuild) structures
                    const seriesList = indexResponse.body || indexResponse.list || [];
                    
                    // Match by sourceId or title
                    const matchedSeries = seriesList.find(s => 
                        (s.sourceId && s.sourceId === seriesId) || 
                        (s.name && s.name.includes(seriesTitle))
                    );

                    let targetCacheFileId = matchedSeries ? matchedSeries.cacheFileId : null;
                    
                    if (targetCacheFileId) {
                        logger.log(`[Fast Path] 마스터 카탈로그에서 신규 캐시 파일 발견: ${targetCacheFileId}`);
                    } else {
                        // [v1.6.1] 2nd Attempt: Fetch Merge Index Fragment directly (Fallback for newly uploaded series)
                        logger.log(`[Fast Path] 마스터 카탈로그에 캐시 부재. _MergeIndex 대기열 파편을 탐색합니다...`);
                        const fragRes = await getMergeIndexFragment(seriesId);
                        if (fragRes.found && fragRes.data && fragRes.data.cacheFileId) {
                            targetCacheFileId = fragRes.data.cacheFileId;
                            logger.log(`[Fast Path] 큐에서 비동기 병합 파편 발견 성공! (ID: ${targetCacheFileId})`);
                        }
                    }

                    if (targetCacheFileId) {
                        // 3. Directly load episode cache using the cacheFileId
                        const cachedEpisodes = await getBooksByCacheId(targetCacheFileId);
                        
                        if (cachedEpisodes && cachedEpisodes.length > 0) {
                             cachedEpisodes.forEach(ep => {
                                 // Map "name" (e.g. "0001 - Title.cbz") to its Drive File ID
                                 // We strip the extension to match our `fullFilename` variable later
                                 const nameWithoutExt = ep.name.replace(/\.[^/.]+$/, "");
                                 episodeCacheMap.set(nameWithoutExt, ep.id);
                             });
                             logger.success(`[Fast Path] 맵핑 테이블 완성: ${episodeCacheMap.size}개 에피소드 캐시 로드 성공!`);
                        }
                    } else {
                        logger.log('[Fast Path] 신규 작품이거나 캐시 파편이 아직 없습니다 (일반 업로드 분기로 진행)');
                    }
                }
            } catch (cacheErr) {
                logger.log(`⚠️ 고속 업로드 캐시 로드 실패 (일반 분기로 진행방향 전환): ${cacheErr.message}`, 'warn');
            }
        }

        // Create IFrame
        // 목록 페이지 최하단에 배치 + opacity 0.1
        // IntersectionObserver가 정상 동작하며, 브라우저가 일반 문서 흐름으로 렌더링
        const iframe = document.createElement('iframe');
        iframe.style.display = 'block';
        iframe.style.width = '100%';
        iframe.style.height = '600px';
        iframe.style.opacity = '0.1';
        iframe.style.pointerEvents = 'none';
        iframe.style.border = 'none';
        iframe.style.marginTop = '40px';
        document.body.appendChild(iframe);

        // [v1.7.1] Novel Single Volume Mode Init
        const novelMode = getConfig().novelMode;
        const isSingleVolume = isNovel && novelMode === 'singleVolume';
        let masterEpubBuilder = null;
        if (isSingleVolume) {
            masterEpubBuilder = new EpubBuilder();
            logger.log('📙 소설 단행본 합본 모드 활성화 (마지막에 한 번에 저장됩니다)');
        }

        // --- Processing Loop ---
        for (let i = 0; i < list.length; i++) {
            const item = parser.parseListItem(list[i].element || list[i]); 
            console.clear();
            logger.log(`[${i + 1}/${list.length}] 처리 중: ${item.title}`);

            // [v1.5.0 Smart Skip] Skip already-uploaded episodes (Drive policy only)
            // [v1.7.1] Bypass skipping in Single Volume mode (we need all chapters)
            if (!isSingleVolume && destination === 'drive') {
                const numStr = item.num ? item.num.toString() : '';
                const numPlain = parseInt(numStr).toString();
                if (uploadedHistorySet.size > 0 && (uploadedHistorySet.has(numStr) || uploadedHistorySet.has(numPlain))) {
                    logger.log(`⏭️ 건너뜀 (이미 업로드됨): ${item.title}`);
                    continue;
                }
                
                // [v1.7.4] 페일세이프: 타임아웃 발생 시 개별 단위 핀셋 조회 수행
                if (historyCheckTimeoutFlag && historyFolderId) {
                    logger.log(`🔍 [페일세이프] 타임아웃 2차 단일 로컬/원격 검사 중: ${item.title}`);
                    const isUploaded = await checkSingleHistoryDirect(historyFolderId, numStr);
                    if (isUploaded) {
                        logger.log(`⏭️ [페일세이프 재검사] 건너뜀 (이미 업로드됨): ${item.title}`);
                        continue;
                    }
                }
            }

            // Decision based on Policy
            let currentBuilder = null;

            // [v1.6.0] Strategy: Always use a FRESH builder per item for Kavita compatibility
            // [v1.7.1] Except for Novel Single Volume Mode
            if (isSingleVolume) {
                currentBuilder = masterEpubBuilder;
            } else {
                if (isNovel) currentBuilder = new EpubBuilder();
                else currentBuilder = new CbzBuilder();
            }

            // Process Item
            try {
                await processItem(item, currentBuilder, siteInfo, iframe, parser, seriesTitle);
                if (isSingleVolume) {
                    logger.log(`📥 챕터 추가 완료: ${item.title} (현재 ${masterEpubBuilder.chapters.length}개)`, 'Downloader');
                }
            } catch (err) {
                console.error(err);
                logger.error(`항목 처리 실패 (${item.title}): ${err.message}`, 'Downloader');

                if (isSingleVolume) {
                    throw new Error(`단행본 합본 모드 중단: ${item.title} 회차를 가져오지 못했습니다. (${err.message})`);
                }

                continue; // Skip faulty item but continue loop
            }

            // Post-Process for Non-Default Policies
            if (buildingPolicy !== 'folderInCbz' && !isSingleVolume) {
                // Build the individual chapter file
             
                // Clean Filename Logic
                // [v1.4.0 Update] Standardized format: "0001 - SeriesTitle 1화" (Keep Full Title)
                // Reason: Better identification when moving files out of folder
                
                let chapterTitle = item.title;
                
                // [v1.4.0] Title Normalization
                // If list title text differs from official metadata title, replace it.
                // Ex: List="Hot Manga 19", Meta="Cool Manga" -> "Cool Manga 19"
                // Condition: We have both titles, they differ, and item starts with list prefix
                if (seriesTitle && listPrefixTitle && seriesTitle !== listPrefixTitle && listPrefixTitle.length > 2) {
                     if (chapterTitle.startsWith(listPrefixTitle)) {
                         chapterTitle = chapterTitle.replace(listPrefixTitle, seriesTitle).trim();
                     }
                }
                
                // Only clean (remove series title) if uploading to Drive
                // [Deprecated] User requested to keep series title
                /*
                if (destination === 'drive' && seriesTitle && chapterTitle.startsWith(seriesTitle)) {
                    chapterTitle = chapterTitle.replace(seriesTitle, '').trim();
                }
                */

                // Final Filename: "0001 - Title"
                const fullFilename = `${item.num} - ${chapterTitle}`;

                // [v1.6.0] Kavita Metadata Insertion
                const innerZip = await currentBuilder.build({ 
                    series: seriesTitle || rootFolder,
                    title: chapterTitle,
                    number: item.num,
                    writer: site
                });
                const blob = await innerZip.generateAsync({ type: "blob" });

                if (buildingPolicy === 'zipOfCbzs') {
                    console.log(`[MasterZip] 추가 중: ${fullFilename}.${extension}`);
                    masterZip.file(`${fullFilename}.${extension}`, blob);
                    
                    // [v1.6.0] 5-Chapter Batching Logic
                    // Every 5 items (or at the end), save the batch and clear memory
                    const processedCount = i + 1;
                    const isLastItem = (i === list.length - 1);
                    const BATCH_SIZE = 5;

                    if (processedCount % BATCH_SIZE === 0 || isLastItem) {
                        const batchNum = Math.ceil(processedCount / BATCH_SIZE);
                        const batchFilename = `${rootFolder}_Part${batchNum}`;
                        
                        logger.log(`📦 배치 저장 중... (${batchFilename})`);
                        await saveFile(masterZip, batchFilename, 'local', 'zip', { category });
                        
                        // Clear masterZip for next batch to save memory
                        masterZip = new JSZip();
                    }
                } else if (buildingPolicy === 'individual') {
                    // [v1.6.0] Phase B-3: Fast Path Smart Branching
                    let success = false;
                    const cachedFileId = episodeCacheMap.get(fullFilename);

                    if (destination === 'drive' && cachedFileId) {
                        try {
                            logger.log(`⚡ [Fast Path] 캐시 히트! 무탐색 덮어쓰기 (PUT) 진행 -> ID: ${cachedFileId}`);
                            
                            // 1. Init Update Session
                            // Notice: We do NOT use direct upload here because direct upload deletes existing files.
                            // We MUST use GAS Relay to trigger the specific PATCH/PUT resumable session.
                            const updateUrl = await initUpdateUploadViaGASRelay(cachedFileId, `${fullFilename}.${extension}`);
                            
                            // 2. Transmit chunks (re-use standard GM_xmlHttpRequest logic from gas.js)
                            // We can build a quick uploader here or expose a method. Since gas.js encapsulates it tightly,
                            // we inline the chunk upload for the Fast Path for maximum control:
                            const CHUNK_SIZE = 20 * 1024 * 1024;
                            const totalSize = blob.size;
                            let start = 0;
                            const buffer = await blob.arrayBuffer();
                            
                            while (start < totalSize) {
                                const end = Math.min(start + CHUNK_SIZE, totalSize);
                                const chunkBuffer = buffer.slice(start, end);
                                
                                // High-speed Base64 encode
                                let binary = "";
                                const chunk_size = 0x8000; // 32KB
                                for (let j = 0; j < bytes.length; j += chunk_size) {
                                    binary += String.fromCharCode.apply(null, bytes.subarray(j, j + chunk_size));
                                }
                                const chunkBase64 = window.btoa(binary);

                                await new Promise((res, rej) => {
                                    GM_xmlhttpRequest({
                                        method: "POST", url: getConfig().gasUrl,
                                        data: JSON.stringify({ 
                                            type: "upload", uploadUrl: updateUrl, chunkData: chunkBase64, 
                                            folderId: getConfig().folderId,
                                            start: start, end: end, total: totalSize, apiKey: getConfig().apiKey
                                        }),
                                        headers: { "Content-Type": "text/plain" },
                                        timeout: 300000,
                                        onload: (resp) => {
                                            try { 
                                                const json = JSON.parse(resp.responseText); 
                                                if (json.status === 'success') res(); else rej(new Error("Fail")); 
                                            } catch (e) { rej(e); }
                                        },
                                        onerror: rej
                                    });
                                });
                                start = end;
                            }
                            
                            logger.success(`⚡ [Fast Path] ${fullFilename} 업데이트(PUT) 완료!`, 'FastPath');
                            success = true;
                        } catch (fastPathErr) {
                            const errMsg = fastPathErr.message || "";
                            logger.log(`⚠️ Fast Path 업로드 중 에러 발생 (${errMsg}), Fallback 시작...`, 'warn', 'FastPath');
                            
                            // [v1.7.3] 자가 회복 로직: 휴지통 또는 파일 부재 시 캐시 삭제
                            const lowerMsg = errMsg.toLowerCase();
                            if (lowerMsg.includes('trash') || lowerMsg.includes('not found')) {
                                logger.warn(`🗑️ [Fast Path] 휴지통/부재 감지 → 캐시에서 해당 항목 삭제 및 일반 업로드 전환: ${fullFilename}`);
                                episodeCacheMap.delete(fullFilename);
                            }
                            
                            success = false; // Fallback
                        }
                    }

                    if (!success) {
                        // Fallback (or local save)
                        logger.log(`[Upload] 일반 업로드(Create/POST) 진행...`);
                        await saveFile(blob, fullFilename, destination, extension, {
                            folderName: rootFolder,
                            category: category
                        });
                    }
                }
            }
            
            // [v1.4.0] Add completion badge to list item (real-time feedback)
            if (item.element && !item.element.querySelector('.toki-badge')) {
                const badge = document.createElement('span');
                badge.className = 'toki-badge';
                badge.innerText = '✅';
                badge.style.marginLeft = '5px';
                badge.style.fontSize = '12px';
                
                // Target: .wr-subject > a (link element)
                const linkEl = item.element.querySelector('.wr-subject > a');
                if (linkEl) {
                    linkEl.prepend(badge);
                } else {
                    // Fallback
                    const titleEl = item.element.querySelector('.wr-subject, .item-subject, .title');
                    if (titleEl) {
                        titleEl.prepend(badge);
                    } else {
                        item.element.appendChild(badge);
                    }
                }
                
                // Visual feedback
                item.element.style.opacity = '0.6';
                item.element.style.backgroundColor = 'rgba(0, 255, 0, 0.05)';
            }
        }


        // [v1.7.1] Finalize Single Volume EPUB
        if (isSingleVolume && masterEpubBuilder) {
            if (masterEpubBuilder.chapters.length > 0) {
                try {
                    // [v1.7.1 Update] Use Chapter Range for Filename instead of "(합본)"
                    // [v1.7.1 Update] Use Chapter Range for Filename instead of "(합본)" - Safe Parsing
                    const startRaw = last.num;
                    const endRaw = first.num;
                    const startNum = parseInt(startRaw);
                    const endNum = parseInt(endRaw);

                    let rangeLabel = "";
                    if (isNaN(startNum) || isNaN(endNum)) {
                        // Fallback to original labels if either is not numeric (e.g., "공지")
                        rangeLabel = (startRaw === endRaw) ? `${startRaw}` : `${startRaw}-${endRaw}`;
                    } else {
                        rangeLabel = (startNum === endNum) ? `${startNum}화` : `${Math.min(startNum, endNum)}-${Math.max(startNum, endNum)}화`;
                    }
                    const finalFilename = `${seriesTitle || rootFolder} (${rangeLabel})`;
                    
                    logger.log(`📚 단행본 조립 및 저장 중... (${finalFilename})`);
                    
                    const finalZip = await masterEpubBuilder.build({
                        series: seriesTitle || rootFolder,
                        title: seriesTitle || rootFolder,
                        writer: site
                    });
                    const finalBlob = await finalZip.generateAsync({ type: "blob" });
                    
                    await saveFile(finalBlob, finalFilename, destination, 'epub', {
                        folderName: rootFolder,
                        category: category
                    });
                    
                    logger.success(`✅ 단행본 합본 저장 완료: ${finalFilename}`);
                } catch (epubErr) {
                    logger.error(`단행본 빌드 실패: ${epubErr.message}`);
                }
            } else {
                logger.warn('⚠️ 유효한 챕터가 없어 단행본 빌드를 취소합니다.', 'Downloader');
            }
        }

        // Cleanup
        iframe.remove();

        // Finalize Build (Batching logic already handles zipOfCbzs during loop)
        if (buildingPolicy === 'folderInCbz') {
            // Deprecated path, handled by zipOfCbzs transition
        }

        // [v1.5.5] 배치 완료 후 Drive 캐시 단일 갱신 (에피소드마다 호출하지 않음)
        if (destination === 'drive') {
            refreshCacheAfterUpload(rootFolder, category, seriesMetadata).catch(e =>
                logger.warn(`캐시 갱신 호출 중 실패 (무시): ${e.message}`, 'GAS:Cache')
            );
        }

        logger.success(`✅ 다운로드 완료!`);
        Notifier.notify('TokiSync', `다운로드 완료! (${list.length}개 항목)`);

    } catch (error) {
        console.error(error);
        logger.error(`전체 다운로드 루틴 오류 발생: ${error.message}`, 'System');
        alert(`다운로드 중 오류 발생:\n${error.message}`);
    } finally {
        // Auto-stop Anti-Sleep mode
        stopSilentAudio();
        logger.log('[Anti-Sleep] 백그라운드 모드 자동 종료');
        
        // Cleanup
        const iframe = document.querySelector('iframe');
        if (iframe) iframe.remove();
    }
}

async function fetchImages(imageUrls) {
    const logger = LogBox.getInstance();
    const promises = imageUrls.map(async (src) => {
        let retries = 3;
        let lastBlob = null;
        let lastExt = '.jpg';
        
        while (retries > 0) {
            try {
                const response = await fetch(src);
                const blob = await response.blob();
                
                if (blob.size === 0) {
                    throw new Error("빈 이미지 데이터 (Blob size 0)");
                }

                // Metadata Extraction
                let ext = '.jpg';
                const extMatch = src.match(/\.[a-zA-Z]+$/);
                
                if (extMatch) {
                    ext = extMatch[0];
                } else {
                    // Fallback: Infer from Content-Type
                    const type = response.headers.get('content-type');
                    if (type) {
                        if (type.includes('png')) ext = '.png';
                        else if (type.includes('gif')) ext = '.gif';
                        else if (type.includes('webp')) ext = '.webp';
                        else if (type.includes('jpeg') || type.includes('jpg')) ext = '.jpg';
                    }
                }

                lastBlob = blob;
                lastExt = ext;

                // [v1.7.3] Hybrid Dummy Detection: Size + Resolution
                // 100KB 이하일 경우 Dummy일 확률이 있으나, 해상도가 높으면 정상으로 수용
                if (blob.size < 100 * 1024 && retries > 1) {
                    // 1. 확실한 더미 패턴 URL이면 재시도 없이 즉시 실패 처리
                    const isDummyUrl = (u) => u && (u.includes('blank.gif') || u.includes('loading.gif') || u.includes('pixel.gif'));
                    if (isDummyUrl(src)) {
                        retries = 1; 
                        throw new Error(`더미 이미지 URL 확인됨 (Skip retry)`);
                    }

                    // 2. 해상도 체크 (가로 또는 세로가 300px 이상이면 정상 이미지로 간주)
                    const { getImageDimensions } = await import('./utils.js');
                    const { width, height } = await getImageDimensions(blob);
                    
                    if (width > 300 || height > 300) {
                        // 규격이 정상인 경우 용량에 상관없이 수용
                        return { src, blob, ext };
                    }

                    throw new Error(`저용량 및 저해상도 의심 (${(blob.size/1024).toFixed(1)}KB, ${width}x${height}) - Lazy 더미 이미지일 수 있으므로 재시도`);
                }

                return { src, blob, ext };
            } catch (e) {
                retries--;
                const retryCount = 3 - retries;
                if (retries > 0) logger.warn(`이미지 다운로드 재시도 (${retryCount}/3): ${e.message}`, 'Network:Image');
                
                if (retries === 0) {
                    // 3회 모두 실패했고 lastBlob이 존재하지만, 여전히 dummy 성격이면 거절
                    if (lastBlob && lastBlob.size > 10000) { // 10KB 이상일 때만 보수적 수용
                        logger.log(`⚠️ 용량이 작지만 수용 (${(lastBlob.size/1024).toFixed(1)}KB): ${src.split('/').pop()}`, 'Network:Image');
                        return { src, blob: lastBlob, ext: lastExt };
                    }
                    
                    console.error(`이미지 다운로드 최종 실패 (${src}):`, e);
                    logger.error(`⚠️ 이미지 누락: ${src.split('/').pop()} (3회 재시도 실패)`, 'Network:Image');
                    
                    // [Fix] 다운로드 실패 시 null 반환 대신 안내 페이지 삽입
                    const placeholderText = `[PAGE_MISSING]\n\n해당 웹툰 페이지를 다운로드할 수 없었습니다.\n원인: 서버 제한 또는 백그라운드 스로틀링 (Lazy Load 실패)\n\nURL: ${src}`;
                    const placeholderBlob = new Blob([placeholderText], { type: 'text/plain' });
                    
                    return { src, blob: placeholderBlob, ext: '.txt', isMissing: true };
                }
                
                // 재시도 대기 (v1.7.2: 1.5초 -> 0.5초)
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
    });

    return await Promise.all(promises);
}
