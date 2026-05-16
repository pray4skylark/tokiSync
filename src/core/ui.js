/**
 * UI Module for TokiSync
 * Handles Logging Overlay and OS Notifications
 */

import { startSilentAudio, stopSilentAudio, isAudioRunning } from './anti_sleep.js';
import { getConfig, setConfig } from './config.js';
import { ParserFactory } from './parsers/ParserFactory.js';
import { RuleManager } from './parsers/RuleManager.js';
import { GenericParser } from './parsers/GenericParser.js';
import { extractEpisodeData } from './extractor.js';
import styles from './ui.css';

export class LogBox {
    static instance = null;

    constructor() {
        if (LogBox.instance) return LogBox.instance;
        this.logs = [];
        this.MAX_LOGS = 500;
        this.init();
        LogBox.instance = this;
    }

    init() {
        if (document.getElementById('toki-logbox')) return;

        // -- Styles --
        const styleId = 'toki-logbox-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = styles;
            document.head.appendChild(style);
        }

        // -- HTML --
        this.container = document.createElement('div');
        this.container.id = 'toki-logbox';
        this.container.innerHTML = `
            <div id="toki-logbox-header">
                <span id="toki-logbox-title">TokiSync Log</span>
                <div id="toki-logbox-controls">
                    <span id="toki-btn-report" title="버그 리포트 복사" style="cursor:pointer; color:#facc15;">📋</span>
                    <span id="toki-btn-audio" title="백그라운드 모드" style="cursor:pointer;">🔊</span>
                    <span id="toki-btn-clear" title="Clear">🚫</span>
                    <span id="toki-btn-close" title="Hide">❌</span>
                </div>
            </div>
            <ul id="toki-logbox-content"></ul>
        `;
        document.body.appendChild(this.container);

        // -- Events --
        this.list = this.container.querySelector('#toki-logbox-content');
        
        document.getElementById('toki-btn-report').onclick = () => this.exportReport();
        document.getElementById('toki-btn-clear').onclick = () => this.clear();
        document.getElementById('toki-btn-close').onclick = () => this.hide();

