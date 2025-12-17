/**
 * 🎨 TokiSync Viewer Logic
 * - Episode List Management
 * - Image Viewer (1-page / 2-page / RTL)
 * - Chunk Downloading & Unzipping
 */

// State
let currentBookList = [];
let currentBookIndex = -1;
/**
 * 뷰어 상태 객체
 * @property {string} mode - 보기 모드 ('1page' | '2page')
 * @property {boolean} coverPriority - 2쪽 보기 시 표지(첫장) 단독 표시 여부
 * @property {boolean} rtlMode - 오른쪽에서 왼쪽으로 읽기 (만화 모드)
 * @property {Array<Object>} images - 이미지 객체 리스트 ({src, width, height, loaded})
 * @property {Array<Array<number>>} spreads - 펼침면 구성 (페이지 인덱스 배열의 배열)
 * @property {number} currentSpreadIndex - 현재 보고 있는 펼침면 인덱스
 * @property {boolean} preload - 다음 화 미리 불러오기 활성화 여부
 */
let vState = {
    mode: '1page', // '1page' or '2page'
    coverPriority: true,
    rtlMode: false,
    images: [], 
    spreads: [], 
    currentSpreadIndex: 0,
    settingsTimer: null,
    preload: true
};
let nextBookPreload = null;

// ============================================================
// 1. Episode List
// ============================================================
/**
 * 회차 목록 모달을 열고 데이터를 로드합니다.
 * @param {string} seriesId - 시리즈 폴더 ID
 * @param {string} title - 시리즈 제목
 * @param {number} seriesIndex - (Optional) 시리즈 인덱스
 */
async function openEpisodeList(seriesId, title, seriesIndex) {
    document.getElementById('episodeModal').style.display = 'flex';
    document.querySelector('#episodeModal .modal-title').innerText = `📄 ${title}`;
    const listEl = document.getElementById('episodeList');
    listEl.innerHTML = '<div style="padding:20px; color:#888;">로딩 중...</div>';

    try {
        const books = await API.request('view_get_books', { seriesId: seriesId });
        document.querySelector('#episodeModal .modal-title').innerText = `📄 ${title} (${books ? books.length : 0}개)`;
        renderEpisodeList(books, seriesId);
    } catch (e) {
        listEl.innerHTML = `<div style="padding:20px; color:red;">오류: ${e.message}</div>`;
    }
}

/**
 * 회차 목록 UI를 렌더링합니다.
 * - .cbz/.zip 파일은 뷰어로 열기
 * - 폴더는 새 탭(구글 드라이브)으로 열기
 * - 'Read' 뱃지 표시
 * 
 * @param {Array<Object>} books - 회차 목록
 * @param {string} seriesId - 시리즈 ID (읽음 기록 조회를 위해 필요)
 */
function renderEpisodeList(books, seriesId) {
    currentBookList = books || [];
    const listEl = document.getElementById('episodeList');
    listEl.innerHTML = '';
    const history = getReadHistory(seriesId);

    if (!books || books.length === 0) {
        listEl.innerHTML = '<div style="padding:20px; color:#888;">표시할 회차가 없습니다.</div>';
        return;
    }

    books.forEach((book, index) => {
        book.seriesId = seriesId; 
        const div = document.createElement('div');
        div.className = 'episode-item';

        let icon = '📁';
        let meta = '폴더';
        let isRead = history[book.id];
        let clickHandler = () => window.open(book.url, '_blank');

        // Check file type
        if (book.media && book.media.mediaType && !book.media.mediaType.includes('folder')) {
            icon = '📦';
            meta = formatSize(book.size);

            const name = book.name.toLowerCase();
            if (name.endsWith('.cbz') || name.endsWith('.zip')) {
                icon = '📖';
                clickHandler = () => loadViewer(index); // Launch Viewer
            }
        }

        div.innerHTML = `
            <div>
                <span style="margin-right:10px;">${icon}</span>
                <span class="ep-name" style="${isRead ? 'color:#888;' : ''}">${book.name}</span>
                ${isRead ? '<span class="read-badge active">READ</span>' : ''}
            </div>
            <span class="ep-meta">${meta}</span>
        `;
        div.onclick = clickHandler;
        listEl.appendChild(div);
    });
}

