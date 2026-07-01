import { sleep, waitIframeLoad, saveFile, getCommonPrefix, scrollToLoad, fetchBlobWithXHR, arrayBufferToBase64 } from './utils.js';
import { extractEpisodeData } from './extractor.js';
import { ParserFactory } from './parsers/ParserFactory.js';
import { detectSite } from './detector.js';
import { EpubBuilder } from './epub.js';
import { CbzBuilder } from './cbz.js';
import { TxtBuilder } from './txt.js';
import { Notifier, showProgressModal } from './ui/index.js';
import { logger } from './logger.js';
import { getConfig, isConfigValid, SLEEP_MULTIPLIERS } from './config.js';
import { EventBus, EVT } from './EventBus.js';
import { startSilentAudio, stopSilentAudio } from './anti_sleep.js';
import { fetchHistory, refreshCacheAfterUpload, getBooksByCacheId, initUpdateUploadViaGASRelay, getMergeIndexFragment } from './gas.js';
import { fetchHistoryDirect, checkSingleHistoryDirect, getOAuthToken, getOrCreateFolder } from './network.js';
import { fetchNovelText, fetchComicImages, closeActiveWorker, initBatchWorkerController } from './worker-controller.js';
import { addEpisodesToQueue, initQueueScheduler, activeWorkers, WORKER_STAGE, updateQueueItem, getQueue, removeQueueItem, getQueueItemId, clearQueue, stopAllWorkers } from './queue.js';

async function shouldSkipEpisode({
    numStr,
    destination,
    isSingleVolume,
    uploadedHistorySet,
    historyCheckTimeoutFlag,
    historyFolderId,
    logOnSkip = false,
    episodeTitle = ''
}) {
    if (isSingleVolume) return false;
    if (destination !== 'drive' && destination !== 'drive_kavita') return false;

    const numPlain = parseInt(numStr).toString();
    if (uploadedHistorySet.size > 0 && (uploadedHistorySet.has(numStr) || uploadedHistorySet.has(numPlain))) {
        if (logOnSkip) {
            logger.log(`⏭️ 건너뜀 (이미 업로드됨): ${episodeTitle}`);
        }
        return true;
    }
    
    if (historyCheckTimeoutFlag && historyFolderId) {
        if (logOnSkip) {
            logger.log(`🔍 [페일세이프] 타임아웃 2차 단일 로컬/원격 검사 중: ${episodeTitle}`);
        }
        const isUploaded = await checkSingleHistoryDirect(historyFolderId, numStr);
        if (isUploaded) {
            if (logOnSkip) {
                logger.log(`⏭️ [페일세이프 재검사] 건너뜀 (이미 업로드됨): ${episodeTitle}`);
            }
            return true;
        }
    }
    
    return false;
}

