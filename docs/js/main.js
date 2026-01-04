/**
 * 🚀 TokiSync Frontend - Main Controller
 * - Handles Initialization
 * - Config Handshake (Zero-Config)
 * - Grid Rendering
 */

const NO_IMAGE_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%22%20y%3D%2250%22%20font-family%3D%22Arial%22%20font-size%3D%2212%22%20fill%3D%22%23666%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E";

// Domains for Quick Link (Numbers Only)
const DEFAULT_DOMAINS = {
    newtoki: '469',
    manatoki: '469',
    booktoki: '469'
};

const VIEWER_VERSION = "v1.1.0"; // Modularization + New Text Layout
// [New] Expose Version to Global Scope for Debugging
window.TOKI_VIEWER_VERSION = VIEWER_VERSION;

let allSeries = [];

// ============================================================
// 1. Initialization & Handshake
// ============================================================

// 초기화
window.addEventListener('DOMContentLoaded', () => {
    
    // Listener for Zero-Config (Tampermonkey Injection)
    window.addEventListener("message", handleMessage, false);
    
    // [New] Initialize Version Display
    const el = document.getElementById('viewerVersionDisplay');
    if(el) el.innerText = `Viewer Version: ${VIEWER_VERSION}`;
    
    // Initial Load Check
    if (API.isConfigured()) {
        showToast("🚀 저장된 설정으로 연결합니다...");
        refreshDB(null, true);
        // Load Saved Domains
        loadDomains();
    } else {
        // Not configured yet. Wait for injection or manual input.
        // We set a small timeout to check formatting injection/manual
        setTimeout(() => {
            if (!API.isConfigured()) {
                document.getElementById('configModal').style.display = 'flex';
            } else {
                 showToast("🚀 저장된 설정으로 연결합니다...");
                 refreshDB(null, true);
            }
            loadDomains();
        }, 1000);
    }
});


/**
 * UserScript(Tampermonkey)로부터의 설정 주입 메시지를 처리합니다.
 * Zero-Config: 별도 설정 없이 바로 서버 URL과 폴더 ID를 수신하여 설정합니다.
 * 
 * @param {MessageEvent} event - window message event
 */
function handleMessage(event) {
    if (event.data.type === 'TOKI_CONFIG') {
        const { url, folderId, deployId } = event.data;
        if (url && folderId) {
            console.log("⚡️ Auto-Config Injected:", { url, folderId });
            API.setConfig(url, folderId);
            
            // UI Update
            document.getElementById('configModal').style.display = 'none';
            showToast("⚡️ 자동 설정 완료! (Zero-Config)");
            
            refreshDB();
        }
    }
}

// ============================================================
// 2. Data Fetching
// ============================================================
/**
 * 라이브러리 데이터를 서버에서 새로고침합니다.
 * 
 * @param {string} [forceId=null] - 강제로 특정 폴더 ID를 사용할 경우 지정
 * @param {boolean} [silent=false] - 로딩 인디케이터 표시 여부 (true면 숨김)
 * @param {boolean} [bypassCache=false] - 서버 캐시 무시 여부 (강제 새로고침)
 */