        // ESC Key Support for LogBox
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container.style.display === 'flex') {
                this.hide();
            }
        });
        
        // Anti-Sleep Button
        const audioBtn = document.getElementById('toki-btn-audio');
        if (audioBtn) {
            audioBtn.onclick = () => {
                try {
                    if (isAudioRunning()) {
                        stopSilentAudio();
                        audioBtn.textContent = '🔊';
                        audioBtn.title = '백그라운드 모드 (꺼짐)';
                        this.log('[Anti-Sleep] 백그라운드 모드 비활성화');
                    } else {
                        startSilentAudio();
                        audioBtn.textContent = '🔇';
                        audioBtn.title = '백그라운드 모드 (켜짐)';
                        this.log('[Anti-Sleep] 백그라운드 모드 활성화', 'success');
                    }
                } catch (e) {
                    this.error(`[Anti-Sleep] 실패: ${e.message}`);
                }
            };

            // Sync UI with initial state (if auto-started by downloader)
            setInterval(() => {
                const running = isAudioRunning();
                if (running && audioBtn.textContent === '🔊') {
                    audioBtn.textContent = '🔇';
                    audioBtn.title = '백그라운드 모드 (켜짐)';
                } else if (!running && audioBtn.textContent === '🔇') {
                    audioBtn.textContent = '🔊';
                    audioBtn.title = '백그라운드 모드 (꺼짐)';
                }
            }, 1000);
        }

    }

    static getInstance() {
        if (!LogBox.instance) {
            new LogBox();
        }
        return LogBox.instance;
    }

    log(msg, type = 'normal', context = '') {
        if (!this.list) return;

        const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        const prefix = context ? `[${context}] ` : '';
        const fullMsg = `[${time}] ${prefix}${msg}`;
        
        // Save to memory
        this.logs.push({ time, type, context, msg: typeof msg === 'string' ? msg : JSON.stringify(msg) });
        if (this.logs.length > this.MAX_LOGS) this.logs.shift();

        const li = document.createElement('li');
        li.textContent = fullMsg;
        
        if (type === 'error') li.classList.add('error');
        if (type === 'success') li.classList.add('success');

        this.list.appendChild(li);
        this.list.scrollTop = this.list.scrollHeight;
    }

    critical(msg, context = '') {
        this.show(); // Always surface critical errors
        this.log(msg, 'critical', context);
    }

    error(msg, context = '') {
        this.show(); // Auto-show on error
        this.log(msg, 'error', context);
    }

    warn(msg, context = '') {
        this.log(msg, 'warn', context);
    }

    success(msg, context = '') {
        this.log(msg, 'success', context);
    }

    clear() {
        if (this.list) this.list.innerHTML = '';
        this.logs = [];
    }

    show() {
        if (this.container) this.container.style.display = 'flex';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
    }

    async exportReport() {
        const version = typeof GM_info !== 'undefined' ? GM_info.script.version : 'Unknown';
        const ua = navigator.userAgent;
        // Include query parameters for accurate book ID tracking
        let currentUrl = window.location.href;
        // Sanitize sensitive tokens if any (like '?token=')
        currentUrl = currentUrl.replace(/([&?])(token|key|pwd)=[^&]+/g, '$1$2=***');
        
        // Retrieve run settings
        const config = getConfig();
        const dest = config.destination || 'native';
        const isCbz = config.saveAs === 'cbz';
        const smartSkip = config.useSmartSkip ? 'ON' : 'OFF';

        // Severity grouping
        const critical = this.logs.filter(l => l.type === 'critical');
        const warn     = this.logs.filter(l => l.type === 'warn' || l.type === 'error');
        const info     = this.logs.filter(l => l.type !== 'critical' && l.type !== 'warn' && l.type !== 'error');

        const fmt = (logs) => logs.length
            ? logs.map(l => { const ctx = l.context ? `[${l.context}] ` : ''; return `[${l.time}] ${ctx}${l.msg}`; }).join('\n')
            : '(없음)';

        const report = `### 🐞 TokiSync Bug Report

**System Information:**
- **Version:** ${version}
- **URL:** \`${currentUrl}\`
- **User Agent:** ${ua}

**Execution Settings:**
- **Destination:** \`${dest}\`
- **Format:** \`${isCbz ? 'CBZ Archive' : 'Raw Images'}\`
- **Smart Skip:** \`${smartSkip}\`

### 🔴 CRITICAL (작업 중단 오류)
\`\`\`
${fmt(critical)}
\`\`\`

### 🟡 WARN (비치명 / 폴백 발생)
\`\`\`
${fmt(warn)}
\`\`\`

### ⚪ INFO (정상 흐름)
\`\`\`
${fmt(info)}
\`\`\`
`.trim();

        try {
            // Priority: GM_setClipboard > navigator.clipboard > execCommand
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(report);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(report);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = report;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                } catch (err) {
                    console.error('Copy Failed', err);
                }
                document.body.removeChild(textArea);
            }
            
            this.success('버그 리포트가 클립보드에 복사되었습니다.', 'System');
            Notifier.notify('TokiSync 버그 리포트', '클립보드 복사 완료! GitHub 이슈 탭이 열립니다.');
            
            setTimeout(() => {
                window.open('https://github.com/pray4skylark/tokiSync/issues/new', '_blank');
            }, 800);
            
        } catch (e) {
            this.error('리포트 복사실패: ' + e.message, 'System');
        }
    }

    toggle() {
        if (!this.container) return;
        if (this.container.style.display === 'none' || this.container.style.display === '') {
            this.show();
        } else {
            this.hide();
        }
    }

}

export class Notifier {
    /**
     * Send OS Notification
     * @param {string} title 
     * @param {string} text 
     * @param {Function} onclick 
     */
    static notify(title, text, onclick = null) {
        if (typeof GM_notification === 'function') {
            GM_notification({
                title: title,
                text: text,
                timeout: 5000,
                onclick: onclick
            });
        } else {
            // Fallback
            console.log(`[Notification] ${title}: ${text}`);
            // Do not use alert() as it blocks execution
        }
    }
}

/**
 * MenuModal (v1.5.0)
 * Unified Menu with Accordion & FAB
 */
export class MenuModal {
    static instance = null;

    constructor(handlers = {}) {
        if (MenuModal.instance) return MenuModal.instance;
        this.handlers = handlers; // { onDownload, openViewer, openSettings, toggleLog, ... }
        this.init();
        MenuModal.instance = this;
    }

