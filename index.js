import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    isJidGroup,
    Browsers,
    proto,
    getAggregateVotesInPollMessage,
} from '@whiskeysockets/baileys';

const isJidUser = (jid) => jid?.endsWith('@s.whatsapp.net') || jid?.endsWith('@lid');
const isJidBroadcast = (jid) => jid?.endsWith('@broadcast');
import { Boom } from '@hapi/boom';
import NodeCache from 'node-cache';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { EventEmitter } from 'events';

import config from './config.js';
import { log } from './utils/logger.js';
import { breakers as circuitBreakers } from './utils/circuitBreaker.js';
import sessionManager, { initSession } from './session.js';
import pluginManager from './pluginManager.js';
import {
    handleMessage,
    handleGroupUpdate,
    handleCall,
    handlePresence,
    handleChannelUpdate,
    handleMessageDelete,
    handleMessageUpdate,
    getMessageText,
} from './handlers.js';
import { handlePostConnect } from './utils/onConnect.js';

process.on('uncaughtException', (err) => {
    log.error('Uncaught Exception:', err.message);
    log.error(err.stack);

});

process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection:', reason);

});

process.on('SIGINT', async () => {
    log.info('Received SIGINT. Graceful shutdown...');
    await shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log.info('Received SIGTERM. Graceful shutdown...');
    await shutdown();
    process.exit(0);
});

const msgRetryCounterCache = new NodeCache({
    stdTTL: 60 * 10,
    checkperiod: 60,
});

const groupMetadataCache = new NodeCache({
    stdTTL: 60 * 5,
    checkperiod: 60,
});

const pollVoteStore = new Map();

let sock = null;
global.autoStatusHandler = null;
let connectionState = {
    isConnected: false,
    qrDisplayed: false,
    retryCount: 0,
    lastDisconnect: null,
    startTime: null,
};

const botEvents = new EventEmitter();

let messageCount = 0;
let lastMemoryCleanup = Date.now();

setInterval(() => {
    const used = process.memoryUsage();
    const heapMB = Math.round(used.heapUsed / 1024 / 1024);
    const rssMB = Math.round(used.rss / 1024 / 1024);

    log.debug(`Memory: Heap ${heapMB}MB | RSS ${rssMB}MB | Messages: ${messageCount}`);

    if (heapMB > 400) {
        log.warn('High memory usage detected. Running cleanup...');
        cleanupMemory();
    }
}, 60000);

function cleanupMemory() {
    try {

        msgRetryCounterCache.flushAll();

        const oneHourAgo = Date.now() - 3600000;
        for (const [key, value] of pollVoteStore.entries()) {
            if (value.lastUpdate < oneHourAgo) {
                pollVoteStore.delete(key);
            }
        }

        if (global.gc) {
            global.gc();
            log.debug('Garbage collection executed');
        }

        lastMemoryCleanup = Date.now();
    } catch (err) {
        log.error('Memory cleanup error:', err.message);
    }
}

let keepAliveInterval = null;

function startKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }

    keepAliveInterval = setInterval(async () => {
        if (sock && connectionState.isConnected) {
            try {

                await sock.sendPresenceUpdate('available');
                log.debug('Keep-alive ping sent');
            } catch (err) {
                log.warn('Keep-alive ping failed:', err.message);
            }
        }
    }, 25000);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

function getSocketConfig(state) {
    return {
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },

        browser: config.connection?.browser?.length === 3
            ? config.connection.browser
            : Browsers.ubuntu('Chrome'),

        logger: pino({ level: config.debug ? 'debug' : 'silent' }),

        syncFullHistory: config.connection?.syncFullHistory ?? false,
        markOnlineOnConnect: config.connection?.markOnlineOnConnect ?? true,

        msgRetryCounterCache,

        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 500,
        qrTimeout: 40000,

        firebaseConfig: {},

        generateHighQualityLinkPreview: true,

        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.templateMessage ||
                message.listMessage ||
                message.interactiveMessage
            );

            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadataVersion: 2,
                                deviceListMetadata: {},
                            },
                            ...message,
                        },
                    },
                };
            }

            return message;
        },

        getMessage: async (key) => {

            return { conversation: '' };
        },

        cachedGroupMetadata: async (jid) => {
            const cached = groupMetadataCache.get(jid);
            if (cached) return cached;

            if (sock) {
                try {
                    const metadata = await sock.groupMetadata(jid);
                    groupMetadataCache.set(jid, metadata);
                    return metadata;
                } catch {
                    return null;
                }
            }
            return null;
        },
    };
}

