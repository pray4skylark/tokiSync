import { sleep, waitIframeLoad, saveFile, getCommonPrefix } from './utils.js';
import { getListItems, parseListItem, getNovelContent, getImageList } from './parser.js';
import { detectSite } from './detector.js';
import { EpubBuilder } from './epub.js';
import { CbzBuilder } from './cbz.js';
import { LogBox, Notifier } from './ui.js';

// Processing Loop에 해당되는 로직을 분리 한다.
export async function processItem(item, builder, siteInfo, iframe, seriesTitle = "") {
    const { site, protocolDomain } = siteInfo;
    const isNovel = (site === "북토끼");

    await waitIframeLoad(iframe, item.src);
    
    // Apply Random Sleep: 1000ms + (0~3000ms random)
    await sleep(1000, 3000);
    
    const iframeDoc = iframe.contentWindow.document;

    if (isNovel) {
        const text = getNovelContent(iframeDoc);
        // Add chapter to existing builder instance
        builder.addChapter(item.title, text);
    } 
    else {
        // Webtoon / Manga
        const imageUrls = getImageList(iframeDoc, protocolDomain);
        console.log(`이미지 ${imageUrls.length}개 감지`);

        // Fetch Images Parallel
        const images = await fetchImages(imageUrls);
        
        // Add chapter to builder
        // Clean the title if seriesTitle exists
        let chapterTitleOnly = item.title;
        if (seriesTitle && chapterTitleOnly.startsWith(seriesTitle)) {
            chapterTitleOnly = chapterTitleOnly.replace(seriesTitle, '').trim();
        }

        // Construct clean folder name: "0001 1화"
        const cleanChapterTitle = `${item.num} ${chapterTitleOnly}`;
        builder.addChapter(cleanChapterTitle, images);
    }
}


