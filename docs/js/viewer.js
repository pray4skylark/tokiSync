/**
 * 🎨 TokiSync Viewer Logic
 * - Episode List Management
 * - Image Viewer (1-page / 2-page / RTL)
 * - Chunk Downloading & Unzipping
 */

// State
let currentBookList = [];
let currentBookIndex = -1;
let vState = {
    mode: '1page', // '1page' or '2page'
    coverPriority: true,
    rtlMode: false,
    images: [], 
    spreads: [], 
    currentSpreadIndex: 0,
    currentSpreadIndex: 0,
    settingsTimer: null,
    preload: true
};
let nextBookPreload = null;

// ============================================================
// 1. Episode List
// ============================================================
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
async function loadViewer(index) {
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
        if (nextBookPreload && nextBookPreload.index === index) {
            console.log("Using preloaded data!");
            blobUrls = nextBookPreload.images;
            nextBookPreload = null;
        } else {
            blobUrls = await fetchAndUnzip(book.id, (progress) => {
                const el = container.querySelector('div');
                if (el) el.innerText = progress;
            });
        }

        if (blobUrls.length === 0) throw new Error("이미지를 찾을 수 없습니다.");

        // Mark Read
        saveReadHistory(book.seriesId, book.id);

        // Setup Images
        vState.images = blobUrls.map(url => ({ src: url, width: 0, height: 0, loaded: false }));
        
        // Load Dimensions for Smart Spreads (Optional but good)
        await loadAllImageDimensions(vState.images);

        recalcSpreads(true);

    } catch (e) {
        alert("뷰어 로드 실패: " + e.message);
        closeViewer();
    }
}

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

function renderCurrentSpread() {
    if (!vState.spreads || vState.spreads.length === 0) return;
    
    const container = document.getElementById('viewerImageContainer');
    const counter = document.getElementById('pageCounter');
    const spreadIndices = vState.spreads[vState.currentSpreadIndex];
    
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

    // Preload Trigger
    if (vState.spreads.length - vState.currentSpreadIndex <= 4) {
         preloadNextEpisode();
    }
}

// Navigation
function navigateViewer(dir) {
    const nextIdx = vState.currentSpreadIndex + dir;
    if (nextIdx >= vState.spreads.length) {
        if (currentBookIndex < currentBookList.length - 1) {
             if (confirm("다음 화로 이동하시겠습니까?")) loadViewer(currentBookIndex + 1);
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
    const chk = document.getElementById('chkPreload');
    vState.preload = chk && chk.checked;
    localStorage.setItem('toki_v_preload', vState.preload);
}

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
function loadViewerSettings() {
    vState.mode = localStorage.getItem('toki_v_mode') || '1page';
    vState.coverPriority = (localStorage.getItem('toki_v_cover') === 'true');
    vState.coverPriority = (localStorage.getItem('toki_v_cover') === 'true');
    vState.rtlMode = (localStorage.getItem('toki_v_rtl') === 'true');
    vState.preload = (localStorage.getItem('toki_v_preload') !== 'false'); // Default true
    
    const elTwo = document.getElementById('chkTwoPage');
    if(elTwo) elTwo.checked = (vState.mode === '2page');

    const elCover = document.getElementById('chkCover');
    if(elCover) elCover.checked = vState.coverPriority;

    const elRtl = document.getElementById('chkRtl');
    if(elRtl) elRtl.checked = vState.rtlMode;
    const elRtl = document.getElementById('chkRtl');
    if(elRtl) elRtl.checked = vState.rtlMode;

    const elPreload = document.getElementById('chkPreload');
    if(elPreload) elPreload.checked = vState.preload;
}
function toggleViewMode() {
    const chk = document.getElementById('chkTwoPage');
    vState.mode = chk && chk.checked ? '2page' : '1page';
    localStorage.setItem('toki_v_mode', vState.mode);
    recalcSpreads();
}

function toggleCoverMode() {
    const chk = document.getElementById('chkCover');
    vState.coverPriority = chk && chk.checked;
    localStorage.setItem('toki_v_cover', vState.coverPriority);
    recalcSpreads();
}

function toggleRtlMode() {
    const chk = document.getElementById('chkRtl');
    vState.rtlMode = chk && chk.checked;
    localStorage.setItem('toki_v_rtl', vState.rtlMode);
    recalcSpreads(); // Re-render to apply direction style
}

function getReadHistory(seriesId) {
    const json = localStorage.getItem(`read_${seriesId}`);
    return json ? JSON.parse(json) : {};
}
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

// Expose globals for HTML onclicks
window.openEpisodeList = openEpisodeList;
window.loadViewer = loadViewer;
window.loadViewer = loadViewer;
window.toggleViewMode = toggleViewMode;
window.toggleCoverMode = toggleCoverMode;
window.toggleRtlMode = toggleRtlMode;
window.togglePreloadMode = togglePreloadMode;
window.closeViewer = closeViewer;
window.closeEpisodeModal = closeEpisodeModal;

function toggleControls() {
    const header = document.querySelector('.viewer-header');
    header.classList.toggle('show');
}
window.toggleControls = toggleControls;
