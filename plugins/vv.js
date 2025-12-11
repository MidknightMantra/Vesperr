import { downloadMediaMessage, getContentType } from '@whiskeysockets/baileys';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { LRUCache } from 'lru-cache';

/* ═══════════════════════════════════════════════════════════════
   CONFIGURATION
   ═══════════════════════════════════════════════════════════════ */

const CONFIG = {
    // Storage
    TEMP_DIR: './temp/viewonce',
    MAX_FILE_SIZE: 50 * 1024 * 1024,  // 50MB max
    CLEANUP_INTERVAL: 300000,          // 5 minutes
    FILE_TTL: 600000,                  // 10 minutes

    // Cache
    CACHE_MAX: 500,
    CACHE_TTL: 3600000,                // 1 hour

    // Rate limiting
    RATE_LIMIT_MAX: 10,                // per user per hour
    RATE_LIMIT_WINDOW: 3600000,        // 1 hour

    // Features
    AUTO_CAPTURE: false,               // Auto-capture all view-once (privacy concern)
    NOTIFY_SENDER: false,              // Notify original sender when captured
    SAVE_TO_CHAT: true,                // Send captured media back to chat
    PRIVATE_MODE: true,                // Send to user's DM instead of group
};

/* ═══════════════════════════════════════════════════════════════
   STORAGE & CACHES
   ═══════════════════════════════════════════════════════════════ */

// Cache for captured view-once messages
const viewOnceCache = new LRUCache({
    max: CONFIG.CACHE_MAX,
    ttl: CONFIG.CACHE_TTL,
    dispose: async (value, key) => {
        // Cleanup file when evicted from cache
        if (value?.filePath && existsSync(value.filePath)) {
            try {
                await unlink(value.filePath);
            } catch { }
        }
    }
});

// User settings cache
const userSettings = new LRUCache({
    max: 1000,
    ttl: 86400000  // 24 hours
});

// Rate limiter
const rateLimiter = new LRUCache({
    max: 5000,
    ttl: CONFIG.RATE_LIMIT_WINDOW
});

// Pending captures (for reply-based capture)
const pendingCaptures = new LRUCache({
    max: 100,
    ttl: 300000  // 5 minutes
});

/* ═══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Ensure temp directory exists
 */
async function ensureTempDir() {
    if (!existsSync(CONFIG.TEMP_DIR)) {
        await mkdir(CONFIG.TEMP_DIR, { recursive: true });
    }
}

/**
 * Generate unique filename
 */
function generateFilename(type, ext) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `vo_${type}_${timestamp}_${random}.${ext}`;
}

/**
 * Get file extension from mimetype
 */
function getExtension(mimetype) {
    const map = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/3gpp': '3gp',
        'video/quicktime': 'mov',
        'audio/ogg': 'ogg',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a'
    };
    return map[mimetype] || 'bin';
}

/**
 * Check rate limit
 */
function checkRateLimit(userId) {
    const key = `viewonce_${userId}`;
    const current = rateLimiter.get(key) || 0;

    if (current >= CONFIG.RATE_LIMIT_MAX) {
        return { allowed: false, remaining: 0 };
    }

    rateLimiter.set(key, current + 1);
    return { allowed: true, remaining: CONFIG.RATE_LIMIT_MAX - current - 1 };
}

/**
 * Get user settings
 */
function getUserSettings(userId) {
    return userSettings.get(userId) || {
        autoCapture: false,
        privateMode: true,
        notifications: true
    };
}

/**
 * Set user settings
 */
function setUserSettings(userId, settings) {
    const current = getUserSettings(userId);
    userSettings.set(userId, { ...current, ...settings });
}

/**
 * Format file size
 */
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Get sender JID (LID compatible)
 */
function getSenderJid(msg) {
    return msg.key.participant || msg.key.participantAlt || msg.key.remoteJid;
}

/**
 * Check if message is view-once
 */
