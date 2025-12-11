import { log } from '../utils/logger.js';

const metrics = { startTime: Date.now(), messageCount: 0, commandCount: 0, errorCount: 0, peakMemory: 0 };
let memoryInterval = null, metricsInterval = null;

export function startMemoryMonitoring(intervalMs = 60000) {
    if (memoryInterval) clearInterval(memoryInterval);
    memoryInterval = setInterval(() => {
        const usage = process.memoryUsage();
        if (usage.heapUsed > metrics.peakMemory) metrics.peakMemory = usage.heapUsed;
        if (usage.heapUsed / usage.heapTotal > 0.85) log.warn('High memory usage');
    }, intervalMs);
}

export function startMetricsLogging(intervalMs = 300000) {
    if (metricsInterval) clearInterval(metricsInterval);
    metricsInterval = setInterval(() => {
        if (process.env.NODE_ENV !== 'production') {
            const stats = getMetrics();
            log.debug('Metrics', { uptime: stats.uptimeFormatted, messages: stats.messageCount });
        }
    }, intervalMs);
}

export function stopMonitoring() {
    if (memoryInterval) { clearInterval(memoryInterval); memoryInterval = null; }
    if (metricsInterval) { clearInterval(metricsInterval); metricsInterval = null; }
}

export function getMetrics() {
    const uptime = Date.now() - metrics.startTime;
    const formatUptime = (ms) => {
        const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
        if (d > 0) return `${d}d ${h % 24}h`;
        if (h > 0) return `${h}h ${m % 60}m`;
        return `${m}m ${s % 60}s`;
    };
    return { uptime, uptimeFormatted: formatUptime(uptime), ...metrics, memoryUsage: process.memoryUsage() };
}

export function incrementMessages() { metrics.messageCount++; }
export function incrementCommands() { metrics.commandCount++; }
export function incrementErrors() { metrics.errorCount++; }

export default { startMemoryMonitoring, startMetricsLogging, stopMonitoring, getMetrics };
