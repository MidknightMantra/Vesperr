import 'dotenv/config';
import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    isJidGroup,
    delay,
    proto,
    getAggregateVotesInPollMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import express from 'express';
import { existsSync, mkdirSync, writeFileSync, readFileSync, watch } from 'fs';
import { EventEmitter } from 'events';
import NodeCache from 'node-cache';
import crypto from 'crypto';
import { createServer } from 'http';
import cluster from 'cluster';
import os from 'os';

// Compatibility helpers (not all Baileys versions export these)
const isJidUser = (jid) => jid?.endsWith('@s.whatsapp.net') || jid?.endsWith('@lid');
const isPnUser = (jid) => jid?.endsWith('@s.whatsapp.net') || false;

import config from './src/config.js';
import { initSession } from './src/session.js';
import pluginManager from './src/pluginManager.js';
import { handleMessage, handleGroupUpdate } from './src/messageHandler.js';
import { log } from './src/utils/logger.js';
import db from './src/database.js';
import { initSentry, captureException } from './src/monitoring/sentry.js';
import { setupGlobalErrorHandlers } from './src/monitoring/errorHandler.js';
import { startMemoryMonitoring, startMetricsLogging, getMetrics } from './src/monitoring/metrics.js';
import { logSystemEvent, logRequest } from './src/monitoring/requestLogger.js';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const VERSION = '0.1.0';
const BAILEYS_MIN_VERSION = '7.0.0';
const MAX_RECONNECT_ATTEMPTS = 15;
const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 300000;
const HEALTH_CHECK_INTERVAL = 30000;
const MESSAGE_CACHE_TTL = 300;
const GROUP_CACHE_TTL = 300;
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 30;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIMEOUT = 30000;
const MESSAGE_QUEUE_CONCURRENCY = 5;
const MESSAGE_QUEUE_MAX_SIZE = 1000;
const HEALTH_PROBE_INTERVAL = 10000;
const AUDIT_LOG_RETENTION_DAYS = 30;

// ═══════════════════════════════════════════════════════════════
// CLUSTER MODE SUPPORT
// ═══════════════════════════════════════════════════════════════

const ENABLE_CLUSTER = process.env.CLUSTER_MODE === 'true';
const NUM_WORKERS = parseInt(process.env.CLUSTER_WORKERS) || Math.min(os.cpus().length, 4);

// Track if we should start the bot (deferred to end of file)
let shouldStartBot = false;

if (ENABLE_CLUSTER && cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);
    console.log(`Forking ${NUM_WORKERS} workers...`);

    for (let i = 0; i < NUM_WORKERS; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
        setTimeout(() => cluster.fork(), 1000);
    });

    // Primary process only handles worker management
    process.on('SIGTERM', () => {
        for (const id in cluster.workers) {
            cluster.workers[id].kill('SIGTERM');
        }
        process.exit(0);
    });
} else {
    // Worker or single-instance mode - mark for initialization (called at end of file)
    shouldStartBot = true;
}

// ═══════════════════════════════════════════════════════════════
// CORRELATION ID GENERATOR (Request Tracing)
// ═══════════════════════════════════════════════════════════════

class CorrelationIdGenerator {
    static generate() {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(4).toString('hex');
        const workerId = cluster.isWorker ? cluster.worker.id : 0;
        return `${timestamp}-${workerId}-${random}`;
    }
}

// ═══════════════════════════════════════════════════════════════
// CIRCUIT BREAKER PATTERN
// ═══════════════════════════════════════════════════════════════

class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
        this.threshold = options.threshold || CIRCUIT_BREAKER_THRESHOLD;
        this.resetTimeout = options.resetTimeout || CIRCUIT_BREAKER_RESET_TIMEOUT;
        this.halfOpenMax = options.halfOpenMax || 3;
        this.listeners = new Map();
    }

    async execute(fn, fallback = null) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
                log.info(`Circuit breaker [${this.name}] entering HALF_OPEN state`);
            } else {
                log.debug(`Circuit breaker [${this.name}] is OPEN, using fallback`);
                if (fallback) return fallback();
                throw new Error(`Circuit breaker [${this.name}] is OPEN`);
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            if (fallback) return fallback();
            throw error;
        }
    }

    onSuccess() {
        this.failureCount = 0;
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.halfOpenMax) {
                this.state = 'CLOSED';
                log.info(`Circuit breaker [${this.name}] recovered to CLOSED state`);
                this.emit('recovered');
            }
        }
    }

    onFailure(error) {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF_OPEN') {
            this.state = 'OPEN';
            log.warn(`Circuit breaker [${this.name}] re-opened after HALF_OPEN failure`);
            this.emit('opened', error);
        } else if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            log.warn(`Circuit breaker [${this.name}] opened after ${this.failureCount} failures`);
            this.emit('opened', error);
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => cb(data));
    }

    getState() {
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime
        };
    }

    reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
    }
}

// Circuit breakers for different services
const circuitBreakers = {
    database: new CircuitBreaker('database', { threshold: 3, resetTimeout: 60000 }),
    whatsapp: new CircuitBreaker('whatsapp', { threshold: 5, resetTimeout: 30000 }),
    external: new CircuitBreaker('external', { threshold: 5, resetTimeout: 45000 })
};

// ═══════════════════════════════════════════════════════════════
// MESSAGE QUEUE WITH PRIORITY PROCESSING
// ═══════════════════════════════════════════════════════════════

class PriorityMessageQueue extends EventEmitter {
    constructor(options = {}) {
        super();
        this.queues = {
            high: [],    // System messages, admin commands
            normal: [],  // Regular user messages
            low: []      // Bulk operations, non-urgent
        };
        this.processing = false;
        this.concurrency = options.concurrency || MESSAGE_QUEUE_CONCURRENCY;
        this.maxSize = options.maxSize || MESSAGE_QUEUE_MAX_SIZE;
        this.activeWorkers = 0;
        this.processedCount = 0;
        this.droppedCount = 0;
        this.paused = false;
    }

    enqueue(item, priority = 'normal') {
        const totalSize = this.size();

        if (totalSize >= this.maxSize) {
            // Drop lowest priority first
            if (this.queues.low.length > 0) {
                this.queues.low.shift();
                this.droppedCount++;
            } else if (priority === 'high') {
                // Only drop normal for high priority
                if (this.queues.normal.length > 0) {
                    this.queues.normal.shift();
                    this.droppedCount++;
                }
            } else {
                this.droppedCount++;
                log.warn('Message queue full, dropping message');
                return false;
            }
        }

        const queueItem = {
            ...item,
            enqueuedAt: Date.now(),
            correlationId: item.correlationId || CorrelationIdGenerator.generate()
        };

        this.queues[priority].push(queueItem);
        this.emit('enqueued', { priority, size: this.size() });

        if (!this.processing && !this.paused) {
            this.process();
        }

        return true;
    }