function isViewOnce(msg) {
    const message = msg.message;
    if (!message) return false;

    // Check for viewOnceMessage wrapper (v1)
    if (message.viewOnceMessage) return true;

    // Check for viewOnceMessageV2 wrapper (v2)
    if (message.viewOnceMessageV2) return true;

    // Check for viewOnceMessageV2Extension
    if (message.viewOnceMessageV2Extension) return true;

    // Check viewOnce flag on image/video/audio
    const contentType = getContentType(message);
    const content = message[contentType];

    return content?.viewOnce === true;
}

/**
 * Extract view-once content
 */
function extractViewOnceContent(msg) {
    const message = msg.message;

    // Unwrap viewOnceMessage containers
    let innerMessage = message.viewOnceMessage?.message
        || message.viewOnceMessageV2?.message
        || message.viewOnceMessageV2Extension?.message
        || message;

    const contentType = getContentType(innerMessage);
    const content = innerMessage[contentType];

    if (!content) return null;

    // Determine media type
    let mediaType = 'unknown';
    let mimetype = content.mimetype || '';

    if (contentType === 'imageMessage' || mimetype.startsWith('image/')) {
        mediaType = 'image';
    } else if (contentType === 'videoMessage' || mimetype.startsWith('video/')) {
        mediaType = 'video';
    } else if (contentType === 'audioMessage' || mimetype.startsWith('audio/')) {
        mediaType = content.ptt ? 'voicenote' : 'audio';
    }

    return {
        contentType,
        mediaType,
        mimetype,
        caption: content.caption || '',
        seconds: content.seconds || 0,
        fileLength: content.fileLength || 0,
        message: innerMessage
    };
}

/* ═══════════════════════════════════════════════════════════════
   CORE FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Capture and save view-once media
 */
async function captureViewOnce(sock, msg, options = {}) {
    const { sendTo, notify = false } = options;

    await ensureTempDir();

    const content = extractViewOnceContent(msg);
    if (!content) {
        throw new Error('Could not extract view-once content');
    }

    // Check file size
    if (content.fileLength > CONFIG.MAX_FILE_SIZE) {
        throw new Error(`File too large (${formatSize(content.fileLength)})`);
    }

    // Download media
    const buffer = await downloadMediaMessage(
        { message: content.message },
        'buffer',
        {},
        {
            logger: console,
            reuploadRequest: sock.updateMediaMessage
        }
    );

    if (!buffer || buffer.length === 0) {
        throw new Error('Failed to download media');
    }

    // Save to temp file
    const ext = getExtension(content.mimetype);
    const filename = generateFilename(content.mediaType, ext);
    const filePath = join(CONFIG.TEMP_DIR, filename);

    await writeFile(filePath, buffer);

    // Cache the capture
    const cacheKey = msg.key.id;
    const captureData = {
        filePath,
        buffer,
        mediaType: content.mediaType,
        mimetype: content.mimetype,
        caption: content.caption,
        seconds: content.seconds,
        size: buffer.length,
        capturedAt: Date.now(),
        originalSender: getSenderJid(msg),
        originalChat: msg.key.remoteJid
    };

    viewOnceCache.set(cacheKey, captureData);

    return captureData;
}

/**
 * Resend captured media
 */
async function resendMedia(sock, captureData, targetJid, options = {}) {
    const { asViewOnce = false, withCaption = true } = options;

    const caption = withCaption && captureData.caption
        ? captureData.caption
        : undefined;

    const baseMessage = {
        caption,
        viewOnce: asViewOnce
    };

    let messageContent;

    switch (captureData.mediaType) {
        case 'image':
            messageContent = {
                image: captureData.buffer,
                mimetype: captureData.mimetype,
                ...baseMessage
            };
            break;

        case 'video':
            messageContent = {
                video: captureData.buffer,
                mimetype: captureData.mimetype,
                seconds: captureData.seconds,
                ...baseMessage
            };
            break;

        case 'voicenote':
            messageContent = {
                audio: captureData.buffer,
                mimetype: captureData.mimetype,
                ptt: true,
                seconds: captureData.seconds
            };
            break;

        case 'audio':
            messageContent = {
                audio: captureData.buffer,
                mimetype: captureData.mimetype,
                ptt: false,
                seconds: captureData.seconds
            };
            break;

        default:
            messageContent = {
                document: captureData.buffer,
                mimetype: captureData.mimetype,
                fileName: `viewonce_${captureData.mediaType}.${getExtension(captureData.mimetype)}`
            };
    }

    return await sock.sendMessage(targetJid, messageContent);
}