async function refreshDB(forceId = null, silent = false, bypassCache = false) {
    const loader = document.getElementById('pageLoader');
    const btn = document.getElementById('refreshBtn');

    if (!silent) {
        if(loader) {
            loader.style.display = 'flex';
            // Reset loader text
            const txt = loader.querySelector('div:last-child');
            if(txt) txt.innerText = "데이터 불러오는 중...";
        }
        if(btn) btn.classList.add('spin-anim');
    }

    try {
        let allSeries = [];
        let continuationToken = null;
        let step = 1;

        // Loop for Continuation Token
        while (true) {
            const payload = { 
                folderId: forceId || API.folderId 
            };
            if (bypassCache) payload.bypassCache = true;
            if (continuationToken) payload.continuationToken = continuationToken;

            const response = await API.request('view_get_library', payload);
            
            // Handle Response
            // Response might be direct array (Legacy/Small) or object
            
            if (Array.isArray(response)) {
                // Legacy or Simple Response
                allSeries = allSeries.concat(response);
                break; // Done
            } 
            else if (response) {
                // Object Response (Standard v3.3+)
                // 1. Accumulate List if present
                if (response.list && Array.isArray(response.list)) {
                    allSeries = allSeries.concat(response.list);
                }

                // 2. Check Status
                if (response.status === 'continue') {
                    if (response.continuationToken) {
                        continuationToken = response.continuationToken;
                        step++;
                        // Update Loader
                        const txt = loader ? loader.querySelector('div:last-child') : null;
                        if(txt) txt.innerText = `데이터 불러오는 중... (Step ${step})`;
                        // Loop again
                        continue;
                    } else {
                        console.warn("[refreshDB] Continue status without token?");
                        break; 
                    }
                } else if (!response.status || response.status === 'completed') {
                    // Done
                    break;
                } else {
                    // Unknown Status?
                    console.warn("[refreshDB] Unknown Status:", response.status);
                    break;
                }
            } else {
                 // Unknown format
                 console.warn("Unknown API Response:", response);
                 break;
            }
        }

        renderGrid(allSeries);
        showToast("📚 라이브러리 업데이트 완료");

    } catch (e) {
        console.error("Library Fetch Error:", e);
        showToast(`❌ 로드 실패: ${e.message}`, 5000);
    } finally {
        if(loader) loader.style.display = 'none';
        if(btn) btn.classList.remove('spin-anim');
    }
}

// ============================================================
// 3. UI Rendering (Grid)
// ============================================================
/**
 * 시리즈 목록 데이터를 기반으로 만화 책자(그리드)를 렌더링합니다.
 * 각 카드는 클릭 시 에피소드 목록(`openEpisodeList`)을 엽니다.
 * 
 * @param {Array<Object>} seriesList - 시리즈 객체 배열
 */