export async function processItem(item, builder, siteInfo, iframe, parser, seriesTitle = "", targetDoc = null, rootFolder = "", destination = "local") {
    const { category } = siteInfo;
    const isNovel = (category === 'Novel' || category === 'novel');
    const viewerCfg = parser.rule.viewer || {};

    const config = getConfig();
    const multiplier = SLEEP_MULTIPLIERS[config.sleepMode] || SLEEP_MULTIPLIERS.cautious;

    const id = getQueueItemId(seriesTitle, item.num ? item.num.toString() : '');
    
    // [H1] Queue Write Monopoly: 상태 변경은 EventBus를 통해 queue.js로 위임
    // [H2] activeWorkers 등록으로 스케줄러 중복 기동 방지 가드 활성화
    EventBus.emit(EVT.QUEUE_ITEM_UPDATE, { id, updates: { status: 'processing', stage: WORKER_STAGE.INIT } });
    activeWorkers.set(id, { type: 'single-volume' });

    const finalRootFolder = rootFolder || seriesTitle || 'UnknownSeries';

    const currentNovelMode = config.novelMode;
    const isSingleVolume = isNovel && currentNovelMode === 'singleVolume';
    const buildingPolicy = config.buildingPolicy || 'individual';

    try {
        if (isNovel) {
            logger.log(`[소설] 추출 중: ${item.title}`, 'Downloader');

            const result = await fetchNovelText(item.src, {
                decryptApi: viewerCfg.decryptApi || null,
                viewerCfg: viewerCfg,
                seriesTitle: seriesTitle,
                rootFolder: finalRootFolder,
                queueId: id,
                episodeTitle: item.title,
                episodeNum: item.num,
                folderId: item.folderId || config.folderId || '',
                destination: destination,
                novelFormat: config.novelFormat || 'epub',
                matchedRule: parser.rule,
                protocolDomain: parser.protocolDomain,
                scanSpeedMultiplier: config.scanSpeed / 750,
                localNameTemplate: config.localNameTemplate,
                localEpisodePadding: config.localEpisodePadding
            });

            if (typeof result === 'string') {
                builder.addChapter(item.title, result.trim());
                logger.log(`✅ [부모 컨트롤러] 소설 추출 성공 (조립 적재 완료): ${item.title}`, 'Downloader');
                
                // [H1] 단일 합본용 큐 아이템 상태 갱신 — EventBus 경유
                EventBus.emit(EVT.QUEUE_ITEM_UPDATE, { id, updates: { status: 'completed', progressPercent: 100, stage: WORKER_STAGE.COMPLETED } });
                EventBus.emit(EVT.UPDATE_PROGRESS);
                
                await sleep(1500 * multiplier, 1000 * multiplier);
                return false; // 부모 측에서 일괄 빌드 및 최종 저장을 하도록 false 반환
            } else {
                throw new Error(`추출 실패 (소설 본문 응답 없음)`);
            }
        } 
        else {
            logger.log(`[만화] 추출 중: ${item.title}`, 'Downloader');

            const images = await fetchComicImages(item.src, {
                viewerCfg: viewerCfg,
                seriesTitle: seriesTitle,
                rootFolder: finalRootFolder,
                queueId: id,
                episodeTitle: item.title,
                episodeNum: item.num,
                folderId: item.folderId || config.folderId || '',
                destination: destination,
                matchedRule: parser.rule,
                protocolDomain: parser.protocolDomain,
                scanSpeedMultiplier: config.scanSpeed / 750,
                localNameTemplate: config.localNameTemplate,
                localEpisodePadding: config.localEpisodePadding
            });

            if (Array.isArray(images)) {
                // resolvedImages: [{ url, data: ArrayBuffer, ext, isMissing }, ...]
                const resolvedImages = images.map(img => {
                    const mimeType = img.ext?.includes('png') ? 'image/png' : (img.ext?.includes('webp') ? 'image/webp' : 'image/jpeg');
                    return {
                        url: img.url,
                        blob: img.data ? new Blob([img.data], { type: mimeType }) : new Blob([]),
                        ext: img.ext || '.jpg',
                        isMissing: !!img.isMissing
                    };
                });

                builder.addChapter(item.title, resolvedImages);
                logger.log(`✅ [부모 컨트롤러] 만화 이미지 추출 성공 (조립 적재 완료): ${item.title}`, 'Downloader');
                
                // [H1] 단일 합본용 큐 아이템 상태 갱신 — EventBus 경유
                EventBus.emit(EVT.QUEUE_ITEM_UPDATE, { id, updates: { status: 'completed', progressPercent: 100, stage: WORKER_STAGE.COMPLETED } });
                EventBus.emit(EVT.UPDATE_PROGRESS);

                await sleep(1500 * multiplier, 1000 * multiplier);
                return false; // 부모 측에서 일괄 저장하므로 false 반환
            } else {
                throw new Error(`추출 실패 (만화 팝업 수집 실패)`);
            }
        }
    } finally {
        // [H2] activeWorkers 정리 — 단일/배치 무관하게 항상 실행
        activeWorkers.delete(id);
        
        // 단일 합본 및 배치 모드가 아닐 때만 즉시 큐 청소 (UI 지속 노출 보장)
        if (!isSingleVolume && buildingPolicy !== 'zipOfCbzs') {
            removeQueueItem(id);
        }
    }
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
    const config = getConfig();
    let isAsyncDelegate = false;
    
    // --- 🚨 대기열 프리체크 스마트 필터 및 UI 위임 ---
    const currentQueue = getQueue();
    if (currentQueue.length > 0) {
        const hasFailed = currentQueue.some(item => item.status === 'failed');
        const hasPendingOrProcessing = currentQueue.some(item => item.status === 'pending' || item.status === 'processing');

        if (hasFailed || hasPendingOrProcessing) {
            const confirmNew = confirm(
                "⚠️ 대기열에 완료되지 않았거나 실패한 수집 항목이 남아있습니다.\n\n" +
                "[확인] 기존 대기열 초기화 후 새로 다운로드 시작\n" +
                "[취소] 다운로드 요청 취소 및 대기열 수동 관리 창 열기"
            );
            
            if (confirmNew) {
                console.log('[TokiSync] 사용자의 승인으로 기존 대기열을 초기화합니다.');
                stopAllWorkers();
                clearQueue();
            } else {
                console.log('[TokiSync] 다운로드 요청을 취소하고 대기열 관리 창을 엽니다.');
                showProgressModal();
                return;
            }
        } else {
            // 온전히 완료된 큐만 있다면 묻지 않고 자동 초기화
            console.log('[TokiSync] 이전 수집이 정상 완료되었으므로 대기열을 자동 초기화합니다.');
            clearQueue();
        }
    }
    // ------------------------------------------------

    logger.init();
    logger.show();
    logger.info(`다운로드 시작 (정책: ${policy}, 강제 덮어쓰기: ${forceOverwrite})...`);

    // Auto-start Anti-Sleep mode
    try {
        startSilentAudio();
        logger.success('[Anti-Sleep] 백그라운드 모드 자동 활성화');
    } catch (e) {
        logger.log('[Anti-Sleep] 자동 시작 실패 (사용자 상호작용 필요)', 'error');
    }

    const failedEpisodes = [];  // [v1.8.1] 완전 실패 리스트
    const partialFailures = []; // [v1.8.1] 부분 실패 리스트 (이미지 일부 누락)
    const siteInfo = await detectSite();
    if (!siteInfo) {
        EventBus.emit(EVT.NOTIFY_ERROR, { msg: "지원하지 않는 사이트이거나 다운로드 페이지가 아닙니다." });
        stopSilentAudio();
        return;
    }

    const parser = await ParserFactory.getParser();
    if (!parser) {
        EventBus.emit(EVT.NOTIFY_ERROR, { msg: "파서를 초기화할 수 없습니다." });
        stopSilentAudio();
        return;
    }

    const { category, matchedRule } = siteInfo;
    const siteName = matchedRule?.name || "TokiSync Parser";
    logger.info(`적용 중인 파서 규칙: [${siteName}] (${matchedRule?.id || 'unknown'})`);
    const isNovel = (category === 'Novel' || category === 'novel');

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
        } else if (policy === 'drive' || policy === 'drive_kavita') {
            buildingPolicy = 'individual'; // 빌딩은 개별 CBZ 단위
            destination = policy;          // 저장 대상은 Google Drive (kavita 여부 유지)
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

        // [v1.8.2] Graceful Fallback for missing Drive configuration
        if ((destination === 'drive' || destination === 'drive_kavita') && !isConfigValid()) {
            EventBus.emit(EVT.NOTIFY_ERROR, { msg: '구글 드라이브 설정(Folder ID 등)이 누락되었습니다. 임시로 개별 로컬 다운로드 정책으로 전환합니다.' });
            logger.warn('⚠️ 구글 드라이브 설정 누락 감지. 정책을 개별 로컬 다운로드로 자동 전환합니다.', 'System');
            buildingPolicy = 'individual';
            destination = 'local';
        }

        const configNovelFormat = getConfig().novelFormat || 'epub';
        const EXTENSION_MAP = {
            'Novel': configNovelFormat,
            'novel': configNovelFormat,
            'Webtoon': 'cbz',
            'webtoon': 'cbz',
            'Manga': 'cbz',
            'manga': 'cbz'
        };

        if (buildingPolicy === 'zipOfCbzs') {
            masterZip = new JSZip(); // Master Container for current batch
            extension = EXTENSION_MAP[category] ?? 'cbz';
        } else {
            // Individual / native / drive
            extension = EXTENSION_MAP[category] ?? 'cbz';
        }

        // Get List
        let list = await parser.getListItems();

        // [v1.9.1] 정렬 로직 통합: 범위 필터 여부와 상관없이 항상 오름차순(1화~N화)으로 정렬
        const rangeSet = parseRangeSpec(rangeSpec);
        const mappedList = list.map(li => {
            const item = parser.parseListItem(li.element || li);
            return { li, num: parseInt(item.num) || 0 }; // 숫자가 아니면 0으로 처리하여 상단 배치
        });

        if (rangeSet) {
            list = mappedList.filter(item => rangeSet.has(item.num))
                             .sort((a, b) => a.num - b.num)
                             .map(item => item.li);
            logger.log(`범위 필터 적용 및 오름차순 정렬 완료: ${rangeSpec} → ${list.length}개 항목`);
        } else {
            list = mappedList.sort((a, b) => a.num - b.num)
                             .map(item => item.li);
            logger.log(`전체 항목 오름차순 정렬 완료: ${list.length}개 항목`);
        }
        
        // Log episode range
        if (list.length > 0) {
            const first = parser.parseListItem(list[list.length - 1]); // usually reversed order
            const last = parser.parseListItem(list[0]);
            logger.info(`총 ${list.length}개 항목 처리 예정. (${first.title} ~ ${last.title})`, 'Downloader');
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
        
        // [v1.9.4] Extract Series ID via Parser rules with robust fallback
        const seriesId = parser.getSeriesId();

        // Determine Root Folder Name & Series Title
        const rootFolder = parser.getFormattedTitle(seriesId, first.title, last.title, getCommonPrefix);
        const seriesTitle = rootFolder.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '');
        const listPrefixTitle = (list.length > 1) ? getCommonPrefix(first.title, last.title) : "";

        // [v1.24.0] 수집 시점의 각 챕터별 원본 상세 제목 매핑 객체 구축
        const episodeTitles = {};
        list.forEach(item => {
            try {
                const ep = parser.parseListItem(item);
                if (ep && ep.num) {
                    const numKey = parseInt(ep.num).toString();
                    episodeTitles[numKey] = ep.title || "";
                }
            } catch (e) {
                logger.warn(`[Downloader] Episode title parse failed: ${e.message}`, 'Downloader');
            }
        });

        // [v1.7.0] Collect detailed metadata for Phase 3 Persistence
        const seriesMetadata = {
            ...parser.getSeriesMetadata(),
            id: seriesId,
            sourceId: seriesId,
            vendorId: parser.rule?.id || parser.getSeriesMetadata().vendorId || (matchedRule?.name || "").toLowerCase().replace(/[^a-z0-9]/g, ''),
            title: seriesTitle || rootFolder,
            originalSeriesTitle: parser.getSeriesTitle() || "",
            episodeTitles: episodeTitles, // [추가] 클라이언트 획득 에피소드 제목 목록
            thumbnail: parser.getThumbnailUrl() || "",
            vendor: parser.getSeriesMetadata().vendor || (matchedRule?.name || "").toLowerCase().replace(/[^a-z0-9]/g, '')
        };

        // [Fix] Append Range [Start-End] for Local Merged Files (folderInCbz / zipOfCbzs)
        // GAS Upload uses individual files so no range needed in folder name
        // [v1.6.0 Update] Batch range is handled during saving, not in rootFolder variable

        // [v1.4.0] Upload Series Thumbnail (if uploading to Drive)
        let historyFolderId = null;
        if (destination === 'drive' || destination === 'drive_kavita') {
            try {
                const thumbnailUrl = parser.getThumbnailUrl();
                if (thumbnailUrl) {
                    logger.log('📷 시리즈 썸네일 업로드 중...');
                    const thumbBlob = await fetchBlobWithXHR(thumbnailUrl, document.URL);
                    
                    // Upload as 'cover.jpg' - network.js will auto-redirect to _Thumbnails/{ID}.jpg
                    // saveFile(data, filename, type, extension, metadata)
                    // → fullFileName = "cover.jpg"
                    const cleanSeries = seriesTitle.replace(/^\[[^\]]+\]\s*/, '');
                    const targetFolder = destination === 'drive_kavita' ? cleanSeries : rootFolder;
                    await saveFile(thumbBlob, 'cover', 'drive', 'jpg', { 
                        category,
                        folderName: targetFolder,
                        destination: destination,
                        folderId: historyFolderId || undefined
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

        if (destination === 'drive' || destination === 'drive_kavita') {
            try {
                if (forceOverwrite) {
                    logger.log('⚠️ 강제 재다운로드 옵션 활성화: 기존 업로드 기록 무시 (전체 덮어쓰기)');
                } else {
                    logger.log('☁️ 드라이브 업로드 기록 및 용량 확인 중 (Smart Skip)...');
                    const cleanFolder = rootFolder.replace(/^\[[^\]]+\]\s*/, '');
                    const targetFolder = destination === 'drive_kavita' ? cleanFolder : rootFolder;
                    const histResult = await fetchHistoryDirect(targetFolder, category);
                    
                    if (histResult.success) {
                        historyFolderId = histResult.folderId;
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
                        data: JSON.stringify({ type: "get_library", folderId: config.folderId, apiKey: config.apiKey, protocolVersion: 3 }),
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

        // [v1.21.2] 공통 범용 큐 선등록 래퍼 (Universal Queue Pre-Registration)
        // 어떤 다운로드 정책이 들어와도 루프 시작 전 전체 수집 대상 에피소드 목록을 큐에 선등록
        const currentNovelMode = getConfig().novelMode;
        const currentIsSingleVolume = isNovel && currentNovelMode === 'singleVolume';
        
        const pendingEpisodes = [];
        for (let i = 0; i < list.length; i++) {
            const item = parser.parseListItem(list[i].element || list[i]);
            const numStr = item.num ? item.num.toString() : '';
            const numPlain = parseInt(numStr).toString();
            
            // 구글 드라이브 스킵 필터 (드라이브 전용)
            const isSkip = await shouldSkipEpisode({
                numStr,
                destination,
                isSingleVolume: currentIsSingleVolume,
                uploadedHistorySet,
                historyCheckTimeoutFlag,
                historyFolderId
            });
            if (isSkip) continue;
            
            pendingEpisodes.push({
                title: item.title,
                url: item.src || item.url || (list[i].element || list[i]).href || location.href,
                episodeNum: numStr,
                category: category,
                viewerCfg: parser.rule.viewer || {},
                rootFolder: rootFolder,
                destination: destination,
                novelFormat: configNovelFormat,
                matchedRule: parser.rule,
                protocolDomain: parser.protocolDomain || window.location.origin,
                seriesMetadata: seriesMetadata
            });
        }

        if (pendingEpisodes.length === 0) {
            if ((destination === 'drive' || destination === 'drive_kavita') && !currentIsSingleVolume) {
                logger.success('✅ 모든 에피소드가 이미 드라이브에 존재하여 수집을 조기 완료합니다.', 'Queue');
                stopSilentAudio();
                return;
            }
        } else {
            // [v1.21.4] 구글 드라이브 업로드 모드 시, 큐 등록 전 작품 폴더를 선제 생성/확정하여 큐 전파 (경쟁적 중복 폴더 생성 차단)
            let activeFolderId = historyFolderId;
            if ((destination === 'drive' || destination === 'drive_kavita') && !activeFolderId) {
                const cleanSeries = seriesTitle.replace(/^\[[^\]]+\]\s*/, '');
                const targetFolder = destination === 'drive_kavita' ? cleanSeries : rootFolder;
                logger.log(`📁 [Drive] 신규 작품 폴더 선제 생성 중: ${targetFolder}`);
                try {
                    const token = await getOAuthToken();
                    let parentFolderId = getConfig().folderId;
                    if (destination === 'drive' || destination === 'drive_kavita') {
                        const categoryFolder = category || 'Webtoon';
                        parentFolderId = await getOrCreateFolder(categoryFolder, getConfig().folderId, token);
                    }
                    activeFolderId = await getOrCreateFolder(targetFolder, parentFolderId, token);
                    logger.success(`📁 [Drive] 신규 작품 폴더 선제 생성 완료 -> ID: ${activeFolderId}`);
                } catch (folderErr) {
                    logger.error(`❌ [Drive] 폴더 선제 생성 중 에러 발생: ${folderErr.message}`);
                }
            }

            // 모든 pendingEpisodes에 확정된 폴더 ID 주입
            const mappedEpisodes = pendingEpisodes.map(ep => ({
                ...ep,
                folderId: activeFolderId || ''
            }));

            const injected = addEpisodesToQueue(mappedEpisodes, seriesTitle);
            logger.log(`🗂️ [공통 큐] 수집 대상 ${injected}개 에피소드를 대기열에 선등록 완료.`, 'Queue');
        }

        // [v1.26.4] 소설 합본 모드를 제외한 모든 다운로드 정책을 신뢰성 높은 배치 큐 파이프라인으로 대통합
        if (!currentIsSingleVolume) {
            logger.log(`🚦 [멀티큐] 차세대 자율형 멀티큐 배치 수집기(v1.21.0) 가동 준비...`, 'Queue');

            // 팝업 차단 회피용 동기적 자식 창 사전 오픈 (Pre-open)
            const MAX_CONCURRENCY = 1;
            const openCount = Math.min(MAX_CONCURRENCY, pendingEpisodes.length);
            logger.log(`🛡️ 팝업 차단 필터 우회를 위한 자식 창 ${openCount}개 선제 확보(Pre-open) 중...`, 'Queue');

            const width = 400;
            const height = 600;
            const leftBase = window.screen.width - width - 50;
            const topBase = 100;

            const freshlyOpened = [];
            for (let i = 0; i < openCount; i++) {
                const ep = pendingEpisodes[i];
                const id = getQueueItemId(seriesTitle, ep.episodeNum);
                const left = leftBase - (i * 50);
                const top = topBase + (i * 50);
                const workerName = `tokisync_novel_worker_${id}`.replace(/[^a-zA-Z0-9_]/g, '');

                logger.log(`🚀 [Pre-open #${i + 1}] 자식 팝업 창 생성: ${ep.title}`);
                const popupRef = window.open(
                    ep.url,
                    workerName,
                    `width=${width},height=${height},left=${left},top=${top},noopener=false,scrollbars=yes,resizable=yes`
                );

                if (popupRef) {
                    activeWorkers.set(id, popupRef);
                    updateQueueItem(id, { status: 'processing', stage: WORKER_STAGE.INIT });
                    freshlyOpened.push(id);
                } else {
                    logger.error(`❌ [Pre-open #${i + 1}] 브라우저 차단으로 자식 창 확보에 실패하였습니다.`, 'Queue');
                }
            }

            if (freshlyOpened.length > 0) {
                logger.success(`🚦 멀티큐 스케줄러 기동 완료. 릴레이 루프 활성화.`, 'Queue');
                initBatchWorkerController();
                initQueueScheduler();
                isAsyncDelegate = true;
            } else {
                logger.error(`❌ 선제 확보된 자식 창이 없어 큐 수집을 중지합니다.`, 'Queue');
                stopSilentAudio();
            }

            return; // 큐 엔진에 스케줄 위임 후 early exit
        }

        // Create IFrame
        // 목록 페이지 최하단에 배치 + opacity 0.1
        // IntersectionObserver가 정상 동작하며, 브라우저가 일반 문서 흐름으로 렌더링
        const iframe = document.createElement('iframe');
        iframe.classList.add('toki-visible-block', 'toki-downloader-iframe');
        document.body.appendChild(iframe);

        // [v1.7.1] Novel Single Volume Mode Init
        const configParams = getConfig();
        const novelMode = configParams.novelMode;
        const novelFormat = configParams.novelFormat || 'epub';
        const isSingleVolume = isNovel && novelMode === 'singleVolume';
        let masterNovelBuilder = null;
        if (isSingleVolume) {
            masterNovelBuilder = novelFormat === 'txt' ? new TxtBuilder() : new EpubBuilder();
            logger.log(`📙 소설 단행본 합본 모드 활성화 (${novelFormat.toUpperCase()}) (마지막에 한 번에 저장됩니다)`);
        }

        // --- Processing Loop ---
        for (let i = 0; i < list.length; i++) {
            const item = parser.parseListItem(list[i].element || list[i]); 
            console.clear();
            logger.info(`[${i + 1}/${list.length}] 처리 중: ${item.title}`);

            // [v1.5.0 Smart Skip] Skip already-uploaded episodes (Drive policy only)
            // [v1.7.1] Bypass skipping in Single Volume mode (we need all chapters)
            const numStr = item.num ? item.num.toString() : '';
            const isSkip = await shouldSkipEpisode({
                numStr,
                destination,
                isSingleVolume,
                uploadedHistorySet,
                historyCheckTimeoutFlag,
                historyFolderId,
                logOnSkip: true,
                episodeTitle: item.title
            });
            if (isSkip) continue;

            // Decision based on Policy
            let currentBuilder = null;

            // [v1.6.0] Strategy: Always use a FRESH builder per item for Kavita compatibility
            // [v1.7.1] Except for Novel Single Volume Mode
            if (isSingleVolume) {
                currentBuilder = masterNovelBuilder;
            } else {
                if (isNovel) currentBuilder = novelFormat === 'txt' ? new TxtBuilder() : new EpubBuilder();
                else currentBuilder = new CbzBuilder();
            }

            // Process Item
            let selfContained = false;
            try {
                selfContained = await processItem(item, currentBuilder, siteInfo, iframe, parser, seriesTitle, null, rootFolder, destination);
                
                // [v1.8.1] 부분 실패 체크 (이미지 누락 여부) - 자립형 워커가 아닌 로컬 빌더 구동 시에만 처리
                if (!selfContained && currentBuilder && currentBuilder.chapters) {
                    const latestChapter = currentBuilder.chapters[currentBuilder.chapters.length - 1];
                    if (latestChapter && Array.isArray(latestChapter.images)) {
                        const missingCount = latestChapter.images.filter(img => img.isMissing).length;
                        if (missingCount > 0) {
                            console.warn(`[Downloader] 부분 실패 감지: ${item.title} (이미지 ${missingCount}개 누락)`);
                            partialFailures.push({
                                num: item.num,
                                title: item.title,
                                missingCount: missingCount
                            });
                        }
                    }
                }

                if (!selfContained && isSingleVolume) {
                    const currentSize = currentBuilder.chapters ? currentBuilder.chapters.length : (currentBuilder.content ? currentBuilder.content.split('===').length - 1 : 0);
                    logger.log(`📥 챕터 추가 완료: ${item.title} (현재 ${currentSize}개)`, 'Downloader');
                }
            } catch (err) {
                console.error(err);
                const errorMsg = err.message || "알 수 없는 오류";
                logger.error(`항목 처리 실패 (${item.title}): ${errorMsg}`, 'Downloader');
                
                // [v1.8.1] 실패 내역 저장
                failedEpisodes.push({
                    num: item.num,
                    title: item.title,
                    error: errorMsg
                });
                continue; // Skip faulty item but continue loop
            }

            // 만약 자식 워커가 업로드/저장까지 자체 종결했다면, 부모 창의 개별 파일 빌딩/저장 흐름을 완전히 건너뛴다.
            if (selfContained) {
                continue;
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

                // Final Filename: Dynamic based on Template or Drive fallback
                let fullFilename;
                if (destination !== 'drive') {
                    const template = config.localNameTemplate || "{number:4} - {title}";
                    const cleanSeries = (seriesTitle || rootFolder || '').replace(/^\[[^\]]+\]\s*/, '');
                    
                    // 1. Dynamic padding {number:X} support
                    fullFilename = template.replace(/\{number:(\d)\}/g, (match, p1) => {
                        const padSize = parseInt(p1, 10);
                        return padSize > 0 
                            ? (item.num || '').toString().padStart(padSize, '0') 
                            : (item.num || '').toString();
                    });

                    // 2. Legacy {number} & {rawNumber} fallback
                    const legacyPaddedNum = (item.num || '').toString().padStart(4, '0');
                    fullFilename = fullFilename
                        .replace(/\{number\}/g, legacyPaddedNum)
                        .replace(/\{rawNumber\}/g, (item.num || '').toString())
                        .replace(/\{series\}/g, cleanSeries)
                        .replace(/\{title\}/g, chapterTitle || '');
                } else {
                    // drive (레거시): 기존 명명법인 `[ID] 작품명 0001화` 강제 적용
                    const paddedNum = (item.num || '').toString().padStart(4, '0');
                    fullFilename = `${rootFolder} ${paddedNum}화`;
                }

                // [v1.6.0] Kavita Metadata Insertion
                const innerZip = await currentBuilder.build({ 
                    series: seriesTitle || rootFolder,
                    title: chapterTitle,
                    number: item.num,
                    writer: siteName
                });
                const blob = await innerZip.generateAsync({ type: "blob" });

                if (buildingPolicy === 'zipOfCbzs') {
                    console.log(`[MasterZip] 추가 중: ${fullFilename}.${extension}`);
                    masterZip.file(`${fullFilename}.${extension}`, blob);
                    
                    // [v1.8.2] Batching Logic
                    // Novel: Infinite batch. Webtoon: 10 per batch to prevent OOM (하향 조정)
                    const processedCount = i + 1;
                    const isLastItem = (i === list.length - 1);
                    const BATCH_SIZE = isNovel ? Infinity : 10;

                    if ((BATCH_SIZE !== Infinity && processedCount % BATCH_SIZE === 0) || isLastItem) {
                        const batchNum = Math.ceil(processedCount / BATCH_SIZE);
                        const batchFilename = `${rootFolder}_Part${batchNum}`;
                        
                        logger.info(`📦 배치 저장 중... (${batchFilename})`);
                        await saveFile(masterZip, batchFilename, 'local', 'zip', { category });
                        
                        // Clear masterZip for next batch to save memory and GC
                        masterZip = null;
                        masterZip = new JSZip();
                    }
                } else if (buildingPolicy === 'individual') {
                    // [v1.6.0] Phase B-3: Fast Path Smart Branching
                    let success = false;
                    const cachedFileId = episodeCacheMap.get(fullFilename);

                    if ((destination === 'drive' || destination === 'drive_kavita') && cachedFileId) {
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
                                const chunkBase64 = arrayBufferToBase64(chunkBuffer);

                                await new Promise((res, rej) => {
                                    GM_xmlhttpRequest({
                                        method: "POST", url: getConfig().gasUrl,
                                            data: JSON.stringify({ 
                                                type: "upload", uploadUrl: updateUrl, chunkData: chunkBase64, 
                                                folderId: getConfig().folderId,
                                                protocolVersion: 3,
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
                // Styles moved to .toki-badge in ui.css
                
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
                
                // Visual feedback (v1.9.5 consistent styling)
                item.element.classList.add('toki-downloaded');
            }
            
            // GC 가드: 사용 완료된 개별 챕터 빌더의 메모리 즉시 해제
            currentBuilder = null;
        }


        // [v1.7.1] Finalize Single Volume EPUB/TXT
        if (isSingleVolume && masterNovelBuilder) {
            const hasContent = masterNovelBuilder.chapters ? masterNovelBuilder.chapters.length > 0 : masterNovelBuilder.content.length > 0;
            if (hasContent) {
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
                    
                    logger.info(`📚 단행본 조립 및 저장 중... (${finalFilename})`);
                    
                    const finalZip = await masterNovelBuilder.build({
                        series: seriesTitle || rootFolder,
                        title: seriesTitle || rootFolder,
                        writer: siteName
                    });
                    const finalBlob = await finalZip.generateAsync({ type: "blob" });
                    
                    await saveFile(finalBlob, finalFilename, destination, extension, {
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

        // [v1.5.5] 배치 완료 후 Drive 캐시 단일 갱신 (에피소드마다 호출하지 않음)
        if (destination === 'drive' || destination === 'drive_kavita') {
            const cleanFolder = rootFolder.replace(/^\[[^\]]+\]\s*/, '');
            const targetFolder = destination === 'drive_kavita' ? cleanFolder : rootFolder;
            refreshCacheAfterUpload(targetFolder, category, seriesMetadata).catch(e =>
                logger.warn(`캐시 갱신 호출 중 실패 (무시): ${e.message}`, 'GAS:Cache')
            );
        }

        logger.success(`✅ 모든 작업 완료!`);
        Notifier.notify('TokiSync', `다운로드 완료! (${list.length - failedEpisodes.length}개 성공, ${failedEpisodes.length}개 실패)`);

        // [v1.8.1] 고도화된 실패 리포트 생성 및 저장 (MCP 검토 반영)
        await generateDownloadReport(seriesTitle || rootFolder, seriesId, list.length, failedEpisodes, partialFailures);

    } catch (error) {
        console.error(error);
        logger.error(`전체 다운로드 루틴 오류 발생: ${error.message}`, 'System');
        alert(`다운로드 중 오류 발생:\n${error.message}`);
    } finally {
        if (!isAsyncDelegate) {
            // Auto-stop Anti-Sleep mode
            stopSilentAudio();
            logger.log('[Anti-Sleep] 백그라운드 모드 자동 종료');
        } else {
            console.log('[Anti-Sleep] 비동기 멀티큐 배치 위임으로 안티 슬립 상태를 지속 유지합니다.');
        }
        
        // [Cleanup 팝업 세션] 다운로드 종료 후 액티브 팝업 폐쇄
        try {
            closeActiveWorker();
        } catch (popupErr) {
            console.warn('[Downloader] 팝업 클린업 실패:', popupErr);
        }

        // Cleanup
        const iframe = document.querySelector('iframe');
        if (iframe) iframe.remove();
    }
}



/**
 * [v1.8.1] 다운로드 실패 리포트 생성 및 다운로드 (MCP 검토 의견 반영)
 * @private
 */
async function generateDownloadReport(seriesTitle, seriesId, listCount, failedEpisodes, partialFailures) {
    if (failedEpisodes.length === 0 && partialFailures.length === 0) return;

    logger.warn(`⚠️ 다운로드 중 일부 오류가 발견되었습니다. 리포트를 생성합니다.`, 'System');

    const timestamp = new Date().toLocaleString();
    const lines = [
        `[TokiSync 다운로드 리포트]`,
        `작품명: ${seriesTitle}`,
        `일시: ${timestamp}`,
        `--------------------------------------------------`,
        `■ 요약 (Summary)`,
        `- 총 시도: ${listCount}개`,
        `- 성공: ${listCount - failedEpisodes.length}개`,
        `- 완전 실패: ${failedEpisodes.length}개 (파일이 생성되지 않음)`,
        `- 부분 실패: ${partialFailures.length}개 (파일은 생성되었으나 일부 데이터 누락)`,
        `--------------------------------------------------`,
    ];

    if (failedEpisodes.length > 0) {
        lines.push(``, `■ 완전 실패 목록 (Critical Failures)`, `(원인 분석 후 해당 회차만 재시도해 보세요)`);
        failedEpisodes.forEach(fail => {
            lines.push(`- [${fail.num}] ${fail.title} : ${fail.error}`);
        });
    }

    if (partialFailures.length > 0) {
        lines.push(``, `■ 부분 실패 목록 (Warnings/Partial Success)`, `(다운로드는 완료되었으나 일부 페이지가 누락된 항목입니다)`);
        partialFailures.forEach(fail => {
            lines.push(`- [${fail.num}] ${fail.title} : 이미지 ${fail.missingCount}개 누락`);
        });
    }

    lines.push(``, `--------------------------------------------------`, `위 리포트를 참고하여 누락된 회차를 확인하시기 바랍니다.`);

    const reportContent = lines.join('\n');
    const reportBlob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const cleanSeriesTitle = (seriesTitle || "Unknown").replace(/[<>:"/\\|?*]/g, '').trim();
    const reportFilename = `${cleanSeriesTitle}_다운로드_실패_리포트`;

    try {
        await saveFile(reportBlob, reportFilename, 'local', 'txt');
        logger.success(`✅ 실패 리포트 다운로드 완료: ${reportFilename}.txt`);
    } catch (e) {
        console.error('[Downloader] 리포트 저장 실패:', e);
    }
}