function closeEpisodeModal() {
    document.getElementById('episodeModal').style.display = 'none';
}

// ============================================================
// 2. Viewer Core
// ============================================================
/**
 * 뷰어를 초기화하고 이미지를 로드합니다.
 * 
 * @param {number} index - currentBookList 내의 회차 인덱스
 * @param {boolean} [isContinuous=false] - 연속 읽기 여부 (true면 처음부터, false면 저장된 페이지부터 시작)
 */
async function loadViewer(index, isContinuous = false) {
    const book = currentBookList[index];
    if (!book) return;

    closeEpisodeModal();
    currentBookIndex = index;
    loadViewerSettings();

    const viewer = document.getElementById('viewerOverlay');
    const content = document.getElementById('viewerContent');
    const container = document.getElementById('viewerImageContainer');
    
    viewer.style.display = 'flex';
    document.body.classList.add('no-scroll'); // Prevent BG scroll

    // Initial UI
    container.innerHTML = '<div style="color:white; font-size:14px;">로딩 중... (0%)</div>';
    updateNavHandlers();

    try {
        let blobUrls = [];
        
        // Check Preload
        if (nextBookPreload && nextBookPreload.index === index && Array.isArray(nextBookPreload.images)) {
            console.log("Using preloaded data!");
            blobUrls = nextBookPreload.images;
            nextBookPreload = null;
        } else {
            // Clear invalid preload
            if (nextBookPreload && nextBookPreload.index === index) nextBookPreload = null;

            blobUrls = await fetchAndUnzip(book.id, (progress) => {
                const el = container.querySelector('div');
                if (el) el.innerText = progress;
            });
        }

        if (!Array.isArray(blobUrls) || blobUrls.length === 0) throw new Error("이미지를 찾을 수 없습니다.");

        // Setup Images
        vState.images = blobUrls.map(url => ({ src: url, width: 0, height: 0, loaded: false }));
        
        // Load Dimensions for Smart Spreads
        await loadAllImageDimensions(vState.images);

        // Calculate Spreads first
        recalcSpreads(false); // Don't reset page yet

        // Restore Progress (unless continuous read)
        const lastPage = getProgress(book.seriesId, book.id);
        if (!isContinuous && lastPage > 0 && lastPage < vState.images.length) {
            // Find spread containing this image
            const spreadIdx = vState.spreads.findIndex(spread => spread.includes(lastPage));
            vState.currentSpreadIndex = spreadIdx >= 0 ? spreadIdx : 0;
            showToast(`📑 이어보기: ${lastPage + 1}페이지`);
        } else {
            vState.currentSpreadIndex = 0;
        }

        renderCurrentSpread();

    } catch (e) {
        alert("뷰어 로드 실패: " + e.message);
        closeViewer();
    }
}

/**
 * .cbz 파일을 청크 단위로 다운로드하고 압축을 해제합니다.
 * 
 * [Stream Process]
 * 1. GAS API(view_get_chunk)를 호출하여 10MB 단위로 다운로드.
 * 2. `chunks` 배열에 바이너리 데이터를 누적.
 * 3. `JSZip`을 사용하여 압축 해제.
 * 4. 이미지 파일만 필터링하여 Blob URL 생성.
 * 
 * @param {string} fileId - 파일 ID
 * @param {Function} onProgress - 진행률 콜백
 * @returns {Promise<Array<string>>} Blob URL 리스트 (파일명 순 정렬됨)
 */
