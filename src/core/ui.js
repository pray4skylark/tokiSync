/**
 * UI Module for TokiSync
 * Handles Logging Overlay and OS Notifications
 */

import { startSilentAudio, stopSilentAudio, isAudioRunning } from './anti_sleep.js';

export class LogBox {
    static instance = null;

    constructor() {
        if (LogBox.instance) return LogBox.instance;
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
            style.innerHTML = `
                #toki-logbox {
                    position: fixed; bottom: 90px; right: 100px;
                    width: 320px; height: 200px;
                    background: rgba(0, 0, 0, 0.85);
                    color: #0f0; font-family: monospace; font-size: 11px;
                    border: 1px solid #333; border-radius: 8px;
                    padding: 0; z-index: 9999;
                    display: none; flex-direction: column;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    backdrop-filter: blur(2px);
                }
                #toki-logbox-header {
                    padding: 5px 10px; background: rgba(255,255,255,0.1);
                    border-bottom: 1px solid #333;
                    display: flex; justify-content: space-between; align-items: center;
                    cursor: move; /* Dragging not implemented yet but visual cue */
                }
                #toki-logbox-title { font-weight: bold; color: #fff; }
                #toki-logbox-controls span { cursor: pointer; margin-left: 8px; color: #aaa; }
                #toki-logbox-controls span:hover { color: #fff; }
                #toki-logbox-content {
                    flex: 1; overflow-y: auto; padding: 10px; margin: 0;
                    list-style: none;
                }
                #toki-logbox-content li { margin-bottom: 2px; word-break: break-all; }
                #toki-logbox-content li.error { color: #ff5555; }
                #toki-logbox-content li.success { color: #55ff55; }
                
                /* Scrollbar */
                #toki-logbox-content::-webkit-scrollbar { width: 6px; }
                #toki-logbox-content::-webkit-scrollbar-track { background: transparent; }
                #toki-logbox-content::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

                /* --- MenuModal Styles (v1.5.0) --- */
                .toki-modal-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    z-index: 9999;
                    display: flex; justify-content: center; align-items: center;
                    opacity: 0; animation: tokiFadeIn 0.2s forwards;
                }
                .toki-modal {
                    width: 360px; max-width: 90%;
                    background: rgba(30, 32, 35, 0.95);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    overflow: hidden;
                    display: flex; flex-direction: column;
                    transform: translateY(20px); animation: tokiSlideUp 0.3s forwards;
                }
                .toki-modal-header {
                    padding: 16px 20px;
                    background: rgba(255, 255, 255, 0.05);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex; justify-content: space-between; align-items: center;
                }
                .toki-modal-title { font-size: 18px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 8px; }
                .toki-modal-close {
                    background: none; border: none; color: #aaa;
                    font-size: 20px; cursor: pointer; padding: 4px;
                }
                .toki-modal-close:hover { color: white; }
                
                .toki-modal-body { padding: 10px; max-height: 70vh; overflow-y: auto; }

                /* Accordion */
                details {
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px; margin-bottom: 8px; overflow: hidden;
                    border: 1px solid transparent; transition: border-color 0.2s;
                }
                details[open] { border-color: rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
                summary {
                    padding: 12px 16px; cursor: pointer; list-style: none;
                    display: flex; justify-content: space-between; align-items: center;
                    font-weight: 600; font-size: 14px; user-select: none; color: #fff;
                }
                summary::-webkit-details-marker { display: none; }
                summary:hover { background: rgba(255, 255, 255, 0.05); }
                summary::after { content: '›'; font-size: 18px; transition: transform 0.2s; color: #aaa; }
                details[open] summary::after { transform: rotate(90deg); }
                .toki-accordion-content { padding: 10px 16px 16px; border-top: 1px solid rgba(255,255,255,0.05); }

                /* Controls */
                .toki-control-group { margin-bottom: 15px; }
                .toki-control-group:last-child { margin-bottom: 0px; }
                .toki-label { display: block; font-size: 11px; color: #aaa; margin-bottom: 6px; }
                .toki-select {
                    width: 100%; padding: 8px;
                    background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px; color: #fff; font-size: 13px;
                }
                .toki-btn-action {
                    width: 100%; padding: 10px;
                    background: linear-gradient(135deg, #6a5acd, #483d8b);
                    border: none; border-radius: 6px;
                    color: #fff; font-size: 14px; font-weight: 500;
                    cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px;
                    transition: filter 0.2s;
                }
                .toki-btn-action:hover { filter: brightness(1.1); }
                .toki-btn-secondary { background: rgba(255,255,255,0.1); color: #ddd; }
                .toki-btn-secondary:hover { background: rgba(255,255,255,0.15); color: #fff; }
                
                /* Range Slider */
                .toki-range-container { position: relative; height: 30px; display: flex; align-items: center; }
                .toki-range-track { width: 100%; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; position: relative; }
                .toki-range-active { position: absolute; height: 100%; background: #6a5acd; }
                .toki-range-thumb {
                    width: 14px; height: 14px; background: #fff; border-radius: 50%;
                    position: absolute; top: 50%; transform: translate(-50%, -50%);
                    cursor: col-resize; box-shadow: 0 1px 3px rgba(0,0,0,0.5);
                }

                /* FAB */
                .toki-fab {
                    position: fixed; bottom: 30px; right: 100px;
                    width: 56px; height: 56px;
                    background: #6a5acd; border-radius: 50%;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                    display: flex; justify-content: center; align-items: center;
                    cursor: pointer; transition: transform 0.2s, background 0.2s;
                    z-index: 9998;
                }
                .toki-fab:hover { background: #483d8b; transform: scale(1.05); }
                .toki-fab svg { width: 24px; height: 24px; fill: white; }

                @keyframes tokiFadeIn { to { opacity: 1; } }
                @keyframes tokiSlideUp { to { transform: translateY(0); } }
            `;
            document.head.appendChild(style);
        }