async function connectToWhatsApp() {
    log.info('Initializing WhatsApp connection...');

    try {

        await initSession();

        await pluginManager.loadAll();

        if (config.plugins?.hotReload) {
            pluginManager.enableHotReload(config.plugins.hotReloadInterval);
        }

        const { version, isLatest } = await fetchLatestBaileysVersion();
        log.info(`Using Baileys v${version.join('.')}${isLatest ? ' (latest)' : ''}`);

        const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);

        sock = makeWASocket(getSocketConfig(state));

        sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                log.debug('Credentials saved');
            } catch (err) {
                log.error('Failed to save credentials:', err.message);
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !connectionState.qrDisplayed) {
                connectionState.qrDisplayed = true;

                qrcode.generate(qr, { small: true });
                log.info('Scan the QR code above to connect');

                if (config.connection?.pairingCode && config.connection?.phoneNumber) {
                    try {
                        const code = await sock.requestPairingCode(config.connection.phoneNumber);
                        log.box(`Pairing Code: ${code}`, 'Enter this code on your phone');
                    } catch (err) {
                        log.warn('Failed to get pairing code:', err.message);
                    }
                }
            }

            if (connection === 'close') {
                connectionState.isConnected = false;
                connectionState.lastDisconnect = new Date();
                stopKeepAlive();

                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || statusCode;

                log.warn(`Connection closed. Reason: ${reason} (${statusCode})`);

                const shouldReconnect = handleDisconnect(statusCode);
                const maxRetries = config.connection?.maxRetries ?? 10;

                if (shouldReconnect && connectionState.retryCount < maxRetries) {
                    connectionState.retryCount++;

                    const baseDelay = config.connection?.retryDelay ?? 3000;
                    const delay = Math.min(baseDelay * Math.pow(1.5, connectionState.retryCount - 1), 60000);

                    log.info(`Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${connectionState.retryCount}/${maxRetries})`);

                    setTimeout(() => {
                        connectToWhatsApp().catch(err => {
                            log.error('Reconnection failed:', err.message);
                        });
                    }, delay);
                } else if (!shouldReconnect) {
                    log.error('Connection permanently closed. Manual intervention required.');

                } else {
                    log.error('Max retry attempts reached.');

                    connectionState.retryCount = 0;
                    setTimeout(() => {
                        log.info('Attempting fresh reconnection...');
                        connectToWhatsApp().catch(err => {
                            log.error('Fresh reconnection failed:', err.message);
                        });
                    }, 120000);
                }
            }

            if (connection === 'open') {
                connectionState.isConnected = true;
                connectionState.qrDisplayed = false;
                connectionState.retryCount = 0;
                connectionState.startTime = new Date();

                const user = sock.user;
                log.success(`Connected as ${user?.name || user?.id || 'Unknown'}`);

                if (user?.id) {
                    config.botNumber = user.id.split(':')[0].split('@')[0];
                    log.info(`Owner: ${config.botNumber}`);
                }

                log.separator();

                startKeepAlive();

                if (config.presence) {
                    try {
                        await sock.sendPresenceUpdate(config.presence);
                    } catch (err) {
                        log.warn('Failed to set presence:', err.message);
                    }
                }

                botEvents.emit('connected', { sock, user });

                try {
                    await pluginManager.executeHook('onConnect', { sock, user });
                } catch (err) {
                    log.error('onConnect hook error:', err.message);
                }

                await handlePostConnect(sock, user);
            }
        });

        sock.ev.process(async (events) => {

            if (events['messages.upsert']) {
                const { messages, type } = events['messages.upsert'];

                if (config.debug) {
                    console.log(`[DEBUG] messages.upsert: type=${type}, count=${messages?.length}`);
                }

                if (type === 'notify' && messages) {
                    for (const msg of messages) {
                        messageCount++;

                        try {

                            const text = getMessageText(msg);

                            if (msg.key.fromMe) {
                                const isCommand = config.hasPrefix?.(text) ?? text?.startsWith(config.prefix);
                                if (!config.selfOnly && !isCommand) continue;
                            }

                            if (config.autoReadMessages && !msg.key.fromMe) {
                                await sock.readMessages([msg.key]).catch(() => { });
                            }

                            await Promise.race([
                                handleMessage(sock, msg, { type, pollVoteStore }),
                                new Promise((_, reject) =>
                                    setTimeout(() => reject(new Error('Message handling timeout')), 30000)
                                )
                            ]);
                        } catch (err) {
                            log.error('Message handling error:', err.message);
                        }
                    }
                }
            }

            if (events['creds.update']) {
                await saveCreds();
            }

            if (events['messages.update']) {
                const updates = events['messages.update'];
                for (const update of updates) {
                    try {
                        if (update.update?.message) {
                            await handleMessageUpdate(sock, update);
                        }
                        if (update.update?.pollUpdates) {
                            await handlePollUpdate(sock, update);
                        }
                    } catch (err) {
                        log.error('Message update error:', err.message);
                    }
                }
            }

            if (events['messages.delete']) {
                const deletion = events['messages.delete'];
                if ('keys' in deletion) {
                    for (const key of deletion.keys) {
                        try {
                            await handleMessageDelete(sock, { key });
                        } catch (err) {
                            log.error('Message delete handler error:', err.message);
                        }
                    }
                }
            }

            if (events['messages.reaction']) {
                const reactions = events['messages.reaction'];
                for (const reaction of reactions) {
                    try {
                        const msg = {
                            key: reaction.key,
                            message: { reactionMessage: reaction.reaction },
                            messageTimestamp: Date.now(),
                        };
                        await handleMessage(sock, msg, { isReaction: true });
                    } catch (err) {
                        log.error('Reaction handler error:', err.message);
                    }
                }
            }
        });

        sock.ev.on('groups.update', async (updates) => {
            for (const update of updates) {
                try {

                    groupMetadataCache.del(update.id);

                    const action = update.subject !== undefined ? 'subject' :
                        update.desc !== undefined ? 'desc' :
                            update.announce !== undefined ? 'announce' :
                                update.restrict !== undefined ? 'restrict' : 'update';

                    await handleGroupUpdate(sock, { ...update, action });
                } catch (err) {
                    log.error('Group update handler error:', err.message);
                }
            }
        });

        sock.ev.on('group-participants.update', async (update) => {
            try {

                groupMetadataCache.del(update.id);
                await handleGroupUpdate(sock, update);
            } catch (err) {
                log.error('Group participants update error:', err.message);
            }
        });

        sock.ev.on('call', async (calls) => {
            for (const call of calls) {
                try {
                    await handleCall(sock, call);
                } catch (err) {
                    log.error('Call handler error:', err.message);
                }
            }
        });

        sock.ev.on('presence.update', async (presence) => {
            try {
                await handlePresence(sock, presence);
            } catch (err) {
                log.error('Presence handler error:', err.message);
            }
        });

        sock.ev.on('newsletters.update', async (updates) => {
            for (const update of updates) {
                try {
                    await handleChannelUpdate(sock, { type: 'update', ...update });
                } catch (err) {
                    log.error('Newsletter update error:', err.message);
                }
            }
        });

        if (config.autoReadStatus || config.autoStatusViewer) {
            import('./plugins/autostatus.js').then(module => {
                global.autoStatusHandler = module.handleStatusUpdate;
                log.info('Post-Connect: Auto Status system initialized');
            }).catch(() => {
                log.debug('Auto Status plugin not found in active directory');
            });
        }

        sock.ev.on('messages.upsert', async (update) => {
            const { messages, type } = update;
            if (!messages || type !== 'notify') return;

            for (const msg of messages) {
                if (msg.key.remoteJid === 'status@broadcast') {

                    if (global.autoStatusHandler) {
                        try {
                            await global.autoStatusHandler(sock, update);
                        } catch (e) {
                            log.debug('Auto status error:', e.message);
                        }
                    } else if (config.autoReadStatus) {

                        await sock.readMessages([msg.key]).catch(() => { });
                    }
                    break;
                }
            }
        });

        sock.ev.on('blocklist.update', async (update) => {
            log.debug('Blocklist updated:', update);
            botEvents.emit('blocklist.update', update);
        });

        sock.ev.on('contacts.update', async (updates) => {
            for (const update of updates) {
                log.debug(`Contact updated: ${update.id}`);
            }
        });

        return sock;

    } catch (err) {
        log.error('Connection initialization error:', err.message);

        const delay = 10000;
        log.info(`Retrying in ${delay / 1000}s...`);
        setTimeout(() => {
            connectToWhatsApp().catch(e => log.error('Retry failed:', e.message));
        }, delay);

        return null;
    }
}

