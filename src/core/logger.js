/**
 * logger.js for TokiSync
 * Abstract logging module that routes all logs through EventBus.
 * Eliminates direct dependencies on the LogBox UI class.
 */

import { EventBus, EVT } from './EventBus.js';

export const logger = {
    init() {
        // No-op for abstract logger compatibility
    },

    log(msg, tag = '') {
        EventBus.emit(EVT.LOG, { msg, level: 'info', tag });
        console.log(`[info][${tag}] ${msg}`);
    },

    info(msg, tag = '') {
        this.log(msg, tag);
    },

    success(msg, tag = '') {
        EventBus.emit(EVT.LOG, { msg, level: 'success', tag });
        console.log(`[success][${tag}] ${msg}`);
    },

    warn(msg, tag = '') {
        EventBus.emit(EVT.LOG, { msg, level: 'warn', tag });
        console.warn(`[warn][${tag}] ${msg}`);
    },

    error(msg, tag = '') {
        EventBus.emit(EVT.LOG, { msg, level: 'error', tag });
        console.error(`[error][${tag}] ${msg}`);
    },

    critical(msg, tag = '') {
        EventBus.emit(EVT.LOG, { msg, level: 'critical', tag });
        console.error(`[critical][${tag}] ${msg}`);
    },

    show() {
        EventBus.emit(EVT.OPEN_DASHBOARD);
    },

    toggle() {
        EventBus.emit(EVT.TOGGLE_DASHBOARD);
    },

    openDashboard(defaultTab = '') {
        EventBus.emit(EVT.OPEN_DASHBOARD, { defaultTab });
    }
};
