import { promises as fs } from 'fs';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto';
import axios from 'axios';
import config from './config.js';
import { log } from './utils/logger.js';

const FETCH_CONFIG = {
    retries: 3,
    timeout: 30000,
    backoffBase: 2000,
    backoffMax: 30000,
};

const SESSION_SOURCES = {
    pastebin: {
        name: 'Pastebin',
        baseUrl: 'https://pastebin.com/raw/',
        enabled: true,
    },
    rentry: {
        name: 'Rentry',
        baseUrl: 'https://rentry.co/raw/',
        enabled: true,
    },
    github: {
        name: 'GitHub Gist',
        baseUrl: 'https://gist.githubusercontent.com/',
        enabled: true,
    },
    telegraph: {
        name: 'Telegraph',
        baseUrl: 'https://telegra.ph/',
        enabled: true,
    },
    custom: {
        name: 'Custom URL',
        baseUrl: '',
        enabled: true,
    }
};

const ENCRYPTION_CONFIG = {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 16,
    saltLength: 32,
    tagLength: 16,
    iterations: 100000,
};

const SESSION_FILES = {
    creds: 'creds.json',
    appState: 'app-state-sync-key-*.json',
    preKeys: 'pre-key-*.json',
    senderKeys: 'sender-key-*.json',
    sessions: 'session-*.json',
};

class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 30000;
        this.state = 'CLOSED';
        this.failures = 0;
        this.lastFailure = null;
        this.nextAttempt = null;
    }

    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error('Circuit breaker is OPEN');
            }
            this.state = 'HALF-OPEN';
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (err) {
            this.onFailure();
            throw err;
        }
    }

    onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }

    onFailure() {
        this.failures++;
        this.lastFailure = Date.now();

        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.resetTimeout;
            log.warn(`Circuit breaker opened, will retry after ${this.resetTimeout}ms`);
        }
    }

    reset() {
        this.failures = 0;
        this.state = 'CLOSED';
        this.lastFailure = null;
        this.nextAttempt = null;
    }
}

const circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 60000,
});

class SessionEncryption {
    constructor(password) {
        this.password = password;
    }

    encrypt(data) {
        const salt = randomBytes(ENCRYPTION_CONFIG.saltLength);
        const iv = randomBytes(ENCRYPTION_CONFIG.ivLength);
        const key = scryptSync(this.password, salt, ENCRYPTION_CONFIG.keyLength, {
            N: ENCRYPTION_CONFIG.iterations
        });

        const cipher = createCipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
        const jsonData = typeof data === 'string' ? data : JSON.stringify(data);

        let encrypted = cipher.update(jsonData, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        const combined = Buffer.concat([
            salt,
            iv,
            authTag,
            Buffer.from(encrypted, 'hex')
        ]);

        return combined.toString('base64');
    }

    decrypt(encryptedData) {
        const combined = Buffer.from(encryptedData, 'base64');

        const salt = combined.subarray(0, ENCRYPTION_CONFIG.saltLength);
        const iv = combined.subarray(
            ENCRYPTION_CONFIG.saltLength,
            ENCRYPTION_CONFIG.saltLength + ENCRYPTION_CONFIG.ivLength
        );
        const authTag = combined.subarray(
            ENCRYPTION_CONFIG.saltLength + ENCRYPTION_CONFIG.ivLength,
            ENCRYPTION_CONFIG.saltLength + ENCRYPTION_CONFIG.ivLength + ENCRYPTION_CONFIG.tagLength
        );
        const encrypted = combined.subarray(
            ENCRYPTION_CONFIG.saltLength + ENCRYPTION_CONFIG.ivLength + ENCRYPTION_CONFIG.tagLength
        );

        const key = scryptSync(this.password, salt, ENCRYPTION_CONFIG.keyLength, {
            N: ENCRYPTION_CONFIG.iterations
        });

        const decipher = createDecipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return JSON.parse(decrypted.toString('utf8'));
    }

    static isEncrypted(data) {
        if (typeof data !== 'string') return false;

        try {
            const decoded = Buffer.from(data, 'base64');
            const minLength = ENCRYPTION_CONFIG.saltLength +
                ENCRYPTION_CONFIG.ivLength +
                ENCRYPTION_CONFIG.tagLength + 1;
            return decoded.length >= minLength && data === decoded.toString('base64');
        } catch {
            return false;
        }
    }
}

class SessionManager {
    constructor(options = {}) {
        this.sessionDir = options.sessionDir || config.sessionDir || './session';
        this.encryptionKey = options.encryptionKey || config.sessionEncryptionKey || null;
        this.encryption = this.encryptionKey ? new SessionEncryption(this.encryptionKey) : null;
        this.backupEnabled = options.backup !== false;
        this.backupInterval = options.backupInterval || 3600000;
        this.backupTimer = null;
        this.sessionId = options.sessionId || config.sessionId || this.generateSessionId();
    }