function handleDisconnect(reason) {
    switch (reason) {
        case DisconnectReason.loggedOut:
            log.error('Device logged out. Please scan QR code again.');

            sessionManager.clearSession().catch(() => { });
            return false;

        case DisconnectReason.badSession:
            log.error('Bad session file. Clearing and reconnecting...');
            sessionManager.clearSession().catch(() => { });
            return true;

        case DisconnectReason.connectionClosed:
        case DisconnectReason.connectionLost:
        case DisconnectReason.timedOut:
            log.warn('Connection lost. Will attempt to reconnect...');
            return true;

        case DisconnectReason.connectionReplaced:
            log.error('Connection replaced by another device.');
            return false;

        case DisconnectReason.multideviceMismatch:
            log.error('Multi-device mismatch. Please re-link device.');
            sessionManager.clearSession().catch(() => { });
            return false;

        case DisconnectReason.restartRequired:
            log.info('Restart required by WhatsApp.');
            return true;

        case 503:
            log.warn('WhatsApp service unavailable. Will retry...');
            return true;

        case 515:
            log.warn('Stream error. Will retry...');
            return true;

        default:
            log.warn(`Unknown disconnect reason: ${reason}. Will try to reconnect...`);
            return true;
    }
}

async function handlePollUpdate(sock, update) {
    try {
        const pollMessage = update.update?.pollUpdates;
        if (!pollMessage?.length) return;

        for (const pollUpdate of pollMessage) {
            const { pollUpdateMessageKey, vote } = pollUpdate;

            const pollKey = pollUpdateMessageKey;
            const votes = getAggregateVotesInPollMessage({
                message: pollUpdate,
                pollUpdates: [pollUpdate],
            });

            pollVoteStore.set(pollKey?.id, {
                key: pollKey,
                votes,
                lastUpdate: Date.now(),
            });

            botEvents.emit('poll.vote', {
                pollKey,
                vote,
                votes,
                voter: update.key?.participant || update.key?.remoteJid,
            });
        }
    } catch (err) {
        log.error('Poll update handling error:', err.message);
    }
}

