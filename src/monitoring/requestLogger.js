import { log } from '../utils/logger.js';

const eventLog = [];
const MAX_LOG_SIZE = 1000;

export function logSystemEvent(eventType, data = {}) {
    eventLog.push({ type: eventType, timestamp: new Date().toISOString(), data });
    if (eventLog.length > MAX_LOG_SIZE) eventLog.shift();
    if (process.env.LOG_LEVEL === 'debug') log.debug(`Event: ${eventType}`, data);
}

export function logRequest(requestData) {
    const { method, path, statusCode, duration } = requestData;
    if (process.env.NODE_ENV === 'production' && ['/health', '/live', '/ready'].includes(path)) return;
    if (statusCode >= 500) log.error(`${method} ${path} ${statusCode} ${duration}ms`);
    else if (statusCode >= 400) log.warn(`${method} ${path} ${statusCode} ${duration}ms`);
}

export function getRecentEvents(count = 100) { return eventLog.slice(-count); }
export function getEventsByType(type, count = 50) { return eventLog.filter(e => e.type === type).slice(-count); }
export function clearEventLog() { eventLog.length = 0; }

export default { logSystemEvent, logRequest, getRecentEvents, getEventsByType, clearEventLog };
