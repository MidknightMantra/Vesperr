import { EventEmitter } from 'events';
import { log } from './logger.js';

export const CircuitState = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
};

const DEFAULT_OPTIONS = {

    failureThreshold: 5,

    successThreshold: 3,

    resetTimeout: 30000,

    timeout: 10000,

    exponentialBackoff: true,

    maxBackoff: 300000,

    backoffMultiplier: 2,

    halfOpenRequestPercentage: 0.5,

    maxConcurrent: 10,

    trackErrorTypes: false,

    ignoredErrors: [],

    countedErrors: [],

    volumeThreshold: 5,

    rollingWindow: 60000,

    errorRateThreshold: 0.5,

    debug: false,
};

export class CircuitBreaker extends EventEmitter {

    constructor(name, options = {}) {
        super();

        this.name = name;
        this.options = { ...DEFAULT_OPTIONS, ...options };

        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.consecutiveSuccesses = 0;
        this.lastFailure = null;
        this.lastSuccess = null;
        this.nextAttempt = null;
        this.currentBackoff = this.options.resetTimeout;

        this.activeRequests = 0;
        this.requestQueue = [];

        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rejectedRequests: 0,
            timeouts: 0,
            lastRequestTime: null,
            averageResponseTime: 0,
            responseTimeSum: 0,
            stateChanges: [],
            errorTypes: new Map(),
        };

        this.requestHistory = [];

        this.fallbackFn = options.fallback || null;

        this.healthCheckFn = options.healthCheck || null;
        this.healthCheckInterval = null;

        this.debug = options.debug || false;