/* ═══════════════════════════════════════════════════════════════
   HELP & INFO
   ═══════════════════════════════════════════════════════════════ */

function generateHelp() {
    return `◎ *VESPERR VIEWONCE*

⌘ *Commands:*
│ ❯ \`.vo capture\` - Capture replied view-once
│ ❯ \`.vo save\` - Save to your DM
│ ❯ \`.vo here\` - Resend in current chat

◇ *How to Use:*
│ 1. Someone sends view-once media
│ 2. Reply with \`.vo capture\`
│ 3. Media saved and sent to you

_⊹ Use responsibly_`;
}

function generateStats() {
    return `📊 *VIEWONCE STATS*

📦 *Cached:* ${viewOnceCache.size}/${CONFIG.CACHE_MAX}
⏱️ *Cache TTL:* ${CONFIG.CACHE_TTL / 60000} minutes
📁 *Max Size:* ${formatSize(CONFIG.MAX_FILE_SIZE)}
🔒 *Private Mode:* ${CONFIG.PRIVATE_MODE ? 'Default ON' : 'Default OFF'}

_Cache auto-cleans expired entries_`;
}

function generateSettings(userId) {
    const settings = getUserSettings(userId);

    return `⚙️ *YOUR SETTINGS*

🔒 *Private Mode:* ${settings.privateMode ? '✅ ON' : '❌ OFF'}
🔔 *Notifications:* ${settings.notifications ? '✅ ON' : '❌ OFF'}
📸 *Auto-Capture:* ${settings.autoCapture ? '✅ ON' : '❌ OFF'}

*Change Settings:*
• \`.vo private on/off\`
• \`.vo notify on/off\``;
}

/* ═══════════════════════════════════════════════════════════════
   PLUGIN EXPORT
   ═══════════════════════════════════════════════════════════════ */