async function fetchAndUnzip(fileId, onProgress) {
    const chunks = [];
    let offset = 0;
    let totalLength = 0;
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB (Chunk Size)

    while (true) {
        const response = await API.request('view_get_chunk', {
            fileId: fileId,
            offset: offset,
            length: CHUNK_SIZE
        });

        if (!response) break;

        const binaryString = atob(response.data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        chunks.push(bytes);
        totalLength += len;
        offset = response.nextOffset;

        if (onProgress) {
            const percent = Math.round((offset / response.totalSize) * 100);
            onProgress(`다운로드 중... (${percent}%)`);
        }

        if (!response.hasMore) break;
    }

    if (onProgress) onProgress('압축 해제 중...');
    
    // Merge
    const combinedBytes = new Uint8Array(totalLength);
    let position = 0;
    for (const chunk of chunks) {
        combinedBytes.set(chunk, position);
        position += chunk.length;
    }

    // Unzip (Using JSZip global)
    if (typeof JSZip === 'undefined') throw new Error("JSZip 라이브러리가 없습니다.");
    const zip = await JSZip.loadAsync(combinedBytes);
    
    const files = Object.keys(zip.files).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    const imageUrls = [];
    for (const filename of files) {
        if (filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            const blob = await zip.files[filename].async('blob');
            imageUrls.push(URL.createObjectURL(blob));
        }
    }
    return imageUrls;
}

// ============================================================
// 3. View Logic (Spreads, Nav)
// ============================================================
/**
 * 보기 모드(1쪽/2쪽)와 이미지 크기(가로/세로)에 따라 페이지(Spread)를 재구성합니다.
 * 
 * [Logic]
 * - 1쪽 보기: 각 이미지가 하나의 Spread가 됨.
 * - 2쪽 보기:
 *   - 가로형 이미지(Landscape): 단독 페이지 사용.
 *   - 표지 모드(Cover Priority): 첫 페이지는 무조건 단독 사용.
 *   - 세로형 이미지: 가능한 경우 두 장을 하나의 Spread로 묶음.
 * 
 * @param {boolean} [resetPage=false] - 현재 페이지 인덱스를 0으로 초기화할지 여부
 */
function recalcSpreads(resetPage = false) {
    vState.spreads = [];
    const images = vState.images;
    
    if (vState.mode === '1page') {
        for(let i=0; i<images.length; i++) vState.spreads.push([i]);
    } else {
        // 2-page logic
        let i = 0;
        if (vState.coverPriority && images.length > 0) {
             vState.spreads.push([0]);
             i = 1;
        }
        while (i < images.length) {
            const current = images[i];
            // If landscape -> Single
            if (current.width > current.height) {
                vState.spreads.push([i]);
                i++;
                continue;
            }
            // Pair?
            if (i + 1 < images.length) {
                const next = images[i+1];
                if (next.width > next.height) { // Next is landscape -> break pair
                     vState.spreads.push([i]);
                     i++;
                } else {
                     vState.spreads.push([i, i+1]);
                     i += 2;
                }
            } else {
                vState.spreads.push([i]);
                i++;
            }
        }
    }
    
    if (resetPage) vState.currentSpreadIndex = 0;
    renderCurrentSpread();
}

/**
 * 현재 Spread(vState.currentSpreadIndex)를 DOM에 그립니다.
 * 
 * [Main Actions]
 * 1. 이미지 태그 생성 및 RTL 모드 적용
 * 2. 페이지 카운터 갱신
 * 3. 현재 페이지 진행도 저장 (`saveProgress`)
 * 4. 마지막 페이지 도달 시 '완독' 처리 (`saveReadHistory`)
 * 5. 남은 페이지가 4장 미만일 때 다음 화 프리로드 트리거 (`preloadNextEpisode`)
 */
function renderCurrentSpread() {
    if (!vState.spreads || vState.spreads.length === 0) return;
    
    const container = document.getElementById('viewerImageContainer');
    const counter = document.getElementById('pageCounter');
    const spreadIndices = vState.spreads[vState.currentSpreadIndex];
    if (!spreadIndices) {
        console.error(`Rendering Error: Invalid Spread Index ${vState.currentSpreadIndex} / ${vState.spreads.length}`);
        return;
    }
    
    // RTL
    const dirStyle = vState.rtlMode ? 'flex-direction:row-reverse;' : '';

    container.innerHTML = `<div class="viewer-spread" style="${dirStyle}" onclick="toggleControls()">
        ${spreadIndices.map(idx => `
            <img src="${vState.images[idx].src}" class="viewer-page ${spreadIndices.length > 1 ? 'half' : ''}">
        `).join('')}
    </div>`;
    
    // Counter
    const start = spreadIndices[0] + 1;
    const end = spreadIndices[spreadIndices.length-1] + 1;
    const total = vState.images.length;
    counter.innerText = (start === end) ? `${start} / ${total}` : `${start}-${end} / ${total}`;

    // Save Progress
    const currentImgIdx = spreadIndices[0]; // Use first image of spread as marker
    saveProgress(currentBookList[currentBookIndex].seriesId, currentBookList[currentBookIndex].id, currentImgIdx);

    // Check Finish (Mark Read if last page)
    if (vState.currentSpreadIndex === vState.spreads.length - 1) {
        saveReadHistory(currentBookList[currentBookIndex].seriesId, currentBookList[currentBookIndex].id);
        const modal = document.getElementById('episodeModal');
        if (modal.style.display === 'flex') {
             // Refresh list if open behind
             // renderEpisodeList(currentBookList, currentBookList[currentBookIndex].seriesId); 
             // (Optional: might be too heavy/distracting)
        }
    }

    // Preload Trigger
    if (vState.spreads.length - vState.currentSpreadIndex <= 4) {
         preloadNextEpisode();
    }
    
    // Update Slider
    updateSliderUI();
}

// Navigation
/**
 * 뷰어 페이지를 이동합니다.
 * 
 * @param {number} dir - 이동 방향 (1: 다음, -1: 이전)
 */
function navigateViewer(dir) {
    const nextIdx = vState.currentSpreadIndex + dir;
    if (nextIdx >= vState.spreads.length) {
        if (currentBookIndex < currentBookList.length - 1) {
             if (confirm("다음 화로 이동하시겠습니까?")) loadViewer(currentBookIndex + 1, true);
        } else {
             showToast("마지막 화입니다.");
        }
        return;
    }
    if (nextIdx < 0) {
        showToast("첫 페이지입니다.");
        return;
    }
    vState.currentSpreadIndex = nextIdx;
    renderCurrentSpread();
}

/**
 * 뷰어를 닫고 리소스를 정리합니다.
 * 중요: `URL.revokeObjectURL`을 호출하여 메모리 누수를 방지합니다.
 */
function closeViewer() {
    const viewer = document.getElementById('viewerOverlay');
    const container = document.getElementById('viewerImageContainer');
    
    // Cleanup Blobs
    if (vState.images) {
        vState.images.forEach(img => URL.revokeObjectURL(img.src));
    }
    vState.images = [];
    vState.spreads = [];
    
    container.innerHTML = '';
    viewer.style.display = 'none';
    document.body.classList.remove('no-scroll');
}

// Key Controls
document.addEventListener('keydown', (e) => {
    if (document.getElementById('viewerOverlay').style.display === 'flex') {
        if (e.key === 'Escape') closeViewer();
        else if (e.key === 'ArrowLeft') navigateViewer(vState.rtlMode ? 1 : -1);
        else if (e.key === 'ArrowRight') navigateViewer(vState.rtlMode ? -1 : 1);
        else if (e.key === ' ' || e.key === 'Enter') navigateViewer(1);
    } else if (document.getElementById('episodeModal').style.display === 'flex') {
         if (e.key === 'Escape') closeEpisodeModal();
    }
});

// ============================================================
// 4. Helpers
// ============================================================
/**
 * 모든 이미지의 실제 크기(naturalWidth/Height)를 비동기적으로 로드합니다.
 * 스마트 2쪽 보기(가로형 이미지 단독 표시 등)를 위해 필수적입니다.
 */
function loadAllImageDimensions(images) {
    const promises = images.map(imgData => {
        return new Promise(resolve => {
             const img = new Image();
             img.onload = () => { imgData.width = img.naturalWidth; imgData.height = img.naturalHeight; imgData.loaded = true; resolve(); };
             img.onerror = resolve;
             img.src = imgData.src;
        });
    });
    return Promise.all(promises);
}


function togglePreloadMode() {
    // Toggle Logic
    vState.preload = !vState.preload;
    localStorage.setItem('toki_v_preload', vState.preload);
    updateButtonStates();
    showToast(vState.preload ? "미리 불러오기: ON" : "미리 불러오기: OFF");
}

/**
 * 다음 화 미리 불러오기(Preload).
 * 현재 화를 4페이지 남겨두었을 때 트리거됩니다.
 */
function preloadNextEpisode() {
    if (!vState.preload) return; // Feature disabled
    
    const nextIndex = currentBookIndex + 1;
    if (nextIndex >= currentBookList.length) return;
    if (nextBookPreload && nextBookPreload.index === nextIndex) return;
    if (window.isPreloading) return;

    window.isPreloading = true;
    fetchAndUnzip(currentBookList[nextIndex].id, null)
        .then(blobUrls => {
            nextBookPreload = { index: nextIndex, images: blobUrls };
            showToast("📦 다음 화 준비 완료!", 3000);
            window.isPreloading = false;
        })
        .catch(() => window.isPreloading = false);
}

function updateNavHandlers() {
    const prev = document.querySelector('.nav-prev');
    const next = document.querySelector('.nav-next');
    if(prev) prev.onclick = () => navigateViewer(vState.rtlMode ? 1 : -1);
    if(next) next.onclick = () => navigateViewer(vState.rtlMode ? -1 : 1);
}

/* Settings Logic (Reused from Client.js but simplified) */
/**
 * 로컬 스토리지에서 뷰어 설정을 로드하고 UI에 반영합니다.
 */
function loadViewerSettings() {
    vState.mode = localStorage.getItem('toki_v_mode') || '1page';
    vState.coverPriority = (localStorage.getItem('toki_v_cover') === 'true');

    vState.rtlMode = (localStorage.getItem('toki_v_rtl') === 'true');
    vState.preload = (localStorage.getItem('toki_v_preload') !== 'false'); // Default true
    
    updateButtonStates();
}

function updateButtonStates() {
    const setBtn = (id, active) => {
        const btn = document.getElementById(id);
        if(btn) active ? btn.classList.add('active') : btn.classList.remove('active');
    };
    
    setBtn('btnTwoPage', vState.mode === '2page');
    setBtn('btnCover', vState.coverPriority);
    setBtn('btnRtl', vState.rtlMode);
    setBtn('btnPreload', vState.preload);
}

function toggleViewMode() {
    vState.mode = (vState.mode === '1page') ? '2page' : '1page';
    localStorage.setItem('toki_v_mode', vState.mode);
    updateButtonStates();
    recalcSpreads(false); // Keep current page if possible
}

function toggleCoverMode() {
    vState.coverPriority = !vState.coverPriority;
    localStorage.setItem('toki_v_cover', vState.coverPriority);
    updateButtonStates();
    recalcSpreads(false);
}

function toggleRtlMode() {
    vState.rtlMode = !vState.rtlMode;
    localStorage.setItem('toki_v_rtl', vState.rtlMode);
    updateButtonStates();
    recalcSpreads(false); // Re-render to apply direction style
}

/**
 * 읽은 기록 반환 (Key: `read_{seriesId}`)
 * @returns {Object} 읽은 기록 객체 { bookId: true, ... }
 */
function getReadHistory(seriesId) {
    const json = localStorage.getItem(`read_${seriesId}`);
    return json ? JSON.parse(json) : {};
}
/**
 * 에피소드 읽음 처리 및 저장
 */
function saveReadHistory(seriesId, bookId) {
    let history = getReadHistory(seriesId);
    history[bookId] = true;
    localStorage.setItem(`read_${seriesId}`, JSON.stringify(history));
}
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + ['B','KB','MB','GB'][i];
}

