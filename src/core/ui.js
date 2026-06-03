/**
 * UI Module for TokiSync
 * Handles Logging Overlay and OS Notifications
 */

import { startSilentAudio, stopSilentAudio, isAudioRunning } from './anti_sleep.js';
import { getConfig, setConfig } from './config.js';
import { EventBus, EVT } from './EventBus.js';
import { ParserFactory } from './parsers/ParserFactory.js';
import { RuleManager } from './parsers/RuleManager.js';
import { GenericParser } from './parsers/GenericParser.js';
import { extractEpisodeData } from './extractor.js';
import styles from './ui.css';
import { getQueue, getQueueStats, getQueuePaused, setQueuePaused, removeQueueItem, removeCompletedAndFailedItems, stopAllWorkers, runSchedulerOnce, clearQueue } from './queue.js';

export class LogBox {
    static instance = null;

    constructor() {
        if (LogBox.instance) return LogBox.instance;
        this.logs = [];
        this.MAX_LOGS = 500;
        this.popupWindow = null;
        this.init();
        LogBox.instance = this;
    }

    init() {
        // -- Register Tampermonkey User Menu Commands --
        if (typeof GM_registerMenuCommand !== 'undefined') {
            try {
                GM_registerMenuCommand("⚡ TokiSync 통합 대시보드 열기", () => {
                    this.openDashboard();
                });
            } catch (e) {
                console.warn('[UI] 템퍼몽키 메뉴 등록 실패:', e.message);
            }
        }

        // ── EventBus 구독 등록 ───────────────────────────────
        EventBus.on(EVT.NOTIFY_ERROR, ({ msg }) => {
            if (this.popupWindow && !this.popupWindow.closed) {
                this.popupWindow.alert(msg);
            } else {
                alert(msg);
            }
        });

        EventBus.on(EVT.LOG, ({ msg, tag, level }) => {
            if (level === 'error') {
                this.error(msg, tag);
            } else if (level === 'warn') {
                this.warn(msg, tag);
            } else if (level === 'success') {
                this.success(msg, tag);
            } else {
                this.log(msg, 'normal', tag);
            }
        });

        EventBus.on(EVT.UPDATE_PROGRESS, () => {
            this.updateProgressUI();
        });
        // ─────────────────────────────────────────────────────

        // 📊 [멀티큐] 팝업이 켜져 있을 때 주기적인 1초 동기화
        setInterval(() => {
            this.updateProgressUI();
        }, 1000);
    }

    openDashboard(defaultTab = '') {
        if (this.popupWindow && !this.popupWindow.closed) {
            this.popupWindow.focus();
            if (defaultTab) {
                this.switchTab(defaultTab);
            }
            return;
        }

        console.log('[TokiSync UI] 🛡️ 가상 팝업 대시보드 기동 (DOM 오염 차단)');
        
        const width = 750;
        const height = 850;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        this.popupWindow = window.open(
            "", 
            "TokiSync_Dashboard", 
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );

        if (!this.popupWindow) {
            alert("⚠️ 팝업창을 띄우지 못했습니다. 브라우저의 팝업 차단 설정을 해제해 주세요!");
            return;
        }

        const doc = this.popupWindow.document;
        doc.title = "⚡ TokiSync Dashboard";

        // Inject Stylesheet
        const style = doc.createElement('style');
        style.innerHTML = styles;
        doc.head.appendChild(style);

        // Body reset — 대시보드 독립 페이지 레이아웃 고정
        const bodyReset = doc.createElement('style');
        bodyReset.innerHTML = `
            *, *::before, *::after { box-sizing: border-box; }
            html, body {
                margin: 0; padding: 0;
                width: 100vw; height: 100vh;
                background: #1a1a2e;
                color: #e0e0e0;
                font-family: 'Segoe UI', system-ui, sans-serif;
                font-size: 14px;
                overflow: hidden;
            }
            #toki-dashboard-popup {
                padding: 0;
                height: 100vh;
            }
        `;
        doc.head.appendChild(bodyReset);

        // Anti-Sleep — 팝업 window에서 AudioContext 자동 기동 (대상 사이트 DOM 오염 없음)
        const antiSleepScript = doc.createElement('script');
        antiSleepScript.textContent = `
            (function() {
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const dest = ctx.createMediaStreamDestination();
                    const gain = ctx.createGain();
                    const osc = ctx.createOscillator();
                    osc.frequency.value = 1;
                    osc.type = 'sine';
                    gain.gain.value = 0.001;
                    osc.connect(gain);
                    gain.connect(dest);
                    osc.start();
                    const audio = document.createElement('audio');
                    audio.srcObject = dest.stream;
                    audio.play().catch(() => {});
                    console.log('[Anti-Sleep] 대시보드 팝업에서 절전 방지 기동');
                } catch(e) {
                    console.warn('[Anti-Sleep] 팝업 기동 실패:', e.message);
                }
            })();
        `;
        doc.body.appendChild(antiSleepScript);

        // Inject Body Structure
        const menuHTML = MenuModal.getInstance() ? MenuModal.getInstance().getHTML() : '';
        doc.body.innerHTML = menuHTML;

        // Bind UI Events
        if (MenuModal.getInstance()) {
            MenuModal.getInstance().bindEventsToPopup(this.popupWindow);
        }

        // Bind Dashboard Specific Events
        const clearLogsBtn = doc.getElementById('toki-btn-log-clear');
        if (clearLogsBtn) {
            clearLogsBtn.onclick = () => this.clear();
        }

        // Flush Cached Logs
        const logContentEl = doc.getElementById('toki-logbox-content');
        if (logContentEl) {
            logContentEl.innerHTML = '';
            this.logs.forEach(l => {
                const li = doc.createElement('li');
                li.textContent = `[${l.time}] ${l.context ? `[${l.context}] ` : ''}${l.msg}`;
                if (l.type === 'error' || l.type === 'critical') li.className = 'error';
                if (l.type === 'success') li.className = 'success';
                logContentEl.appendChild(li);
            });
            logContentEl.scrollTop = logContentEl.scrollHeight;
        }

        this.updateProgressUI();
        if (defaultTab) {
            this.switchTab(defaultTab);
        }
    }