        // -- HTML --
        this.container = document.createElement('div');
        this.container.id = 'toki-logbox';
        this.container.innerHTML = `
            <div id="toki-logbox-header">
                <span id="toki-logbox-title">TokiSync Log</span>
                <div id="toki-logbox-controls">
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
        
        document.getElementById('toki-btn-clear').onclick = () => this.clear();
        document.getElementById('toki-btn-close').onclick = () => this.hide();
        
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
        }
    }

    static getInstance() {
        if (!LogBox.instance) {
            new LogBox();
        }
        return LogBox.instance;
    }

    log(msg, type = 'normal') {
        if (!this.list) return;

        const li = document.createElement('li');
        const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        li.textContent = `[${time}] ${msg}`;
        
        if (type === 'error') li.classList.add('error');
        if (type === 'success') li.classList.add('success');

        this.list.appendChild(li);
        this.list.scrollTop = this.list.scrollHeight;
    }

    error(msg) {
        this.show(); // Auto-show on error
        this.log(msg, 'error');
    }

    success(msg) {
        this.log(msg, 'success');
    }

    clear() {
        if (this.list) this.list.innerHTML = '';
    }

    show() {
        if (this.container) this.container.style.display = 'flex';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
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
        
        // 2. Keyboard Shortcut (Ctrl+Shift+T)
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't' || e.code === 'KeyT')) {
                e.preventDefault();
                this.toggle();
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
                <button class="toki-modal-close" style="font-size: 14px; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; display: flex; align-items: center; gap: 4px;" id="toki-btn-viewer-link" title="Open Viewer">
                    🌐 <span style="font-size: 12px;">Viewer</span>
                </button>
                <button class="toki-modal-close" id="toki-btn-menu-close" title="Close">&times;</button>
            </div>
        `;
        modal.appendChild(header);

        // -- Body --
        const body = document.createElement('div');
        body.className = 'toki-modal-body';
        
        // 1. Download Section
        const downSection = this.createAccordion('📥 다운로드 (Download)', true); // Default Open
        downSection.innerHTML += `
            <div class="toki-accordion-content">
                <!-- Range Slider Container -->
                <!-- Range Slider Container -->
                <div class="toki-control-group">
                    <label class="toki-label">범위 지정 (직접 입력 가능)</label>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <input type="number" id="toki-range-start" class="toki-select" style="width:45%; text-align:center;" placeholder="Start">
                        <span style="color:#aaa;">~</span>
                        <input type="number" id="toki-range-end" class="toki-select" style="width:45%; text-align:center;" placeholder="End">
                    </div>
                    <div class="toki-range-container" id="toki-range-slider">
                        <div class="toki-range-track">
                            <div class="toki-range-active" style="left: 0%; width: 100%;"></div>
                            <div class="toki-range-thumb" data-thumb="0" style="left: 0%"></div>
                            <div class="toki-range-thumb" data-thumb="1" style="left: 100%"></div>
                        </div>
                    </div>
                    <button class="toki-btn-action" id="toki-btn-down-range" style="margin-top: 10px;">
                        <span>선택 다운로드 시작</span>
                    </button>
                </div>
                <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 12px 0;">
                <button class="toki-btn-action toki-btn-secondary" id="toki-btn-down-all">
                    <span>전체 다운로드 (All)</span>
                </button>
            </div>
        `;
        body.appendChild(downSection);

