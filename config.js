import { config as dotenvConfig } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

dotenvConfig();

const env = (key, defaultValue = undefined) => {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    return value;
};

const envArray = (key, defaultValue = []) => {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.split(',').map(s => s.trim()).filter(Boolean);
};

const config = {

    botName: env('BOT_NAME', 'Vesperr'),
    botNumber: env('BOT_NUMBER', ''),
    version: env('BOT_VERSION', '2.0.0'),

    prefix: env('PREFIX', '.'),
    altPrefixes: envArray('ALT_PREFIXES', ['/', '!']),
    caseSensitive: env('CASE_SENSITIVE', false),

    owners: envArray('OWNERS', []),
    admins: envArray('ADMINS', []),
    premiumUsers: envArray('PREMIUM_USERS', []),
    bannedUsers: envArray('BANNED_USERS', []),

    sessionDir: env('SESSION_DIR', './session'),
    sessionId: env('SESSION_ID', ''),
    sessionEncryptionKey: env('SESSION_ENCRYPTION_KEY', ''),

    pastebinCode: env('PASTEBIN_CODE', ''),
    rentryCode: env('RENTRY_CODE', ''),
    gistUrl: env('GIST_URL', ''),
    telegraphCode: env('TELEGRAPH_CODE', ''),
    sessionUrl: env('SESSION_URL', ''),

    autoBackup: env('AUTO_BACKUP', true),
    backupInterval: env('BACKUP_INTERVAL', 3600000),
    maxBackups: env('MAX_BACKUPS', 5),

    respondInGroups: env('RESPOND_IN_GROUPS', true),
    respondInPrivate: env('RESPOND_IN_PRIVATE', true),
    respondInChannels: env('RESPOND_IN_CHANNELS', false),
    ownerOnly: env('OWNER_ONLY', false),
    selfOnly: env('SELF_ONLY', false),

    unknownCommandReply: env('UNKNOWN_COMMAND_REPLY', false),
    unknownCommandMessage: env('UNKNOWN_COMMAND_MESSAGE', '❓ Unknown command. Use .help'),

    errorMessage: env('ERROR_MESSAGE', '❌ An error occurred. Please try again.'),

    antiSpam: {
        enabled: env('ANTI_SPAM', true),
        maxMessages: env('SPAM_MAX_MESSAGES', 10),
        window: env('SPAM_WINDOW', 10000),
        banDuration: env('SPAM_BAN_DURATION', 300000),
    },

    globalRateLimit: {
        messagesPerMinute: env('RATE_LIMIT_PER_MINUTE', 30),
        messagesPerDay: env('RATE_LIMIT_PER_DAY', 1000),
    },

    defaultCooldown: env('DEFAULT_COOLDOWN', 3000),

    welcomeMessage: env('WELCOME_MESSAGE', ''),
    goodbyeMessage: env('GOODBYE_MESSAGE', ''),
    promoteMessage: env('PROMOTE_MESSAGE', ''),
    demoteMessage: env('DEMOTE_MESSAGE', ''),
    welcomeWithRules: env('WELCOME_WITH_RULES', false),

    antiLink: env('ANTI_LINK', false),
    antiLinkAction: env('ANTI_LINK_ACTION', 'warn'),
    antiBadWords: env('ANTI_BAD_WORDS', false),
    badWords: envArray('BAD_WORDS', []),
    antiViewOnce: env('ANTI_VIEW_ONCE', false),
    antiDelete: env('ANTI_DELETE', false),

    rejectCalls: env('REJECT_CALLS', false),
    callRejectMessage: env('CALL_REJECT_MESSAGE', '📵 Sorry, I cannot receive calls.'),

    presence: env('PRESENCE', 'available'),
    autoReadMessages: env('AUTO_READ', false),
    autoReadStatus: env('AUTO_READ_STATUS', false),
    autoTyping: env('AUTO_TYPING', true),
    typingDuration: env('TYPING_DURATION', 1500),
    levelingEnabled: env('LEVELING_ENABLED', false),

    database: {
        type: env('DB_TYPE', 'json'),
        uri: env('DATABASE_URL', ''),
        name: env('DB_NAME', 'whatsapp_bot'),
        dataDir: env('DATA_DIR', './data'),
    },

    apis: {
        openai: env('OPENAI_API_KEY', ''),
        gemini: env('GEMINI_API_KEY', ''),
        removeBg: env('REMOVE_BG_KEY', ''),
        weather: env('WEATHER_API_KEY', ''),
        spotify: {
            clientId: env('SPOTIFY_CLIENT_ID', ''),
            clientSecret: env('SPOTIFY_CLIENT_SECRET', ''),
        },
        firebase: {
            projectId: env('FIREBASE_PROJECT_ID', ''),
            privateKey: env('FIREBASE_PRIVATE_KEY', ''),
            clientEmail: env('FIREBASE_CLIENT_EMAIL', ''),
        },
    },

    media: {
        maxFileSize: env('MAX_FILE_SIZE', 100 * 1024 * 1024),
        maxImageSize: env('MAX_IMAGE_SIZE', 10 * 1024 * 1024),
        maxVideoSize: env('MAX_VIDEO_SIZE', 50 * 1024 * 1024),
        maxAudioSize: env('MAX_AUDIO_SIZE', 16 * 1024 * 1024),
        stickerAuthor: env('STICKER_AUTHOR', 'Bot'),
        stickerPack: env('STICKER_PACK', 'Vesperr'),
        tempDir: env('TEMP_DIR', './temp'),
    },

    debug: env('DEBUG', false),
    logLevel: env('LOG_LEVEL', 'info'),
    logToFile: env('LOG_TO_FILE', true),
    logDir: env('LOG_DIR', './logs'),
    logMaxFiles: env('LOG_MAX_FILES', 7),

    connection: {
        printQR: env('PRINT_QR', true),
        pairingCode: env('PAIRING_CODE', false),
        phoneNumber: env('PHONE_NUMBER', ''),
        browser: envArray('BROWSER', ['Vesperr', 'Chrome', '120.0.0']),
        syncFullHistory: env('SYNC_FULL_HISTORY', false),
        markOnlineOnConnect: env('MARK_ONLINE', true),
        retryOnDisconnect: env('RETRY_ON_DISCONNECT', true),
        maxRetries: env('MAX_RETRIES', 10),
        retryDelay: env('RETRY_DELAY', 5000),
    },

    plugins: {
        dir: env('PLUGINS_DIR', './plugins'),
        hotReload: env('HOT_RELOAD', true),
        hotReloadInterval: env('HOT_RELOAD_INTERVAL', 1000),
        disabled: envArray('DISABLED_PLUGINS', []),
        enabled: envArray('ENABLED_PLUGINS', []),
    },

    isOwner(jid) {
        if (!jid) return false;
        const normalized = this.normalizeJid(jid);

        if (this.botNumber) {
            const botNormalized = this.normalizeJid(this.botNumber);
            if (botNormalized && normalized === botNormalized) return true;
        }

        return this.owners.some(owner => this.normalizeJid(owner) === normalized);
    },

    isAdmin(jid) {
        if (!jid) return false;
        if (this.isOwner(jid)) return true;
        const normalized = this.normalizeJid(jid);
        return this.admins.some(admin => this.normalizeJid(admin) === normalized);
    },

    isPremium(jid) {
        if (!jid) return false;
        if (this.isOwner(jid)) return true;
        const normalized = this.normalizeJid(jid);
        return this.premiumUsers.some(user => this.normalizeJid(user) === normalized);
    },

    isBanned(jid) {
        if (!jid) return false;
        const normalized = this.normalizeJid(jid);
        return this.bannedUsers.some(user => this.normalizeJid(user) === normalized);
    },

    normalizeJid(jid) {
        if (!jid) return '';

        let normalized = jid.split(':')[0].split('@')[0];

        normalized = normalized.replace(/\D/g, '');
        return normalized;
    },

    shouldRespond(isGroup, isOwner, isChannel = false) {

        if (isOwner) return true;

        if (this.ownerOnly) return false;

        if (isChannel) return this.respondInChannels;

        if (isGroup) return this.respondInGroups;
        return this.respondInPrivate;
    },

    getAllPrefixes() {
        return [this.prefix, ...this.altPrefixes].filter(Boolean);
    },

    hasPrefix(text) {
        if (!text) return false;
        return this.getAllPrefixes().some(p => text.startsWith(p));
    },

    getUsedPrefix(text) {
        if (!text) return null;
        return this.getAllPrefixes().find(p => text.startsWith(p)) || null;
    },

    addToList(list, jid) {
        const normalized = this.normalizeJid(jid);
        if (!this[list].includes(normalized)) {
            this[list].push(normalized);
            this.save();
            return true;
        }
        return false;
    },

    removeFromList(list, jid) {
        const normalized = this.normalizeJid(jid);
        const index = this[list].findIndex(u => this.normalizeJid(u) === normalized);
        if (index > -1) {
            this[list].splice(index, 1);
            this.save();
            return true;
        }
        return false;
    },

    save() {
        const runtimeConfig = {
            owners: this.owners,
            admins: this.admins,
            premiumUsers: this.premiumUsers,
            bannedUsers: this.bannedUsers,
            antiSpam: this.antiSpam,
            levelingEnabled: this.levelingEnabled,
            plugins: {
                disabled: this.plugins.disabled,
            },
        };

        try {
            const configPath = join(this.database.dataDir, 'runtime-config.json');
            writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2));
        } catch (err) {
            console.error('Failed to save runtime config:', err.message);
        }
    },

    load() {
        try {
            const configPath = join(this.database.dataDir, 'runtime-config.json');
            if (existsSync(configPath)) {
                const saved = JSON.parse(readFileSync(configPath, 'utf8'));

                if (saved.owners) this.owners = [...new Set([...this.owners, ...saved.owners])];
                if (saved.admins) this.admins = [...new Set([...this.admins, ...saved.admins])];
                if (saved.premiumUsers) this.premiumUsers = [...new Set([...this.premiumUsers, ...saved.premiumUsers])];
                if (saved.bannedUsers) this.bannedUsers = saved.bannedUsers;
                if (saved.antiSpam) Object.assign(this.antiSpam, saved.antiSpam);
                if (saved.levelingEnabled !== undefined) this.levelingEnabled = saved.levelingEnabled;
                if (saved.plugins?.disabled) this.plugins.disabled = saved.plugins.disabled;
            }
        } catch (err) {
            console.error('Failed to load runtime config:', err.message);
        }
    },

    get(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this);
    },

    set(path, value) {
        const keys = path.split('.');
        const last = keys.pop();
        const target = keys.reduce((obj, key) => {
            if (!obj[key]) obj[key] = {};
            return obj[key];
        }, this);
        target[last] = value;
        this.save();
    },
};

config.load();

export default config;
export { env, envArray };