    async process() {
        if (this.paused) return;
        this.processing = true;

        while (this.hasItems() && this.activeWorkers < this.concurrency && !this.paused) {
            const item = this.dequeue();
            if (!item) break;

            this.activeWorkers++;

            // Process asynchronously
            this.processItem(item)
                .catch(err => {
                    log.error('Queue item processing error:', err.message);
                    this.emit('error', { item, error: err });
                })
                .finally(() => {
                    this.activeWorkers--;
                    this.processedCount++;

                    // Continue processing
                    if (this.hasItems() && !this.paused) {
                        setImmediate(() => this.process());
                    } else if (!this.hasItems()) {
                        this.processing = false;
                        this.emit('drained');
                    }
                });
        }

        if (!this.hasItems()) {
            this.processing = false;
        }
    }

    dequeue() {
        // Priority order: high > normal > low
        if (this.queues.high.length > 0) return this.queues.high.shift();
        if (this.queues.normal.length > 0) return this.queues.normal.shift();
        if (this.queues.low.length > 0) return this.queues.low.shift();
        return null;
    }

    async processItem(item) {
        const latency = Date.now() - item.enqueuedAt;

        if (latency > 30000) {
            log.warn(`High queue latency: ${latency}ms for ${item.correlationId}`);
        }

        try {
            await item.handler(item.data);
            this.emit('processed', { item, latency });
        } catch (err) {
            this.emit('failed', { item, error: err, latency });
            throw err;
        }
    }

    hasItems() {
        return this.queues.high.length > 0 ||
            this.queues.normal.length > 0 ||
            this.queues.low.length > 0;
    }

    size() {
        return this.queues.high.length +
            this.queues.normal.length +
            this.queues.low.length;
    }

    pause() {
        this.paused = true;
        this.emit('paused');
    }

    resume() {
        this.paused = false;
        this.emit('resumed');
        if (this.hasItems()) {
            this.process();
        }
    }

    clear() {
        const cleared = this.size();
        this.queues = { high: [], normal: [], low: [] };
        this.emit('cleared', { count: cleared });
        return cleared;
    }

    getStats() {
        return {
            queued: {
                high: this.queues.high.length,
                normal: this.queues.normal.length,
                low: this.queues.low.length,
                total: this.size()
            },
            activeWorkers: this.activeWorkers,
            processedCount: this.processedCount,
            droppedCount: this.droppedCount,
            paused: this.paused
        };
    }
}

const messageQueue = new PriorityMessageQueue();

// ═══════════════════════════════════════════════════════════════
// ENHANCED SLIDING WINDOW RATE LIMITER
// ═══════════════════════════════════════════════════════════════

class SlidingWindowRateLimiter {
    constructor(options = {}) {
        this.windowMs = options.windowMs || RATE_LIMIT_WINDOW;
        this.maxRequests = options.maxRequests || RATE_LIMIT_MAX;
        this.windows = new Map();
        this.blockDuration = options.blockDuration || 300000; // 5 minutes
        this.blockedUsers = new Map();
        this.warningThreshold = options.warningThreshold || 0.8;
    }

    check(key, weight = 1) {
        // Check if user is blocked
        const blockExpiry = this.blockedUsers.get(key);
        if (blockExpiry && Date.now() < blockExpiry) {
            return {
                allowed: false,
                blocked: true,
                remaining: 0,
                resetAt: blockExpiry,
                reason: 'BLOCKED'
            };
        } else if (blockExpiry) {
            this.blockedUsers.delete(key);
        }

        const now = Date.now();
        const windowStart = now - this.windowMs;

        let windowData = this.windows.get(key);

        if (!windowData) {
            windowData = { requests: [], warnings: 0 };
            this.windows.set(key, windowData);
        }

        // Remove expired requests
        windowData.requests = windowData.requests.filter(r => r.time > windowStart);

        // Calculate current count with weights
        const currentCount = windowData.requests.reduce((sum, r) => sum + r.weight, 0);
        const remaining = Math.max(0, this.maxRequests - currentCount);

        // Check if at warning threshold
        if (remaining <= this.maxRequests * (1 - this.warningThreshold) && remaining > 0) {
            windowData.warnings++;
        }

        if (currentCount + weight > this.maxRequests) {
            // Check for repeat offenders
            if (windowData.warnings >= 3) {
                this.blockedUsers.set(key, now + this.blockDuration);
                log.warn(`User ${key} blocked for repeated rate limit violations`);
                logSystemEvent('rate_limit_block', { key, duration: this.blockDuration });
            }

            return {
                allowed: false,
                blocked: false,
                remaining: 0,
                resetAt: windowData.requests[0]?.time + this.windowMs || now + this.windowMs,
                reason: 'RATE_LIMITED'
            };
        }

        windowData.requests.push({ time: now, weight });

        return {
            allowed: true,
            blocked: false,
            remaining: remaining - weight,
            resetAt: now + this.windowMs
        };
    }

    isRateLimited(key, weight = 1) {
        return !this.check(key, weight).allowed;
    }

    reset(key) {
        this.windows.delete(key);
        this.blockedUsers.delete(key);
    }

    cleanup() {
        const now = Date.now();
        const windowStart = now - this.windowMs;

        for (const [key, windowData] of this.windows.entries()) {
            windowData.requests = windowData.requests.filter(r => r.time > windowStart);
            if (windowData.requests.length === 0) {
                this.windows.delete(key);
            }
        }

        // Clean expired blocks
        for (const [key, expiry] of this.blockedUsers.entries()) {
            if (now >= expiry) {
                this.blockedUsers.delete(key);
            }
        }
    }

    getStats() {
        return {
            activeWindows: this.windows.size,
            blockedUsers: this.blockedUsers.size
        };
    }
}

const rateLimiter = new SlidingWindowRateLimiter();
setInterval(() => rateLimiter.cleanup(), RATE_LIMIT_WINDOW);

// ═══════════════════════════════════════════════════════════════
// AUDIT LOGGER
// ═══════════════════════════════════════════════════════════════

class AuditLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 10000;
        this.sensitiveFields = ['password', 'token', 'key', 'secret', 'auth'];
    }

    log(action, details = {}, actor = null) {
        const entry = {
            id: CorrelationIdGenerator.generate(),
            timestamp: new Date().toISOString(),
            action,
            actor: actor ? this.sanitize({ id: actor }) : null,
            details: this.sanitize(details),
            workerId: cluster.isWorker ? cluster.worker.id : 0
        };

        this.logs.push(entry);

        // Trim old logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Also log to system
        logSystemEvent(`audit_${action}`, entry);

        return entry;
    }

    sanitize(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        const sanitized = Array.isArray(obj) ? [] : {};

        for (const [key, value] of Object.entries(obj)) {
            if (this.sensitiveFields.some(f => key.toLowerCase().includes(f))) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'object') {
                sanitized[key] = this.sanitize(value);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    query(filters = {}) {
        let results = [...this.logs];

        if (filters.action) {
            results = results.filter(l => l.action === filters.action);
        }
        if (filters.actor) {
            results = results.filter(l => l.actor?.id === filters.actor);
        }
        if (filters.since) {
            const since = new Date(filters.since);
            results = results.filter(l => new Date(l.timestamp) >= since);
        }
        if (filters.until) {
            const until = new Date(filters.until);
            results = results.filter(l => new Date(l.timestamp) <= until);
        }

        return results.slice(-(filters.limit || 100));
    }

    getStats() {
        const actionCounts = {};
        for (const log of this.logs) {
            actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
        }

        return {
            totalLogs: this.logs.length,
            actionCounts,
            oldestLog: this.logs[0]?.timestamp,
            newestLog: this.logs[this.logs.length - 1]?.timestamp
        };
    }
}

const auditLogger = new AuditLogger();

// ═══════════════════════════════════════════════════════════════
// CACHES (Reduced sizes for lower memory usage)
// ═══════════════════════════════════════════════════════════════

const messageCache = new NodeCache({
    stdTTL: 180, // 3 minutes
    checkperiod: 30,
    useClones: false,
    maxKeys: 500 // Reduced from 10000
});

const groupCache = new NodeCache({
    stdTTL: 300,
    checkperiod: 60,
    useClones: false,
    maxKeys: 100 // Reduced from 500
});

const lidMappingCache = new NodeCache({
    stdTTL: 1800, // 30 minutes
    checkperiod: 120,
    useClones: false,
    maxKeys: 500 // Reduced from 5000
});

// Session cache for user context
const sessionCache = new NodeCache({
    stdTTL: 900, // 15 minutes
    checkperiod: 180,
    useClones: false,
    maxKeys: 200 // Reduced from 1000
});

// ═══════════════════════════════════════════════════════════════
// GLOBAL STATE MANAGEMENT (Enhanced)
// ═══════════════════════════════════════════════════════════════

class BotState extends EventEmitter {
    constructor() {
        super();
        this.startTime = Date.now();
        this.sock = null;
        this.pluginManager = null;
        this.connectionState = 'disconnected';
        this.reconnectAttempts = 0;
        this.lastConnected = null;
        this.messageCount = 0;
        this.errorCount = 0;
        this.isShuttingDown = false;
        this.healthCheckInterval = null;
        this.rateLimitMap = new Map();
        this.qrDisplayed = false;
        this.baileysVersion = null;
        this.degradedMode = false;
        this.lastHealthProbe = null;
        this.workerId = cluster.isWorker ? cluster.worker.id : 0;
        this.features = {
            antiSpam: true,
            autoJoin: true,
            antiCall: true,
            messageQueue: true
        };
    }

    get uptime() {
        return Date.now() - this.startTime;
    }

    get isConnected() {
        return this.connectionState === 'open';
    }

    updateConnectionState(state) {
        const oldState = this.connectionState;
        this.connectionState = state;
        this.emit('connectionStateChange', { oldState, newState: state });
        logSystemEvent('connection_state_change', { from: oldState, to: state });
        auditLogger.log('connection_state_change', { from: oldState, to: state });
    }

    incrementMessages() {
        this.messageCount++;
        this.emit('messageProcessed', this.messageCount);
    }

    incrementErrors() {
        this.errorCount++;
        this.emit('errorOccurred', this.errorCount);
    }

    enterDegradedMode(reason) {
        if (!this.degradedMode) {
            this.degradedMode = true;
            log.warn(`Entering degraded mode: ${reason}`);
            logSystemEvent('degraded_mode_enter', { reason });
            auditLogger.log('degraded_mode', { action: 'enter', reason });
            this.emit('degradedMode', { active: true, reason });
        }
    }

    exitDegradedMode() {
        if (this.degradedMode) {
            this.degradedMode = false;
            log.info('Exiting degraded mode');
            logSystemEvent('degraded_mode_exit', {});
            auditLogger.log('degraded_mode', { action: 'exit' });
            this.emit('degradedMode', { active: false });
        }
    }

    toggleFeature(feature, enabled) {
        if (feature in this.features) {
            this.features[feature] = enabled;
            auditLogger.log('feature_toggle', { feature, enabled });
            this.emit('featureToggle', { feature, enabled });
        }
    }

    getStats() {
        return {
            version: VERSION,
            workerId: this.workerId,
            uptime: this.uptime,
            uptimeFormatted: this.formatUptime(this.uptime),
            connectionState: this.connectionState,
            reconnectAttempts: this.reconnectAttempts,
            lastConnected: this.lastConnected,
            messageCount: this.messageCount,
            errorCount: this.errorCount,
            degradedMode: this.degradedMode,
            features: this.features,
            memoryUsage: process.memoryUsage(),
            pluginCount: this.pluginManager?.count || 0,
            baileysVersion: this.baileysVersion,
            lastHealthProbe: this.lastHealthProbe,
            cacheStats: {
                messages: messageCache.getStats(),
                groups: groupCache.getStats(),
                lidMappings: lidMappingCache.getStats(),
                sessions: sessionCache.getStats()
            },
            queueStats: messageQueue.getStats(),
            rateLimiterStats: rateLimiter.getStats(),
            circuitBreakers: Object.fromEntries(
                Object.entries(circuitBreakers).map(([k, v]) => [k, v.getState()])
            )
        };
    }

    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
}

// ═══════════════════════════════════════════════════════════════
// PLUGIN HOT-RELOAD MANAGER
// ═══════════════════════════════════════════════════════════════

class PluginHotReloader {
    constructor(pluginManager, pluginDir = './src/plugins') {
        this.pluginManager = pluginManager;
        this.pluginDir = pluginDir;
        this.watcher = null;
        this.reloadDebounce = new Map();
        this.debounceMs = 1000;
    }

    start() {
        if (!existsSync(this.pluginDir)) {
            log.warn('Plugin directory not found, hot-reload disabled');
            return;
        }

        try {
            this.watcher = watch(this.pluginDir, { recursive: true }, (eventType, filename) => {
                if (!filename || !filename.endsWith('.js')) return;

                // Debounce rapid changes
                if (this.reloadDebounce.has(filename)) {
                    clearTimeout(this.reloadDebounce.get(filename));
                }

                this.reloadDebounce.set(filename, setTimeout(() => {
                    this.handleChange(eventType, filename);
                    this.reloadDebounce.delete(filename);
                }, this.debounceMs));
            });

            log.info('Plugin hot-reload enabled');
        } catch (err) {
            log.warn('Plugin hot-reload failed to start:', err.message);
        }
    }

    async handleChange(eventType, filename) {
        log.info(`Plugin ${eventType}: ${filename}`);

        try {
            // Clear module cache
            const modulePath = `${this.pluginDir}/${filename}`;
            const fullPath = await import.meta.resolve?.(modulePath) || modulePath;

            // Reload all plugins for simplicity
            // In production, you'd want targeted reload
            await this.pluginManager.loadAll();

            log.success(`Plugins reloaded after ${filename} change`);
            auditLogger.log('plugin_hot_reload', { file: filename, eventType });
        } catch (err) {
            log.error(`Plugin reload failed: ${err.message}`);
        }
    }

    stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        this.reloadDebounce.forEach(timeout => clearTimeout(timeout));
        this.reloadDebounce.clear();
    }
}