export function getSocket() {
    return sock;
}

export function getConnectionState() {
    return { ...connectionState };
}

export function getUptime() {
    if (!connectionState.startTime) return 0;
    return Date.now() - connectionState.startTime.getTime();
}

const messageQueue = [];
let isProcessingQueue = false;

export async function sendMessage(jid, content, options = {}) {
    if (!sock || !connectionState.isConnected) {
        throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
        messageQueue.push({ jid, content, options, resolve, reject });
        processMessageQueue();
    });
}

async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    const { jid, content, options, resolve, reject } = messageQueue.shift();

    try {
        const result = await sock.sendMessage(jid, content, options);
        resolve(result);
    } catch (err) {
        reject(err);
    }

    setTimeout(() => {
        isProcessingQueue = false;
        processMessageQueue();
    }, 100);
}

export async function getGroupMetadata(jid) {
    const cached = groupMetadataCache.get(jid);
    if (cached) return cached;

    if (sock && connectionState.isConnected) {
        const metadata = await sock.groupMetadata(jid);
        groupMetadataCache.set(jid, metadata);
        return metadata;
    }

    return null;
}

export async function shutdown() {
    log.info('Shutting down...');

    stopKeepAlive();

    try {
        await pluginManager.executeHook('onShutdown', { sock });
    } catch (err) {
        log.error('Shutdown hook error:', err.message);
    }

    pluginManager.disableHotReload();

    sessionManager.stopAutoBackup();

    if (sock) {
        try {
            sock.ws?.close();
            sock.end();
        } catch (err) {
            log.error('Socket close error:', err.message);
        }
    }

    log.info('Goodbye!');
}

setInterval(() => {
    if (!connectionState.isConnected) return;

    const uptime = getUptime();
    const uptimeMin = Math.floor(uptime / 60000);
    const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    log.info(`📊 Status: Connected for ${uptimeMin}m | ${memory}MB RAM | ${messageCount} msgs processed`);
}, 300000);

export {
    sock,
    botEvents,
    pluginManager,
    sessionManager,
    config,
    log,
    groupMetadataCache,
    pollVoteStore,
};

export default {
    connect: connectToWhatsApp,
    getSocket,
    getConnectionState,
    getUptime,
    sendMessage,
    getGroupMetadata,
    shutdown,
    events: botEvents,
    plugins: pluginManager,
    session: sessionManager,
    config,
    log,
};

log.banner?.(config.botName, config.version, [
    `Prefix: ${config.prefix}`,
    `Mode: ${config.ownerOnly ? 'Owner Only' : 'Public'}`,
]) || log.info(`Starting ${config.botName} v${config.version}`);

connectToWhatsApp().catch((err) => {
    log.error('Failed to start:', err.message);

    setTimeout(() => {
        log.info('Attempting recovery...');
        connectToWhatsApp().catch(e => log.error('Recovery failed:', e.message));
    }, 30000);
});

setInterval(() => {

}, 60000);
