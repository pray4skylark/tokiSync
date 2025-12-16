/**
 * 🚀 TokiSync Frontend - Main Controller
 * - Handles Initialization
 * - Config Handshake (Zero-Config)
 * - Grid Rendering
 */

const NO_IMAGE_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%22%20y%3D%2250%22%20font-family%3D%22Arial%22%20font-size%3D%2212%22%20fill%3D%22%23666%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E";

// Domains for Quick Link
const DEFAULT_DOMAINS = {
    newtoki: 'https://newtoki470.com',
    manatoki: 'https://manatoki470.net',
    booktoki: 'https://booktoki470.com'
};

let allSeries = [];

// ============================================================
// 1. Initialization & Handshake
// ============================================================
window.onload = function () {
    // Load Saved Domains
    loadDomains();

    // Listener for Zero-Config (Tampermonkey Injection)
    window.addEventListener("message", handleMessage, false);

    // Initial Load Check
    if (API.isConfigured()) {
        showToast("🚀 저장된 설정으로 연결합니다...");
        refreshDB(null, true);
    } else {
        // Not configured yet. Wait for injection or manual input.
        // We set a small timeout to show the "Manual Config" modal if injection doesn't happen fast.
        setTimeout(() => {
            if (!API.isConfigured()) {
                document.getElementById('configModal').style.display = 'flex';
            }
        }, 1000);
    }
};

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
async function refreshDB(forceId = null, silent = false) {
    const loader = document.getElementById('pageLoader');
    const btn = document.getElementById('refreshBtn');

    if (!silent) {
        if(loader) loader.style.display = 'flex';
        if(btn) btn.classList.add('spin-anim');
    }

    try {
        const seriesList = await API.request('view_get_library', { 
            folderId: forceId || API.folderId 
        });
        
        renderGrid(seriesList);

    } catch (e) {
        console.error("Library Fetch Error:", e);
        showToast(`❌ 로드 실패: ${e.message}`, 5000);
        // Show config modal if auth failing implies wrong URL/ID
        // But maybe it's just network?
    } finally {
        if(loader) loader.style.display = 'none';
        if(btn) btn.classList.remove('spin-anim');
    }
}

// ============================================================
// 3. UI Rendering (Grid)
// ============================================================
function renderGrid(seriesList) {
    allSeries = seriesList || [];
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
            const thumb = series.thumbnail && series.thumbnail.startsWith("data:image") ? series.thumbnail : NO_IMAGE_SVG;
            const dynamicUrl = getDynamicLink(series);
            const hasContentId = !!series.sourceId;

            card.innerHTML = `
                <div class="thumb-wrapper">
                    <img src="${thumb}" class="thumb" onerror="this.src='${NO_IMAGE_SVG}'">
                    <div class="overlay">
                        <a href="${series.url}" target="_blank" class="btn btn-drive">📂 드라이브</a>
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

// Manual Save Config
function saveManualConfig() {
    const url = document.getElementById('configApiUrl').value.trim();
    const id = document.getElementById('configFolderId').value.trim();
    
    if (!url || !id) return alert("값을 모두 입력해주세요.");
    
    API.setConfig(url, id);
    document.getElementById('configModal').style.display = 'none';
    refreshDB();
}

function filterData() {
    const query = document.getElementById('search').value.toLowerCase();
    const cards = document.querySelectorAll('.card');
    cards.forEach((card, index) => {
        const series = allSeries[index];
        const meta = series.metadata || { authors: [] };
        const authors = meta.authors || [];
        const text = (series.name + (authors.join(' '))).toLowerCase();
        card.style.display = text.includes(query) ? 'flex' : 'none';
    });
}

// Domain Management
function saveDomains() {
    localStorage.setItem('toki_domains', JSON.stringify({
        newtoki: document.getElementById('url_newtoki').value.trim(),
        manatoki: document.getElementById('url_manatoki').value.trim(),
        booktoki: document.getElementById('url_booktoki').value.trim()
    }));
    document.getElementById('domainPanel').style.display = 'none';
    renderGrid(allSeries); // Re-render links
}

function loadDomains() {
    const saved = JSON.parse(localStorage.getItem('toki_domains')) || DEFAULT_DOMAINS;
    const elNew = document.getElementById('url_newtoki');
    const elMana = document.getElementById('url_manatoki');
    const elBook = document.getElementById('url_booktoki');
    
    if(elNew) elNew.value = saved.newtoki;
    if(elMana) elMana.value = saved.manatoki;
    if(elBook) elBook.value = saved.booktoki;
}

function getDynamicLink(series) {
    const contentId = series.sourceId;
    const site = (series.name || "").toLowerCase();
    
    const saved = JSON.parse(localStorage.getItem('toki_domains')) || DEFAULT_DOMAINS;
    let baseUrl = saved.manatoki;
    let path = "/comic/";

    if (site.includes("뉴토끼")) { baseUrl = saved.newtoki; path = "/webtoon/"; }
    else if (site.includes("북토끼")) { baseUrl = saved.booktoki; path = "/novel/"; }

    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    return contentId ? (baseUrl + path + contentId) : "#";
}

function toggleSettings() {
    const el = document.getElementById('domainPanel');
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}