/* Progress Logic */
/**
 * 저장된 진행도(페이지 인덱스)를 반환합니다.
 */
function getProgress(seriesId, bookId) {
    const json = localStorage.getItem(`prog_${seriesId}`);
    const data = json ? JSON.parse(json) : {};
    return data[bookId] || 0;
}
/**
 * 현재 읽고 있는 페이지 인덱스를 저장합니다.
 */
function saveProgress(seriesId, bookId, pageIndex) {
    const json = localStorage.getItem(`prog_${seriesId}`);
    const data = json ? JSON.parse(json) : {};
    data[bookId] = pageIndex;
    localStorage.setItem(`prog_${seriesId}`, JSON.stringify(data));
}

/* New UI Handlers */
function toggleControls() {
    const header = document.querySelector('.viewer-header');
    const footer = document.querySelector('.viewer-footer');
    header.classList.toggle('show');
    footer.classList.toggle('show');
}

function updateSliderUI() {
    const slider = document.getElementById('pageSlider');
    const currentLabel = document.getElementById('sliderCurrent');
    const totalLabel = document.getElementById('sliderTotal');
    const title = document.getElementById('viewerTitle');

    if (!vState.spreads || vState.spreads.length === 0) return;

    // Current page number (1-based)
    // Use the first image index of the current spread
    const currentImgIndex = vState.spreads[vState.currentSpreadIndex][0] + 1;
    const totalImages = vState.images.length;

    if (slider) {
        slider.min = 1;
        slider.max = totalImages;
        slider.value = currentImgIndex;
    }
    if (currentLabel) currentLabel.innerText = currentImgIndex;
    if (totalLabel) totalLabel.innerText = totalImages;
    
    // Update Title with Series/Episode Info if available
    if(title && currentBookList[currentBookIndex]) {
        title.innerText = currentBookList[currentBookIndex].name;
    }
}