        // 2. Settings Section
        const setSection = this.createAccordion('⚙️ 설정 (Settings)');
        setSection.innerHTML += `
            <div class="toki-accordion-content">
                <div class="toki-control-group">
                    <label class="toki-label">다운로드 정책</label>
                    <select id="toki-sel-policy" class="toki-select">
                        <option value="folderInCbz">통합 파일 (Folder in CBZ/EPUB)</option>
                        <option value="zipOfCbzs">압축 파일 모음 (ZIP of CBZs)</option>
                        <option value="individual">개별 파일 (Individual Files)</option>
                        <option value="gasUpload">Google Drive 업로드 (개별 파일)</option>
                    </select>
                </div>
                <div class="toki-control-group">
                    <label class="toki-label">다운로드 속도</label>
                    <select id="toki-sel-speed" class="toki-select">
                         <option value="agile">빠름 (1-3초)</option>
                         <option value="cautious">신중 (2-5초)</option>
                         <option value="thorough">철저 (3-8초)</option>
                    </select>
                </div>
                <div class="toki-control-group">
                    <button class="toki-btn-action toki-btn-secondary" id="toki-btn-advanced" style="font-size: 13px;">
                        🛠️ 고급 설정 (경로, API키)
                    </button>
                </div>
            </div>
        `;
        body.appendChild(setSection);

        // 3. System Section
        const sysSection = this.createAccordion('📝 시스템 (System)');
        sysSection.innerHTML += `
            <div class="toki-accordion-content">
                 <button class="toki-btn-action toki-btn-secondary" id="toki-btn-log">
                    <span>로그창 토글</span>
                </button>
                <div style="margin-top: 10px;">
                     <button class="toki-btn-action toki-btn-secondary" id="toki-btn-migration" style="font-size: 13px;">
                        📂 파일명 표준화 (Migration)
                    </button>
                </div>
                <div style="margin-top: 10px;">
                    <button class="toki-btn-action toki-btn-secondary" id="toki-btn-thumb-optim" style="font-size: 12px;">
                        🔄 썸네일 최적화 (v1.4.0)
                    </button>
                </div>
            </div>
        `;
        body.appendChild(sysSection);

        modal.appendChild(body);
        document.body.appendChild(overlay);