    generateSessionId() {
        return createHash('sha256')
            .update(`${Date.now()}-${randomBytes(8).toString('hex')}`)
            .digest('hex')
            .substring(0, 16);
    }

    async init() {
        await this.ensureSessionDir();

        if (await this.hasLocalSession()) {
            log.info('Found existing local session');
            return { success: true, source: 'local' };
        }

        const remoteResult = await this.restoreFromRemote();
        if (remoteResult.success) {
            return remoteResult;
        }

        log.info('No session found. QR code will be displayed.');
        return { success: false, source: null };
    }

    async ensureSessionDir() {
        if (!existsSync(this.sessionDir)) {
            mkdirSync(this.sessionDir, { recursive: true });
            log.debug(`Created session directory: ${this.sessionDir}`);
        }
    }

    async hasLocalSession() {
        const credsPath = join(this.sessionDir, SESSION_FILES.creds);
        try {
            await fs.access(credsPath);
            const stats = await fs.stat(credsPath);

            if (stats.size < 10) return false;

            const content = await fs.readFile(credsPath, 'utf8');
            const parsed = JSON.parse(content);

            return this.validateCredsStructure(parsed);
        } catch {
            return false;
        }
    }

    async restoreFromRemote() {
        const sources = this.getConfiguredSources();

        if (sources.length === 0) {
            log.debug('No remote session sources configured');
            return { success: false, source: null };
        }

        for (const source of sources) {
            try {
                log.info(`Attempting to restore session from ${source.name}...`);
                const result = await this.fetchFromSource(source);

                if (result.success) {
                    await this.saveSession(result.data);
                    log.success(`Session restored from ${source.name}`);
                    return { success: true, source: source.name };
                }
            } catch (err) {
                log.warn(`Failed to restore from ${source.name}: ${err.message}`);
            }
        }

        return { success: false, source: null };
    }

    getConfiguredSources() {
        const sources = [];

        if (config.pastebinCode) {
            sources.push({
                name: SESSION_SOURCES.pastebin.name,
                url: `${SESSION_SOURCES.pastebin.baseUrl}${config.pastebinCode}`,
                priority: 1,
            });
        }

        if (config.rentryCode) {
            sources.push({
                name: SESSION_SOURCES.rentry.name,
                url: `${SESSION_SOURCES.rentry.baseUrl}${config.rentryCode}`,
                priority: 2,
            });
        }

        if (config.gistUrl) {
            sources.push({
                name: SESSION_SOURCES.github.name,
                url: config.gistUrl,
                priority: 3,
            });
        }

        if (config.telegraphCode) {
            sources.push({
                name: SESSION_SOURCES.telegraph.name,
                url: `${SESSION_SOURCES.telegraph.baseUrl}${config.telegraphCode}`,
                priority: 4,
            });
        }

        if (config.sessionUrl) {
            sources.push({
                name: SESSION_SOURCES.custom.name,
                url: config.sessionUrl,
                priority: 5,
            });
        }

        return sources.sort((a, b) => a.priority - b.priority);
    }

