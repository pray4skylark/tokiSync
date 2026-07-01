/**
 * LogBox Module for TokiSync
 * Handles logging overlay, anti-sleep, and progress UI synchronization.
 */

import { startSilentAudio, stopSilentAudio, isAudioRunning } from '../anti_sleep.js';
import { getConfig, setConfig } from '../config.js';
import { EventBus, EVT } from '../EventBus.js';
import { getQueue, getQueueStats, getQueuePaused } from '../queue.js';
import { MenuModal } from './MenuModal.js';
import styles from './ui.css';

export class LogBox {
    static instance = null;

    constructor() {
        if (LogBox.instance) return LogBox.instance;
        this.logs = [];
        this.MAX_LOGS = 500;
        this.popupWindow = null;
        this.isEventRegistered = false;
        this.syncIntervalId = null;
        this._consoleInterceptor = null;
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
        if (!this.isEventRegistered) {
            this.isEventRegistered = true;
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
                } else if (level === 'info') {
                    this.info(msg, tag);
                } else {
                    this.log(msg, 'normal', tag);
                }
            });

            EventBus.on(EVT.UPDATE_PROGRESS, () => {
                this.updateProgressUI();
            });

            // ── 신규 대시보드 상태 제어 이벤트 구독 ───────────────────
            EventBus.on(EVT.OPEN_DASHBOARD, (payload) => {
                this.openDashboard(payload ? payload.defaultTab : undefined);
            });

            EventBus.on(EVT.CLOSE_DASHBOARD, () => {
                this.hide();
            });

            EventBus.on(EVT.TOGGLE_DASHBOARD, () => {
                this.toggle();
            });
        }
        // ─────────────────────────────────────────────────────
    }

    openDashboard(defaultTab = '') {
        // Node.js 테스트 환경 등 윈도우 객체가 완전하지 않은 환경에서의 안전 차단
        if (typeof window === 'undefined' || typeof window.open !== 'function') {
            return;
        }

        if (this.popupWindow && !this.popupWindow.closed) {
            if (typeof this.popupWindow.focus === 'function') {
                this.popupWindow.focus();
            }
            if (defaultTab) {
                this.switchTab(defaultTab);
            }
            this.startProgressSync();
            return;
        }

        console.log('[TokiSync UI] 🛡️ 가상 팝업 대시보드 기동 (DOM 오염 차단)');
        
        const width = 1200;
        const height = 850;
        const screenWidth = window.screen ? window.screen.width : 1920;
        const screenHeight = window.screen ? window.screen.height : 1080;
        const left = (screenWidth - width) / 2;
        const top = (screenHeight - height) / 2;
        
        try {
            this.popupWindow = window.open(
                "", 
                "TokiSync_Dashboard", 
                `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
            );
        } catch (e) {
            console.warn('[TokiSync UI] Dashboard window.open 실패:', e.message);
            return;
        }

        if (!this.popupWindow || !this.popupWindow.document) {
            if (typeof alert === 'function') {
                alert("⚠️ 팝업창을 띄우지 못했습니다. 브라우저의 팝업 차단 설정을 해제해 주세요!");
            } else {
                console.warn("⚠️ 팝업창을 띄우지 못했습니다. (alert 미지원 환경)");
            }
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

        // Tab Switch Binding
        const logTabBtns = doc.querySelectorAll('.toki-log-tab-btn');
        logTabBtns.forEach(btn => {
            btn.onclick = () => {
                const target = btn.getAttribute('data-logtab');
                logTabBtns.forEach(b => b.classList.toggle('active', b === btn));
                doc.querySelectorAll('.toki-log-panel').forEach(p => {
                    const isTarget = (target === 'debug' && p.id === 'toki-debug-console')
                        || (target === 'service' && p.id === 'toki-logbox-content');
                    p.classList.toggle('active', isTarget);
                });
            };
        });

        // Toggle Button Binding
        const toggleBtn = doc.getElementById('toki-btn-console-toggle');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                const active = toggleBtn.classList.toggle('on');
                toggleBtn.textContent = active ? '■ 수집 중단' : '▶ 수집 재개';
                if (this._consoleInterceptor) {
                    this._consoleInterceptor.setActive(active);
                }
                const statusEl = doc.querySelector('.toki-console-status');
                if (statusEl) {
                    statusEl.textContent = active ? 'TokiSync 디버그 로그 수집 중' : '수집 중단됨';
                }
            };
        }

        // Flush Cached Logs
        const flushContainer = (id, logArray) => {
            const el = doc.getElementById(id);
            if (!el) return;
            el.innerHTML = '';
            logArray.forEach(l => {
                const li = doc.createElement('li');
                li.textContent = `[${l.time}] ${l.context ? `[${l.context}] ` : ''}${l.msg}`;
                const t = l.type;
                if (l.context === 'Console') {
                    li.className = (t === 'error' || t === 'critical') ? 'error'
                        : t === 'warn' ? 'warn' : t === 'success' ? 'success' : 'log';
                } else {
                    if (t === 'error' || t === 'critical') li.className = 'error';
                    else if (t === 'success') li.className = 'success';
                }
                el.appendChild(li);
            });
            el.scrollTop = el.scrollHeight;
        };
        flushContainer('toki-logbox-content', this.logs.filter(l => l.context !== 'Console'));
        flushContainer('toki-debug-console-content', this.logs.filter(l => l.context === 'Console'));

        this.updateProgressUI();
        if (defaultTab) {
            this.switchTab(defaultTab);
        }

        // 팝업 창이 닫힐 때 타이머 해제 바인딩
        try {
            this.popupWindow.addEventListener('beforeunload', () => {
                this.stopProgressSync();
            });
        } catch (e) {
            console.warn('[TokiSync UI] beforeunload 이벤트 리스너 등록 실패:', e.message);
        }

        this.startProgressSync();
    }

    updateProgressUI() {
        if (!this.popupWindow || this.popupWindow.closed || !this.popupWindow.document) return;

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

        // [v1.21.9] 다운로드 탭 인라인 진행 상태 업데이트 및 버튼 가시성 제어
        const dlActions = doc.getElementById('toki-download-actions');
        const inlineProgress = doc.getElementById('toki-inline-progress');
        
        if (dlActions && inlineProgress) {
            const hasActiveTasks = queue.some(item => item.status === 'processing' || item.status === 'pending');
            if (hasActiveTasks) {
                dlActions.style.display = 'none';
                inlineProgress.style.display = 'block';
                
                const inlineText = doc.getElementById('toki-inline-text');
                const inlinePercent = doc.getElementById('toki-inline-percent');
                const inlineBar = doc.getElementById('toki-inline-bar');
                const inlinePause = doc.getElementById('toki-inline-pause');
                
                if (inlineText) {
                    const pauseText = isPaused ? ' ⏸️ [일시 정지됨]' : '';
                    inlineText.textContent = `진행률: ${overallPercent}% (${stats.completed + stats.failed} / ${stats.total})${pauseText}`;
                }
                if (inlinePercent) {
                    inlinePercent.textContent = `${overallPercent}%`;
                }
                if (inlineBar) {
                    inlineBar.style.width = `${overallPercent}%`;
                    if (isPaused) {
                        inlineBar.classList.add('toki-progress-bar-paused');
                    } else {
                        inlineBar.classList.remove('toki-progress-bar-paused');
                    }
                }
                if (inlinePause) {
                    inlinePause.innerHTML = isPaused ? '<span>▶️ 재개</span>' : '<span>⏸️ 일시 정지</span>';
                }
            } else {
                dlActions.style.display = 'block';
                inlineProgress.style.display = 'none';
            }
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
        const config = getConfig();

        // 디버그성 컨텍스트(태그) 목록 정의
        const debugContexts = ['Worker:Batch', 'DOM:Scroll', 'DOM:Stall', 'DOM:Ready', 'FastPath', 'GAS:Cache', 'Queue'];
        const isDebugMode = config.logLevel === 'debug' || config.logLevel === 'normal';

        // 디버그성 컨텍스트이나 디버그 모드가 아닌 경우 접두사(prefix)에서 숨김 처리
        const shouldShowContext = isDebugMode || !debugContexts.includes(context);

        // 템플릿 문법을 사용한 로그 문자열 조립
        const logTemplate = config.logTemplate || '[{time}] {prefix}{msg}';
        const displayPrefix = (context && shouldShowContext) ? `[${context}] ` : '';

        const fullMsg = logTemplate
            .replace('{time}', time)
            .replace('{prefix}', displayPrefix)
            .replace('{msg}', msg);
        
        // 1. 내부 메모리 및 브라우저 콘솔에는 모든 상세 정보가 포함된 원본 로그 누적 출력
        const consolePrefix = context ? `[${context}] ` : '';
        this.logs.push({ time, type, context, msg: typeof msg === 'string' ? msg : JSON.stringify(msg) });
        if (this.logs.length > this.MAX_LOGS) this.logs.shift();

        if (type === 'error' || type === 'critical') {
            console.error(`[TokiSync] ${consolePrefix}${msg}`);
        } else if (type === 'warn') {
            console.warn(`[TokiSync] ${consolePrefix}${msg}`);
        } else {
            console.log(`[TokiSync] ${consolePrefix}${msg}`);
        }

        // 2. 설정된 로그 수준에 따라 로그 필터링 적용
        const LEVEL_PRIORITY = {
            'normal': 1,
            'debug': 1,
            'info': 2,
            'success': 2,
            'warn': 3,
            'error': 4,
            'critical': 4
        };
        const currentLogLevel = getConfig().logLevel || 'info';
        const currentPriority = LEVEL_PRIORITY[currentLogLevel] || 2;
        const msgPriority = LEVEL_PRIORITY[type] || 1;

        if (msgPriority < currentPriority) {
            return;
        }

        // 팝업이 활성화되어 있으면 실시간 렌더링
        if (this.popupWindow && !this.popupWindow.closed && this.popupWindow.document) {
            const doc = this.popupWindow.document;
            const isConsole = (context === 'Console');
            const containerId = isConsole ? 'toki-debug-console-content' : 'toki-logbox-content';
            const logContentEl = doc.getElementById(containerId);
            if (logContentEl) {
                const li = doc.createElement('li');
                li.textContent = fullMsg;
                
                if (isConsole) {
                    const baseType = (type === 'info' || type === 'normal') ? 'log' : type;
                    li.className = baseType === 'error' || baseType === 'critical' ? 'error'
                        : baseType === 'warn' ? 'warn'
                        : baseType === 'success' ? 'success' : 'log';
                } else {
                    if (type === 'error' || type === 'critical') li.className = 'error';
                    else if (type === 'success') li.className = 'success';
                    else if (type === 'warn') li.className = 'warn';
                    else if (type === 'info') li.className = 'info';
                }
                
                logContentEl.appendChild(li);
                
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
        if (this.popupWindow && !this.popupWindow.closed) {
            const doc = this.popupWindow.document;
            const activeTab = doc.querySelector('.toki-log-tab-btn.active');
            const tabName = activeTab ? activeTab.getAttribute('data-logtab') : 'service';
            if (tabName === 'service') {
                const el = doc.getElementById('toki-logbox-content');
                if (el) el.innerHTML = '';
                this.logs = this.logs.filter(l => l.context === 'Console');
            } else {
                const el = doc.getElementById('toki-debug-console-content');
                if (el) el.innerHTML = '';
                this.logs = this.logs.filter(l => l.context !== 'Console');
            }
        } else {
            this.logs = [];
        }
    }

    show() {
        this.openDashboard();
    }

    hide() {
        if (this.popupWindow && !this.popupWindow.closed) {
            this.popupWindow.close();
        }
        this.popupWindow = null;
        this.stopProgressSync();
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

    startProgressSync() {
        if (this.syncIntervalId) return;
        this.syncIntervalId = setInterval(() => {
            if (this.popupWindow && !this.popupWindow.closed) {
                this.updateProgressUI();
            } else {
                this.stopProgressSync();
            }
        }, 1000);
    }

    stopProgressSync() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
    }
}