    updateProgressUI() {
        if (!this.popupWindow || this.popupWindow.closed) return;

        const doc = this.popupWindow.document;
        const progressContainer = doc.getElementById('toki-logbox-progress');
        if (!progressContainer) return;

        const queue = getQueue();
        const listEl = doc.getElementById('toki-progress-workers-list');
        const queueListEl = doc.getElementById('toki-progress-queue-list');
        const queueSection = doc.getElementById('toki-progress-queue-section');

        if (queue.length === 0) {
            const textEl = doc.getElementById('toki-progress-overall-text');
            const barEl = doc.getElementById('toki-progress-overall-bar');
            
            if (textEl) textEl.textContent = `진행률: 0% (0 / 0)`;
            if (barEl) barEl.style.width = `0%`;
            
            if (listEl) {
                listEl.innerHTML = `
                    <div class="toki-empty-queue-msg">
                        <span>💡 수집 대기열이 비어 있습니다.</span>
                        <p>작품 목록에서 다운로드할 화를 체크하고 다운로드 정책에 따라 다운로드를 클릭해 주세요.</p>
                    </div>
                `;
            }
            if (queueSection) queueSection.style.display = 'none';
            return;
        }

        progressContainer.style.display = 'block';
        if (queueSection) queueSection.style.display = 'block';

        const stats = getQueueStats();
        const overallPercent = stats.total > 0 ? Math.round(((stats.completed + stats.failed) / stats.total) * 100) : 0;

        // 전체 진행도 갱신
        const textEl = doc.getElementById('toki-progress-overall-text');
        const barEl = doc.getElementById('toki-progress-overall-bar');
        const pauseBtn = doc.getElementById('toki-btn-queue-pause');
        const isPaused = getQueuePaused();
        
        if (textEl) {
            const pauseText = isPaused ? ' ⏸️ [일시 정지됨]' : '';
            textEl.textContent = `진행률: ${overallPercent}% (${stats.completed + stats.failed} / ${stats.total})${pauseText}`;
        }
        
        if (barEl) {
            barEl.style.width = `${overallPercent}%`;
            if (isPaused) {
                barEl.classList.add('toki-progress-bar-paused');
            } else {
                barEl.classList.remove('toki-progress-bar-paused');
            }
        }

        if (pauseBtn) {
            pauseBtn.textContent = isPaused ? '▶️ 재개' : '⏸️ 일시 정지';
            pauseBtn.title = isPaused ? '재개하기 (Resume)' : '일시 정지 (Pause)';
        }

        // 개별 활성 팝업(Worker) 진행 상황 렌더링
        if (listEl) {
            const activeWorkers = queue.filter(item => item.status === 'processing');
            listEl.innerHTML = activeWorkers.map(item => {
                let stageName = '다운로드 중';
                if (item.stage === 'STAGE_INIT') stageName = '초기화';
                else if (item.stage === 'STAGE_DOM_READY') stageName = '대기';
                else if (item.stage === 'STAGE_SCROLLING') stageName = '스크롤';
                else if (item.stage === 'STAGE_PARSING') stageName = '파싱';
                else if (item.stage === 'STAGE_DOWNLOADING') stageName = '다운로드';
                else if (item.stage === 'STAGE_UPLOADING') stageName = '업로드';

                return `
                    <div class="toki-worker-progress-item">
                        <div class="toki-worker-info">
                            <span class="toki-worker-title">${item.episodeTitle}</span>
                            <span class="toki-worker-stage">${stageName} (${item.progressPercent}%)</span>
                        </div>
                        <div class="toki-worker-bar-bg">
                            <div class="toki-worker-bar-fill" style="width: ${item.progressPercent}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 대기열 목록 렌더링
        if (queueListEl) {
            queueListEl.innerHTML = queue.map(item => {
                let badgeClass = 'toki-badge-pending';
                let statusText = '대기';
                if (item.status === 'processing') {
                    badgeClass = 'toki-badge-processing';
                    statusText = '진행';
                } else if (item.status === 'completed') {
                    badgeClass = 'toki-badge-completed';
                    statusText = '완료';
                } else if (item.status === 'failed') {
                    badgeClass = 'toki-badge-failed';
                    statusText = '실패';
                }

                let stageText = '';
                if (item.status === 'processing') {
                    if (item.stage === 'STAGE_INIT') stageText = '초기화';
                    else if (item.stage === 'STAGE_DOM_READY') stageText = '로딩중';
                    else if (item.stage === 'STAGE_SCROLLING') stageText = '스크롤';
                    else if (item.stage === 'STAGE_PARSING') stageText = '파싱중';
                    else if (item.stage === 'STAGE_DOWNLOADING') stageText = '받는중';
                    else if (item.stage === 'STAGE_UPLOADING') stageText = '업로드';
                    stageText = ` [${stageText}]`;
                }

                const errorTitle = item.errorMsg ? ` title="${item.errorMsg}" style="cursor: help;"` : '';

                return `
                    <div class="toki-queue-list-item" data-id="${item.id}">
                        <div class="toki-queue-item-meta">
                            <span class="toki-badge ${badgeClass}"${errorTitle}>${statusText}${stageText}</span>
                            <span class="toki-queue-item-title" title="${item.episodeTitle}">${item.episodeTitle}</span>
                        </div>
                        <span class="toki-queue-item-delete" title="수집 대기열에서 제거" data-id="${item.id}">❌</span>
                    </div>
                `;
            }).join('');
        }
    }

    static getInstance() {
        if (!LogBox.instance) {
            new LogBox();
        }
        return LogBox.instance;
    }

    log(msg, type = 'normal', context = '') {
        const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        const prefix = context ? `[${context}] ` : '';
        const fullMsg = `[${time}] ${prefix}${msg}`;
        
        // 1. 내부 메모리 및 브라우저 콘솔에는 모든 로그 누적 출력
        this.logs.push({ time, type, context, msg: typeof msg === 'string' ? msg : JSON.stringify(msg) });
        if (this.logs.length > this.MAX_LOGS) this.logs.shift();

        if (type === 'error' || type === 'critical') {
            console.error(`[TokiSync] ${prefix}${msg}`);
        } else if (type === 'warn') {
            console.warn(`[TokiSync] ${prefix}${msg}`);
        } else {
            console.log(`[TokiSync] ${prefix}${msg}`);
        }

        // 2. 사소한 자잘한 일반 로그는 대시보드 화면에 뿌리지 않음 (핵심 요약 필터링)
        if (type === 'normal') {
            return;
        }

        // 팝업이 활성화되어 있으면 실시간 렌더링
        if (this.popupWindow && !this.popupWindow.closed) {
            const doc = this.popupWindow.document;
            const logContentEl = doc.getElementById('toki-logbox-content');
            if (logContentEl) {
                const li = doc.createElement('li');
                li.textContent = fullMsg;
                
                // 클래스 매핑
                if (type === 'error' || type === 'critical') li.className = 'error';
                else if (type === 'success') li.className = 'success';
                else if (type === 'warn') li.className = 'warn';
                else if (type === 'info') li.className = 'info';
                
                logContentEl.appendChild(li);
                
                // 스크롤 미동작 방지 (안정적인 DOM 렌더링 후 스크롤 조율을 위해 미세 지연)
                setTimeout(() => {
                    logContentEl.scrollTop = logContentEl.scrollHeight;
                }, 10);
            }
        }
    }

    info(msg, context = '') {
        this.log(msg, 'info', context);
    }

    critical(msg, context = '') {
        this.openDashboard();
        this.log(msg, 'critical', context);
    }

    error(msg, context = '') {
        this.openDashboard();
        this.log(msg, 'error', context);
    }

    warn(msg, context = '') {
        this.log(msg, 'warn', context);
    }

    success(msg, context = '') {
        this.log(msg, 'success', context);
    }

    clear() {
        this.logs = [];
        if (this.popupWindow && !this.popupWindow.closed) {
            const doc = this.popupWindow.document;
            const logContentEl = doc.getElementById('toki-logbox-content');
            if (logContentEl) logContentEl.innerHTML = '';
        }
    }

    show() {
        this.openDashboard();
    }

    hide() {
        if (this.popupWindow && !this.popupWindow.closed) {
            this.popupWindow.close();
        }
    }

    toggle() {
        if (this.popupWindow && !this.popupWindow.closed) {
            this.hide();
        } else {
            this.show();
        }
    }

    switchTab(tabName) {
        if (!this.popupWindow || this.popupWindow.closed) return;
        const doc = this.popupWindow.document;
        const tabBtn = doc.querySelector(`.toki-tab-btn[data-tab="${tabName}"]`);
        if (tabBtn) {
            tabBtn.click();
        }
    }
}

export class Notifier {
    static notify(title, text, onclick = null) {
        if (typeof GM_notification === 'function') {
            GM_notification({
                title: title,
                text: text,
                timeout: 5000,
                onclick: onclick
            });
        } else {
            console.log(`[Notification] ${title}: ${text}`);
        }
    }
}

export class MenuModal {
    static instance = null;

    constructor(handlers = {}) {
        if (MenuModal.instance) return MenuModal.instance;
        this.handlers = handlers;
        this.init();
        MenuModal.instance = this;
    }

    init() {
        // [임시] 대시보드 팝업 분리형으로, 대상 DOM 내 FAB 자동생성은 차단합니다.
    }

    getHTML() {
        return `
        <div id="toki-dashboard-popup">
            <div id="toki-dashboard-header">
                <span id="toki-dashboard-title">⚡ TokiSync 통합 대시보드</span>
                <div id="toki-dashboard-header-controls">
                    <button class="toki-btn-ghost" id="toki-btn-show-progress" title="수집 진행 상황 및 대기열">📊 진행 상황</button>
                    <button class="toki-btn-ghost" id="toki-btn-show-logs" title="실시간 수집 로그 모니터">📋 로그</button>
                    <button class="toki-btn-ghost" id="toki-btn-viewer-link" title="Open Viewer">🌐 Viewer</button>
                    <button class="toki-btn-ghost" id="toki-btn-menu-close" title="Close">❌ 닫기</button>
                </div>
            </div>
            
            <div class="toki-tabs">
                <button class="toki-tab-btn active" data-tab="download">📥 다운로드</button>
                <button class="toki-tab-btn" data-tab="settings">⚙️ 설정</button>
                <button class="toki-tab-btn" data-tab="history">📊 기록</button>
                <button class="toki-tab-btn" data-tab="tools">🛠️ 도구</button>
            </div>
            
            <div class="toki-modal-body">
                <!-- 1. Download Tab -->
                <div class="toki-tab-content active" id="toki-tab-download">
                    <div class="toki-control-group">
                        <label class="toki-label">빠른 작업</label>
                        <button class="toki-btn-action toki-btn-gradient-green" id="toki-btn-down-current">
                            <span>🚀 현재 회차 즉시 다운로드</span>
                        </button>
                    </div>
                    <hr class="toki-divider">
                    <div class="toki-control-group">
                        <label class="toki-label">에피소드 범위 지정</label>
                        <input type="text" id="toki-range-input" class="toki-input" placeholder="예: 1,2,4-10,15 (비우면 전체)">
                        <div class="toki-text-xs toki-mt-8 toki-ml-4">쉼표(,)로 개별 번호, 하이픈(-)으로 연속 범위 지정</div>
                    </div>
                    <div class="toki-control-group toki-mb-24">
                        <label class="toki-checkbox-wrapper">
                            <input type="checkbox" id="toki-chk-force-overwrite" class="toki-checkbox-input">
                            <span class="toki-checkbox"></span>
                            <span class="toki-checkbox-label">⚠️ 강제 재다운로드 (파일 덮어쓰기)</span>
                        </label>
                    </div>
                    <div class="toki-btn-group-row">
                        <button class="toki-btn-action toki-flex-1-4" id="toki-btn-down-range">
                            <span>선택 다운로드</span>
                        </button>
                        <button class="toki-btn-action toki-btn-secondary" id="toki-btn-down-all">
                            <span>전체</span>
                        </button>
                    </div>
                </div>

                <!-- 2. Settings Tab -->
                <div class="toki-tab-content" id="toki-tab-settings">
                    <div class="toki-section-title toki-mt-0">Download Policies</div>
                    <div class="toki-control-group">
                        <label class="toki-label">저장 정책</label>
                        <select id="toki-sel-policy" class="toki-select">
                            <option value="individual">개별 파일 (Individual)</option>
                            <option value="zipOfCbzs">챕터 묶음 (ZIP of CBZs)</option>
                            <option value="native">자동 분류 (Native)</option>
                            <option value="drive">드라이브 업로드 (GoogleDrive)</option>
                        </select>
                    </div>

                    <div id="toki-native-helper" class="toki-hidden toki-helper-box-blue">
                        <div class="toki-text-sm toki-text-primary toki-mb-10 toki-helper-desc">
                            ⚠️ Native 모드는 브라우저 설정 변경이 필요합니다.
                        </div>
                        <button class="toki-btn-action toki-btn-secondary toki-btn-sm" id="toki-btn-test-native">
                            📂 기능 동작 테스트 실행
                        </button>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">로컬 파일명 템플릿</label>
                        <input type="text" id="toki-sel-nametemplate" class="toki-input" placeholder="{number} - {title}">
                        <div class="toki-hint" style="font-size: 11px; color: #888; margin-top: 4px;">
                            로컬 저장 시 파일명 포맷입니다. 
                            (치환자: <b>{number}</b>=패딩번호, <b>{rawNumber}</b>=원본번호, <b>{series}</b>=작품명, <b>{title}</b>=회차제목)<br>
                            ※ 구글 드라이브 업로드 시에는 기존 포맷으로 고정됩니다.
                        </div>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">로컬 화수 패딩 자릿수</label>
                        <select id="toki-sel-localpadding" class="toki-select">
                            <option value="0">패딩 없음 (1, 2, 10)</option>
                            <option value="2">2자리 패딩 (01, 02, 10)</option>
                            <option value="3">3자리 패딩 (001, 002, 010)</option>
                            <option value="4">4자리 패딩 (0001, 0002, 0010)</option>
                        </select>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">다운로드 속도</label>
                        <select id="toki-sel-speed" class="toki-select">
                            <option value="agile">빠름 (1-3초)</option>
                            <option value="cautious">신중 (2-5초)</option>
                            <option value="thorough">철저 (3-8초)</option>
                            <option value="slow">느림 (5-15초)</option>
                            <option value="very_slow">매우 느림 (10-30초)</option>
                        </select>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">이미지 스캔 속도
                            <span id="toki-scan-speed-val" style="font-weight: bold; color: var(--toki-primary, #6366f1);">1000ms</span>
                        </label>
                        <input type="range" id="toki-sel-scanspeed" min="100" max="5000" step="100" value="1000" class="toki-range" style="width: 100%;">
                        <div class="toki-hint" style="font-size: 11px; color: #888; margin-top: 4px;">
                            100ms(빠름/불안정) ─ 1000ms(기본/권장) ─ 3000ms(안정) ─ 5000ms(확실)
                        </div>
                    </div>

                    <div class="toki-section-title">Format & Rules</div>
                    <div class="toki-form-grid">
                        <div class="toki-control-group">
                            <label class="toki-label">소설 포맷</label>
                            <select id="toki-sel-novel-format" class="toki-select">
                                <option value="epub">EPUB</option>
                                <option value="txt">TXT</option>
                            </select>
                        </div>
                        <div class="toki-control-group">
                            <label class="toki-label">소설 패키징</label>
                            <select id="toki-sel-novel-mode" class="toki-select">
                                <option value="perChapter">개별 회차</option>
                                <option value="singleVolume">범위 합본</option>
                            </select>
                        </div>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">Smart Skip 민감도</label>
                        <select id="toki-sel-smartskip" class="toki-select">
                            <option value="90">90% (매우 민감)</option>
                            <option value="80">80% (민감)</option>
                            <option value="70">70% (보통)</option>
                            <option value="50">50% (기본)</option>
                        </select>
                    </div>

                    <div class="toki-section-title">Cloud & Storage</div>
                    <div class="toki-control-group">
                        <label class="toki-label">GAS Script ID</label>
                        <input type="text" id="toki-sel-gas-id" class="toki-input" placeholder="AKfycb...">
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">Google Drive Folder ID</label>
                        <input type="text" id="toki-sel-folder-id" class="toki-input" placeholder="Folder ID">
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">API Key (보안)</label>
                        <input type="password" id="toki-sel-apikey" class="toki-input" placeholder="API Key">
                    </div>

                    <div class="toki-control-group toki-mt-24 toki-mb-24">
                        <button class="toki-btn-action toki-btn-gradient-green" id="toki-btn-save-settings" style="height: 48px;">
                            <span>💾 설정 저장하기</span>
                        </button>
                    </div>
                </div>

                <!-- 3. History Tab -->
                <div class="toki-tab-content" id="toki-tab-history">
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
                        <button class="toki-btn-action toki-btn-sync" id="toki-btn-sync-now">
                            <span>🔄 지금 즉시 동기화</span>
                        </button>
                    </div>
                    <p class="toki-text-xs toki-text-center toki-line-16">
                        구글 드라이브와의 연결을 확인하고 동기화 이력을 체크합니다.
                    </p>
                </div>

                <!-- 4. Tools Tab -->
                <div class="toki-tab-content" id="toki-tab-tools">
                    <div class="toki-control-group">
                        <label class="toki-label">파일 관리</label>
                        <div class="toki-btn-group-stack">
                            <button class="toki-btn-action toki-btn-secondary" id="toki-btn-migration">
                                📂 기존 파일명 표준화 (Migration)
                            </button>
                            <button class="toki-btn-action toki-btn-secondary" id="toki-btn-thumb-optim">
                                🔄 썸네일 통합 및 캐시 최적화
                            </button>
                        </div>
                    </div>
                    <hr class="toki-divider">
                    <div class="toki-control-group">
                        <label class="toki-label">시스템 도구</label>
                        <div class="toki-btn-group-stack">
                            <button class="toki-btn-action toki-btn-secondary" id="toki-btn-test-extract">
                                🧪 현재 페이지 이미지/소설 추출 테스트
                            </button>
                            <button class="toki-btn-action toki-btn-indigo" id="toki-btn-tree-editor">
                                🧩 파싱 규칙 편집기 (Tree Editor)
                            </button>
                            <button class="toki-btn-action toki-btn-lavender" id="toki-btn-form-editor">
                                📝 간편 규칙 편집기 (Form Editor)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 📊 수집 진행 상황 및 대기열 모달 -->
        <div id="toki-modal-progress" class="toki-dashboard-modal-overlay" style="display: none;">
            <div class="toki-dashboard-modal">
                <div class="toki-dashboard-modal-header">
                    <span class="toki-dashboard-modal-title">📊 수집 진행 상황 & 대기열</span>
                    <button class="toki-dashboard-modal-close" id="toki-btn-modal-progress-close" title="닫기">&times;</button>
                </div>
                <div class="toki-dashboard-modal-content">
                    <div id="toki-logbox-progress" style="display: block;">
                        <div id="toki-progress-header">
                            <span id="toki-progress-overall-text">진행률: 0% (0 / 0)</span>
                            <div id="toki-progress-overall-controls">
                                <span id="toki-btn-queue-expand" title="대기열 크게 보기" class="toki-cursor-pointer toki-progress-btn">↕️</span>
                                <span id="toki-btn-queue-clear" title="완료/실패 큐 정리" class="toki-cursor-pointer toki-progress-btn">🧹</span>
                                <span id="toki-btn-queue-reset" title="대기열 전체 삭제 (초기화)" class="toki-cursor-pointer toki-progress-btn">🗑️</span>
                                <span id="toki-btn-queue-pause" title="일시 정지" class="toki-cursor-pointer toki-progress-btn">⏸️</span>
                                <span id="toki-btn-queue-stop" title="수집 중단" class="toki-cursor-pointer toki-progress-btn">⏹️</span>
                            </div>
                        </div>
                        <div class="toki-progress-bar-container">
                            <div id="toki-progress-overall-bar" class="toki-progress-overall-bar-fill"></div>
                        </div>
                        <div id="toki-progress-workers-list">
                            <!-- 활성 팝업(Worker) 동적 렌더링 -->
                        </div>
                        <div id="toki-progress-queue-section" style="display: none;">
                            <div id="toki-queue-section-header">
                                <span>📋 수집 대기열 목록</span>
                            </div>
                            <div id="toki-progress-queue-list">
                                <!-- 대기열 목록 동적 렌더링 -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 📋 실시간 로그 모달 -->
        <div id="toki-modal-logs" class="toki-dashboard-modal-overlay" style="display: none;">
            <div class="toki-dashboard-modal">
                <div class="toki-dashboard-modal-header">
                    <span class="toki-dashboard-modal-title">📋 실시간 수집 로그 모니터</span>
                    <button class="toki-dashboard-modal-close" id="toki-btn-modal-logs-close" title="닫기">&times;</button>
                </div>
                <div class="toki-dashboard-modal-content">
                    <div id="toki-dashboard-log-section" style="display: flex;">
                        <div id="toki-log-header">
                            <span>📋 실시간 수집 로그 모니터</span>
                            <span id="toki-btn-log-clear" title="Clear Logs" class="toki-cursor-pointer" style="font-size: 12px; color: var(--toki-color-warning, #e6a23c); cursor: pointer;">🚫 비우기</span>
                        </div>
                        <ul id="toki-logbox-content"></ul>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    bindEventsToPopup(popupWindow) {
        const doc = popupWindow.document;

        // 1. Tab Switching Logic
        const tabBtns = doc.querySelectorAll('.toki-tab-btn');
        const tabContents = doc.querySelectorAll('.toki-tab-content');

        tabBtns.forEach(btn => {
            btn.onclick = () => {
                const target = btn.getAttribute('data-tab');
                tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                tabContents.forEach(c => {
                    c.classList.toggle('active', c.id === `toki-tab-${target}`);
                });
            };
        });

        // 2. Control Buttons
        const closeBtn = doc.getElementById('toki-btn-menu-close');
        if (closeBtn) {
            closeBtn.onclick = () => popupWindow.close();
        }

        const viewerLink = doc.getElementById('toki-btn-viewer-link');
        if (viewerLink) {
            viewerLink.onclick = () => {
                if (this.handlers.openViewer) this.handlers.openViewer();
            };
        }

        // 3. Download Tab Events
        const downAllBtn = doc.getElementById('toki-btn-down-all');
        if (downAllBtn) {
            downAllBtn.onclick = () => {
                const force = doc.getElementById('toki-chk-force-overwrite').checked;
                if (this.handlers.downloadAll) this.handlers.downloadAll(force);
            };
        }

        const downRangeBtn = doc.getElementById('toki-btn-down-range');
        if (downRangeBtn) {
            downRangeBtn.onclick = () => {
                const spec = doc.getElementById('toki-range-input').value.trim();
                const force = doc.getElementById('toki-chk-force-overwrite').checked;
                if (this.handlers.downloadRange) {
                    this.handlers.downloadRange(spec || undefined, force);
                }
            };
        }

        const downCurrentBtn = doc.getElementById('toki-btn-down-current');
        if (downCurrentBtn) {
            downCurrentBtn.onclick = () => {
                if (this.handlers.downloadCurrent) this.handlers.downloadCurrent();
            };
        }

        const testExtractBtn = doc.getElementById('toki-btn-test-extract');
        if (testExtractBtn) {
            testExtractBtn.onclick = () => {
                if (this.handlers.testExtraction) this.handlers.testExtraction();
            };
        }

        // 4. Settings Tab Events
        const selGasId = doc.getElementById('toki-sel-gas-id');
        const selFolderId = doc.getElementById('toki-sel-folder-id');
        const selApiKey = doc.getElementById('toki-sel-apikey');
        const selPolicy = doc.getElementById('toki-sel-policy');
        const selNameTemplate = doc.getElementById('toki-sel-nametemplate');
        const selLocalPadding = doc.getElementById('toki-sel-localpadding');
        const selSpeed = doc.getElementById('toki-sel-speed');
        const selScanSpeed = doc.getElementById('toki-sel-scanspeed');
        const selNovelFormat = doc.getElementById('toki-sel-novel-format');
        const selNovelTerm = doc.getElementById('toki-sel-novel-mode');
        const selSmartSkip = doc.getElementById('toki-sel-smartskip');

        if (this.handlers.getConfig) {
            const cfg = this.handlers.getConfig();
            if (selGasId) selGasId.value = cfg.gasId || '';
            if (selFolderId) selFolderId.value = cfg.folderId || '';
            if (selApiKey) selApiKey.value = cfg.apiKey || '';
            if (selPolicy) {
                selPolicy.value = cfg.policy || 'individual';
                this.updateNativeHelper(doc, selPolicy.value);
            }
            if (selNameTemplate) selNameTemplate.value = cfg.localNameTemplate || '';
            if (selLocalPadding) selLocalPadding.value = cfg.localEpisodePadding !== undefined ? String(cfg.localEpisodePadding) : '4';
            if (selSpeed) selSpeed.value = cfg.sleepMode || 'agile';
            if (selScanSpeed) {
                selScanSpeed.value = cfg.scanSpeed !== undefined ? String(cfg.scanSpeed) : '1000';
                const valSpan = doc.getElementById('toki-scan-speed-val');
                if (valSpan) valSpan.innerText = `${selScanSpeed.value}ms`;
                
                selScanSpeed.oninput = (e) => {
                    if (valSpan) valSpan.innerText = `${e.target.value}ms`;
                };
            }
            if (selNovelFormat) selNovelFormat.value = cfg.novelFormat || 'epub';
            if (selNovelTerm) selNovelTerm.value = cfg.novelMode || 'perChapter';
            if (selSmartSkip) selSmartSkip.value = cfg.smartSkipRatio !== undefined ? String(cfg.smartSkipRatio) : '50';
        }

        if (selPolicy) {
            selPolicy.onchange = () => {
                if (this.handlers.setConfig) this.handlers.setConfig('TOKI_DOWNLOAD_POLICY', selPolicy.value);
                this.updateNativeHelper(doc, selPolicy.value);
            };
            this.updateNativeHelper(doc, selPolicy.value);
        }

        const testNativeBtn = doc.getElementById('toki-btn-test-native');
        if (testNativeBtn) {
            testNativeBtn.onclick = async () => {
                if (this.handlers.testNativeDownload) {
                    testNativeBtn.disabled = true;
                    testNativeBtn.textContent = '⏳ 테스트 중...';
                    const success = await this.handlers.testNativeDownload();
                    if (success) {
                        testNativeBtn.textContent = '✅ 테스트 성공 (폴더 확인)';
                        testNativeBtn.style.color = '#67c23a';
                    } else {
                        testNativeBtn.textContent = '❌ 테스트 실패 (설정 확인)';
                        testNativeBtn.style.color = '#f56c6c';
                    }
                    setTimeout(() => {
                        testNativeBtn.disabled = false;
                        testNativeBtn.textContent = '📂 자동 분류 기능 테스트';
                        testNativeBtn.style.color = '';
                    }, 3000);
                }
            };
        }

        // 9. Queue List Item & Modal Controls Event Delegation (우주 무결 안전 장치)
        const progressModalOverlay = doc.getElementById('toki-modal-progress');
        if (progressModalOverlay) {
            progressModalOverlay.addEventListener('click', (e) => {
                // 9-1. 개별 삭제 ❌
                const deleteBtn = e.target.closest('.toki-queue-item-delete');
                if (deleteBtn) {
                    const itemId = deleteBtn.getAttribute('data-id');
                    if (popupWindow.confirm('선택한 에피소드를 대기열에서 제거하시겠습니까?')) {
                        removeQueueItem(itemId);
                        LogBox.getInstance().updateProgressUI();
                        runSchedulerOnce();
                    }
                    return;
                }

                // 9-2. 대기열 전체 삭제 (초기화) 🗑️
                const resetBtn = e.target.closest('#toki-btn-queue-reset');
                if (resetBtn) {
                    if (popupWindow.confirm('🗑️ 대기열의 모든 에피소드를 즉시 완전히 삭제하시겠습니까?\n(진행 중인 작업도 모두 강제 중단됩니다)')) {
                        stopAllWorkers();
                        clearQueue();
                        LogBox.getInstance().updateProgressUI();
                    }
                    return;
                }

                // 9-3. 완료/실패 정리 🧹
                const clearBtn = e.target.closest('#toki-btn-queue-clear');
                if (clearBtn) {
                    if (popupWindow.confirm('🧹 완료/실패 항목을 정리하시겠습니까?')) {
                        removeCompletedAndFailedItems();
                        LogBox.getInstance().updateProgressUI();
                        runSchedulerOnce();
                    }
                    return;
                }

                // 9-4. 일시 정지 ⏸️
                const pauseBtn = e.target.closest('#toki-btn-queue-pause');
                if (pauseBtn) {
                    const isPaused = getQueuePaused();
                    setQueuePaused(!isPaused);
                    LogBox.getInstance().updateProgressUI();
                    if (isPaused) {
                        runSchedulerOnce();
                    }
                    return;
                }

                // 9-5. 수집 중단 ⏹️
                const stopBtn = e.target.closest('#toki-btn-queue-stop');
                if (stopBtn) {
                    if (popupWindow.confirm('⚠️ 모든 배치 작업을 중단하시겠습니까?')) {
                        stopAllWorkers();
                        LogBox.getInstance().updateProgressUI();
                    }
                    return;
                }

                // 9-6. 크게 보기 ↕️
                const expandBtn = e.target.closest('#toki-btn-queue-expand');
                if (expandBtn) {
                    const isMaximized = progressModalOverlay.classList.toggle('toki-queue-maximized');
                    expandBtn.textContent = isMaximized ? '🔽' : '↕️';
                    expandBtn.title = isMaximized ? '대기열 원래대로 보기' : '대기열 크게 보기';
                    return;
                }
            });
        }

        // 5. History Tab Events
        const syncBtn = doc.getElementById('toki-btn-sync-now');
        if (syncBtn) {
            syncBtn.onclick = async () => {
                if (this.handlers.syncHistory) {
                    syncBtn.disabled = true;
                    syncBtn.innerHTML = '<span>⏳ 동기화 중...</span>';
                    await this.handlers.syncHistory();
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = '<span>🔄 지금 즉시 동기화</span>';
                    
                    const timeEl = doc.getElementById('toki-txt-last-sync');
                    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
                }
            };
        }

        // 6. Tools Tab Events
        const migrationBtn = doc.getElementById('toki-btn-migration');
        if (migrationBtn) {
            migrationBtn.onclick = () => {
                if (this.handlers.migrateFilenames) this.handlers.migrateFilenames();
            };
        }

        const thumbBtn = doc.getElementById('toki-btn-thumb-optim');
        if (thumbBtn) {
            thumbBtn.onclick = () => {
                if (this.handlers.migrateThumbnails) this.handlers.migrateThumbnails();
            };
        }

        const treeEditorBtn = doc.getElementById('toki-btn-tree-editor');
        if (treeEditorBtn) {
            treeEditorBtn.onclick = () => {
                const editor = new TreeRuleEditor();
                editor.show(doc);
            };
        }

        const formEditorBtn = doc.getElementById('toki-btn-form-editor');
        if (formEditorBtn) {
            formEditorBtn.onclick = () => {
                const editor = new FormRuleEditor();
                editor.show(doc);
            };
        }

        // 7. Dashboard Modal Toggle Events
        const showProgressBtn = doc.getElementById('toki-btn-show-progress');
        const progressModal = doc.getElementById('toki-modal-progress');
        const closeProgressBtn = doc.getElementById('toki-btn-modal-progress-close');
        
        if (showProgressBtn && progressModal) {
            showProgressBtn.onclick = () => {
                progressModal.style.display = 'flex';
            };
        }
        if (closeProgressBtn && progressModal) {
            closeProgressBtn.onclick = () => {
                progressModal.style.display = 'none';
            };
        }
        if (progressModal) {
            progressModal.onclick = (e) => {
                if (e.target === progressModal) {
                    progressModal.style.display = 'none';
                }
            };
        }

        const showLogsBtn = doc.getElementById('toki-btn-show-logs');
        const logsModal = doc.getElementById('toki-modal-logs');
        const closeLogsBtn = doc.getElementById('toki-btn-modal-logs-close');

        if (showLogsBtn && logsModal) {
            showLogsBtn.onclick = () => {
                logsModal.style.display = 'flex';
            };
        }
        if (closeLogsBtn && logsModal) {
            closeLogsBtn.onclick = () => {
                logsModal.style.display = 'none';
            };
        }
        if (logsModal) {
            logsModal.onclick = (e) => {
                if (e.target === logsModal) {
                    logsModal.style.display = 'none';
                }
            };
        }

        // 8. Settings Save Handler (통합 대시보드 전용 저장 연동)
        const saveSettingsBtn = doc.getElementById('toki-btn-save-settings');
        if (saveSettingsBtn) {
            saveSettingsBtn.onclick = () => {
                const newGasId = selGasId ? selGasId.value.trim() : '';
                const newFolder = selFolderId ? selFolderId.value.trim() : '';
                const newApiKey = selApiKey ? selApiKey.value.trim() : '';
                const newPolicy = selPolicy ? selPolicy.value : 'individual';
                const newNameTemplate = selNameTemplate ? selNameTemplate.value.trim() || "{number} - {title}" : "{number} - {title}";
                const newLocalPadding = selLocalPadding ? selLocalPadding.value : '4';
                const newSleepMode = selSpeed ? selSpeed.value : 'agile';
                const newScanSpeed = selScanSpeed ? selScanSpeed.value : '1000';
                const newNovelFormat = selNovelFormat ? selNovelFormat.value : 'epub';
                const newNovelMode = selNovelTerm ? selNovelTerm.value : 'perChapter';
                const newSmartSkip = selSmartSkip ? selSmartSkip.value : '50';
                // URL 입력 시 ID 추출 로직 병합
                let finalGasId = newGasId;
                const urlMatch = newGasId.match(/\/s\/([^\/]+)\/exec/);
                if (urlMatch) finalGasId = urlMatch[1];

                if (this.handlers.setConfig) {
                    this.handlers.setConfig('TOKI_GAS_ID', finalGasId);
                    this.handlers.setConfig('TOKI_FOLDER_ID', newFolder);
                    this.handlers.setConfig('TOKI_API_KEY', newApiKey);
                    this.handlers.setConfig('TOKI_DOWNLOAD_POLICY', newPolicy);
                    this.handlers.setConfig('TOKI_LOCAL_NAME_TEMPLATE', newNameTemplate);
                    this.handlers.setConfig('TOKI_LOCAL_EPISODE_PADDING', newLocalPadding);
                    this.handlers.setConfig('TOKI_SLEEP_MODE', newSleepMode);
                    this.handlers.setConfig('TOKI_SCAN_SPEED', newScanSpeed);
                    this.handlers.setConfig('TOKI_NOVEL_FORMAT', newNovelFormat);
                    this.handlers.setConfig('TOKI_NOVEL_MODE', newNovelMode);
                    this.handlers.setConfig('TOKI_SMART_SKIP_RATIO', newSmartSkip);
                }

                popupWindow.alert('설정이 저장되었습니다.');
            };
        }

    }

    show() {
        LogBox.getInstance().openDashboard();
    }

    close() {
        LogBox.getInstance().hide();
    }

    toggle() {
        LogBox.getInstance().toggle();
    }

    updateNativeHelper(doc, policy) {
        const helper = doc.getElementById('toki-native-helper');
        if (helper) {
            if (policy === 'native') {
                helper.classList.remove('toki-hidden');
            } else {
                helper.classList.add('toki-hidden');
            }
        }
    }

    static getInstance() {
        if (!MenuModal.instance) {
            new MenuModal();
        }
        return MenuModal.instance;
    }
}

/**
 * Mark downloaded items in the list (UI Sync)
 * @param {string[]} historyList Array of episode IDs (e.g. ["0001", "0002"])
 */
export async function markDownloadedItems(historyList) {
    // [v1.21.7] 현 시점에서 필요하지 않은 회차 목록 완료 체크 표시(마킹) 렌더링 기능을 전면 제외하여 리소스 최적화
    return;

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
            'images': '웹툰 이미지 또는 소설 본문 요소',
            'exclude': '제외할 요소의 CSS 셀렉터 (반점 구분 또는 배열)'
        };
    }

    show(popupDoc = document) {
        const doc = popupDoc;
        this.overlay = doc.createElement('div');
        this.overlay.className = 'toki-modal-overlay';
        // z-index handled by .toki-tree-modal in ui.css
        
        this.overlay.innerHTML = `
            <div class="toki-modal toki-tree-modal">
                <div class="toki-modal-header">
                    <div class="toki-modal-title">🧩 파싱 규칙 관리자 (Tree Editor)</div>
                    <div class="toki-flex-row-8">
                        <button class="toki-btn-rule" id="tree-btn-export">📤 내보내기</button>
                        <button class="toki-btn-rule" id="tree-btn-import">📥 가져오기</button>
                        <button class="toki-modal-close" id="tree-close-btn">&times;</button>
                    </div>
                </div>
                <div class="toki-tree-container">
                    <div class="toki-tree-view" id="tree-root"></div>
                    
                    <div class="toki-tree-right-panel">
                        <div class="toki-flex-between toki-text-xs">
                            <span>📄 JSON 미리보기</span>
                            <span id="tree-json-status" class="toki-text-success">✓ Valid</span>
                        </div>
                        <textarea class="toki-tree-json-preview" id="tree-json-editor" spellcheck="false"></textarea>
                        
                        <div class="toki-test-bench toki-mt-0">
                            <div class="toki-label toki-mb-5">🧪 즉시 테스트</div>
                            <div class="toki-flex-row-8">
                                <input type="text" id="tree-test-url" class="toki-input-compact toki-flex-1" placeholder="주소 입력" value="${window.location.href}">
                                <button class="toki-btn-rule toki-text-success" id="tree-btn-test">실행</button>
                            </div>
                            <div id="tree-test-result" class="toki-test-result">규칙 수정 후 바로 테스트해보세요.</div>
                        </div>
                        
                        <div class="toki-flex-row-10">
                            <button class="toki-btn-action toki-btn-lavender" id="tree-btn-save">저장 및 적용</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        doc.body.appendChild(this.overlay);
        this.render(doc);
        this.bindEvents(doc);
    }

    render(popupDoc = document) {
        const doc = popupDoc;
        const root = this.overlay.querySelector('#tree-root');
        root.innerHTML = '';
        
        const mainNode = doc.createElement('div');
        mainNode.innerHTML = `<div class="toki-tree-item"><span class="toki-tree-key">Rules [Array]</span><button class="toki-tree-btn-small" id="tree-add-rule">➕ 룰 추가</button></div>`;
        root.appendChild(mainNode);

        const listNode = doc.createElement('div');
        listNode.className = 'toki-tree-node';
        this.rules.forEach((rule, idx) => {
            listNode.appendChild(this.renderNode(rule, `[${idx}]`, rule.name || rule.id || `Rule ${idx + 1}`));
        });
        root.appendChild(listNode);

        this.updateJsonPreview();
    }

    renderNode(data, path, label = '', doc = document) {
        const wrapper = doc.createElement('div');
        wrapper.className = 'toki-tree-node-wrapper';

        const item = doc.createElement('div');
        item.className = 'toki-tree-item';
        
        const isObject = data !== null && typeof data === 'object';
        const toggle = doc.createElement('span');
        toggle.className = 'toki-tree-toggle';
        toggle.textContent = isObject ? '▼' : '•';
        
        const keySpan = doc.createElement('span');
        keySpan.className = 'toki-tree-key';
        keySpan.textContent = label || path.split('.').pop();
        if (this.hints[keySpan.textContent]) {
            keySpan.title = this.hints[keySpan.textContent];
        }

        item.appendChild(toggle);
        item.appendChild(keySpan);

        if (!isObject) {
            const input = doc.createElement('input');
            input.className = 'toki-tree-val';
            input.value = data;
            input.dataset.path = path;
            input.oninput = (e) => this.updateValue(path, e.target.value);
            item.appendChild(input);
        } else {
            const actions = doc.createElement('div');
            actions.className = 'toki-tree-actions';
            
            const btnDel = doc.createElement('button');
            btnDel.className = 'toki-tree-btn-small';
            btnDel.textContent = '🗑️';
            btnDel.onclick = () => this.removeNode(path);
            actions.appendChild(btnDel);
            
            item.appendChild(actions);
        }

        wrapper.appendChild(item);

        if (isObject) {
            const children = doc.createElement('div');
            children.className = 'toki-tree-node';
            Object.keys(data).forEach(key => {
                children.appendChild(this.renderNode(data[key], `${path}.${key}`, key, doc));
            });
            wrapper.appendChild(children);

            toggle.onclick = () => {
                children.classList.toggle('toki-hidden');
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

    bindEvents(popupDoc = document) {
        const overlay = this.overlay;
        
        overlay.querySelector('#tree-close-btn').onclick = () => overlay.remove();
        
        overlay.querySelector('#tree-add-rule').onclick = () => {
            this.rules.push({
                id: 'new_site_' + Date.now(),
                name: '새 사이트',
                urlPattern: '',
                category: 'Webtoon',
                meta: {
                    title: 'h1.title',
                    author: 'span.author',
                    thumb: { selector: 'div.thumb > img', attr: 'src' }
                },
                list: {
                    container: 'ul.list',
                    item: 'li.item',
                    num: 'span.no',
                    title: 'a.link',
                    link: { selector: 'a.link', attr: 'href' }
                },
                viewer: {
                    fetchMethod: 'iframe',
                    imageRegex: 'https?:\\\\/\\\\/[a-zA-Z0-9_\\\\.\\\\/-]+\\\\.(?:jpg|png|webp|gif)',
                    imageContainer: 'div.viewer',
                    imageItem: 'img',
                    lazyAttrOptions: ['data-src', 'src'],
                    exclude: ''
                }
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
                    status.classList.add('toki-text-success');
                    status.classList.remove('toki-text-danger');
                    if (this.renderTimer) clearTimeout(this.renderTimer);
                    this.renderTimer = setTimeout(() => this.render(), 1000);
                }
            } catch (err) {
                status.textContent = '⚠ Invalid JSON';
                status.classList.add('toki-text-danger');
                status.classList.remove('toki-text-success');
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
            const selectOverlay = document.createElement('div');
            selectOverlay.className = 'toki-modal-overlay';
            selectOverlay.style.zIndex = '20002'; // Above Tree Editor
            selectOverlay.onclick = (e) => { if(e.target === selectOverlay) selectOverlay.remove(); };
            
            selectOverlay.innerHTML = `
                <div class="toki-modal toki-compact-modal" style="max-width: 400px; padding: 24px;">
                    <div class="toki-modal-header" style="margin-bottom: 20px;">
                        <div class="toki-modal-title" style="font-size: 16px;">📥 규칙 가져오기 방식 선택</div>
                        <button class="toki-modal-close" id="import-select-close" title="닫기">&times;</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
                        <button class="toki-btn-action toki-btn-lavender" id="import-choose-file">
                            📂 로컬 JSON 파일 선택
                        </button>
                        <button class="toki-btn-action toki-btn-secondary" id="import-choose-url">
                            🌐 원격 URL 주소 입력
                        </button>
                    </div>
                    <div id="import-url-input-container" class="toki-hidden" style="margin-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 16px;">
                        <div class="toki-control-group" style="margin-bottom: 16px;">
                            <label class="toki-label">원격 규칙 URL 주소</label>
                            <input type="text" id="import-url-input" class="toki-input" placeholder="https://..." value="https://pray4skylark.github.io/tokiSync/rules.json">
                        </div>
                        <button class="toki-btn-action" id="import-btn-fetch" style="width: 100%;">
                            <span>가져오기 실행</span>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(selectOverlay);

            selectOverlay.querySelector('#import-select-close').onclick = () => selectOverlay.remove();

            const handleRulesImport = (rules) => {
                const rulesArr = Array.isArray(rules) ? rules : (rules.rules || []);
                if (!Array.isArray(rulesArr) || rulesArr.length === 0) {
                    alert('가져올 규칙이 유효하지 않거나 비어 있습니다.');
                    return;
                }
                const mode = confirm('기존 규칙과 합치시겠습니까? (취소 시 전체 덮어쓰기)') ? 'merge' : 'overwrite';
                if (mode === 'overwrite') {
                    this.rules = rulesArr;
                } else {
                    RuleManager.bulkImport(rulesArr, 'merge');
                    this.rules = RuleManager.getCustomRules();
                }
                this.render();
                selectOverlay.remove();
            };

            // File selection
            selectOverlay.querySelector('#import-choose-file').onclick = () => {
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
                            handleRulesImport(imported);
                        } catch (err) {
                            alert('JSON 파싱 오류: ' + err.message);
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            };

            // URL input toggle
            selectOverlay.querySelector('#import-choose-url').onclick = () => {
                const container = selectOverlay.querySelector('#import-url-input-container');
                container.classList.remove('toki-hidden');
            };

            // Fetch remote URL
            selectOverlay.querySelector('#import-btn-fetch').onclick = async () => {
                const url = selectOverlay.querySelector('#import-url-input').value.trim();
                if (!url) {
                    alert('URL을 입력해주세요.');
                    return;
                }
                const fetchBtn = selectOverlay.querySelector('#import-btn-fetch');
                fetchBtn.disabled = true;
                fetchBtn.innerHTML = '<span>⏳ 가져오는 중...</span>';
                
                try {
                    const fetched = await RuleManager.fetchRemoteRules(url);
                    if (fetched) {
                        handleRulesImport(fetched);
                    } else {
                        alert('원격 규칙을 가져오는데 실패했습니다. URL 주소 및 네트워크 상태를 확인하세요.');
                    }
                } catch (err) {
                    alert('오류 발생: ' + err.message);
                } finally {
                    fetchBtn.disabled = false;
                    fetchBtn.innerHTML = '<span>가져오기 실행</span>';
                }
            };
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
                    <div class="toki-text-success">성공!</div>
                    <div>• 제목: ${result.title || 'N/A'}</div>
                    <div>• 항목 수: ${result.urls?.length || (result.content ? '1 (Text)' : '0')}</div>
                `;
            } catch (e) {
                res.textContent = '❌ 실패: ' + e.message;
            }
        };
    }
}

/**
 * FormRuleEditor (v1.21.0)
 * Specialist UI for managing parsing rules with a sleek Form-Tree Hybrid Two-Track interface.
 */
export class FormRuleEditor {
    constructor() {
        this.rules = RuleManager.getCustomRules() || [];
        this.overlay = null;
        this.currentRuleIndex = 0;
        this.isDropperActive = false;
        this.targetDropperInputId = null;
        
        // Ensure at least one rule exists
        if (this.rules.length === 0) {
            this.rules.push(this.createNewRuleDraft());
        }
    }

    createNewRuleDraft() {
        return {
            id: 'new_site_rule',
            name: '신규 사이트 규칙',
            urlPattern: '.*example\\\\.com/.*',
            category: 'Webtoon',
            meta: {
                title: 'h1.title',
                author: 'span.author',
                thumb: { selector: 'div.thumb > img', attr: 'src' }
            },
            list: {
                container: 'ul.list',
                item: 'li.item',
                num: 'span.no',
                title: 'a.link',
                link: { selector: 'a.link', attr: 'href' }
            },
            viewer: {
                fetchMethod: 'iframe',
                imageRegex: 'https?:\\\\/\\\\/[a-zA-Z0-9_\\\\.\\\\/-]+\\\\.(?:jpg|png|webp|gif)',
                imageContainer: 'div.viewer',
                imageItem: 'img',
                lazyAttrOptions: ['data-src', 'src'],
                exclude: ''
            }
        };
    }

    show(popupDoc = document) {
        const doc = popupDoc;
        if (doc.getElementById('toki-form-editor-overlay')) return;

        this.overlay = doc.createElement('div');
        this.overlay.id = 'toki-form-editor-overlay';
        this.overlay.className = 'toki-modal-overlay';
        this.overlay.style.zIndex = '10001';
        
        this.render();
        doc.body.appendChild(this.overlay);
        this.bindEvents(doc);
        this.loadRuleIntoForm();
    }

    render() {
        const scriptVer = typeof __SCRIPT_VERSION__ !== 'undefined' ? __SCRIPT_VERSION__ : '1.22.0';
        this.overlay.innerHTML = `
            <div class="toki-modal toki-form-editor-modal">
                <div class="toki-modal-header">
                    <div class="toki-modal-title">📝 간편 규칙 편집기 (Form Editor) <span class="toki-text-xs">v${scriptVer}</span></div>
                    <div class="toki-flex-row-8">
                        <button class="toki-btn-rule" id="form-btn-export">📤 내보내기</button>
                        <button class="toki-btn-rule" id="form-btn-import">📥 가져오기</button>
                        <button class="toki-modal-close" id="form-close-btn">&times;</button>
                    </div>
                </div>
                <div class="toki-form-editor-container">
                    <!-- Left Column: Input Form -->
                    <div class="toki-form-editor-left">
                        <!-- 1. 기본 정보 카드 -->
                        <div class="toki-form-card">
                            <div class="toki-form-card-title">
                                <span>🌐 기본 사이트 정보</span>
                                <select id="form-rule-selector" class="toki-select toki-btn-sm" style="width: auto; padding: 4px 24px 4px 10px; margin: 0;">
                                    ${this.rules.map((r, i) => `<option value="${i}">${r.name} (${r.id})</option>`).join('')}
                                    <option value="new">+ 신규 규칙 추가</option>
                                </select>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">규칙 ID</span>
                                    <input type="text" id="rule-id" class="toki-input-compact" placeholder="예: blacktoon_webtoon">
                                </div>
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">규칙 이름</span>
                                    <input type="text" id="rule-name" class="toki-input-compact" placeholder="예: 블랙툰 웹툰 규칙">
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">URL 패턴 (정규식)</span>
                                    <input type="text" id="rule-urlPattern" class="toki-input-compact" placeholder="예: .*/webtoon/.*">
                                </div>
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">카테고리</span>
                                    <select id="rule-category" class="toki-select" style="padding: 10px 14px; font-size:13px; height:38px;">
                                        <option value="Webtoon">Webtoon (웹툰)</option>
                                        <option value="Manga">Manga (만화)</option>
                                        <option value="Novel">Novel (소설)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- 2. 작품 정보(Meta) 카드 -->
                        <div class="toki-form-card">
                            <div class="toki-form-card-title">📖 작품 정보 추출 (Meta)</div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">제목 셀렉터</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-meta-title" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-meta-title" class="toki-input-compact toki-flex-1" placeholder="예: h1.hero-v2-title">
                                        <span class="toki-badge-match zero" id="match-rule-meta-title">0</span>
                                    </div>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">작가 셀렉터</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-meta-author" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-meta-author" class="toki-input-compact toki-flex-1" placeholder="예: div.hero-v2-author">
                                        <span class="toki-badge-match zero" id="match-rule-meta-author">0</span>
                                    </div>
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">썸네일 이미지 셀렉터</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-meta-thumb-selector" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-meta-thumb-selector" class="toki-input-compact toki-flex-1" placeholder="예: div.hero-v2-thumb img">
                                        <span class="toki-badge-match zero" id="match-rule-meta-thumb-selector">0</span>
                                    </div>
                                </div>
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">썸네일 추출 속성</span>
                                    <input type="text" id="rule-meta-thumb-attr" class="toki-input-compact" placeholder="기본값: src (비워두면 src)">
                                </div>
                            </div>
                        </div>

                        <!-- 3. 회차 목록(List) 카드 -->
                        <div class="toki-form-card">
                            <div class="toki-form-card-title">📜 회차 목록 추출 (List)</div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">목록 부모 컨테이너</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-list-container" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-container" class="toki-input-compact toki-flex-1" placeholder="예: ul.ep-list-v2">
                                        <span class="toki-badge-match zero" id="match-rule-list-container">0</span>
                                    </div>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">회차 아이템 (개별 행)</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-list-item" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-item" class="toki-input-compact toki-flex-1" placeholder="예: li.ep-row-v2">
                                        <span class="toki-badge-match zero" id="match-rule-list-item">0</span>
                                    </div>
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">회차 링크 셀렉터</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-list-link-selector" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-link-selector" class="toki-input-compact toki-flex-1" placeholder="예: a.ep-row-v2-link">
                                        <span class="toki-badge-match zero" id="match-rule-list-link-selector">0</span>
                                    </div>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">회차 제목 셀렉터</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-list-title" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-title" class="toki-input-compact toki-flex-1" placeholder="예: .ep-row-v2-title strong">
                                        <span class="toki-badge-match zero" id="match-rule-list-title">0</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. 본문/뷰어(Viewer) 카드 -->
                        <div class="toki-form-card">
                            <div class="toki-form-card-title">🖼️ 본문/이미지 추출 (Viewer)</div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">수집 방식 (fetchMethod)</span>
                                    <select id="rule-viewer-fetchMethod" class="toki-select" style="padding: 10px 14px; font-size:13px; height:38px;">
                                        <option value="iframe">iframe (정적/동적 DOM 수집)</option>
                                        <option value="api">api (소설 및 암호화 API)</option>
                                        <option value="direct">direct (단일 다이렉트 패치)</option>
                                    </select>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">뷰어 본문/이미지 부모 컨테이너</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-viewer-imageContainer" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-viewer-imageContainer" class="toki-input-compact toki-flex-1" placeholder="예: div.vw-imgs, article.viewer">
                                        <span class="toki-badge-match zero" id="match-rule-viewer-imageContainer">0</span>
                                    </div>
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">뷰어 이미지/문단 태그</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-viewer-imageItem" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-viewer-imageItem" class="toki-input-compact toki-flex-1" placeholder="예: img 또는 p">
                                        <span class="toki-badge-match zero" id="match-rule-viewer-imageItem">0</span>
                                    </div>
                                </div>
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">레이지로드 속성 후보 (반점 구분)</span>
                                    <input type="text" id="rule-viewer-lazyAttrOptions" class="toki-input-compact" placeholder="예: data-src, data-lazy, src">
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row" style="grid-column: span 2;">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">제외 셀렉터 (exclude) (반점 구분)</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-viewer-exclude" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-viewer-exclude" class="toki-input-compact toki-flex-1" placeholder="예: .ad-banner, #sponsored-bottom">
                                        <span class="toki-badge-match zero" id="match-rule-viewer-exclude">0</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: JSON Preview & Sandbox -->
                    <div class="toki-form-editor-right">
                        <div class="toki-flex-between">
                            <span class="toki-form-row-label" style="font-weight: 800;">⚙️ 실시간 완성 JSON 규칙</span>
                            <span id="form-json-status" class="toki-badge-match ok">✓ Valid</span>
                        </div>
                        <textarea class="toki-tree-json-preview toki-flex-1" id="form-json-editor" spellcheck="false" style="font-size: 11px; line-height:1.4;"></textarea>
                        
                        <div class="toki-form-card" style="margin: 0; padding: 12px; background: rgba(0,0,0,0.02);">
                            <div class="toki-form-row-label" style="font-weight: 800; color: var(--toki-primary);">🧪 로컬 셀렉터 가상 테스트</div>
                            <div class="toki-flex-row-8">
                                <input type="text" id="form-test-url" class="toki-input-compact toki-flex-1" style="height:32px; font-size:12px; padding: 4px 10px;" value="${window.location.href}">
                                <button class="toki-btn-rule toki-text-success" id="form-btn-test" style="height:32px; padding:0 12px;">테스트</button>
                            </div>
                            <div id="form-test-result" class="toki-text-xs" style="margin-top: 4px; color: var(--toki-text-muted);">
                                현재 페이지 또는 지정한 URL 주소의 DOM 파싱 검증을 원클릭으로 가상 작동해보세요.
                            </div>
                        </div>
                        
                        <button class="toki-btn-action toki-btn-lavender" id="form-btn-save" style="height: 48px; border-radius:14px; box-shadow: 0 4px 12px rgba(106, 90, 205, 0.2);">
                            저장 및 즉시 스케줄러 적용
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    loadRuleIntoForm() {
        const rule = this.rules[this.currentRuleIndex];
        if (!rule) return;

        // Base
        this.setValue('rule-id', rule.id || '');
        this.setValue('rule-name', rule.name || '');
        this.setValue('rule-urlPattern', rule.urlPattern || '');
        this.setValue('rule-category', rule.category || 'Webtoon');

        // Meta
        this.setValue('rule-meta-title', typeof rule.meta?.title === 'string' ? rule.meta.title : rule.meta?.title?.selector || '');
        this.setValue('rule-meta-author', typeof rule.meta?.author === 'string' ? rule.meta.author : rule.meta?.author?.selector || '');
        this.setValue('rule-meta-thumb-selector', rule.meta?.thumb?.selector || (typeof rule.meta?.thumb === 'string' ? rule.meta.thumb : ''));
        this.setValue('rule-meta-thumb-attr', rule.meta?.thumb?.attr || '');

        // List
        this.setValue('rule-list-container', rule.list?.container || '');
        this.setValue('rule-list-item', rule.list?.item || '');
        this.setValue('rule-list-link-selector', rule.list?.link?.selector || (typeof rule.list?.link === 'string' ? rule.list.link : ''));
        this.setValue('rule-list-title', rule.list?.title || '');

        // Viewer
        this.setValue('rule-viewer-fetchMethod', rule.viewer?.fetchMethod || 'iframe');
        this.setValue('rule-viewer-imageContainer', rule.viewer?.imageContainer || '');
        this.setValue('rule-viewer-imageItem', rule.viewer?.imageItem || '');
        this.setValue('rule-viewer-lazyAttrOptions', Array.isArray(rule.viewer?.lazyAttrOptions) ? rule.viewer.lazyAttrOptions.join(', ') : '');
        
        const excludeRule = rule.viewer?.exclude || rule.viewer?.remove || '';
        const excludeStr = Array.isArray(excludeRule) ? excludeRule.join(', ') : excludeRule;
        this.setValue('rule-viewer-exclude', excludeStr);

        this.updateJsonPreview();
        this.runRealtimeDomMatchCount();
    }

    setValue(id, val) {
        const el = this.overlay.querySelector('#' + id);
        if (el) el.value = val;
    }

    getValue(id) {
        const el = this.overlay.querySelector('#' + id);
        return el ? el.value.trim() : '';
    }

    updateJsonPreview() {
        const rule = this.rules[this.currentRuleIndex];
        if (!rule) return;

        // Sync form values into rule object
        rule.id = this.getValue('rule-id');
        rule.name = this.getValue('rule-name');
        rule.urlPattern = this.getValue('rule-urlPattern');
        rule.category = this.getValue('rule-category');

        rule.meta = {
            title: this.getValue('rule-meta-title'),
            author: this.getValue('rule-meta-author'),
            thumb: {
                selector: this.getValue('rule-meta-thumb-selector'),
                attr: this.getValue('rule-meta-thumb-attr') || 'src'
            }
        };

        rule.list = {
            container: this.getValue('rule-list-container'),
            item: this.getValue('rule-list-item'),
            num: 'span.no', // Default baseline fallback
            title: this.getValue('rule-list-title'),
            link: {
                selector: this.getValue('rule-list-link-selector'),
                attr: 'href'
            }
        };

        const lazyStr = this.getValue('rule-viewer-lazyAttrOptions');
        const excludeStr = this.getValue('rule-viewer-exclude');
        const excludeArray = excludeStr ? excludeStr.split(',').map(s => s.trim()).filter(s => s) : [];

        rule.viewer = {
            fetchMethod: this.getValue('rule-viewer-fetchMethod'),
            imageRegex: rule.viewer?.imageRegex || 'https?:\\\\/\\\\/[a-zA-Z0-9_\\\\.\\\\/-]+\\\\.(?:jpg|png|webp|gif)',
            imageContainer: this.getValue('rule-viewer-imageContainer'),
            imageItem: this.getValue('rule-viewer-imageItem'),
            lazyAttrOptions: lazyStr ? lazyStr.split(',').map(s => s.trim()) : []
        };

        if (excludeArray.length > 0) {
            rule.viewer.exclude = excludeArray;
            if (rule.viewer.remove) delete rule.viewer.remove;
        } else {
            if (rule.viewer.exclude) delete rule.viewer.exclude;
            if (rule.viewer.remove) delete rule.viewer.remove;
        }

        const editor = this.overlay.querySelector('#form-json-editor');
        if (editor) {
            editor.value = JSON.stringify(rule, null, 2);
        }
    }

    runRealtimeDomMatchCount() {
        const selectors = [
            'rule-meta-title',
            'rule-meta-author',
            'rule-meta-thumb-selector',
            'rule-list-container',
            'rule-list-item',
            'rule-list-link-selector',
            'rule-list-title',
            'rule-viewer-imageContainer',
            'rule-viewer-imageItem',
            'rule-viewer-exclude'
        ];

        selectors.forEach(id => {
            const selector = this.getValue(id);
            const badge = this.overlay.querySelector('#match-' + id);
            if (!badge) return;

            if (!selector) {
                badge.textContent = '0';
                badge.className = 'toki-badge-match zero';
                return;
            }

            try {
                const count = document.querySelectorAll(selector).length;
                badge.textContent = count;
                if (count > 0) {
                    badge.className = 'toki-badge-match ok';
                } else {
                    badge.className = 'toki-badge-match zero';
                }
            } catch (e) {
                badge.textContent = 'Err';
                badge.className = 'toki-badge-match error';
            }
        });
    }

    bindEvents(popupDoc = document) {
        const doc = popupDoc;
        
        // Close
        this.overlay.querySelector('#form-close-btn').onclick = () => this.overlay.remove();

        // 룰 셀렉터 체인지
        const selector = this.overlay.querySelector('#form-rule-selector');
        selector.onchange = () => {
            if (selector.value === 'new') {
                const newRule = this.createNewRuleDraft();
                newRule.id = 'custom_rule_' + Date.now();
                newRule.name = '새로운 규칙 ' + (this.rules.length + 1);
                this.rules.push(newRule);
                this.currentRuleIndex = this.rules.length - 1;
                
                // Re-render select options
                selector.innerHTML = `
                    ${this.rules.map((r, i) => `<option value="${i}">${r.name} (${r.id})</option>`).join('')}
                    <option value="new">+ 신규 규칙 추가</option>
                `;
                selector.value = this.currentRuleIndex;
            } else {
                this.currentRuleIndex = parseInt(selector.value);
            }
            this.loadRuleIntoForm();
        };

        // Form inputs -> JSON Preview & Match Count
        const inputs = this.overlay.querySelectorAll('.toki-input-compact, .toki-select');
        inputs.forEach(el => {
            el.oninput = () => {
                this.updateJsonPreview();
                this.runRealtimeDomMatchCount();
            };
        });

        // JSON Preview -> Form (Reverse binding)
        const jsonEditor = this.overlay.querySelector('#form-json-editor');
        jsonEditor.oninput = () => {
            const status = this.overlay.querySelector('#form-json-status');
            try {
                const parsed = JSON.parse(jsonEditor.value);
                status.textContent = '✓ Valid';
                status.className = 'toki-badge-match ok';
                this.rules[this.currentRuleIndex] = parsed;
                // Re-populate without recursive oninput loop
                this.loadFormFromData(parsed);
            } catch (e) {
                status.textContent = '⚠️ Invalid';
                status.className = 'toki-badge-match error';
            }
        };

        // Dropper Buttons
        const droppers = this.overlay.querySelectorAll('.toki-form-dropper-btn');
        droppers.forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.getAttribute('data-target');
                this.activateDropper(targetId);
            };
        });

        // Test button
        this.overlay.querySelector('#form-btn-test').onclick = async () => {
            const res = this.overlay.querySelector('#form-test-result');
            res.textContent = '⏳ 파싱 테스트 작동 중...';
            try {
                const url = this.overlay.querySelector('#form-test-url').value;
                const domain = new URL(url).origin;
                const rule = this.rules[this.currentRuleIndex];

                const parser = new GenericParser(domain, rule);
                const result = await extractEpisodeData(document, parser, { site: 'test', category: rule.category }, false);

                res.innerHTML = `
                    <div class="toki-text-success" style="font-weight:800;">성공! (Virtual Match)</div>
                    <div>• 제목: <strong>${result.title || '미추출'}</strong></div>
                    <div>• 총 에피소드 수: <strong>${result.urls?.length || (result.content ? '1 (Text)' : '0')}개</strong></div>
                `;
            } catch (e) {
                res.innerHTML = `<div class="toki-text-danger">❌ 실패: ${e.message}</div>`;
            }
        };

        // Save Button
        this.overlay.querySelector('#form-btn-save').onclick = () => {
            this.updateJsonPreview();
            RuleManager.saveCustomRules(this.rules);
            const status = this.overlay.querySelector('#form-json-status');
            status.textContent = '💾 저장됨!';
            status.className = 'toki-badge-match ok';
            setTimeout(() => {
                status.textContent = '✓ Valid';
            }, 1500);
            
            // Notify LogBox of parser reload
            new LogBox().log('[FormEditor] 새로운 파싱 규칙이 디스크 큐 세마포어에 즉시 영속 반영되었습니다.', 'success');
        };

        // Export & Import
        this.overlay.querySelector('#form-btn-export').onclick = () => {
            const blob = new Blob([JSON.stringify(this.rules, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tokisync_custom_rules_${Date.now()}.json`;
            a.click();
        };

        this.overlay.querySelector('#form-btn-import').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const parsed = JSON.parse(evt.target.result);
                        const list = Array.isArray(parsed) ? parsed : (parsed.rules || [parsed]);
                        this.rules = list;
                        RuleManager.saveCustomRules(this.rules);
                        this.currentRuleIndex = 0;
                        
                        // Reset select box options
                        const selector = this.overlay.querySelector('#form-rule-selector');
                        selector.innerHTML = `
                            ${this.rules.map((r, i) => `<option value="${i}">${r.name} (${r.id})</option>`).join('')}
                            <option value="new">+ 신규 규칙 추가</option>
                        `;
                        selector.value = 0;
                        this.loadRuleIntoForm();
                    } catch (err) {
                        alert('잘못된 규칙 JSON 파일입니다: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };
    }

    loadFormFromData(rule) {
        this.setValue('rule-id', rule.id || '');
        this.setValue('rule-name', rule.name || '');
        this.setValue('rule-urlPattern', rule.urlPattern || '');
        this.setValue('rule-category', rule.category || 'Webtoon');

        this.setValue('rule-meta-title', typeof rule.meta?.title === 'string' ? rule.meta.title : rule.meta?.title?.selector || '');
        this.setValue('rule-meta-author', typeof rule.meta?.author === 'string' ? rule.meta.author : rule.meta?.author?.selector || '');
        this.setValue('rule-meta-thumb-selector', rule.meta?.thumb?.selector || '');
        this.setValue('rule-meta-thumb-attr', rule.meta?.thumb?.attr || '');

        this.setValue('rule-list-container', rule.list?.container || '');
        this.setValue('rule-list-item', rule.list?.item || '');
        this.setValue('rule-list-link-selector', rule.list?.link?.selector || '');
        this.setValue('rule-list-title', rule.list?.title || '');

        this.setValue('rule-viewer-fetchMethod', rule.viewer?.fetchMethod || 'iframe');
        this.setValue('rule-viewer-imageContainer', rule.viewer?.imageContainer || '');
        this.setValue('rule-viewer-imageItem', rule.viewer?.imageItem || '');
        this.setValue('rule-viewer-lazyAttrOptions', Array.isArray(rule.viewer?.lazyAttrOptions) ? rule.viewer.lazyAttrOptions.join(', ') : '');
        
        const excludeRule = rule.viewer?.exclude || rule.viewer?.remove || '';
        const excludeStr = Array.isArray(excludeRule) ? excludeRule.join(', ') : excludeRule;
        this.setValue('rule-viewer-exclude', excludeStr);

        this.runRealtimeDomMatchCount();
    }

    activateDropper(targetInputId) {
        if (this.isDropperActive) return;

        this.isDropperActive = true;
        this.targetDropperInputId = targetInputId;

        // Hide form editor and main logbox completely (physical display none to bypass CSS animation forwards)
        const formOverlay = document.getElementById('toki-form-editor-overlay');
        const logBox = document.getElementById('toki-logbox');
        
        if (formOverlay) {
            formOverlay.style.display = 'none';
            formOverlay.style.pointerEvents = 'none';
        }
        if (logBox) {
            logBox.style.display = 'none';
        }

        const style = document.createElement('style');
        style.id = 'toki-dropper-style';
        style.innerHTML = `
            .toki-dropper-hover {
                outline: 3px dashed #7c3aed !important;
                outline-offset: 2px !important;
                background-color: rgba(124, 58, 237, 0.15) !important;
                cursor: crosshair !important;
                transition: outline 0.1s ease !important;
            }
        `;
        document.head.appendChild(style);

        const onMouseOver = (e) => {
            e.stopPropagation();
            if (e.target.closest('#toki-form-editor-overlay') || e.target.closest('#toki-logbox')) return;
            e.target.classList.add('toki-dropper-hover');
        };

        const onMouseOut = (e) => {
            e.stopPropagation();
            e.target.classList.remove('toki-dropper-hover');
        };

        const onClick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const element = e.target;
            element.classList.remove('toki-dropper-hover');

            const selector = this.getUniqueSelector(element);
            this.setValue(this.targetDropperInputId, selector);

            // Clean up
            document.removeEventListener('mouseover', onMouseOver, true);
            document.removeEventListener('mouseout', onMouseOut, true);
            document.removeEventListener('click', onClick, true);
            
            const styleNode = document.getElementById('toki-dropper-style');
            if (styleNode) styleNode.remove();

            // Restore form editor and logbox visibility to their default stylesheet/class states
            const restoredFormOverlay = document.getElementById('toki-form-editor-overlay');
            const restoredLogBox = document.getElementById('toki-logbox');
            
            if (restoredFormOverlay) {
                restoredFormOverlay.style.display = '';
                restoredFormOverlay.style.pointerEvents = 'auto';
            }
            if (restoredLogBox) {
                restoredLogBox.style.display = '';
            }
            this.isDropperActive = false;

            this.updateJsonPreview();
            this.runRealtimeDomMatchCount();
            
            new LogBox().log(`[Dropper] 자동 CSS 셀렉터 감지 완료: ${selector}`, 'success');
        };

        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('mouseout', onMouseOut, true);
        document.addEventListener('click', onClick, true);
    }

    getUniqueSelector(el) {
        if (!(el instanceof Element)) return '';
        const path = [];
        let current = el;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
            let selector = current.nodeName.toLowerCase();
            
            if (current.id) {
                selector += '#' + current.id;
                path.unshift(selector);
                break; // IDs are unique enough
            } else {
                let className = '';
                if (current.className) {
                    // Extract classes ignoring toki specific classes
                    const classes = current.className.split(/\\s+/).filter(c => c && !c.startsWith('toki-'));
                    if (classes.length > 0) {
                        className = '.' + classes.join('.');
                    }
                }
                selector += className;
                
                // If not unique among siblings, add nth-of-type
                let sibling = current;
                let nth = 1;
                while (sibling = sibling.previousElementSibling) {
                    if (sibling.nodeName.toLowerCase() === current.nodeName.toLowerCase()) nth++;
                }
                if (nth > 1) {
                    // Avoid nth-of-type for generic structural wrappers unless required
                    if (!className && (selector === 'div' || selector === 'li')) {
                        selector += `:nth-of-type(${nth})`;
                    }
                }
            }
            path.unshift(selector);
            current = current.parentNode;
        }

        // Refine path to make it shorter and cleaner
        let finalPath = path.join(' > ');
        // If too long, try to simplify
        if (path.length > 3) {
            const lastThree = path.slice(-3);
            finalPath = lastThree.join(' > ');
            // If still unique in document, use it
            if (document.querySelectorAll(finalPath).length === 1) {
                return finalPath;
            }
            // Otherwise try query with class of last item
            const lastItem = path[path.length - 1];
            if (lastItem.includes('.') && document.querySelectorAll(lastItem).length === 1) {
                return lastItem;
            }
        }
        return finalPath;
    }
}