export async function tokiDownload(startIndex, lastIndex, policy = 'folderInCbz') {
    const logger = LogBox.getInstance();
    logger.init();
    logger.show();
    logger.log(`다운로드 시작 (정책: ${policy})...`);

    const siteInfo = detectSite();
    if (!siteInfo) {
        alert("지원하지 않는 사이트이거나 다운로드 페이지가 아닙니다.");
        return;
    }
    const { site, protocolDomain } = siteInfo;
    const isNovel = (site === "북토끼");

    try {
        // Prepare Strategy Variables
        let mainBuilder = null;
        let masterZip = null;
        let extension = 'zip';
        let destination = 'local';
        
        let buildingPolicy = policy; 
        if (policy === 'gasUpload') {
            buildingPolicy = 'individual';
            destination = 'drive';
        }
        
        // Determine Category for GAS
        let category = 'Webtoon';
        if (site === '북토끼') category = 'Novel';
        else if (site === '마나토끼') category = 'Manga';

        if (buildingPolicy === 'folderInCbz') {
            if (isNovel) {
                mainBuilder = new EpubBuilder();
                extension = 'epub';
            } else {
                mainBuilder = new CbzBuilder();
                extension = 'cbz';
            }
        } else if (buildingPolicy === 'zipOfCbzs') {
            masterZip = new JSZip(); // Master Container
            extension = isNovel ? 'epub' : 'cbz';
        } else {
            // Individual (or gasUpload): No shared builder or master zip needed initially
            extension = isNovel ? 'epub' : 'cbz';
        }

        // Get List
        let list = getListItems();

        // Filter Logic
        if (startIndex) {
            list = list.filter(li => {
                const num = parseInt(li.querySelector('.wr-num').innerText);
                return num >= startIndex;
            });
        }
        if (lastIndex) {
            list = list.filter(li => {
                const num = parseInt(li.querySelector('.wr-num').innerText);
                return num <= lastIndex;
            });
        }
        
        logger.log(`총 ${list.length}개 항목 처리 예정.`);

        if (list.length === 0) {
            alert("다운로드할 항목이 없습니다.");
            return;
        }

        // Folder Name (Title) & Common Title Extraction
        const first = parseListItem(list[0]);
        const last = parseListItem(list[list.length - 1]);
        
        // Extract Series ID from URL
        // https://.../webtoon/123456?page=...
        // Pattern: /novel/(\d+) or /webtoon/(\d+) or /comic/(\d+)
        const idMatch = document.URL.match(/\/(novel|webtoon|comic)\/([0-9]+)/);
        const seriesId = idMatch ? idMatch[2] : "0000";

        let seriesTitle = "";
        let rootFolder = "";

        if (list.length > 1) {
            seriesTitle = getCommonPrefix(first.title, last.title);
            if (seriesTitle.length > 2) {
                // If common prefix exists, use it as series title
                 rootFolder = `[${seriesId}] ${seriesTitle}`;
            } else {
                 // Fallback format if no clear prefix found (rare)
                 rootFolder = `[${seriesId}] ${first.title} ~ ${last.title}`;
            }
        } else {
             rootFolder = `[${seriesId}] ${first.title}`;
        }

        // [Fix] Append Range [Start-End] for Local Merged Files (folderInCbz / zipOfCbzs)
        // GAS Upload uses individual files so no range needed in folder name
        if (buildingPolicy === 'folderInCbz' || buildingPolicy === 'zipOfCbzs') {
            const startNum = parseInt(first.num);
            const endNum = parseInt(last.num);
            const rangeStr = (list.length > 1) ? ` [${startNum}-${endNum}]` : ` [${startNum}]`;
            rootFolder += rangeStr;
        }

        // Create IFrame
        const iframe = document.createElement('iframe');
        iframe.width = 600; iframe.height = 600;
        iframe.style.position = 'fixed'; iframe.style.top = '-9999px'; // Hide it
        document.body.appendChild(iframe);

        // --- Processing Loop ---
        for (let i = 0; i < list.length; i++) {
            const item = parseListItem(list[i].element || list[i]); 
            console.clear();
            logger.log(`[${i + 1}/${list.length}] 처리 중: ${item.title}`);

            // Decision based on Policy
            let currentBuilder = null;

            if (buildingPolicy === 'folderInCbz') {
                currentBuilder = mainBuilder;
            } else {
                // For 'zipOfCbzs' and 'individual', we need a FRESH builder per item
                if (isNovel) currentBuilder = new EpubBuilder();
                else currentBuilder = new CbzBuilder();
            }

            // Process Item
            try {
                await processItem(item, currentBuilder, siteInfo, iframe, seriesTitle);
            } catch (err) {
                console.error(err);
                logger.error(`항목 실패 (${item.title}): ${err.message}`);
                continue; // Skip faulty item but continue loop
            }

            // Post-Process for Non-Default Policies
            if (buildingPolicy !== 'folderInCbz') {
                // Build the individual chapter file
             
                // Clean Filename Logic
                // 1. GAS Upload (Drive): Format "0001 - 1화" (Remove Series Title)
                // 2. Local Individual: Format "0001 - SeriesTitle 1화" (Keep Full Title)
                
                let chapterTitle = item.title;
                
                // Only clean (remove series title) if uploading to Drive
                if (destination === 'drive' && seriesTitle && chapterTitle.startsWith(seriesTitle)) {
                    chapterTitle = chapterTitle.replace(seriesTitle, '').trim();
                }

                // Final Filename: "0001 - Title"
                const fullFilename = `${item.num} - ${chapterTitle}`;

                const innerZip = await currentBuilder.build({ title: fullFilename, author: site });
                const blob = await innerZip.generateAsync({ type: "blob" });

                if (buildingPolicy === 'zipOfCbzs') {
                    console.log(`[MasterZip] 추가 중: ${fullFilename}.${extension}`);
                    masterZip.file(`${fullFilename}.${extension}`, blob);
                } else if (buildingPolicy === 'individual') {
                    // Immediate Save (Local or Drive based on destination)
                    await saveFile(blob, fullFilename, destination, extension, {
                        folderName: rootFolder, // [ID] Series Title
                        category: category
                    }); 
                }
            }
        }

        // Cleanup
        iframe.remove();

        // Finalize Build
        // Finalize Build
        if (buildingPolicy === 'folderInCbz' && mainBuilder) {
            logger.log("통합 파일 생성 및 저장 중...");
            const zip = await mainBuilder.build({ title: rootFolder, author: site });
            await saveFile(zip, rootFolder, destination, extension, { category });
        } else if (buildingPolicy === 'zipOfCbzs' && masterZip) {
            logger.log("Master ZIP 파일 생성 및 저장 중...");
            await saveFile(masterZip, rootFolder, 'local', 'zip', { category }); 
        }

        logger.success("모든 작업 완료!");
        Notifier.notify("다운로드 완료", `${rootFolder} (${list.length} 항목)`);

    } catch (error) {
        console.error(error);
        alert(`오류 발생: ${error.message}`);
        LogBox.getInstance().error(error.message);
    }
}

async function fetchImages(imageUrls) {
    const promises = imageUrls.map(async (src) => {
        try {
            const response = await fetch(src);
            const blob = await response.blob();
            
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

            return { src, blob, ext };
        } catch (e) {
            console.error(`이미지 다운로드 실패: ${src}`, e);
            return null;
        }
    });

    return await Promise.all(promises);
}