function onSliderInput(val) {
    const el = document.getElementById('sliderCurrent');
    if(el) el.innerText = val;
}

function onSliderChange(val) {
    const targetPage = parseInt(val) - 1; // 0-based index
    // Find spread containing targetPage
    const spreadIdx = vState.spreads.findIndex(spread => spread.includes(targetPage));
    if (spreadIdx >= 0) {
        vState.currentSpreadIndex = spreadIdx;
        renderCurrentSpread();
    } else {
        // Fallback: approximate
        vState.currentSpreadIndex = Math.min(targetPage, vState.spreads.length - 1);
        renderCurrentSpread();
    }
}

function openEpisodeListFromViewer() {
    const book = currentBookList[currentBookIndex];
    if(book) {
        // Re-open with same context
        openEpisodeList(book.seriesId, document.querySelector('.modal-title').innerText.replace('📄 ','').split('(')[0].trim());
    }
}

// Expose globals for HTML onclicks
window.openEpisodeList = openEpisodeList;
window.loadViewer = loadViewer;
window.toggleViewMode = toggleViewMode;
window.toggleCoverMode = toggleCoverMode;
window.toggleRtlMode = toggleRtlMode;
window.togglePreloadMode = togglePreloadMode;
window.closeViewer = closeViewer;
window.closeEpisodeModal = closeEpisodeModal;
window.toggleControls = toggleControls;
window.navigateViewer = navigateViewer;
window.onSliderInput = onSliderInput;
window.onSliderChange = onSliderChange;
window.openEpisodeListFromViewer = openEpisodeListFromViewer;