    init() {
        if (document.getElementById('toki-menu-fab')) return;
        
        // 1. Create FAB
        this.createFAB();
        
        // 2. Keyboard Shortcut (Ctrl+Shift+T & ESC)
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't' || e.code === 'KeyT')) {
                e.preventDefault();
                this.toggle();
            }
            if (e.key === 'Escape') {
                const overlay = document.querySelector('.toki-modal-overlay');
                if (overlay) this.close(overlay);
            }
        });
    }

    createFAB() {
        const fab = document.createElement('div');
        fab.id = 'toki-menu-fab';
        fab.className = 'toki-fab';
        fab.title = 'TokiSync 메뉴 (Ctrl+Shift+T)';
        fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>`;
        
        fab.onclick = () => this.show();
        document.body.appendChild(fab);
    }

    render() {
        // Retrieve current config for UI state
        // We assume config is available or we pass it. For simplicity, we read it here if available, 
        // but ui.js doesn't import config directly to avoid circular dependency if possible.
        // Better to pass current state or read from GM_getValue directly purely for UI init if needed.
        
        const overlay = document.createElement('div');
        overlay.className = 'toki-modal-overlay';
        overlay.onclick = (e) => { if(e.target === overlay) this.close(overlay); };

        const modal = document.createElement('div');
        modal.className = 'toki-modal';
        overlay.appendChild(modal);

        // -- Header --
        const header = document.createElement('div');
        header.className = 'toki-modal-header';
        header.innerHTML = `
            <div class="toki-modal-title"><span>⚡ TokiSync</span></div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <button class="toki-btn-ghost" id="toki-btn-viewer-link" title="Open Viewer">
                    🌐 <span>Viewer</span>
                </button>
                <button class="toki-modal-close" id="toki-btn-menu-close" title="Close">&times;</button>
            </div>
        `;
        modal.appendChild(header);

        // -- Tabs Header --
        const tabsHeader = document.createElement('div');
        tabsHeader.className = 'toki-tabs';
        tabsHeader.innerHTML = `
            <button class="toki-tab-btn active" data-tab="download">📥 다운로드</button>
            <button class="toki-tab-btn" data-tab="settings">⚙️ 설정</button>
            <button class="toki-tab-btn" data-tab="history">📊 기록</button>
            <button class="toki-tab-btn" data-tab="tools">🛠️ 도구</button>
        `;
        modal.appendChild(tabsHeader);

        // -- Body --
        const body = document.createElement('div');
        body.className = 'toki-modal-body';
        
        // 1. Download Tab
        const tabDown = document.createElement('div');
        tabDown.className = 'toki-tab-content active';
        tabDown.id = 'toki-tab-download';
        tabDown.innerHTML = `
                <div class="toki-control-group">
                    <label class="toki-label">빠른 작업</label>
                    <button class="toki-btn-action" id="toki-btn-down-current" style="height: 52px; background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">
                        <span>🚀 현재 회차 즉시 다운로드</span>
                    </button>
                </div>
                <hr style="border: 0; border-top: 1px solid rgba(0,0,0,0.05); margin: 24px 0;">
                <div class="toki-control-group">
                    <label class="toki-label">에피소드 범위 지정</label>
                    <input type="text" id="toki-range-input" class="toki-input"
                        placeholder="예: 1,2,4-10,15 (비우면 전체)">
                    <div style="font-size: 11px; margin-top: 8px; color: #94a3b8; margin-left: 4px;">쉼표(,)로 개별 번호, 하이픈(-)으로 연속 범위 지정</div>
                </div>
                <div class="toki-control-group" style="margin-bottom: 24px;">
                    <label class="toki-checkbox-wrapper">
                        <input type="checkbox" id="toki-chk-force-overwrite" class="toki-checkbox-input">
                        <span class="toki-checkbox"></span>
                        <span class="toki-checkbox-label">⚠️ 강제 재다운로드 (파일 덮어쓰기)</span>
                    </label>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="toki-btn-action" id="toki-btn-down-range" style="flex: 1.4; height: 52px;">
                        <span>선택 다운로드</span>
                    </button>
                    <button class="toki-btn-action toki-btn-secondary" id="toki-btn-down-all" style="flex: 1; height: 52px;">
                        <span>전체</span>
                    </button>
                </div>
        `;
        body.appendChild(tabDown);

        // 2. Settings Tab (Unified v1.9.1)
        const tabSettings = document.createElement('div');
        tabSettings.className = 'toki-tab-content';
        tabSettings.id = 'toki-tab-settings';
        tabSettings.innerHTML = `
            <div class="toki-section-title" style="margin-top:0;">Download Settings</div>
            <div class="toki-control-group">
                <label class="toki-label">저장 정책</label>
                <select id="toki-sel-policy" class="toki-select">
                    <option value="individual">개별 파일</option>
                    <option value="zipOfCbzs">챕터 묶음</option>
                    <option value="native">자동 분류</option>
                    <option value="drive">드라이브</option>
                </select>
            </div>
            
            <div class="toki-control-group">
                <label class="toki-label">다운로드 속도</label>
                <select id="toki-sel-speed" class="toki-select">
                    <option value="agile">빠름</option>
                    <option value="cautious">신중</option>
                    <option value="thorough">철저</option>
                    <option value="slow">느림</option>
                    <option value="very_slow">매우 느림</option>
                </select>
            </div>

            <div id="toki-native-helper" style="display:none; margin: -10px 0 20px 0; padding: 14px; background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.1); border-radius: 18px;">
                <div style="font-size: 12px; color: var(--toki-primary); margin-bottom: 10px; line-height: 1.5; font-weight: 500;">
                    ⚠️ Native 모드는 브라우저 설정 변경이 필요합니다.
                </div>
                <button class="toki-btn-action toki-btn-secondary" id="toki-btn-test-native" style="height: 36px; font-size: 12px; border-radius: 12px;">
                    📂 기능 동작 테스트 실행
                </button>
            </div>

            <div class="toki-section-title">Novel Settings</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div class="toki-control-group">
                    <label class="toki-label">소설 포맷</label>
                    <select id="toki-sel-novel-format" class="toki-select">
                        <option value="epub">EPUB</option>
                        <option value="txt">TXT</option>
                    </select>
                </div>
                <div class="toki-control-group">
                    <label class="toki-label">Smart Skip</label>
                    <select id="toki-sel-smartskip" class="toki-select">
                        <option value="90">90% (민감)</option>
                        <option value="70">70% (보통)</option>
                        <option value="50">50% (기본)</option>
                    </select>
                </div>
            </div>

            <div class="toki-control-group">
                <label class="toki-label">소설 패키징</label>
                <select id="toki-sel-novel-mode" class="toki-select">
                    <option value="perChapter">회차별 개별 저장</option>
                    <option value="singleVolume">범위 합본 저장</option>
                </select>
            </div>

            <div class="toki-section-title">Configuration</div>
            <button class="toki-btn-action toki-btn-secondary" id="toki-btn-advanced" style="height: 52px; font-size: 14px; font-weight: 700; border-style: dashed; background: rgba(0,0,0,0.02); border-radius: 20px;">
                🛠️ 상세 주소 및 API 키 설정 (Advanced)
            </button>
        `;
        body.appendChild(tabSettings);

        // 3. History Tab (NEW)
        const tabHistory = document.createElement('div');
        tabHistory.className = 'toki-tab-content';
        tabHistory.id = 'toki-tab-history';
        tabHistory.innerHTML = `
            <div class="toki-info-card">
                <div class="toki-info-row">
                    <span class="toki-info-label">동기화 상태</span>
                    <span class="toki-info-val"><span class="toki-status-dot toki-status-online"></span>연결됨</span>
                </div>
                <div class="toki-info-row">
                    <span class="toki-info-label">마지막 동기화</span>
                    <span class="toki-info-val" id="toki-txt-last-sync">-</span>
                </div>
            </div>
            <div class="toki-control-group">
                <button class="toki-btn-action" id="toki-btn-sync-now" style="height: 48px;">
                    <span>🔄 지금 즉시 동기화</span>
                </button>
            </div>
            <p style="font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.6;">
                구글 드라이브의 데이터를 기반으로 목록에 완료 표시(✅)를 업데이트합니다.
            </p>
        `;
        body.appendChild(tabHistory);

        // 4. Tools Tab (Renamed from System)
        const tabTools = document.createElement('div');
        tabTools.className = 'toki-tab-content';
        tabTools.id = 'toki-tab-tools';
        tabTools.innerHTML = `
                <div class="toki-control-group">
                    <label class="toki-label">파일 관리</label>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button class="toki-btn-action toki-btn-secondary" id="toki-btn-migration" style="height: 44px; justify-content: flex-start; padding-left: 20px;">
                            📂 기존 파일명 표준화 (Migration)
                        </button>
                        <button class="toki-btn-action toki-btn-secondary" id="toki-btn-thumb-optim" style="height: 44px; justify-content: flex-start; padding-left: 20px;">
                            🔄 썸네일 통합 및 캐 최적화
                        </button>
                    </div>
                </div>
                <hr style="border: 0; border-top: 1px solid rgba(0,0,0,0.05); margin: 24px 0;">
                <div class="toki-control-group">
                    <label class="toki-label">시스템 도구</label>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button class="toki-btn-action toki-btn-secondary" id="toki-btn-log" style="height: 44px; justify-content: flex-start; padding-left: 20px;">
                            📝 실시간 로그창 토글
                        </button>
                        <button class="toki-btn-action" id="toki-btn-tree-editor" style="height: 44px; background: #6366f1; justify-content: flex-start; padding-left: 20px;">
                            🧩 파싱 규칙 편집기 (Tree Editor)
                        </button>
                    </div>
                </div>
        `;
        body.appendChild(tabTools);

        modal.appendChild(body);
        document.body.appendChild(overlay);

        // --- Bind Events & Init Logic ---
        this.bindEvents(overlay);
    }

    // Helper removed as no longer using accordion

    bindEvents(overlay) {
        // Tab Switching Logic
        const tabBtns = overlay.querySelectorAll('.toki-tab-btn');
        const tabContents = overlay.querySelectorAll('.toki-tab-content');

        tabBtns.forEach(btn => {
            btn.onclick = () => {
                const target = btn.getAttribute('data-tab');
                
                // Toggle Buttons
                tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                // Toggle Contents
                tabContents.forEach(c => {
                    c.classList.toggle('active', c.id === `toki-tab-${target}`);
                });
            };
        });

        // Headers
        const closeBtn = document.getElementById('toki-btn-menu-close');
        if (closeBtn) closeBtn.onclick = () => this.close(overlay);
        
        const viewerLink = document.getElementById('toki-btn-viewer-link');
        if (viewerLink) viewerLink.onclick = () => {
             if(this.handlers.openViewer) this.handlers.openViewer();
        };

        // 1. Download Tab
        const downAllBtn = document.getElementById('toki-btn-down-all');
        if (downAllBtn) downAllBtn.onclick = () => {
            const force = document.getElementById('toki-chk-force-overwrite').checked;
            if(this.handlers.downloadAll) this.handlers.downloadAll(force);
            this.close(overlay);
        };

        const downRangeBtn = document.getElementById('toki-btn-down-range');
        if (downRangeBtn) downRangeBtn.onclick = () => {
            const spec = document.getElementById('toki-range-input').value.trim();
            const force = document.getElementById('toki-chk-force-overwrite').checked;
            if (this.handlers.downloadRange) {
                this.handlers.downloadRange(spec || undefined, force);
            }
            this.close(overlay);
        };

        const downCurrentBtn = document.getElementById('toki-btn-down-current');
        if (downCurrentBtn) downCurrentBtn.onclick = () => {
             if(this.handlers.downloadCurrent) this.handlers.downloadCurrent();
             this.close(overlay);
        };

        const testExtractBtn = document.getElementById('toki-btn-test-extract');
        if (testExtractBtn) testExtractBtn.onclick = () => {
             if(this.handlers.testExtraction) this.handlers.testExtraction();
        };

        // 2. Settings Tab
        const selPolicy = document.getElementById('toki-sel-policy');
        const selSpeed = document.getElementById('toki-sel-speed');
        const selNovelTerm = document.getElementById('toki-sel-novel-mode');

        // Load Initial Values
        if (this.handlers.getConfig) {
            const cfg = this.handlers.getConfig();
            if (cfg.policy && selPolicy) selPolicy.value = cfg.policy;
            if (cfg.sleepMode && selSpeed) selSpeed.value = cfg.sleepMode;
            if (cfg.novelMode && selNovelTerm) selNovelTerm.value = cfg.novelMode;
        }

        if (selPolicy) {
            selPolicy.onchange = () => { 
                if(this.handlers.setConfig) this.handlers.setConfig('TOKI_DOWNLOAD_POLICY', selPolicy.value);
                this.updateNativeHelper(selPolicy.value);
            };
            this.updateNativeHelper(selPolicy.value);
        }
        
        const testNativeBtn = document.getElementById('toki-btn-test-native');
        if (testNativeBtn) {
            testNativeBtn.onclick = async () => {
                if (this.handlers.testNativeDownload) {
                    testNativeBtn.disabled = true;
                    testNativeBtn.textContent = '⏳ 테스트 중...';
                    const success = await this.handlers.testNativeDownload();
                    if (success) {
                        testNativeBtn.textContent = '✅ 테스트 성공 (폴더 확인)';
                        testNativeBtn.style.color = '#55ff55';
                    } else {
                        testNativeBtn.textContent = '❌ 테스트 실패 (설정 확인)';
                        testNativeBtn.style.color = '#ff5555';
                    }
                    setTimeout(() => {
                        testNativeBtn.disabled = false;
                        testNativeBtn.textContent = '📂 자동 분류 기능 테스트';
                        testNativeBtn.style.color = '';
                    }, 3000);
                }
            };
        }

        if (selSpeed) selSpeed.onchange = () => { if(this.handlers.setConfig) this.handlers.setConfig('TOKI_SLEEP_MODE', selSpeed.value); };
        if (selNovelTerm) selNovelTerm.onchange = () => { if(this.handlers.setConfig) this.handlers.setConfig('TOKI_NOVEL_MODE', selNovelTerm.value); };

        const advancedBtn = document.getElementById('toki-btn-advanced');
        if (advancedBtn) advancedBtn.onclick = () => {
            if(this.handlers.openSettings) this.handlers.openSettings();
            this.close(overlay); 
        };

        // 3. History Tab
        const syncBtn = document.getElementById('toki-btn-sync-now');
        if (syncBtn) {
            syncBtn.onclick = async () => {
                if (this.handlers.syncHistory) {
                    syncBtn.disabled = true;
                    syncBtn.innerHTML = '<span>⏳ 동기화 중...</span>';
                    await this.handlers.syncHistory();
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = '<span>🔄 지금 즉시 동기화</span>';
                    
                    const timeEl = document.getElementById('toki-txt-last-sync');
                    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
                }
            };
        }

        // 4. Tools Tab
        const migrationBtn = document.getElementById('toki-btn-migration');
        if (migrationBtn) migrationBtn.onclick = () => {
            if(this.handlers.migrateFilenames) this.handlers.migrateFilenames();
            this.close(overlay);
        };

        const thumbBtn = document.getElementById('toki-btn-thumb-optim');
        if (thumbBtn) thumbBtn.onclick = () => {
            if(this.handlers.migrateThumbnails) this.handlers.migrateThumbnails();
            this.close(overlay);
        };

        const logBtn = document.getElementById('toki-btn-log');
        if (logBtn) logBtn.onclick = () => {
            if(this.handlers.toggleLog) this.handlers.toggleLog();
        };

        const treeEditorBtn = document.getElementById('toki-btn-tree-editor');
        if (treeEditorBtn) treeEditorBtn.onclick = () => {
            const editor = new TreeRuleEditor();
            editor.show();
        };
    }

    // getEpisodeRange 핸들러는 슬라이더 제거로 더 이상 UI에서 사용 안 함 (main.js 호환용으로 유지)

    show() {
        this.render();
    }

    close(overlay) {
        if(overlay) {
            overlay.style.transition = 'opacity 0.2s';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
        }
    }

    toggle() {
        const existing = document.querySelector('.toki-modal-overlay');
        if (existing) this.close(existing);
        else this.show();
    }

    updateNativeHelper(policy) {
        const helper = document.getElementById('toki-native-helper');
        if (helper) {
            helper.style.display = (policy === 'native') ? 'block' : 'none';
        }
    }
}

/**
 * Mark downloaded items in the list (UI Sync)
 * @param {string[]} historyList Array of episode IDs (e.g. ["0001", "0002"])
 */
export async function markDownloadedItems(historyList) {
    if (!historyList || historyList.length === 0) return;

    // Use Set for fast lookup
    const historySet = new Set(historyList.map(id => id.toString())); // Ensure string comparison

    const parser = await ParserFactory.getParser();
    if (!parser) {
        console.warn('[UI] 파서를 찾을 수 없어 다운로드 표시를 생략합니다.');
        return;
    }

    const items = await parser.getListItems();
    let markedCount = 0;

    items.forEach(li => {
        try {
            const item = parser.parseListItem(li);
            if (!item) return; // Skip if parse failed
            
            const { num, element } = item;

            if (num) {
                // Normalize: '0001' -> '1', '1' -> '1' for comparison
                const normalizedNum = parseInt(num).toString();
                
                // Check if ANY items in history set matches this number
                let isDownloaded = historySet.has(num) || historySet.has(normalizedNum);
                
                // Try left-pad match
                if(!isDownloaded && normalizedNum.length < 4) {
                    const padded = normalizedNum.padStart(4, '0');
                    isDownloaded = historySet.has(padded);
                }

                if (isDownloaded) {
                    // Visual Indicator (v1.9.1 Class-based)
                    element.classList.add('toki-downloaded'); 
                    markedCount++;
                }
            }
        } catch (e) {
            console.warn('[UI] 특정 항목(li) 마킹 중 오류 발생 (건너뜀):', e);
        }
    });

    
    console.log(`[UI] ${markedCount}개 항목에 다운로드 완료 표시 적용.`);
}

/**
 * TreeRuleEditor (v1.9.0)
 * Specialist UI for managing parsing rules with a tree-style interface.
 */
export class TreeRuleEditor {
    constructor() {
        this.rules = RuleManager.getCustomRules();
        this.overlay = null;
        this.hints = {
            'id': '사이트 고유 ID (영문/숫자)',
            'name': '표시용 이름',
            'urlPattern': '적용할 URL 정규표현식',
            'category': 'Webtoon / Manga / Novel',
            'meta': '작품 정보를 추출하는 규칙 그룹',
            'selector': 'CSS 셀렉터 (예: .title, #info)',
            'attr': '추출할 속성 (비워두면 텍스트)',
            'regex': '데이터 정제용 정규식 그룹',
            'list': '회차 목록을 추출하는 규칙 그룹',
            'container': '목록 전체를 감싸는 부모 요소',
            'item': '각 회차 줄 요소 (li 등)',
            'viewer': '본문 내용을 추출하는 규칙 그룹',
            'images': '웹툰 이미지 또는 소설 본문 요소'
        };
    }

    show() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'toki-modal-overlay';
        this.overlay.style.zIndex = '10002';
        
        this.overlay.innerHTML = `
            <div class="toki-modal toki-tree-modal">
                <div class="toki-modal-header">
                    <div class="toki-modal-title">🧩 파싱 규칙 관리자 (Tree Editor)</div>
                    <div style="display: flex; gap: 8px;">
                        <button class="toki-btn-rule" id="tree-btn-export">📤 내보내기</button>
                        <button class="toki-btn-rule" id="tree-btn-import">📥 가져오기</button>
                        <button class="toki-modal-close" id="tree-close-btn">&times;</button>
                    </div>
                </div>
                <div class="toki-tree-container">
                    <div class="toki-tree-view" id="tree-root"></div>
                    
                    <div class="toki-tree-right-panel">
                        <div style="display: flex; justify-content: space-between; align-items: center; color: #888; font-size: 12px;">
                            <span>📄 JSON 미리보기</span>
                            <span id="tree-json-status" style="color: #4ade80;">✓ Valid</span>
                        </div>
                        <textarea class="toki-tree-json-preview" id="tree-json-editor" spellcheck="false"></textarea>
                        
                        <div class="toki-test-bench" style="margin-top: 0;">
                            <div class="toki-label" style="margin-bottom: 5px;">🧪 즉시 테스트</div>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="tree-test-url" class="toki-input-compact" style="flex: 1;" placeholder="주소 입력" value="${window.location.href}">
                                <button class="toki-btn-rule" id="tree-btn-test" style="border-color: #4ade80; color: #4ade80;">실행</button>
                            </div>
                            <div id="tree-test-result" class="toki-test-result">규칙 수정 후 바로 테스트해보세요.</div>
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button class="toki-btn-action" id="tree-btn-save" style="background: #6a5acd; font-weight: bold;">저장 및 적용</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        this.render();
        this.bindEvents();
    }

    render() {
        const root = this.overlay.querySelector('#tree-root');
        root.innerHTML = '';
        
        const mainNode = document.createElement('div');
        mainNode.innerHTML = `<div class="toki-tree-item"><span class="toki-tree-key">Rules [Array]</span><button class="toki-tree-btn-small" id="tree-add-rule">➕ 룰 추가</button></div>`;
        root.appendChild(mainNode);

        const listNode = document.createElement('div');
        listNode.className = 'toki-tree-node';
        this.rules.forEach((rule, idx) => {
            listNode.appendChild(this.renderNode(rule, `[${idx}]`, rule.name || rule.id || `Rule ${idx + 1}`));
        });
        root.appendChild(listNode);

        this.updateJsonPreview();
    }

    renderNode(data, path, label = '') {
        const wrapper = document.createElement('div');
        wrapper.className = 'toki-tree-node-wrapper';

        const item = document.createElement('div');
        item.className = 'toki-tree-item';
        
        const isObject = data !== null && typeof data === 'object';
        const toggle = document.createElement('span');
        toggle.className = 'toki-tree-toggle';
        toggle.textContent = isObject ? '▼' : '•';
        
        const keySpan = document.createElement('span');
        keySpan.className = 'toki-tree-key';
        keySpan.textContent = label || path.split('.').pop();
        if (this.hints[keySpan.textContent]) {
            keySpan.title = this.hints[keySpan.textContent];
        }

        item.appendChild(toggle);
        item.appendChild(keySpan);

        if (!isObject) {
            const input = document.createElement('input');
            input.className = 'toki-tree-val';
            input.value = data;
            input.dataset.path = path;
            input.oninput = (e) => this.updateValue(path, e.target.value);
            item.appendChild(input);
        } else {
            const actions = document.createElement('div');
            actions.className = 'toki-tree-actions';
            
            const btnDel = document.createElement('button');
            btnDel.className = 'toki-tree-btn-small';
            btnDel.textContent = '🗑️';
            btnDel.onclick = () => this.removeNode(path);
            actions.appendChild(btnDel);
            
            item.appendChild(actions);
        }

        wrapper.appendChild(item);

        if (isObject) {
            const children = document.createElement('div');
            children.className = 'toki-tree-node';
            Object.keys(data).forEach(key => {
                children.appendChild(this.renderNode(data[key], `${path}.${key}`, key));
            });
            wrapper.appendChild(children);

            toggle.onclick = () => {
                const isHidden = children.style.display === 'none';
                children.style.display = isHidden ? 'block' : 'none';
                toggle.textContent = isHidden ? '▼' : '▶';
            };
        }

        return wrapper;
    }

    updateValue(path, val) {
        const parts = path.split('.');
        let current = this.rules;
        
        for (let i = 0; i < parts.length; i++) {
            let p = parts[i];
            if (p.startsWith('[') && p.endsWith(']')) {
                p = parseInt(p.substring(1, p.length - 1));
            }
            
            if (i === parts.length - 1) {
                current[p] = val;
            } else {
                current = current[p];
            }
        }
        this.updateJsonPreview();
    }

    removeNode(path) {
        if (!confirm(`노드(${path})를 삭제하시겠습니까?`)) return;
        
        const parts = path.split('.');
        if (parts.length === 1) { // Root rule
            const idx = parseInt(parts[0].substring(1, parts[0].length - 1));
            this.rules.splice(idx, 1);
        } else {
            let current = this.rules;
            for (let i = 0; i < parts.length - 1; i++) {
                let p = parts[i];
                if (p.startsWith('[') && p.endsWith(']')) p = parseInt(p.substring(1, p.length - 1));
                current = current[p];
            }
            const last = parts[parts.length - 1];
            delete current[last];
        }
        this.render();
    }

    updateJsonPreview() {
        const editor = this.overlay.querySelector('#tree-json-editor');
        editor.value = JSON.stringify(this.rules, null, 2);
    }

    bindEvents() {
        const overlay = this.overlay;
        
        overlay.querySelector('#tree-close-btn').onclick = () => overlay.remove();
        
        overlay.querySelector('#tree-add-rule').onclick = () => {
            this.rules.push({
                id: 'new_site_' + Date.now(),
                name: '새 사이트',
                urlPattern: '',
                category: 'Webtoon',
                meta: { title: { selector: '' } },
                list: { container: '', item: '' },
                viewer: { images: { selector: '' } }
            });
            this.render();
        };

        overlay.querySelector('#tree-json-editor').oninput = (e) => {
            const status = overlay.querySelector('#tree-json-status');
            try {
                const parsed = JSON.parse(e.target.value);
                if (Array.isArray(parsed)) {
                    this.rules = parsed;
                    status.textContent = '✓ Valid';
                    status.style.color = '#4ade80';
                    if (this.renderTimer) clearTimeout(this.renderTimer);
                    this.renderTimer = setTimeout(() => this.render(), 1000);
                }
            } catch (err) {
                status.textContent = '⚠ Invalid JSON';
                status.style.color = '#ff5555';
            }
        };

        overlay.querySelector('#tree-btn-save').onclick = () => {
            RuleManager.saveCustomRules(this.rules);
            alert('파싱 규칙이 성공적으로 저장되었습니다.');
            overlay.remove();
        };

        overlay.querySelector('#tree-btn-export').onclick = () => {
            const blob = new Blob([JSON.stringify(this.rules, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tokisync_rules_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        overlay.querySelector('#tree-btn-import').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const imported = JSON.parse(ev.target.result);
                        const rules = Array.isArray(imported) ? imported : (imported.rules || []);
                        const mode = confirm('기존 규칙과 합치시겠습니까? (취소 시 전체 덮어쓰기)') ? 'merge' : 'overwrite';
                        
                        if (mode === 'overwrite') {
                            this.rules = rules;
                        } else {
                            RuleManager.bulkImport(rules, 'merge');
                            this.rules = RuleManager.getCustomRules();
                        }
                        this.render();
                    } catch (err) {
                        alert('JSON 파싱 오류: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };

        overlay.querySelector('#tree-btn-test').onclick = async () => {
            const res = overlay.querySelector('#tree-test-result');
            res.textContent = '⏳ 파싱 테스트 중...';
            try {
                const url = overlay.querySelector('#tree-test-url').value;
                const domain = new URL(url).origin;
                const rule = this.rules.find(r => new RegExp(r.urlPattern, 'i').test(url));
                if (!rule) throw new Error('해당 URL에 맞는 규칙이 트리 내에 없습니다.');

                const parser = new GenericParser(domain, rule);
                const result = await extractEpisodeData(document, parser, { site: 'test', category: rule.category }, false);
                
                res.innerHTML = `
                    <div style="color: #4ade80">성공!</div>
                    <div>• 제목: ${result.title || 'N/A'}</div>
                    <div>• 항목 수: ${result.urls?.length || (result.content ? '1 (Text)' : '0')}</div>
                `;
            } catch (e) {
                res.textContent = '❌ 실패: ' + e.message;
            }
        };
    }
}