    async fetchFromSource(source) {
        let lastError;

        for (let attempt = 1; attempt <= FETCH_CONFIG.retries; attempt++) {
            try {
                const data = await circuitBreaker.execute(async () => {
                    const response = await axios.get(source.url, {
                        timeout: FETCH_CONFIG.timeout,
                        headers: {
                            'User-Agent': 'WhatsApp-Session-Manager/1.0',
                            'Accept': 'application/json, text/plain, *
    async parseSessionData(data) {

        if (typeof data === 'object' && data !== null) {
            return data;
        }

        if (typeof data !== 'string') {
            throw new Error('Invalid data type');
        }

        const trimmed = data.trim();

        if (this.encryption && SessionEncryption.isEncrypted(trimmed)) {
            try {
                return this.encryption.decrypt(trimmed);
            } catch (err) {
                log.warn('Failed to decrypt session data, trying other formats...');
            }
        }

        try {
            return JSON.parse(trimmed);
        } catch {

        }

        try {
            const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
            return JSON.parse(decoded);
        } catch {

        }

        if (this.encryption) {
            try {
                const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
                if (SessionEncryption.isEncrypted(decoded)) {
                    return this.encryption.decrypt(decoded);
                }
            } catch {

            }
        }

        const jsonMatch = trimmed.match(/<code[^>]*>([\s\S]*?)<\/code>/i) ||
            trimmed.match(/{[\s\S]*"creds"[\s\S]*}/);
        if (jsonMatch) {
            try {
                const cleaned = jsonMatch[1] || jsonMatch[0];
                return JSON.parse(cleaned.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
            } catch {

            }
        }

        throw new Error('Unable to parse session data');
    }

    validateCredsStructure(creds) {
        if (!creds || typeof creds !== 'object') return false;

        const requiredFields = [
            'noiseKey',
            'signedIdentityKey',
            'signedPreKey',
            'registrationId',
        ];

        const hasRequired = requiredFields.every(field => {
            const value = creds[field];
            return value !== undefined && value !== null;
        });

        if (!hasRequired) {
            log.debug('Session missing required fields');
            return false;
        }

        try {

            if (creds.noiseKey) {
                if (!creds.noiseKey.private || !creds.noiseKey.public) {
                    return false;
                }
            }

            if (creds.signedIdentityKey) {
                if (!creds.signedIdentityKey.private || !creds.signedIdentityKey.public) {
                    return false;
                }
            }

            return true;
        } catch {
            return false;
        }
    }

    async saveSession(data) {
        const creds = data.creds || data;
        const credsPath = join(this.sessionDir, SESSION_FILES.creds);

        await fs.writeFile(
            credsPath,
            JSON.stringify(creds, null, 2),
            'utf8'
        );

        if (data.keys) {
            await this.saveSessionKeys(data.keys);
        }

        log.debug('Session saved to disk');
    }

    async saveSessionKeys(keys) {
        for (const [category, items] of Object.entries(keys)) {
            if (!items || typeof items !== 'object') continue;

            for (const [id, value] of Object.entries(items)) {
                const filename = `${category}-${id}.json`;
                const filepath = join(this.sessionDir, filename);

                try {
                    await fs.writeFile(
                        filepath,
                        JSON.stringify(value, null, 2),
                        'utf8'
                    );
                } catch (err) {
                    log.warn(`Failed to save ${filename}: ${err.message}`);
                }
            }
        }
    }

    async exportSession(options = {}) {
        const credsPath = join(this.sessionDir, SESSION_FILES.creds);

        try {
            const creds = JSON.parse(await fs.readFile(credsPath, 'utf8'));

            const sessionData = { creds, keys: {} };

            const files = await fs.readdir(this.sessionDir);
            for (const file of files) {
                if (file === SESSION_FILES.creds) continue;
                if (!file.endsWith('.json')) continue;

                try {
                    const content = JSON.parse(
                        await fs.readFile(join(this.sessionDir, file), 'utf8')
                    );

                    const match = file.match(/^(.+)-(.+)\.json$/);
                    if (match) {
                        const [, category, id] = match;
                        if (!sessionData.keys[category]) {
                            sessionData.keys[category] = {};
                        }
                        sessionData.keys[category][id] = content;
                    }
                } catch {

                }
            }

            if (options.encrypt && this.encryption) {
                return this.encryption.encrypt(sessionData);
            }

            if (options.base64) {
                return Buffer.from(JSON.stringify(sessionData)).toString('base64');
            }

            return sessionData;
        } catch (err) {
            throw new Error(`Failed to export session: ${err.message}`);
        }
    }

    async createBackup() {
        const backupDir = join(this.sessionDir, 'backups');

        if (!existsSync(backupDir)) {
            mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = join(backupDir, `session-${timestamp}.json`);

        try {
            const sessionData = await this.exportSession({ encrypt: !!this.encryption });

            await fs.writeFile(
                backupPath,
                typeof sessionData === 'string'
                    ? sessionData
                    : JSON.stringify(sessionData, null, 2),
                'utf8'
            );

            await this.cleanOldBackups(backupDir, 5);

            log.debug(`Session backup created: ${backupPath}`);
            return backupPath;
        } catch (err) {
            log.warn(`Failed to create backup: ${err.message}`);
            return null;
        }
    }

    async cleanOldBackups(backupDir, keepCount) {
        try {
            const files = await fs.readdir(backupDir);
            const backups = files
                .filter(f => f.startsWith('session-') && f.endsWith('.json'))
                .sort()
                .reverse();

            for (let i = keepCount; i < backups.length; i++) {
                await fs.unlink(join(backupDir, backups[i]));
                log.debug(`Removed old backup: ${backups[i]}`);
            }
        } catch (err) {
            log.warn(`Failed to clean backups: ${err.message}`);
        }
    }

    async restoreFromBackup(backupFile = null) {
        const backupDir = join(this.sessionDir, 'backups');

        try {
            let backupPath;

            if (backupFile) {
                backupPath = backupFile.includes('/')
                    ? backupFile
                    : join(backupDir, backupFile);
            } else {

                const files = await fs.readdir(backupDir);
                const backups = files
                    .filter(f => f.startsWith('session-') && f.endsWith('.json'))
                    .sort()
                    .reverse();

                if (backups.length === 0) {
                    throw new Error('No backups found');
                }

                backupPath = join(backupDir, backups[0]);
            }

            const content = await fs.readFile(backupPath, 'utf8');
            const parsed = await this.parseSessionData(content);

            await this.saveSession(parsed);
            log.success(`Session restored from backup: ${backupPath}`);

            return true;
        } catch (err) {
            throw new Error(`Failed to restore from backup: ${err.message}`);
        }
    }

    startAutoBackup() {
        if (!this.backupEnabled) return;
        if (this.backupTimer) return;

        this.backupTimer = setInterval(async () => {
            await this.createBackup();
        }, this.backupInterval);

        log.debug(`Auto-backup enabled (every ${this.backupInterval / 60000} minutes)`);
    }

    stopAutoBackup() {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
            this.backupTimer = null;
            log.debug('Auto-backup disabled');
        }
    }

    async clearSession() {
        try {
            const files = await fs.readdir(this.sessionDir);

            for (const file of files) {
                if (file === 'backups') continue;

                const filepath = join(this.sessionDir, file);
                const stat = await fs.stat(filepath);

                if (stat.isFile()) {
                    await fs.unlink(filepath);
                }
            }

            log.info('Session cleared');
            return true;
        } catch (err) {
            throw new Error(`Failed to clear session: ${err.message}`);
        }
    }

    async getSessionInfo() {
        const credsPath = join(this.sessionDir, SESSION_FILES.creds);

        try {
            const stats = await fs.stat(credsPath);
            const creds = JSON.parse(await fs.readFile(credsPath, 'utf8'));

            return {
                exists: true,
                sessionId: this.sessionId,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                size: stats.size,
                me: creds.me || null,
                platform: creds.platform || 'unknown',
                hasKeys: !!creds.noiseKey,
            };
        } catch {
            return {
                exists: false,
                sessionId: this.sessionId,
            };
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

const sessionManager = new SessionManager();

export async function initSession() {
    const result = await sessionManager.init();

    if (result.success) {

        sessionManager.startAutoBackup();
    }

    return result.success;
}

export async function exportSession(options = {}) {
    return sessionManager.exportSession(options);
}

export async function createBackup() {
    return sessionManager.createBackup();
}

export async function restoreFromBackup(backupFile = null) {
    return sessionManager.restoreFromBackup(backupFile);
}

export async function clearSession() {
    return sessionManager.clearSession();
}

export async function getSessionInfo() {
    return sessionManager.getSessionInfo();
}

export { SessionManager, SessionEncryption };
export default sessionManager;