        // --- Bind Events & Init Logic ---
        this.initExclusiveAccordion();
        this.bindEvents(overlay);
        this.initRangeSlider();
    }

    createAccordion(title, open = false) {
        const details = document.createElement('details');
        if (open) details.open = true;
        const summary = document.createElement('summary');
        summary.innerText = title;
        details.appendChild(summary);
        return details;
    }

    initExclusiveAccordion() {
        const details = document.querySelectorAll('.toki-modal-body details');
        details.forEach((detail) => {
            detail.addEventListener('toggle', (e) => {
                if (detail.open) {
                    details.forEach((other) => {
                        if (other !== detail && other.open) {
                            other.open = false;
                        }
                    });
                }
            });
        });
    }

    bindEvents(overlay) {
        // Headers
        document.getElementById('toki-btn-menu-close').onclick = () => this.close(overlay);
        document.getElementById('toki-btn-viewer-link').onclick = () => {
             if(this.handlers.openViewer) this.handlers.openViewer();
        };

        // Download
        document.getElementById('toki-btn-down-all').onclick = () => {
            if(this.handlers.downloadAll) this.handlers.downloadAll();
            this.close(overlay);
        };
        document.getElementById('toki-btn-down-range').onclick = () => {
             // Get Range from Inputs
             const startInput = document.getElementById('toki-range-start');
             const endInput = document.getElementById('toki-range-end');
             
             const start = parseInt(startInput.value);
             const end = parseInt(endInput.value);

             if (!isNaN(start) && !isNaN(end) && this.handlers.downloadRange) {
                 this.handlers.downloadRange(start, end);
             }
             this.close(overlay);
        };

        // Settings
        const selPolicy = document.getElementById('toki-sel-policy');
        const selSpeed = document.getElementById('toki-sel-speed');

        // Load Initial Values (Need to fetch via handler or GM)
        if (this.handlers.getConfig) {
            const cfg = this.handlers.getConfig();
            if (cfg.policy) selPolicy.value = cfg.policy;
            if (cfg.sleepMode) selSpeed.value = cfg.sleepMode;
        }

        selPolicy.onchange = () => { if(this.handlers.setConfig) this.handlers.setConfig('TOKI_DOWNLOAD_POLICY', selPolicy.value); };
        selSpeed.onchange = () => { if(this.handlers.setConfig) this.handlers.setConfig('TOKI_SLEEP_MODE', selSpeed.value); };

        document.getElementById('toki-btn-advanced').onclick = () => {
            if(this.handlers.openSettings) this.handlers.openSettings();
            // Typically advanced settings opens another modal, so we might want to close this one or keep it behind.
            // Let's keep it open or close it? 
            // Existing logic: showConfigModal() removes existing modal? 
            // Let's close this menu for clarity.
            this.close(overlay); 
        };
        document.getElementById('toki-btn-migration').onclick = () => {
            if(this.handlers.migrateFilenames) this.handlers.migrateFilenames();
            this.close(overlay);
        };

        // System
        document.getElementById('toki-btn-log').onclick = () => {
            if(this.handlers.toggleLog) this.handlers.toggleLog();
        };
         document.getElementById('toki-btn-thumb-optim').onclick = () => {
            if(this.handlers.migrateThumbnails) this.handlers.migrateThumbnails();
            this.close(overlay);
        };
    }

    initRangeSlider() {
        // We need 'min' and 'max' episode numbers.
        // handlers.getEpisodeRange() should return { min: 1, max: 100 }
        
        let minEp = 1;
        let maxEp = 100;

        if (this.handlers.getEpisodeRange) {
            const range = this.handlers.getEpisodeRange();
            if (range) {
                minEp = range.min;
                maxEp = range.max;
            }
        }
        
        // Initial State
        this.currentRange = { start: minEp, end: maxEp };
        this.absMin = minEp;
        this.absMax = maxEp;
        
        this.updateRangeUI();
        
        // Input Event Listeners for Manual Entry
        const startInput = document.getElementById('toki-range-start');
        const endInput = document.getElementById('toki-range-end');
        
        const onInputChange = () => {
            let s = parseInt(startInput.value);
            let e = parseInt(endInput.value);
            
            if(isNaN(s)) s = this.absMin;
            if(isNaN(e)) e = this.absMax;
            
            // Validate against Abs Range
            s = Math.max(this.absMin, Math.min(s, this.absMax));
            e = Math.max(this.absMin, Math.min(e, this.absMax));
            
            // Ensure Start <= End
            if (s > e) [s, e] = [e, s];
            
            this.currentRange.start = s;
            this.currentRange.end = e;
            this.updateRangeUI();
        };

        startInput.onchange = onInputChange;
        endInput.onchange = onInputChange;
        
        // Drag Logic
        const track = document.getElementById('toki-range-slider');
        const thumbs = track.querySelectorAll('.toki-range-thumb');
        
        thumbs.forEach(thumb => {
            thumb.onmousedown = (e) => {
                e.preventDefault();
                const isStart = thumb.dataset.thumb === '0';
                
                const onMove = (moveEvent) => {
                    const rect = track.getBoundingClientRect();
                    let x = moveEvent.clientX - rect.left;
                    let percent = (x / rect.width) * 100;
                    percent = Math.max(0, Math.min(100, percent));
                    
                    // Convert percent to value within absolute range [absMin, absMax]
                    // Val = min + (percent * (max - min))
                    let value = Math.round(this.absMin + (percent / 100) * (this.absMax - this.absMin));
                    
                    if (isStart) {
                        this.currentRange.start = Math.min(value, this.currentRange.end);
                        // Clamp to min
                        if(this.currentRange.start < this.absMin) this.currentRange.start = this.absMin;
                    } else {
                        this.currentRange.end = Math.max(value, this.currentRange.start);
                         // Clamp to max
                        if(this.currentRange.end > this.absMax) this.currentRange.end = this.absMax;
                    }
                    this.updateRangeUI();
                };
                
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };
                
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            };
        });
    }

    updateRangeUI() {
        const { start, end } = this.currentRange;
        
        // Update Inputs
        const startInput = document.getElementById('toki-range-start');
        const endInput = document.getElementById('toki-range-end');
        if(startInput && endInput) {
            startInput.value = start;
            endInput.value = end;
        }

        // Calculate percentages based on absMin and absMax
        const totalRange = this.absMax - this.absMin;
        // Avoid division by zero
        const safeRange = totalRange === 0 ? 1 : totalRange;

        const startPct = ((start - this.absMin) / safeRange) * 100;
        const endPct = ((end - this.absMin) / safeRange) * 100;

        const thumbs = document.querySelectorAll('.toki-range-thumb');
        const active = document.querySelector('.toki-range-active');
        
        if (thumbs.length === 2 && active) {
             thumbs[0].style.left = `${startPct}%`;
             thumbs[1].style.left = `${endPct}%`;
             active.style.left = `${startPct}%`;
             active.style.width = `${endPct - startPct}%`;
        }
    }

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
}