function renderGrid(seriesList) {
    // Safety: Ensure seriesList is an array
    if (Array.isArray(seriesList)) {
        allSeries = seriesList;
    } else {
        console.warn("[renderGrid] Expected array but got:", seriesList);
        allSeries = [];
    }
    const grid = document.getElementById('grid');
    grid.innerHTML = '';

    if (!allSeries || allSeries.length === 0) {
        grid.innerHTML = '<div class="no-data">저장된 작품이 없습니다.</div>';
        return;
    }

    allSeries.forEach((series, index) => {
        try {
            const card = document.createElement('div');
            card.className = 'card';

            const meta = series.metadata || { status: 'Unknown', authors: [] };
            const authors = meta.authors || [];
            const status = meta.status || 'Unknown';
            
            // Thumbnail Logic: Base64 -> DriveID -> Default
            let thumb = NO_IMAGE_SVG;
            if (series.thumbnail && series.thumbnail.startsWith("data:image")) {
                thumb = series.thumbnail;
            } else if (series.thumbnailId) {
                // High-performance Drive Thumbnail URL
                thumb = `https://lh3.googleusercontent.com/d/${series.thumbnailId}=s400`;
            } else if (series.thumbnail && series.thumbnail.startsWith("http")) {
                thumb = series.thumbnail;
            }
            const dynamicUrl = getDynamicLink(series);
            const hasContentId = !!series.sourceId;

            card.innerHTML = `
                <div class="thumb-wrapper">
                    <img src="${thumb}" class="thumb" onerror="this.src='${NO_IMAGE_SVG}'">
                    <div class="overlay">
                        <a href="${series.id ? 'https://drive.google.com/drive/u/0/folders/' + series.id : '#'}" target="_blank" class="btn btn-drive">📂 드라이브</a>
                        <button onclick="openEpisodeList('${series.id}', '${series.name}', ${index})" class="btn" style="background:#444; color:white;">📄 목록</button>
                        ${hasContentId ? `
                            <a href="${dynamicUrl}" target="_blank" class="btn btn-site">🌐 사이트</a>
                        ` : ''}
                    </div>
                </div>
                <div class="info">
                    <div class="title" title="${series.name}">${series.name}</div>
                    <span class="author" title="${authors.join(', ')}">${authors.join(', ') || '작가 미상'}</span>
                    <div class="meta">
                        <span class="badge ${status === 'COMPLETED' ? 'completed' : 'ongoing'}">${status}</span>
                        <span class="count">${series.booksCount || 0}권</span>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        } catch (err) {
            console.error("Render Error:", err);
        }
    });
}

// ============================================================
// 4. Utility / UI Handlers
// ============================================================
/**
 * 토스트 메시지를 화면 하단에 표시합니다.
 * @param {string} msg - 메시지 내용
 * @param {number} [duration=3000] - 지속 시간 (ms)
 */
function showToast(msg, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * 설정 모달의 '저장' 버튼 핸들러입니다.
 * 입력된 URL과 ID를 저장하고 데이터를 새로고침합니다.
 */
function saveManualConfig() {
    const url = document.getElementById('configApiUrl').value.trim();
    const id = document.getElementById('configFolderId').value.trim();
    
    if (!url || !id) return alert("값을 모두 입력해주세요.");
    
    API.setConfig(url, id);
    document.getElementById('configModal').style.display = 'none';
    refreshDB();
}

/**
 * 검색창 입력 이벤트 핸들러.
 * `allSeries`에서 제목을 검색하여 그리드를 필터링합니다.
 */
// 🚀 Global State
let currentTab = 'all'; // 'all', 'Webtoon', 'Manga', 'Novel'

// ... (Existing Init Code) ...

/**
 * 탭을 전환하고 리스트를 필터링합니다.
 * @param {string} tabName - 'all', 'Webtoon', 'Manga', 'Novel'
 */
function switchTab(tabName) {
    currentTab = tabName;
    
    // UI Update
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.innerText === getTabLabel(tabName)) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Re-filter
    filterData();
}

function getTabLabel(key) {
    if (key === 'all') return '전체';
    if (key === 'Webtoon') return '웹툰';
    if (key === 'Manga') return '만화';
    if (key === 'Novel') return '소설';
    return '';
}

/**
 * 검색창 입력 및 탭 선택에 따라 그리드를 필터링합니다.
 */
function filterData() {
    const query = document.getElementById('search').value.toLowerCase();
    const cards = document.querySelectorAll('.card');
    
    cards.forEach((card, index) => {
        const series = allSeries[index];
        const meta = series.metadata || { authors: [] };
        const authors = meta.authors || [];
        const text = (series.name + (authors.join(' '))).toLowerCase();
        
        // 1. Text Search
        const matchText = text.includes(query);
        
        // 2. Category Filter
        // Note: Server returns 'category' in metadata or root object
        const cat = series.category || (series.metadata ? series.metadata.category : 'Unknown');
        const matchTab = (currentTab === 'all') || (cat === currentTab) || 
                         (currentTab === 'Webtoon' && cat === 'Webtoon') || // Legacy Compat
                         (currentTab === 'Manga' && cat === 'Manga');

        card.style.display = (matchText && matchTab) ? 'flex' : 'none';
    });
}

// ============================================================
// 5. Settings / Config Logic
// ============================================================
function saveActiveSettings() {
    // 1. Save Domain Numbers
    const domains = {
        newtoki: document.getElementById('url_newtoki').value.trim() || DEFAULT_DOMAINS.newtoki,
        manatoki: document.getElementById('url_manatoki').value.trim() || DEFAULT_DOMAINS.manatoki,
        booktoki: document.getElementById('url_booktoki').value.trim() || DEFAULT_DOMAINS.booktoki
    };
    localStorage.setItem('toki_domains', JSON.stringify(domains));

    // 2. Save Connection Settings
    const folderId = document.getElementById('setting_folderId').value.trim();
    const deployId = document.getElementById('setting_deployId').value.trim();
    
    if (folderId && deployId) {
        const apiUrl = `https://script.google.com/macros/s/${deployId}/exec`;
        API.setConfig(apiUrl, folderId);
        showToast("☁️ 서버 연결 설정이 업데이트되었습니다.");
    }

    // 3. Save Viewer Preferences
    const vMode = document.getElementById('pref_2page').checked ? '2page' : '1page';
    const vCover = document.getElementById('pref_cover').checked;
    const vRtl = document.getElementById('pref_rtl').checked;
    const vEngine = document.querySelector('input[name="view_engine"]:checked').value;

    localStorage.setItem('toki_v_mode', vMode);
    localStorage.setItem('toki_v_cover', vCover);
    localStorage.setItem('toki_v_rtl', vRtl);
    localStorage.setItem('toki_v_engine', vEngine);

    // UI Feedback
    document.getElementById('domainPanel').style.display = 'none';
    showToast("✅ 설정이 저장되었습니다.");
    
    // Refresh Grid (for Links) and maybe DB if config changed
    renderGrid(allSeries);
    if(folderId && deployId) refreshDB();
}

function loadDomains() {
    // 1. Load Domains
    const saved = JSON.parse(localStorage.getItem('toki_domains')) || DEFAULT_DOMAINS;
    const elNew = document.getElementById('url_newtoki');
    const elMana = document.getElementById('url_manatoki');
    const elBook = document.getElementById('url_booktoki');
    
    if(elNew) elNew.value = saved.newtoki;
    if(elMana) elMana.value = saved.manatoki;
    if(elBook) elBook.value = saved.booktoki;

    // 2. Load Connection Settings
    const elFolder = document.getElementById('setting_folderId');
    const elDeploy = document.getElementById('setting_deployId');
    
    if (API.folderId && elFolder) elFolder.value = API.folderId;
    if (API.baseUrl && elDeploy) {
        // Extract Deployment ID from URL
        const match = API.baseUrl.match(/\/s\/([^\/]+)\/exec/);
        if (match && match[1]) elDeploy.value = match[1];
    }

    // 3. Load Viewer Preferences
    const vMode = localStorage.getItem('toki_v_mode') || '1page';
    const vCover = (localStorage.getItem('toki_v_cover') === 'true');
    const vRtl = (localStorage.getItem('toki_v_rtl') === 'true');
    const vEngine = localStorage.getItem('toki_v_engine') || 'legacy'; // Default to Legacy (Rollback)

    if(document.getElementById('pref_2page')) document.getElementById('pref_2page').checked = (vMode === '2page');
    if(document.getElementById('pref_cover')) document.getElementById('pref_cover').checked = vCover;
    if(document.getElementById('pref_rtl')) document.getElementById('pref_rtl').checked = vRtl;
    
    // Set Radio
    const radios = document.getElementsByName('view_engine');
    for(const r of radios) {
        r.checked = (r.value === vEngine);
    }
}

function getDynamicLink(series) {
    const contentId = series.sourceId;
    // Defensive Category Check
    let cat = series.category || (series.metadata ? series.metadata.category : '');
    const site = (series.name || "").toLowerCase();

    // Fallback if category is missing
    if (!cat) {
        if (site.includes("북토끼")) cat = "Novel";
        else if (site.includes("마나토끼")) cat = "Manga";
        else cat = "Webtoon";
    }

    const saved = JSON.parse(localStorage.getItem('toki_domains')) || DEFAULT_DOMAINS;
    
    // Default: Webtoon (NewToki)
    let baseUrl = `https://newtoki${saved.newtoki}.com`;
    let path = "/webtoon/";

    if (cat === "Novel") { 
        baseUrl = `https://booktoki${saved.booktoki}.com`; 
        path = "/novel/"; 
    }
    else if (cat === "Manga") { 
        baseUrl = `https://manatoki${saved.manatoki}.net`; 
        path = "/comic/"; 
    }

    return contentId ? (baseUrl + path + contentId) : "#";
}

/**
 * 도메인 설정 패널을 토글(열기/닫기)합니다.
 */
function toggleSettings() {
    const el = document.getElementById('domainPanel');
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

// 🚀 Expose Globals for HTML onclick & Modules
window.refreshDB = refreshDB;
window.toggleSettings = toggleSettings;
window.switchTab = switchTab;
window.filterData = filterData;
window.saveActiveSettings = saveActiveSettings;
window.saveManualConfig = saveManualConfig;
window.showToast = showToast; // Used by viewer?
window.renderGrid = renderGrid; // Debugging
