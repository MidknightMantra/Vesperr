import config from '../config.js';
import { log } from '../utils/logger.js';

let Sentry = null, isInitialized = false;

export function initSentry() {
    if (!config.sentryDsn) return false;
    try {
        import('@sentry/node').then((mod) => {
            Sentry = mod;
            Sentry.init({ dsn: config.sentryDsn, environment: config.nodeEnv, release: 'vesperr@2.1.0' });
            isInitialized = true;
            log.success('Sentry initialized');
        }).catch(() => { });
        return true;
    } catch { return false; }
}

export function captureException(error, context = {}) {
    if (isInitialized && Sentry) return Sentry.captureException(error, { extra: context });
    return null;
}

export function captureMessage(message, level = 'info') {
    if (isInitialized && Sentry) return Sentry.captureMessage(message, level);
    return null;
}

export default { initSentry, captureException, captureMessage };