/**
 * Mark downloaded items in the list (UI Sync)
 * @param {string[]} historyList Array of episode IDs (e.g. ["0001", "0002"])
 */
export function markDownloadedItems(historyList) {
    if (!historyList || historyList.length === 0) return;

    // Use Set for fast lookup
    const historySet = new Set(historyList.map(id => id.toString())); // Ensure string comparison

    // Target elements: This depends on the specific site structure
    // Common pattern: li.list-item, .list-body > li
    // We reuse logic similar to `getListItems` or target generic list structures found on these sites.
    
    // Attempt 1: NewToki / ManaToki style (.list-item)
    // Attempt 2: BookToki (table rows or similar)
    // We iterate generic selectors commonly used.
    
    const items = document.querySelectorAll('.list-item, .list-row, .post-item, .wr-list li');
    
    let markedCount = 0;

    items.forEach(item => {
        // Find the number logic consistent with downloader.js
        const numElement = item.querySelector('.wr-num, .num');
        if (numElement) {
            // Need to map "Number" to "ID" or verify what ID means.
            // Wait, fetchHistory returns "Episode IDs" which usually correspond to something unique?
            // Actually, in previous steps we used "rootFolder" name for check (series title).
            // SyncService.gs likely returns list of FILENAMES or Folder names if checking inside series folder.
            // If the GAS script returns list of '0001', '0002' (chapter numbers), we match that.
            
            // Assuming historyList contains Chapter Numbers (e.g. "1", "2", "0050")
            const numText = numElement.innerText.trim();
            
            // Normalize: '001' -> '1', '1' -> '1' for comparison
            const normalizedNum = parseInt(numText).toString();
            
            // Check if ANY items in history set matches this number
            // (Assuming historySet has normalized strings like "1", "50")
            // Or if historySet has padded "0001".
            
            // Let's try flexible matching
            let isDownloaded = historySet.has(numText) || historySet.has(normalizedNum);
             
            // Try left-pad match (toki usually uses 4 digit padding in filenames potentially?)
            if(!isDownloaded && normalizedNum.length < 4) {
                 const padded = normalizedNum.padStart(4, '0');
                 isDownloaded = historySet.has(padded);
            }

            if (isDownloaded) {
                // Visual Indicator
                item.style.opacity = '0.6';
                item.style.backgroundColor = 'rgba(0, 255, 0, 0.05)';
                
                // Add Badge if not exists
                if (!item.querySelector('.toki-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'toki-badge';
                    badge.innerText = '✅';
                    badge.style.marginLeft = '5px';
                    badge.style.fontSize = '12px';
                    
                    // Priority: .item-subject > .wr-subject > .title
                    const itemSubject = item.querySelector('.item-subject');
                    const titleEl = item.querySelector('.wr-subject, .title');
                    
                    if (itemSubject) {
                        // Insert at the beginning of .item-subject
                        itemSubject.prepend(badge);
                    } else if (titleEl) {
                        titleEl.prepend(badge);
                    } else {
                        item.appendChild(badge);
                    }
                }
                markedCount++;
            }
        }
    });
    
    console.log(`[UI] ${markedCount}개 항목에 다운로드 완료 표시 적용.`);
}