        this._log('debug', `Circuit breaker "${name}" initialized`, this.options);
    }

    async execute(fn, ...args) {
        this.stats.totalRequests++;
        this.stats.lastRequestTime = Date.now();

        if (!this._canExecute()) {
            return this._handleRejection();
        }

        if (this.activeRequests >= this.options.maxConcurrent) {
            return this._handleBulkheadFull();
        }

        this.activeRequests++;
        const startTime = Date.now();

        try {

            const result = await this._executeWithTimeout(fn, args);

            this._onSuccess(Date.now() - startTime);
            return result;

        } catch (error) {
            this._onFailure(error, Date.now() - startTime);

            if (this.fallbackFn) {
                return this._executeFallback(error, args);
            }

            throw error;

        } finally {
            this.activeRequests--;
            this._processQueue();
        }
    }

    async fire(fn) {
        return this.execute(fn);
    }

    wrap(fn) {
        return async (...args) => {
            return this.execute(() => fn(...args));
        };
    }

    _canExecute() {
        switch (this.state) {
            case CircuitState.CLOSED:
                return true;

            case CircuitState.OPEN:

                if (Date.now() >= this.nextAttempt) {
                    this._transitionTo(CircuitState.HALF_OPEN);
                    return true;
                }
                return false;

            case CircuitState.HALF_OPEN:

                return Math.random() < this.options.halfOpenRequestPercentage;

            default:
                return false;
        }
    }

    _onSuccess(responseTime) {
        this.successes++;
        this.consecutiveSuccesses++;
        this.lastSuccess = Date.now();
        this.stats.successfulRequests++;

        this.stats.responseTimeSum += responseTime;
        this.stats.averageResponseTime =
            this.stats.responseTimeSum / this.stats.successfulRequests;

        this._recordRequest(true);

        this._log('debug', `Success (${responseTime}ms)`, {
            state: this.state,
            consecutiveSuccesses: this.consecutiveSuccesses,
        });

        if (this.state === CircuitState.HALF_OPEN) {
            if (this.consecutiveSuccesses >= this.options.successThreshold) {
                this._transitionTo(CircuitState.CLOSED);
            }
        } else if (this.state === CircuitState.CLOSED) {

            this.failures = 0;
        }

        this.emit('success', { responseTime, state: this.state });
    }

    _onFailure(error, responseTime) {

        if (this._shouldIgnoreError(error)) {
            this._log('debug', 'Error ignored', { error: error.message });
            return;
        }

        this.failures++;
        this.consecutiveSuccesses = 0;
        this.lastFailure = Date.now();
        this.stats.failedRequests++;

        if (this.options.trackErrorTypes) {
            const errorType = error.name || 'Unknown';
            const count = this.stats.errorTypes.get(errorType) || 0;
            this.stats.errorTypes.set(errorType, count + 1);
        }

        this._recordRequest(false);

        this._log('debug', `Failure: ${error.message}`, {
            state: this.state,
            failures: this.failures,
        });

        if (this.state === CircuitState.HALF_OPEN) {

            this._transitionTo(CircuitState.OPEN);
        } else if (this.state === CircuitState.CLOSED) {

            if (this._shouldOpen()) {
                this._transitionTo(CircuitState.OPEN);
            }
        }

        this.emit('failure', { error, responseTime, state: this.state });
    }

    _shouldOpen() {

        const recentRequests = this._getRecentRequests();
        if (recentRequests.length < this.options.volumeThreshold) {
            return false;
        }

        if (this.options.errorRateThreshold > 0) {
            const errorRate = this._calculateErrorRate();
            if (errorRate >= this.options.errorRateThreshold) {
                return true;
            }
        }

        return this.failures >= this.options.failureThreshold;
    }

    _transitionTo(newState) {
        const oldState = this.state;

        if (oldState === newState) return;

        this.state = newState;

        this.stats.stateChanges.push({
            from: oldState,
            to: newState,
            timestamp: Date.now(),
        });

        if (this.stats.stateChanges.length > 100) {
            this.stats.stateChanges.shift();
        }

        switch (newState) {
            case CircuitState.OPEN:
                this._onOpen();
                break;
            case CircuitState.HALF_OPEN:
                this._onHalfOpen();
                break;
            case CircuitState.CLOSED:
                this._onClose();
                break;
        }

        this._log('info', `State: ${oldState} → ${newState}`);
        this.emit('stateChange', { from: oldState, to: newState });
    }

    _onOpen() {

        if (this.options.exponentialBackoff) {
            this.currentBackoff = Math.min(
                this.currentBackoff * this.options.backoffMultiplier,
                this.options.maxBackoff
            );
        } else {
            this.currentBackoff = this.options.resetTimeout;
        }

        this.nextAttempt = Date.now() + this.currentBackoff;

        this._log('warn', `Circuit OPEN. Next attempt in ${this.currentBackoff}ms`);
        this.emit('open', { nextAttempt: this.nextAttempt, backoff: this.currentBackoff });
    }

    _onHalfOpen() {
        this.consecutiveSuccesses = 0;

        this._log('info', 'Circuit HALF-OPEN. Testing recovery...');
        this.emit('halfOpen');
    }

    _onClose() {

        this.failures = 0;
        this.currentBackoff = this.options.resetTimeout;
        this.consecutiveSuccesses = 0;

        this._log('info', 'Circuit CLOSED. Normal operation resumed.');
        this.emit('close');
    }

    async _executeWithTimeout(fn, args) {
        if (!this.options.timeout) {
            return fn(...args);
        }

        return Promise.race([
            fn(...args),
            new Promise((_, reject) => {
                setTimeout(() => {
                    this.stats.timeouts++;
                    reject(new CircuitBreakerError('Operation timed out', 'TIMEOUT'));
                }, this.options.timeout);
            }),
        ]);
    }

    async _executeFallback(error, args) {
        try {
            this._log('debug', 'Executing fallback');
            const result = await this.fallbackFn(error, ...args);
            this.emit('fallback', { error, result });
            return result;
        } catch (fallbackError) {
            this._log('error', 'Fallback failed', fallbackError);
            this.emit('fallbackError', { originalError: error, fallbackError });
            throw error;
        }
    }

    async _handleRejection() {
        this.stats.rejectedRequests++;

        const error = new CircuitBreakerError(
            `Circuit "${this.name}" is OPEN`,
            'CIRCUIT_OPEN'
        );

        this._log('debug', 'Request rejected - circuit open');
        this.emit('rejected', { state: this.state, nextAttempt: this.nextAttempt });

        if (this.fallbackFn) {
            return this._executeFallback(error, []);
        }

        throw error;
    }

    async _handleBulkheadFull() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const index = this.requestQueue.findIndex(item => item.resolve === resolve);
                if (index !== -1) {
                    this.requestQueue.splice(index, 1);
                }
                reject(new CircuitBreakerError('Bulkhead capacity exceeded', 'BULKHEAD_FULL'));
            }, this.options.timeout);

            this.requestQueue.push({ resolve, reject, timeout });
        });
    }

    _processQueue() {
        if (this.requestQueue.length === 0) return;
        if (this.activeRequests >= this.options.maxConcurrent) return;

        const { resolve, timeout } = this.requestQueue.shift();
        clearTimeout(timeout);
        resolve();
    }

    _shouldIgnoreError(error) {

        if (this.options.ignoredErrors.length > 0) {
            for (const ignored of this.options.ignoredErrors) {
                if (typeof ignored === 'string' && error.name === ignored) {
                    return true;
                }
                if (typeof ignored === 'function' && error instanceof ignored) {
                    return true;
                }
                if (ignored instanceof RegExp && ignored.test(error.message)) {
                    return true;
                }
            }
        }

        if (this.options.countedErrors.length > 0) {
            for (const counted of this.options.countedErrors) {
                if (typeof counted === 'string' && error.name === counted) {
                    return false;
                }
                if (typeof counted === 'function' && error instanceof counted) {
                    return false;
                }
            }
            return true;
        }

        return false;
    }

    _recordRequest(success) {
        const now = Date.now();

        this.requestHistory.push({
            timestamp: now,
            success,
        });

        this._cleanRequestHistory();
    }

    _getRecentRequests() {
        this._cleanRequestHistory();
        return this.requestHistory;
    }

    _cleanRequestHistory() {
        const cutoff = Date.now() - this.options.rollingWindow;
        this.requestHistory = this.requestHistory.filter(r => r.timestamp > cutoff);
    }

    _calculateErrorRate() {
        const requests = this._getRecentRequests();
        if (requests.length === 0) return 0;

        const failures = requests.filter(r => !r.success).length;
        return failures / requests.length;
    }

    setHealthCheck(fn, interval = 30000) {
        this.healthCheckFn = fn;

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            if (this.state === CircuitState.OPEN) {
                try {
                    await this.healthCheckFn();
                    this._log('info', 'Health check passed');
                    this._transitionTo(CircuitState.HALF_OPEN);
                } catch (error) {
                    this._log('debug', 'Health check failed', error.message);
                }
            }
        }, interval);

        this._log('debug', `Health check enabled (${interval}ms interval)`);
    }

    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    async checkHealth() {
        if (!this.healthCheckFn) {
            return this.state === CircuitState.CLOSED;
        }

        try {
            await this.healthCheckFn();
            return true;
        } catch {
            return false;
        }
    }

    open() {
        this._transitionTo(CircuitState.OPEN);
    }

    close() {
        this._transitionTo(CircuitState.CLOSED);
    }

    halfOpen() {
        this._transitionTo(CircuitState.HALF_OPEN);
    }

    reset() {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.consecutiveSuccesses = 0;
        this.lastFailure = null;
        this.lastSuccess = null;
        this.nextAttempt = null;
        this.currentBackoff = this.options.resetTimeout;
        this.requestHistory = [];

        this._log('info', 'Circuit breaker reset');
        this.emit('reset');
    }

    getState() {
        return this.state;
    }

    isOpen() {
        return this.state === CircuitState.OPEN;
    }

    isClosed() {
        return this.state === CircuitState.CLOSED;
    }

    isHalfOpen() {
        return this.state === CircuitState.HALF_OPEN;
    }

    getStats() {
        const errorRate = this._calculateErrorRate();

        return {
            name: this.name,
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            consecutiveSuccesses: this.consecutiveSuccesses,
            lastFailure: this.lastFailure,
            lastSuccess: this.lastSuccess,
            nextAttempt: this.nextAttempt,
            currentBackoff: this.currentBackoff,
            activeRequests: this.activeRequests,
            queuedRequests: this.requestQueue.length,
            errorRate: (errorRate * 100).toFixed(2) + '%',
            ...this.stats,
            errorTypes: Object.fromEntries(this.stats.errorTypes),
            recentStateChanges: this.stats.stateChanges.slice(-10),
        };
    }

    getTimeUntilNextAttempt() {
        if (this.state !== CircuitState.OPEN || !this.nextAttempt) {
            return null;
        }
        return Math.max(0, this.nextAttempt - Date.now());
    }

    _log(level, message, data = null) {
        if (!this.debug && level === 'debug') return;

        const prefix = `[CircuitBreaker:${this.name}]`;

        if (log && log[level]) {
            if (data) {
                log[level](`${prefix} ${message}`, data);
            } else {
                log[level](`${prefix} ${message}`);
            }
        }
    }

    destroy() {
        this.stopHealthCheck();
        this.removeAllListeners();
        this.requestQueue = [];
        this._log('info', 'Circuit breaker destroyed');
    }
}

