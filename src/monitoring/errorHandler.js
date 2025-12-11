import { log } from '../utils/logger.js';
import { captureException } from './sentry.js';

export function setupGlobalErrorHandlers() {
    log.debug('Global error handlers ready');
}

export function withErrorHandling(fn, context = {}) {
    return async (...args) => {
        try { return await fn(...args); } catch (error) {
            log.error(`Error in ${context.name || 'unknown'}: ${error.message}`);
            captureException(error, context);
            throw error;
        }
    };
}

export async function safeAsync(fn, fallback = null) {
    try { return await fn(); } catch { return fallback; }
}

export async function retryAsync(fn, options = {}) {
    const { maxRetries = 3, initialDelay = 1000, maxDelay = 30000, backoffFactor = 2 } = options;
    let lastError, delay = initialDelay;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try { return await fn(); } catch (error) {
            lastError = error;
            if (attempt === maxRetries) throw error;
            await new Promise(r => setTimeout(r, delay));
            delay = Math.min(delay * backoffFactor, maxDelay);
        }
    }
    throw lastError;
}

export default { setupGlobalErrorHandlers, withErrorHandling, safeAsync, retryAsync };