// ═══════════════════════════════════════════════════════════════
// HEALTH PROBE (WebSocket Connection Health)
// ═══════════════════════════════════════════════════════════════

class HealthProbe {
    constructor(botState) {
        this.botState = botState;
        this.consecutiveFailures = 0;
        this.maxFailures = 3;
        this.interval = null;
    }

    start(sock) {
        this.sock = sock;
        this.interval = setInterval(() => this.probe(), HEALTH_PROBE_INTERVAL);
    }

    async probe() {
        if (!this.sock || this.botState.isShuttingDown) return;

        try {
            // Simple connectivity check
            const start = Date.now();

            if (this.sock.ws?.readyState === 1) { // OPEN
                this.consecutiveFailures = 0;
                this.botState.lastHealthProbe = {
                    time: new Date().toISOString(),
                    latency: Date.now() - start,
                    status: 'healthy'
                };

                if (this.botState.degradedMode) {
                    this.botState.exitDegradedMode();
                }
            } else {
                this.onFailure();
            }
        } catch (err) {
            this.onFailure();
        }
    }

    onFailure() {
        this.consecutiveFailures++;
        this.botState.lastHealthProbe = {
            time: new Date().toISOString(),
            status: 'unhealthy',
            consecutiveFailures: this.consecutiveFailures
        };

        if (this.consecutiveFailures >= this.maxFailures) {
            this.botState.enterDegradedMode('WebSocket health check failures');
        }
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// ENHANCED RECONNECTION MANAGER
// ═══════════════════════════════════════════════════════════════

class ReconnectionManager {
    constructor() {
        this.attempts = 0;
        this.maxAttempts = MAX_RECONNECT_ATTEMPTS;
        this.initialDelay = INITIAL_RECONNECT_DELAY;
        this.maxDelay = MAX_RECONNECT_DELAY;
        this.timeoutId = null;
        this.backoffMultiplier = 1.5;
        this.jitterFactor = 0.3;
    }

    getNextDelay() {
        // Exponential backoff with jitter
        const exponentialDelay = this.initialDelay * Math.pow(this.backoffMultiplier, this.attempts);
        const jitter = exponentialDelay * this.jitterFactor * (Math.random() - 0.5);
        return Math.min(Math.round(exponentialDelay + jitter), this.maxDelay);
    }

    async scheduleReconnect(callback) {
        if (this.attempts >= this.maxAttempts) {
            log.error(`Max reconnection attempts (${this.maxAttempts}) reached.`);
            logSystemEvent('max_reconnect_reached', { attempts: this.attempts });
            auditLogger.log('reconnect_exhausted', { attempts: this.attempts });
            return false;
        }

        this.attempts++;
        const delayMs = this.getNextDelay();

        log.info(`Reconnection attempt ${this.attempts}/${this.maxAttempts} in ${Math.round(delayMs / 1000)}s...`);
        logSystemEvent('reconnect_scheduled', { attempt: this.attempts, delay: delayMs });

        return new Promise((resolve) => {
            this.timeoutId = setTimeout(async () => {
                try {
                    await callback();
                    resolve(true);
                } catch (err) {
                    log.error('Reconnection failed:', err.message);
                    resolve(false);
                }
            }, delayMs);
        });
    }

    reset() {
        this.attempts = 0;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    cancel() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// LOGGER CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const pinoLogger = pino({
    level: process.env.LOG_LEVEL || 'silent',
    transport: process.env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: { colorize: true }
    } : undefined
});

// ═══════════════════════════════════════════════════════════════
// MESSAGE STORE (Required for Baileys 7.x)
// ═══════════════════════════════════════════════════════════════

function storeMessage(jid, message) {
    if (!message?.key?.id) return;
    const key = `${jid}:${message.key.id}`;
    messageCache.set(key, message);
}

async function getMessage(key) {
    if (!key?.remoteJid || !key?.id) return undefined;

    const cacheKey = `${key.remoteJid}:${key.id}`;
    const cached = messageCache.get(cacheKey);

    if (cached?.message) {
        return cached.message;
    }

    // Fallback with circuit breaker
    try {
        return await circuitBreakers.database.execute(
            async () => {
                const dbMessage = await db.getMessage?.(key.remoteJid, key.id);
                return dbMessage;
            },
            () => undefined
        );
    } catch (err) {
        return undefined;
    }
}

// ═══════════════════════════════════════════════════════════════
// LID (Local Identifier) UTILITIES
// ═══════════════════════════════════════════════════════════════

function getPreferredJid(msg) {
    if (msg.key.remoteJidAlt) {
        if (!isPnUser(msg.key.remoteJid) && isPnUser(msg.key.remoteJidAlt)) {
            return msg.key.remoteJidAlt;
        }
    }
    return msg.key.remoteJid;
}

function getSender(msg, sock) {
    const jid = msg.key.remoteJid;

    if (isJidGroup(jid)) {
        return msg.key.participant || msg.key.participantAlt || jid;
    }

    return msg.key.fromMe ? sock?.user?.id : jid;
}

function storeLidMapping(lid, pn) {
    if (lid && pn) {
        lidMappingCache.set(`lid:${lid}`, pn);
        lidMappingCache.set(`pn:${pn}`, lid);
    }
}

// ═══════════════════════════════════════════════════════════════
// MAIN BOT INITIALIZATION
// ═══════════════════════════════════════════════════════════════

async function initializeBot() {
    // Initialize global bot state
    const botState = new BotState();
    global.VESPERR = botState;

    const reconnectionManager = new ReconnectionManager();
    const healthProbe = new HealthProbe(botState);
    let pluginHotReloader = null;

    // Monitoring initialization
    initSentry();
    setupGlobalErrorHandlers();
    startMemoryMonitoring();
    startMetricsLogging();

    // ═══════════════════════════════════════════════════════════
    // WEB SERVER (Enhanced Health & Metrics API)
    // ═══════════════════════════════════════════════════════════

    const app = express();
    const PORT = process.env.PORT || 3000;

    // Request correlation
    app.use((req, res, next) => {
        req.correlationId = req.headers['x-correlation-id'] || CorrelationIdGenerator.generate();
        res.setHeader('x-correlation-id', req.correlationId);
        next();
    });

    // Request logging
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            logRequest({
                correlationId: req.correlationId,
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                duration: Date.now() - start
            });
            next();
        });

        app.use(express.json());

        // Security headers
        app.use((req, res, next) => {
            res.header('X-Content-Type-Options', 'nosniff');
            res.header('X-Frame-Options', 'DENY');
            res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Correlation-ID');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            if (req.method === 'OPTIONS') return res.sendStatus(200);
            next();
        });

        // API Authentication middleware (optional)
        const apiAuth = (req, res, next) => {
            const apiKey = process.env.API_KEY;
            if (!apiKey) return next(); // No auth if not configured

            const providedKey = req.headers['x-api-key'] || req.query.apiKey;
            if (providedKey !== apiKey) {
                auditLogger.log('unauthorized_api_access', {
                    path: req.path,
                    ip: req.ip
                });
                return res.status(401).json({ error: 'Unauthorized' });
            }
            next();
        };

        app.get('/', (req, res) => {
            res.json({
                status: botState.isConnected ? 'online' : 'offline',
                bot: 'Vesperr',
                version: VERSION,
                baileys: botState.baileysVersion,
                uptime: botState.uptime,
                uptimeFormatted: botState.getStats().uptimeFormatted,
                degradedMode: botState.degradedMode,
                workerId: botState.workerId
            });
        });

        app.get('/health', (req, res) => {
            const stats = botState.getStats();
            const checks = {
                connection: stats.connectionState === 'open',
                errorRate: stats.errorCount < 100,
                memory: stats.memoryUsage.heapUsed / stats.memoryUsage.heapTotal < 0.95,
                queue: stats.queueStats.queued.total < MESSAGE_QUEUE_MAX_SIZE * 0.9,
                circuitBreakers: Object.values(stats.circuitBreakers).every(cb => cb.state !== 'OPEN')
            };

            const isHealthy = Object.values(checks).every(Boolean);

            res.status(isHealthy ? 200 : 503).json({
                status: isHealthy ? 'healthy' : 'unhealthy',
                degradedMode: stats.degradedMode,
                timestamp: new Date().toISOString(),
                correlationId: req.correlationId,
                checks,
                ...stats
            });
        });

        app.get('/metrics', (req, res) => {
            const stats = botState.getStats();
            const cacheStats = stats.cacheStats;
            const queueStats = stats.queueStats;

            res.type('text/plain').send(`
# HELP vesperr_info Bot information
# TYPE vesperr_info gauge
vesperr_info{version="${VERSION}",worker="${stats.workerId}"} 1

# HELP vesperr_uptime_seconds Bot uptime in seconds
# TYPE vesperr_uptime_seconds gauge
vesperr_uptime_seconds ${Math.floor(stats.uptime / 1000)}

# HELP vesperr_messages_total Total messages processed
# TYPE vesperr_messages_total counter
vesperr_messages_total ${stats.messageCount}

# HELP vesperr_errors_total Total errors encountered
# TYPE vesperr_errors_total counter
vesperr_errors_total ${stats.errorCount}

# HELP vesperr_connection_state Current connection state
# TYPE vesperr_connection_state gauge
vesperr_connection_state ${stats.connectionState === 'open' ? 1 : 0}

# HELP vesperr_degraded_mode Degraded mode status
# TYPE vesperr_degraded_mode gauge
vesperr_degraded_mode ${stats.degradedMode ? 1 : 0}

# HELP vesperr_plugins_loaded Number of plugins loaded
# TYPE vesperr_plugins_loaded gauge
vesperr_plugins_loaded ${stats.pluginCount}

# HELP vesperr_memory_heap_used_bytes Heap memory used
# TYPE vesperr_memory_heap_used_bytes gauge
vesperr_memory_heap_used_bytes ${stats.memoryUsage.heapUsed}

# HELP vesperr_memory_heap_total_bytes Total heap memory
# TYPE vesperr_memory_heap_total_bytes gauge
vesperr_memory_heap_total_bytes ${stats.memoryUsage.heapTotal}

# HELP vesperr_queue_size Current message queue size
# TYPE vesperr_queue_size gauge
vesperr_queue_size{priority="high"} ${queueStats.queued.high}
vesperr_queue_size{priority="normal"} ${queueStats.queued.normal}
vesperr_queue_size{priority="low"} ${queueStats.queued.low}

# HELP vesperr_queue_processed_total Total messages processed by queue
# TYPE vesperr_queue_processed_total counter
vesperr_queue_processed_total ${queueStats.processedCount}

# HELP vesperr_queue_dropped_total Total messages dropped by queue
# TYPE vesperr_queue_dropped_total counter
vesperr_queue_dropped_total ${queueStats.droppedCount}

# HELP vesperr_cache_keys Cache entries count
# TYPE vesperr_cache_keys gauge
vesperr_cache_keys{cache="messages"} ${cacheStats.messages?.keys || 0}
vesperr_cache_keys{cache="groups"} ${cacheStats.groups?.keys || 0}
vesperr_cache_keys{cache="lid"} ${cacheStats.lidMappings?.keys || 0}
vesperr_cache_keys{cache="sessions"} ${cacheStats.sessions?.keys || 0}

# HELP vesperr_circuit_breaker_state Circuit breaker states (0=closed, 1=open, 2=half_open)
# TYPE vesperr_circuit_breaker_state gauge
${Object.entries(stats.circuitBreakers).map(([name, cb]) =>
                `vesperr_circuit_breaker_state{name="${name}"} ${cb.state === 'CLOSED' ? 0 : cb.state === 'OPEN' ? 1 : 2}`
            ).join('\n')}

# HELP vesperr_rate_limiter_active Active rate limit windows
# TYPE vesperr_rate_limiter_active gauge
vesperr_rate_limiter_active ${stats.rateLimiterStats.activeWindows}

# HELP vesperr_rate_limiter_blocked Blocked users count
# TYPE vesperr_rate_limiter_blocked gauge
vesperr_rate_limiter_blocked ${stats.rateLimiterStats.blockedUsers}

# HELP vesperr_reconnect_attempts Current reconnection attempt count
# TYPE vesperr_reconnect_attempts gauge
vesperr_reconnect_attempts ${stats.reconnectAttempts}
`.trim());
        });

        app.get('/ready', (req, res) => {
            if (botState.isConnected && !botState.degradedMode) {
                res.status(200).json({ ready: true });
            } else {
                res.status(503).json({
                    ready: false,
                    state: botState.connectionState,
                    degradedMode: botState.degradedMode
                });
            }
        });

        app.get('/live', (req, res) => {
            res.status(200).json({
                alive: true,
                pid: process.pid,
                workerId: botState.workerId
            });
        });

        app.get('/plugins', apiAuth, (req, res) => {
            const plugins = botState.pluginManager?.getAll?.() || [];
            res.json({
                count: plugins.length,
                plugins: plugins.map(p => ({
                    name: p.name,
                    description: p.description,
                    pattern: p.pattern?.toString(),
                    category: p.category,
                    enabled: p.enabled !== false
                }))
            });
        });

        app.get('/stats', apiAuth, (req, res) => {
            res.json({
                ...botState.getStats(),
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                pid: process.pid,
                env: process.env.NODE_ENV || 'development'
            });
        });

        // Admin endpoints
        app.post('/admin/feature', apiAuth, (req, res) => {
            const { feature, enabled } = req.body;
            if (!feature || typeof enabled !== 'boolean') {
                return res.status(400).json({ error: 'Invalid request' });
            }

            botState.toggleFeature(feature, enabled);
            res.json({ success: true, features: botState.features });
        });

        app.post('/admin/queue/pause', apiAuth, (req, res) => {
            messageQueue.pause();
            res.json({ success: true, paused: true });
        });

        app.post('/admin/queue/resume', apiAuth, (req, res) => {
            messageQueue.resume();
            res.json({ success: true, paused: false });
        });

        app.post('/admin/circuit-breaker/reset', apiAuth, (req, res) => {
            const { name } = req.body;
            if (name && circuitBreakers[name]) {
                circuitBreakers[name].reset();
                auditLogger.log('circuit_breaker_reset', { name });
                res.json({ success: true, state: circuitBreakers[name].getState() });
            } else {
                res.status(400).json({ error: 'Invalid circuit breaker name' });
            }
        });

        app.get('/audit', apiAuth, (req, res) => {
            const { action, actor, since, until, limit } = req.query;
            const logs = auditLogger.query({
                action,
                actor,
                since,
                until,
                limit: parseInt(limit) || 100
            });
        });
        res.json({
            count: logs.length,
            stats: auditLogger.getStats(),
            logs
        });
    });

    // ═══════════════════════════════════════════════════════════
    // BANNER
    // ═══════════════════════════════════════════════════════════

    function printBanner() {
        if (botState.workerId > 1) return; // Only print for first worker

        const colors = {
            purple: '\x1b[35m',
            cyan: '\x1b[36m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            reset: '\x1b[0m',
            bold: '\x1b[1m'
        };

        console.log(colors.purple + colors.bold);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('   ╦  ╦╔═╗╔═╗╔═╗╔═╗╦═╗╦═╗');
        console.log('   ╚╗╔╝║╣ ╚═╗╠═╝║╣ ╠╦╝╠╦╝');
        console.log('    ╚╝ ╚═╝╚═╝╩  ╚═╝╩╚═╩╚═');
        console.log(colors.reset);
        console.log(colors.cyan + `   Vesperr Bot v${VERSION}` + colors.reset);
        console.log(colors.yellow + `   Node ${process.version} | Baileys 7.x Compatible` + colors.reset);
        console.log(colors.green + `   Circuit Breaker: ✓ | Message Queue: ✓ | Hot-Reload: ✓` + colors.reset);
        console.log(colors.green + `   LID Support: ✓ | Group Cache: ✓ | Audit Log: ✓` + colors.reset);
        console.log(colors.purple + '═══════════════════════════════════════════════════════════════' + colors.reset);
        console.log();
    }

    // ═══════════════════════════════════════════════════════════
    // MESSAGE PROCESSING WITH QUEUE INTEGRATION
    // ═══════════════════════════════════════════════════════════

    async function processMessage(sock, msg, context = {}) {
        const jid = msg.key.remoteJid;
        const isGroup = isJidGroup(jid);
        const correlationId = context.correlationId || CorrelationIdGenerator.generate();

        // Store message for later retrieval
        storeMessage(jid, msg);

        // Store LID/PN mapping if available
        if (msg.key.remoteJidAlt) {
            const lid = isPnUser(msg.key.remoteJid) ? msg.key.remoteJidAlt : msg.key.remoteJid;
            const pn = isPnUser(msg.key.remoteJid) ? msg.key.remoteJid : msg.key.remoteJidAlt;
            storeLidMapping(lid, pn);
        }

        // Rate limit check
        const rateLimitKey = isGroup
            ? jid
            : (msg.key.participant || msg.key.participantAlt || getSender(msg, sock));

        const rateLimitResult = rateLimiter.check(rateLimitKey);

        if (!rateLimitResult.allowed) {
            log.debug(`Rate limited: ${rateLimitKey} (${rateLimitResult.reason})`);
            return;
        }

        // Determine priority
        let priority = 'normal';
        const messageContent = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text || '';

        if (messageContent.startsWith(config.prefix + 'admin') ||
            messageContent.startsWith(config.prefix + 'system')) {
            priority = 'high';
        } else if (isGroup && !messageContent.startsWith(config.prefix)) {
            priority = 'low';
        }

        // Handle with circuit breaker
        const handler = async (data) => {
            await circuitBreakers.whatsapp.execute(
                async () => {
                    await handleMessage(sock, data.msg, {
                        preferredJid: getPreferredJid(data.msg),
                        sender: getSender(data.msg, sock),
                        isLid: !isPnUser(data.msg.key.remoteJid),
                        correlationId: data.correlationId,
                        lidMapping: {
                            get: (id) => lidMappingCache.get(`lid:${id}`) || lidMappingCache.get(`pn:${id}`)
                        }
                    });
                },
                () => {
                    // Fallback: log but don't crash
                    log.warn('WhatsApp circuit breaker open, message deferred');
                }
            );
        };

        // Queue the message if feature enabled
        if (botState.features.messageQueue) {
            messageQueue.enqueue({
                correlationId,
                data: { msg, correlationId },
                handler
            }, priority);
        } else {
            // Direct processing
            try {
                await handler({ msg, correlationId });
                botState.incrementMessages();
            } catch (err) {
                botState.incrementErrors();
                captureException?.(err, { context: 'message_processing', correlationId });
                log.error(`Message processing error [${correlationId}]:`, err.message);
            }
        }
    }

    // Queue event handlers
    messageQueue.on('processed', () => {
        botState.incrementMessages();
    });

    messageQueue.on('failed', ({ error, item }) => {
        botState.incrementErrors();
        captureException?.(error, {
            context: 'queue_processing',
            correlationId: item.correlationId
        });
    });

    // ═══════════════════════════════════════════════════════════
    // AUTO-JOIN & AUTO-FOLLOW HANDLERS
    // ═══════════════════════════════════════════════════════════

    async function handleAutoJoinGroup(sock) {
        if (!config.autoJoinGroupUrl || !botState.features.autoJoin) return;

        try {
            const code = config.autoJoinGroupUrl.split('chat.whatsapp.com/')[1] || config.autoJoinGroupUrl;
            log.info(`Attempting to join support group...`);

            await delay(2000);
            await sock.groupAcceptInvite(code);

            log.success('✅ Joined support group!');
            auditLogger.log('auto_join', { type: 'group', success: true });
        } catch (err) {
            if (err.message?.includes('already') || err.message?.includes('participant')) {
                log.info('Already a member of support group');
            } else {
                log.warn(`Failed to join support group: ${err.message}`);
                auditLogger.log('auto_join', { type: 'group', success: false, error: err.message });
            }
        }
    }

    async function handleAutoFollowChannel(sock) {
        if (!config.autoFollowChannelUrl || !botState.features.autoJoin) return;

        try {
            const channelCode = config.autoFollowChannelUrl.split('whatsapp.com/channel/')[1] || config.autoFollowChannelUrl;

            if (!sock.newsletterFollow) {
                log.warn('Newsletter/channel support not available in this Baileys version');
                return;
            }

            let jidToFollow = channelCode;

            if (!channelCode.includes('@newsletter')) {
                try {
                    const metadata = await sock.newsletterMetadata('invite', channelCode);
                    jidToFollow = metadata.id;
                } catch (e) {
                    log.warn('Could not resolve channel code');
                }
            }

            await delay(2000);
            await sock.newsletterFollow(jidToFollow);

            log.success('✅ Followed announcement channel!');
            auditLogger.log('auto_follow', { type: 'channel', success: true });
        } catch (err) {
            if (err.message?.includes('already')) {
                log.info('Already following announcement channel');
            } else {
                log.warn(`Failed to follow channel: ${err.message}`);
                auditLogger.log('auto_follow', { type: 'channel', success: false, error: err.message });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // POLL VOTE HANDLING
    // ═══════════════════════════════════════════════════════════

    async function handlePollUpdate(sock, pollUpdate) {
        try {
            for (const update of pollUpdate) {
                const pollMsg = await getMessage(update.pollCreationMessageKey);

                if (pollMsg) {
                    const votes = getAggregateVotesInPollMessage({
                        message: pollMsg,
                        pollUpdates: update.vote
                    });

                    log.debug('Poll votes updated:', votes);
                    botState.emit('pollUpdate', { update, votes });
                }
            }
        } catch (err) {
            log.error('Poll update error:', err.message);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // HEALTH CHECKS
    // ═══════════════════════════════════════════════════════════

    function startHealthChecks() {
        botState.healthCheckInterval = setInterval(() => {
            const stats = botState.getStats();
            const memUsage = stats.memoryUsage;

            if (process.env.NODE_ENV !== 'production') {
                log.debug('Health Check', {
                    state: stats.connectionState,
                    uptime: stats.uptimeFormatted,
                    messages: stats.messageCount,
                    queue: stats.queueStats.queued.total,
                    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
                });
            }

            botState.emit('healthCheck', stats);

            // Memory pressure handling
            const heapPercent = memUsage.heapUsed / memUsage.heapTotal;
            if (heapPercent > 0.9) {
                log.warn('High memory usage detected', {
                    heapPercent: Math.round(heapPercent * 100)
                });

                // Clear oldest cache entries
                const oldestMessages = messageCache.keys().slice(0, 100);
                oldestMessages.forEach(k => messageCache.del(k));

                if (global.gc) {
                    log.info('Triggering garbage collection...');
                    global.gc();
                }
            }

            // Check circuit breakers
            const openBreakers = Object.entries(circuitBreakers)
                .filter(([_, cb]) => cb.state === 'OPEN')
                .map(([name]) => name);

            if (openBreakers.length > 0) {
                log.warn(`Open circuit breakers: ${openBreakers.join(', ')}`);
            }

        }, HEALTH_CHECK_INTERVAL);
    }

    // ═══════════════════════════════════════════════════════════
    // MAIN BOT STARTUP
    // ═══════════════════════════════════════════════════════════

    async function startBot() {
        if (botState.isShuttingDown) {
            log.warn('Shutdown in progress, aborting startup');
            return;
        }

        printBanner();
        logSystemEvent('bot_startup', {
            version: VERSION,
            mode: config.mode,
            nodeVersion: process.version,
            workerId: botState.workerId
        });
        auditLogger.log('bot_startup', { version: VERSION });

        // Database connection with circuit breaker
        try {
            await circuitBreakers.database.execute(async () => {
                await db.connect();
            });
            log.success('Database connected');
        } catch (err) {
            log.error('Database connection failed:', err.message);
            botState.enterDegradedMode('Database unavailable');
        }

        // Session directory
        if (!existsSync(config.sessionDir)) {
            mkdirSync(config.sessionDir, { recursive: true });
            log.info(`Created session directory: ${config.sessionDir}`);
        }

        await initSession();

        // Load plugins
        await pluginManager.loadAll();
        botState.pluginManager = pluginManager;
        log.success(`Loaded ${pluginManager.count} plugins`);

        // Start hot-reload in development
        if (process.env.NODE_ENV === 'development') {
            pluginHotReloader = new PluginHotReloader(pluginManager);
            pluginHotReloader.start();
        }

        // Fetch latest Baileys version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        botState.baileysVersion = version.join('.');
        log.info(`WhatsApp Web v${version.join('.')} ${isLatest ? '(latest)' : ''}`);

        // Auth state
        const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);

        // Create socket
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pinoLogger)
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }), // Suppress internal Baileys logs to clean up console
            browser: ['Vesperr', 'Google Chrome', 'Linux'],
            getMessage: getMessage,
            cachedGroupMetadata: async (jid) => groupCache.get(jid),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            retryRequestDelayMs: 2000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            emitOwnEvents: true,
            fireInitQueries: true
        });

        botState.sock = sock;

        // ═══════════════════════════════════════════════════════
        // CONNECTION EVENTS
        // ═══════════════════════════════════════════════════════

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !botState.qrDisplayed) {
                console.log('\n📱 Scan this QR code with WhatsApp:\n');
                qrcode.generate(qr, { small: true });
                console.log('\n💡 Tip: Save your SESSION_ID for deployments\n');
                botState.qrDisplayed = true;
            }

            if (connection) {
                botState.updateConnectionState(connection);
            }

            if (connection === 'close') {
                healthProbe.stop();

                const boom = new Boom(lastDisconnect?.error);
                const statusCode = boom?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || `Unknown (${statusCode})`;

                log.warn(`Connection closed: ${reason}`);
                auditLogger.log('connection_closed', { statusCode, reason });

                if (statusCode === DisconnectReason.loggedOut) {
                    log.error('Session logged out. Delete session folder and restart.');
                    await gracefulShutdown('LOGOUT');
                    return;
                }

                const recoverableErrors = [
                    DisconnectReason.connectionLost,
                    DisconnectReason.connectionClosed,
                    DisconnectReason.connectionReplaced,
                    DisconnectReason.timedOut,
                    DisconnectReason.restartRequired
                ];

                if (recoverableErrors.includes(statusCode) || statusCode >= 500) {
                    botState.reconnectAttempts = reconnectionManager.attempts;
                    await reconnectionManager.scheduleReconnect(startBot);
                } else {
                    log.error(`Unrecoverable disconnect (${statusCode}).`);
                    botState.enterDegradedMode(`Unrecoverable disconnect: ${reason}`);
                }
            }

            if (connection === 'open') {
                reconnectionManager.reset();
                botState.reconnectAttempts = 0;
                botState.lastConnected = new Date().toISOString();
                botState.qrDisplayed = false;
                botState.exitDegradedMode();

                log.success('🎉 Connected to WhatsApp!');
                log.info(`Bot ID: ${sock.user?.id}`);
                log.info(`Plugins: ${pluginManager.count} | Prefix: ${config.prefix}`);

                auditLogger.log('connection_established', { botId: sock.user?.id });

                // Start health probe
                healthProbe.start(sock);

                setTimeout(() => handleAutoJoinGroup(sock), 5000);
                setTimeout(() => handleAutoFollowChannel(sock), 8000);
            }
        });

        // ═══════════════════════════════════════════════════════
        // CREDENTIALS UPDATE
        // ═══════════════════════════════════════════════════════

        sock.ev.on('creds.update', saveCreds);

        // ═══════════════════════════════════════════════════════
        // LID MAPPING UPDATES
        // ═══════════════════════════════════════════════════════

        sock.ev.on('lid-mapping.update', (mapping) => {
            for (const [lid, pn] of Object.entries(mapping)) {
                storeLidMapping(lid, pn);
            }
        });

        // ═══════════════════════════════════════════════════════
        // MESSAGE HANDLING
        // ═══════════════════════════════════════════════════════

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                // Auto-read status updates (to appear in viewer list)
                if (msg.key.remoteJid === 'status@broadcast' && !msg.key.fromMe) {
                    try {
                        await sock.readMessages([msg.key]);
                        // Optional: Log it debug only to avoid clutter
                        // log.debug(`Viewed status from ${msg.key.participant}`);
                    } catch (err) {
                        log.warn(`Failed to read status: ${err.message}`);
                    }
                    continue;
                }

                if (!msg.message) continue;
                const correlationId = CorrelationIdGenerator.generate();
                setImmediate(() => processMessage(sock, msg, { correlationId }));
            }
        });

        // ═══════════════════════════════════════════════════════
        // MESSAGE UPDATES
        // ═══════════════════════════════════════════════════════

        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                if (update.message) {
                    storeMessage(update.key.remoteJid, update);
                }
            }
        });

        // ═══════════════════════════════════════════════════════
        // POLL UPDATES
        // ═══════════════════════════════════════════════════════

        sock.ev.on('messages.poll-update', async (pollUpdate) => {
            await handlePollUpdate(sock, pollUpdate);
        });

        // ═══════════════════════════════════════════════════════
        // GROUP UPDATES
        // ═══════════════════════════════════════════════════════

        sock.ev.on('groups.update', async (updates) => {
            for (const update of updates) {
                try {
                    const metadata = await sock.groupMetadata(update.id);
                    groupCache.set(update.id, metadata);
                } catch (err) {
                    log.debug(`Failed to cache group metadata: ${err.message}`);
                }
            }
        });

        sock.ev.on('group-participants.update', async (update) => {
            try {
                const metadata = await sock.groupMetadata(update.id);
                groupCache.set(update.id, metadata);
                await handleGroupUpdate(sock, update);
            } catch (err) {
                log.error('Group update error:', err.message);
                captureException?.(err, { context: 'group_update' });
            }
        });

        // ═══════════════════════════════════════════════════════
        // CALL HANDLING
        // ═══════════════════════════════════════════════════════

        sock.ev.on('call', async (calls) => {
            if (!config.antiCall || !botState.features.antiCall) return;

            for (const call of calls) {
                if (call.status === 'offer') {
                    try {
                        log.info(`Rejecting call from ${call.from}`);
                        await sock.rejectCall(call.id, call.from);
                        await sock.sendMessage(call.from, {
                            text: '📵 *Auto-Reject*\n\nI do not accept calls. Please send a message instead.'
                        });
                        auditLogger.log('call_rejected', { from: call.from });
                    } catch (err) {
                        log.error('Call rejection error:', err.message);
                    }
                }
            }
        });

        // ═══════════════════════════════════════════════════════
        // CONTACTS & PRESENCE
        // ═══════════════════════════════════════════════════════

        sock.ev.on('contacts.update', (updates) => {
            for (const contact of updates) {
                if (contact.id && contact.lid) {
                    storeLidMapping(contact.lid, contact.id);
                }
            }
        });

        sock.ev.on('presence.update', (update) => {
            botState.emit('presence', update);
        });

        // Start health checks
        startHealthChecks();
    }

    // ═══════════════════════════════════════════════════════════
    // GRACEFUL SHUTDOWN
    // ═══════════════════════════════════════════════════════════

    async function gracefulShutdown(signal) {
        if (botState.isShuttingDown) return;
        botState.isShuttingDown = true;

        log.info(`\nReceived ${signal}. Starting graceful shutdown...`);
        auditLogger.log('shutdown_initiated', { signal });

        // Stop accepting new messages
        messageQueue.pause();

        // Wait for queue to drain (with timeout)
        const drainTimeout = 10000;
        await Promise.race([
            new Promise(resolve => {
                if (!messageQueue.hasItems()) resolve();
                messageQueue.once('drained', resolve);
            }),
            new Promise(resolve => setTimeout(resolve, drainTimeout))
        ]);

        reconnectionManager.cancel();
        healthProbe.stop();
        pluginHotReloader?.stop();

        if (botState.healthCheckInterval) {
            clearInterval(botState.healthCheckInterval);
        }

        // Flush caches
        messageCache.flushAll();
        groupCache.flushAll();
        lidMappingCache.flushAll();
        sessionCache.flushAll();

        if (botState.sock) {
            try {
                await botState.sock.end();
                log.info('WebSocket connection closed');
            } catch (err) {
                log.warn('Error closing WebSocket:', err.message);
            }
        }

        try {
            await db.close?.();
            log.info('Database connection closed');
        } catch (err) {
            log.warn('Error closing database:', err.message);
        }

        server.close(() => {
            log.info('HTTP server closed');
        });

        const stats = botState.getStats();
        log.info('Final Stats:', {
            uptime: stats.uptimeFormatted,
            messages: stats.messageCount,
            errors: stats.errorCount,
            queueProcessed: stats.queueStats.processedCount
        });

        auditLogger.log('shutdown_complete', stats);

        setTimeout(() => {
            log.success('Goodbye! 👋');
            process.exit(0);
        }, 1000);
    }

    // ═══════════════════════════════════════════════════════════
    // PROCESS HANDLERS
    // ═══════════════════════════════════════════════════════════

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (err) => {
        log.error('Uncaught Exception:', err.message);
        log.error(err.stack);
        captureException?.(err, { context: 'uncaught_exception' });
        botState.incrementErrors();
        auditLogger.log('uncaught_exception', { error: err.message });

        if (err.message?.includes('ECONNRESET') || err.message?.includes('ETIMEDOUT')) {
            return; // Non-fatal
        }
    });

    process.on('unhandledRejection', (reason, promise) => {
        log.error('Unhandled Rejection:', reason);
        captureException?.(reason, { context: 'unhandled_rejection' });
        botState.incrementErrors();
        auditLogger.log('unhandled_rejection', { reason: String(reason) });
    });

    // ═══════════════════════════════════════════════════════════
    // START
    // ═══════════════════════════════════════════════════════════

    startBot().catch((err) => {
        log.error('Startup failed:', err.message);
        log.error(err.stack);
        auditLogger.log('startup_failed', { error: err.message });
        process.exit(1);
    });

    // Export for testing and external access
    return {
        botState,
        rateLimiter,
        reconnectionManager,
        messageQueue,
        circuitBreakers,
        auditLogger,
        getMessage,
        storeMessage,
        groupCache,
        messageCache,
        lidMappingCache,
        sessionCache
    };
}

// Export for module usage
export default initializeBot;

// ═══════════════════════════════════════════════════════════════
// START BOT (after all classes are defined)
// ═══════════════════════════════════════════════════════════════

if (shouldStartBot) {
    initializeBot();
}