export class CircuitBreakerError extends Error {
    constructor(message, code = 'CIRCUIT_ERROR') {
        super(message);
        this.name = 'CircuitBreakerError';
        this.code = code;
        this.timestamp = Date.now();
    }
}

class CircuitBreakerRegistry {
    constructor() {
        this.breakers = new Map();
    }

    get(name, options = {}) {
        if (!this.breakers.has(name)) {
            this.breakers.set(name, new CircuitBreaker(name, options));
        }
        return this.breakers.get(name);
    }

    create(name, options = {}) {
        const breaker = new CircuitBreaker(name, options);
        this.breakers.set(name, breaker);
        return breaker;
    }

    has(name) {
        return this.breakers.has(name);
    }

    remove(name) {
        const breaker = this.breakers.get(name);
        if (breaker) {
            breaker.destroy();
            this.breakers.delete(name);
        }
    }

    getAll() {
        return this.breakers;
    }

    getAllStats() {
        const stats = {};
        for (const [name, breaker] of this.breakers) {
            stats[name] = breaker.getStats();
        }
        return stats;
    }

    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }

    destroyAll() {
        for (const breaker of this.breakers.values()) {
            breaker.destroy();
        }
        this.breakers.clear();
    }
}

export async function retry(fn, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 30000,
        multiplier = 2,
        jitter = true,
        retryOn = () => true,
        onRetry = () => { },
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries || !retryOn(error, attempt)) {
                throw error;
            }

            let waitTime = Math.min(delay, maxDelay);
            if (jitter) {
                waitTime = waitTime * (0.5 + Math.random());
            }

            onRetry(error, attempt, waitTime);

            await new Promise(resolve => setTimeout(resolve, waitTime));
            delay *= multiplier;
        }
    }

    throw lastError;
}

const registry = new CircuitBreakerRegistry();

export const breakers = {

    external: registry.create('external', {
        failureThreshold: 5,
        resetTimeout: 30000,
        timeout: 15000,
        maxConcurrent: 10,
    }),

    database: registry.create('database', {
        failureThreshold: 3,
        resetTimeout: 10000,
        timeout: 5000,
        maxConcurrent: 20,
    }),

    whatsapp: registry.create('whatsapp', {
        failureThreshold: 5,
        resetTimeout: 60000,
        timeout: 30000,
        maxConcurrent: 5,
        exponentialBackoff: true,
        maxBackoff: 300000,
    }),

    media: registry.create('media', {
        failureThreshold: 3,
        resetTimeout: 30000,
        timeout: 60000,
        maxConcurrent: 3,
    }),

    ai: registry.create('ai', {
        failureThreshold: 3,
        resetTimeout: 60000,
        timeout: 120000,
        maxConcurrent: 2,
    }),
};

export { registry };

export default {
    CircuitBreaker,
    CircuitBreakerError,
    CircuitBreakerRegistry,
    CircuitState,
    registry,
    breakers,
    retry,
};