export default {
    name: 'viewonce',
    alias: ['vo', 'vv', 'antiviewonce', 'avo'],
    category: 'utility',
    desc: 'Capture and save view-once media',
    react: '👁️',

    command: {
        pattern: 'viewonce',
        run: async ({ sock, msg, args, isGroup, isAdmin, isBotAdmin }) => {
            const chat = msg.key.remoteJid;
            const user = getSenderJid(msg);
            const subCommand = args[0]?.toLowerCase();
            const subArg = args[1]?.toLowerCase();

            // Rate limit check
            const rateCheck = checkRateLimit(user);
            if (!rateCheck.allowed) {
                return sock.sendMessage(chat, {
                    text: `⏳ *Rate Limited*\n\nYou've reached the hourly limit. Try again later.`
                }, { quoted: msg });
            }

            // Get quoted message
            const quoted = msg.message?.extendedTextMessage?.contextInfo;
            const quotedMsg = quoted?.quotedMessage;
            const quotedKey = quoted ? {
                remoteJid: chat,
                id: quoted.stanzaId,
                participant: quoted.participant
            } : null;

            // ═══════════════════════════════════════════════════════════
            // COMMAND ROUTING
            // ═══════════════════════════════════════════════════════════

            // Help
            if (!subCommand || subCommand === 'help') {
                return sock.sendMessage(chat, { text: generateHelp() }, { quoted: msg });
            }

            // Stats
            if (subCommand === 'stats') {
                return sock.sendMessage(chat, { text: generateStats() }, { quoted: msg });
            }

            // Settings view
            if (subCommand === 'settings') {
                return sock.sendMessage(chat, { text: generateSettings(user) }, { quoted: msg });
            }

            // Private mode toggle
            if (subCommand === 'private') {
                if (!['on', 'off'].includes(subArg)) {
                    return sock.sendMessage(chat, {
                        text: '⚙️ Usage: `.vo private on` or `.vo private off`'
                    }, { quoted: msg });
                }

                setUserSettings(user, { privateMode: subArg === 'on' });
                return sock.sendMessage(chat, {
                    text: `✅ Private mode ${subArg === 'on' ? 'enabled' : 'disabled'}`
                }, { quoted: msg });
            }

            // Notification toggle
            if (subCommand === 'notify') {
                if (!['on', 'off'].includes(subArg)) {
                    return sock.sendMessage(chat, {
                        text: '⚙️ Usage: `.vo notify on` or `.vo notify off`'
                    }, { quoted: msg });
                }

                setUserSettings(user, { notifications: subArg === 'on' });
                return sock.sendMessage(chat, {
                    text: `✅ Notifications ${subArg === 'on' ? 'enabled' : 'disabled'}`
                }, { quoted: msg });
            }

            // ═══════════════════════════════════════════════════════════
            // CAPTURE COMMAND
            // ═══════════════════════════════════════════════════════════

            if (['capture', 'cap', 'c', 'get', 'save', 'here'].includes(subCommand)) {
                // Must reply to a message
                if (!quotedMsg) {
                    return sock.sendMessage(chat, {
                        text: '❌ *Reply to a view-once message to capture it*'
                    }, { quoted: msg });
                }

                // Check if it's view-once
                const isVO = quotedMsg.viewOnceMessage ||
                    quotedMsg.viewOnceMessageV2 ||
                    quotedMsg.viewOnceMessageV2Extension ||
                    quotedMsg.imageMessage?.viewOnce ||
                    quotedMsg.videoMessage?.viewOnce ||
                    quotedMsg.audioMessage?.viewOnce;

                if (!isVO) {
                    return sock.sendMessage(chat, {
                        text: '❌ *That message is not a view-once media*'
                    }, { quoted: msg });
                }

                // Send processing message
                const processingMsg = await sock.sendMessage(chat, {
                    text: '🔄 *Capturing view-once media...*'
                }, { quoted: msg });

                try {
                    // Create mock message object for capture
                    const mockMsg = {
                        key: quotedKey,
                        message: quotedMsg
                    };

                    // Capture the media
                    const captureData = await captureViewOnce(sock, mockMsg);

                    // Determine where to send
                    const settings = getUserSettings(user);
                    const sendPrivate = settings.privateMode || subCommand === 'save';
                    const sendHere = subCommand === 'here' && !sendPrivate;

                    // Prepare info text
                    const mediaEmoji = {
                        'image': '🖼️',
                        'video': '🎬',
                        'voicenote': '🎤',
                        'audio': '🎵'
                    }[captureData.mediaType] || '📁';

                    const infoText = `${mediaEmoji} *View-Once Captured!*

📦 *Type:* ${captureData.mediaType}
📐 *Size:* ${formatSize(captureData.size)}
${captureData.caption ? `💬 *Caption:* ${captureData.caption}` : ''}
${captureData.seconds ? `⏱️ *Duration:* ${captureData.seconds}s` : ''}

_Captured by Vesperr_ 👁️`;

                    // Send to appropriate destination
                    if (sendPrivate && isGroup) {
                        // Send to user's DM
                        const userDM = user.includes('@') ? user : `${user}@s.whatsapp.net`;

                        await sock.sendMessage(userDM, { text: infoText });
                        await resendMedia(sock, captureData, userDM, { asViewOnce: false });

                        await sock.sendMessage(chat, {
                            text: '✅ *Captured!* Check your DM 📩',
                            edit: processingMsg.key
                        });
                    } else {
                        // Send in current chat
                        await sock.sendMessage(chat, {
                            text: infoText,
                            edit: processingMsg.key
                        });

                        await resendMedia(sock, captureData, chat, { asViewOnce: false });
                    }

                    // Cleanup temp file after sending
                    setTimeout(async () => {
                        try {
                            if (existsSync(captureData.filePath)) {
                                await unlink(captureData.filePath);
                            }
                        } catch { }
                    }, 60000); // 1 minute delay

                } catch (error) {
                    console.error('ViewOnce capture error:', error);

                    let errorMsg = '❌ *Failed to capture view-once*\n\n';

                    if (error.message.includes('too large')) {
                        errorMsg += 'The file is too large to capture.';
                    } else if (error.message.includes('download')) {
                        errorMsg += 'Could not download the media. It may have expired.';
                    } else {
                        errorMsg += 'The media may have already been viewed or expired.';
                    }

                    await sock.sendMessage(chat, {
                        text: errorMsg,
                        edit: processingMsg.key
                    });
                }

                return;
            }

            // ═══════════════════════════════════════════════════════════
            // RETRIEVE FROM CACHE
            // ═══════════════════════════════════════════════════════════

            if (subCommand === 'list') {
                const cached = [];
                viewOnceCache.forEach((value, key) => {
                    if (value.originalChat === chat || value.originalSender === user) {
                        cached.push({
                            id: key.slice(-8),
                            type: value.mediaType,
                            size: formatSize(value.size),
                            ago: Math.round((Date.now() - value.capturedAt) / 60000)
                        });
                    }
                });

                if (cached.length === 0) {
                    return sock.sendMessage(chat, {
                        text: '📭 *No cached view-once media found*'
                    }, { quoted: msg });
                }

                const listText = cached.map((c, i) =>
                    `${i + 1}. ${c.type} (${c.size}) - ${c.ago}m ago`
                ).join('\n');

                return sock.sendMessage(chat, {
                    text: `📦 *Cached View-Once Media*\n\n${listText}\n\n_Use \`.vo get <number>\` to retrieve_`
                }, { quoted: msg });
            }

            // Unknown command
            return sock.sendMessage(chat, {
                text: `❓ Unknown command. Try \`.vo help\``
            }, { quoted: msg });
        }
    },

    // ═══════════════════════════════════════════════════════════════
    // EVENT HANDLER - Auto-detect view-once messages
    // ═══════════════════════════════════════════════════════════════

    events: {
        'messages.upsert': async ({ sock, messages }) => {
            // Only process if auto-capture is enabled globally
            if (!CONFIG.AUTO_CAPTURE) return;

            for (const msg of messages) {
                if (!msg.message) continue;
                if (msg.key.fromMe) continue;

                // Check if view-once
                if (isViewOnce(msg)) {
                    const chat = msg.key.remoteJid;
                    const sender = getSenderJid(msg);
                    const settings = getUserSettings(sender);

                    // Check user's auto-capture setting
                    if (!settings.autoCapture) continue;

                    try {
                        const captureData = await captureViewOnce(sock, msg);

                        // Notify if enabled
                        if (settings.notifications) {
                            const userDM = sender.includes('@') ? sender : `${sender}@s.whatsapp.net`;

                            await sock.sendMessage(userDM, {
                                text: `👁️ *Auto-Captured View-Once*\n\nType: ${captureData.mediaType}\nFrom: ${chat}\n\n_Reply with \`.vo list\` to see cached media_`
                            });
                        }
                    } catch (error) {
                        console.error('Auto-capture failed:', error.message);
                    }
                }
            }
        }
    }
};

// Export utilities for external use
export {
    captureViewOnce,
    resendMedia,
    isViewOnce,
    viewOnceCache,
    getUserSettings,
    setUserSettings
};