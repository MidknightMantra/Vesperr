import {
    isJidGroup,
    getContentType,
    downloadMediaMessage,
    generateWAMessageFromContent,
    proto
} from '@whiskeysockets/baileys';

const isJidUser = (jid) => jid?.endsWith('@s.whatsapp.net') || jid?.endsWith('@lid');
const isJidBroadcast = (jid) => jid?.endsWith('@broadcast');
const isJidStatusBroadcast = (jid) => jid === 'status@broadcast';
const isJidNewsletter = (jid) => jid?.endsWith('@newsletter');
import config from './config.js';
import pluginManager from './pluginManager.js';
import { log } from './utils/logger.js';
import { jidToPhone, phoneToJid } from './utils/jid.js';
import xss from 'xss';
import { LRUCache as LRU } from 'lru-cache';

const cooldownCache = new LRU({
    max: 5000,
    ttl: 3600 * 1000,
});

const rateLimitCache = new LRU({
    max: 2000,
    ttl: 60 * 1000,
});

const groupMetadataCache = new LRU({
    max: 500,
    ttl: 5 * 60 * 1000,
});

const processedMessages = new LRU({
    max: 1000,
    ttl: 60 * 1000,
});

const spamTracker = new LRU({
    max: 1000,
    ttl: 60 * 1000,
});

const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];

export function getMessageText(msg) {
    const m = msg.message;
    if (!m) return '';

    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;

    if (m.imageMessage?.caption) return m.imageMessage.caption;
    if (m.videoMessage?.caption) return m.videoMessage.caption;
    if (m.documentMessage?.caption) return m.documentMessage.caption;

    if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
    if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
    if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;

    if (m.pollUpdateMessage) return '[Poll Vote]';

    if (m.ephemeralMessage?.message) return getMessageText({ message: m.ephemeralMessage.message });
    if (m.viewOnceMessage?.message) return getMessageText({ message: m.viewOnceMessage.message });
    if (m.viewOnceMessageV2?.message) return getMessageText({ message: m.viewOnceMessageV2.message });

    if (m.documentMessage?.fileName) return m.documentMessage.fileName;

    return '';
}

function getMessageType(msg) {
    const m = msg.message;
    if (!m) return 'unknown';

    const inner = m.ephemeralMessage?.message ||
        m.viewOnceMessage?.message ||
        m.viewOnceMessageV2?.message ||
        m;

    return getContentType(inner) || 'unknown';
}

function hasMedia(msg) {
    const type = getMessageType(msg);
    return MEDIA_TYPES.includes(type);
}

function getMediaMessage(msg) {
    const m = msg.message;
    if (!m) return null;

    const inner = m.ephemeralMessage?.message ||
        m.viewOnceMessage?.message ||
        m.viewOnceMessageV2?.message ||
        m;

    for (const type of MEDIA_TYPES) {
        if (inner[type]) return { type, message: inner[type] };
    }
    return null;
}

function getQuotedMessage(msg) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
        msg.message?.imageMessage?.contextInfo ||
        msg.message?.videoMessage?.contextInfo ||
        msg.message?.documentMessage?.contextInfo ||
        msg.message?.stickerMessage?.contextInfo;

    if (!contextInfo?.quotedMessage) return null;

    const quotedMsg = { message: contextInfo.quotedMessage };
    const quotedType = getMessageType(quotedMsg);

    return {
        key: {
            remoteJid: msg.key.remoteJid,
            fromMe: contextInfo.participant === msg.key.participant,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant
        },
        message: contextInfo.quotedMessage,
        sender: contextInfo.participant,
        text: getMessageText(quotedMsg),
        type: quotedType,
        hasMedia: MEDIA_TYPES.includes(quotedType),
        mentionedJid: contextInfo.mentionedJid || [],
        isForwarded: contextInfo.isForwarded || false
    };
}

function getMentions(msg) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
        msg.message?.imageMessage?.contextInfo ||
        msg.message?.videoMessage?.contextInfo;

    return contextInfo?.mentionedJid || [];
}

function getButtonResponse(msg) {
    const m = msg.message;
    if (!m) return null;

    if (m.buttonsResponseMessage) {
        return {
            type: 'button',
            selectedButtonId: m.buttonsResponseMessage.selectedButtonId,
            selectedDisplayText: m.buttonsResponseMessage.selectedDisplayText,
            contextInfo: m.buttonsResponseMessage.contextInfo
        };
    }

    if (m.listResponseMessage) {
        return {
            type: 'list',
            listId: m.listResponseMessage.title,
            selectedRowId: m.listResponseMessage.singleSelectReply?.selectedRowId,
            selectedDisplayText: m.listResponseMessage.description,
            contextInfo: m.listResponseMessage.contextInfo
        };
    }

    if (m.templateButtonReplyMessage) {
        return {
            type: 'template',
            selectedId: m.templateButtonReplyMessage.selectedId,
            selectedDisplayText: m.templateButtonReplyMessage.selectedDisplayText,
            selectedIndex: m.templateButtonReplyMessage.selectedIndex,
            contextInfo: m.templateButtonReplyMessage.contextInfo
        };
    }

    if (m.interactiveResponseMessage) {
        const body = m.interactiveResponseMessage.body;
        try {
            const parsed = JSON.parse(body?.text || '{}');
            return {
                type: 'interactive',
                ...parsed,
                contextInfo: m.interactiveResponseMessage.contextInfo
            };
        } catch {
            return {
                type: 'interactive',
                raw: body?.text,
                contextInfo: m.interactiveResponseMessage.contextInfo
            };
        }
    }

    return null;
}

function getPollVote(msg) {
    const pollUpdate = msg.message?.pollUpdateMessage;
    if (!pollUpdate) return null;

    return {
        pollCreationMessageKey: pollUpdate.pollCreationMessageKey,
        vote: pollUpdate.vote,
        voter: msg.key.participant || msg.key.remoteJid,
        senderTimestampMs: pollUpdate.senderTimestampMs
    };
}

function getReaction(msg) {
    const reaction = msg.message?.reactionMessage;
    if (!reaction) return null;

    return {
        emoji: reaction.text,
        key: reaction.key,
        isRemoval: !reaction.text,
        reactor: msg.key.participant || msg.key.remoteJid
    };
}

async function buildContext(sock, msg, extra = {}) {
    const jid = msg.key.remoteJid;
    const isGroup = isJidGroup(jid);
    const isPrivate = isJidUser(jid);
    const isBroadcast = isJidBroadcast(jid);
    const isStatus = isJidStatusBroadcast(jid);
    const isChannel = isJidNewsletter?.(jid) || jid?.endsWith('@newsletter');

    const sender = extra.sender || (isGroup ? msg.key.participant : jid);
    const senderNumber = jidToPhone(sender);
    const text = getMessageText(msg);
    const sanitizedText = xss(text);
    const messageType = getMessageType(msg);

    let groupMetadata = null;
    let isAdmin = false;
    let isBotAdmin = false;
    let isSuperAdmin = false;

    if (isGroup) {
        const cacheKey = `group:${jid}`;
        groupMetadata = groupMetadataCache.get(cacheKey);

        if (!groupMetadata) {
            try {
                groupMetadata = await sock.groupMetadata(jid);
                groupMetadataCache.set(cacheKey, groupMetadata);
            } catch (err) {
                log.warn(`Failed to get group metadata for ${jid}: ${err.message}`);
            }
        }

        if (groupMetadata) {
            const botJid = sock.user?.id;
            const normalizedSender = sender?.split(':')[0] + '@s.whatsapp.net';
            const normalizedBot = botJid?.split(':')[0] + '@s.whatsapp.net';

            for (const p of groupMetadata.participants) {
                const normalizedP = p.id.split(':')[0] + '@s.whatsapp.net';

                if (normalizedP === normalizedSender) {
                    if (p.admin === 'superadmin') {
                        isSuperAdmin = true;
                        isAdmin = true;
                    } else if (p.admin === 'admin') {
                        isAdmin = true;
                    }
                }

                if (normalizedP === normalizedBot) {
                    isBotAdmin = p.admin === 'admin' || p.admin === 'superadmin';
                }
            }
        }
    }

    const quoted = getQuotedMessage(msg);
    const mentions = getMentions(msg);
    const buttonResponse = getButtonResponse(msg);
    const pollVote = getPollVote(msg);
    const reaction = getReaction(msg);
    const mediaInfo = getMediaMessage(msg);

    const isPremium = config.premiumUsers?.includes(sender) ||
        config.premiumUsers?.includes(senderNumber) ||
        false;

    const ctx = {

        sock,
        msg,
        message: msg,
        key: msg.key,
        messageId: msg.key.id,

        jid,
        from: jid,
        sender,
        senderNumber,
        pushName: msg.pushName || senderNumber || 'User',

        text,
        body: sanitizedText,
        originalText: text,
        messageType,
        timestamp: msg.messageTimestamp,

        isGroup,
        isPrivate,
        isBroadcast,
        isStatus,
        isChannel,
        isFromMe: msg.key.fromMe,

        isOwner: config.isOwner(sender) || config.isOwner(senderNumber),
        isAdmin,
        isBotAdmin,
        isSuperAdmin,
        isPremium,

        groupMetadata,
        groupName: groupMetadata?.subject || '',
        groupDesc: groupMetadata?.desc || '',
        groupParticipants: groupMetadata?.participants || [],

        quoted,
        mentions,
        mentionedJid: mentions,
        buttonResponse,
        pollVote,
        reaction,

        hasMedia: !!mediaInfo,
        mediaType: mediaInfo?.type || null,
        mediaMessage: mediaInfo?.message || null,

        ...extra,

        reply: async (content, options = {}) => {
            const msgContent = typeof content === 'string' ? { text: content } : content;
            return sock.sendMessage(jid, msgContent, { quoted: msg, ...options });
        },

        send: async (content, options = {}) => {
            const msgContent = typeof content === 'string' ? { text: content } : content;
            return sock.sendMessage(jid, msgContent, options);
        },

        react: async (emoji) => {
            return sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
        },

        downloadMedia: async (options = {}) => {
            const targetMsg = options.quoted ? quoted?.message : msg.message;
            if (!targetMsg) return null;

            try {

                const inner = targetMsg.ephemeralMessage?.message ||
                    targetMsg.viewOnceMessage?.message ||
                    targetMsg.viewOnceMessageV2?.message ||
                    targetMsg;

                return await downloadMediaMessage(
                    { message: inner },
                    'buffer',
                    {},
                    {
                        logger: log,
                        reuploadRequest: sock.updateMediaMessage
                    }
                );
            } catch (err) {
                log.error(`Media download failed: ${err.message}`);
                return null;
            }
        },

        sendButtons: async (text, buttons, options = {}) => {
            const buttonRows = buttons.map((btn, i) => ({
                buttonId: btn.id || `btn_${i}`,
                buttonText: { displayText: btn.text || btn.display },
                type: 1
            }));

            return sock.sendMessage(jid, {
                text,
                footer: options.footer || '',
                buttons: buttonRows,
                headerType: options.headerType || 1,
                viewOnce: options.viewOnce || false
            }, { quoted: options.quoted !== false ? msg : undefined });
        },

        sendList: async (text, buttonText, sections, options = {}) => {
            return sock.sendMessage(jid, {
                text,
                footer: options.footer || '',
                title: options.title || '',
                buttonText,
                sections
            }, { quoted: options.quoted !== false ? msg : undefined });
        },

        sendPoll: async (question, options, config = {}) => {
            return sock.sendMessage(jid, {
                poll: {
                    name: question,
                    values: options.slice(0, 12),
                    selectableCount: config.multiSelect ? options.length : 1
                }
            });
        },

        sendAlbum: async (images) => {
            const albumItems = images.map(img => ({
                image: typeof img === 'string' ? { url: img } : img.buffer ? img : { url: img },
                caption: img.caption || ''
            }));

            return sock.sendMessage(jid, { albumMessage: albumItems }, { quoted: msg });
        },

        sendEvent: async (eventData) => {
            const startTime = eventData.startTime || Math.floor(Date.now() / 1000) + 86400;
            const endTime = eventData.endTime || startTime + 7200;

            return sock.sendMessage(jid, {
                eventMessage: {
                    isCanceled: false,
                    name: eventData.name,
                    description: eventData.description || '',
                    location: {
                        degreesLatitude: eventData.lat || 0,
                        degreesLongitude: eventData.lng || 0,
                        name: eventData.location || ''
                    },
                    joinLink: eventData.joinLink || '',
                    startTime: startTime.toString(),
                    endTime: endTime.toString(),
                    extraGuestsAllowed: eventData.extraGuests !== false
                }
            });
        },

        forward: async (targetJid, forceForward = false) => {
            return sock.sendMessage(targetJid, { forward: msg, force: forceForward });
        },

        delete: async () => {
            return sock.sendMessage(jid, { delete: msg.key });
        },

        getProfilePic: async (targetJid = sender) => {
            try {
                return await sock.profilePictureUrl(targetJid, 'image');
            } catch {
                return null;
            }
        },

        mention: (jids, text) => {
            const mentions = Array.isArray(jids) ? jids : [jids];
            return {
                text: text || mentions.map(j => `@${jidToPhone(j)}`).join(' '),
                mentions
            };
        },

        edit: async (newText, messageKey) => {
            return sock.sendMessage(jid, {
                text: newText,
                edit: messageKey || msg.key
            });
        },

        typing: async () => {
            await sock.sendPresenceUpdate('composing', jid);
        },

        recording: async () => {
            await sock.sendPresenceUpdate('recording', jid);
        },

        clearPresence: async () => {
            await sock.sendPresenceUpdate('paused', jid);
        }
    };

    return ctx;
}

function checkSpam(sender, config = {}) {
    const { maxMessages = 10, window = 10000 } = config;
    const key = `spam:${sender}`;
    const now = Date.now();

    let data = spamTracker.get(key) || { count: 0, firstMsg: now };

    if (now - data.firstMsg > window) {
        data = { count: 1, firstMsg: now };
    } else {
        data.count++;
    }

    spamTracker.set(key, data);

    return data.count > maxMessages;
}

function checkRateLimit(sender, pluginName, rateLimit) {
    if (!rateLimit) return { allowed: true };

    const { max, window } = rateLimit;
    const key = `rate:${sender}:${pluginName}`;
    const now = Date.now();

    let data = rateLimitCache.get(key) || { count: 0, windowStart: now };

    if (now - data.windowStart > window) {
        data = { count: 1, windowStart: now };
    } else {
        data.count++;
    }

    rateLimitCache.set(key, data);

    if (data.count > max) {
        const resetIn = Math.ceil((window - (now - data.windowStart)) / 1000);
        return { allowed: false, resetIn, limit: max };
    }

    return { allowed: true };
}

export async function handleMessage(sock, msg, extra = {}) {
    const startTime = Date.now();

    try {

        if (!msg.message) return;
        if (msg.key.remoteJid === 'status@broadcast') return;

        const msgType = getContentType(msg.message);
        if (['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'].includes(msgType)) {
            return;
        }

        const msgId = msg.key.id;
        if (processedMessages.has(msgId)) return;
        processedMessages.set(msgId, true);

        const ctx = await buildContext(sock, msg, extra);

        console.log(`[DEBUG] Message from ${ctx.senderNumber}: "${ctx.body}" (type: ${ctx.messageType})`);

        if (ctx.reaction) {
            await handleReaction(ctx);
            return;
        }

        if (ctx.pollVote) {
            await handlePollVote(ctx);
            return;
        }

        if (ctx.buttonResponse) {
            await handleInteractiveResponse(ctx);
            return;
        }

        if (!config.shouldRespond(ctx.isGroup, ctx.isOwner, ctx.isChannel)) return;

        if (config.antiSpam && checkSpam(ctx.sender, config.antiSpam)) {
            log.warn(`Spam detected from ${ctx.senderNumber}`);
            return;
        }

        const text = ctx.body;

        console.log(`[DEBUG] Text: "${text}", Prefix: "${config.prefix}"`);
        if (!text.startsWith(config.prefix)) {
            console.log('[DEBUG] Prefix mismatch');

            await pluginManager.handleNonCommandMessage(ctx);
            return;
        }

        console.log(`[DEBUG] Finding command for: "${text}"`);
        const result = pluginManager.findCommand(text, ctx.messageType);
        if (!result) {
            console.log('[DEBUG] No command found');

            if (config.unknownCommandReply) {
                await ctx.reply(config.unknownCommandMessage || '❓ Unknown command. Use .help for available commands.');
            }
            return;
        }

        console.log(`[DEBUG] Command found: ${result.plugin.name}`);

        const { plugin, match, commandUsed, args, argsArray, flags } = result;

        ctx.command = plugin.name;
        ctx.commandUsed = commandUsed;
        ctx.args = args;
        ctx.argsArray = argsArray;
        ctx.flags = flags;
        ctx.prefix = config.prefix;
        ctx.match = match;
        ctx.pluginManager = pluginManager;

        const canExecute = await pluginManager.canExecute(plugin, ctx);
        if (!canExecute.allowed) {
            await handlePermissionDenied(ctx, plugin, canExecute);
            return;
        }

        const cooldownKey = `${ctx.sender}:${plugin.name}`;
        const lastExec = cooldownCache.get(cooldownKey);
        if (lastExec && plugin.cooldown > 0) {
            const elapsed = Date.now() - lastExec;
            if (elapsed < plugin.cooldown) {
                const remaining = Math.ceil((plugin.cooldown - elapsed) / 1000);
                await ctx.reply(`⏳ Please wait ${remaining}s before using this command again.`);
                return;
            }
        }

        if (plugin.rateLimit) {
            const rlCheck = checkRateLimit(ctx.sender, plugin.name, plugin.rateLimit);
            if (!rlCheck.allowed) {
                await ctx.reply(`🚫 Rate limit exceeded. Try again in ${rlCheck.resetIn}s.`);
                return;
            }
        }

        const middlewareOk = await pluginManager.runMiddleware(ctx, plugin);
        if (middlewareOk === false) return;

        const beforeHooks = await pluginManager.executeHook('beforeCommand', ctx, plugin);
        if (beforeHooks.some(h => h.result?.abort)) return;

        cooldownCache.set(cooldownKey, Date.now());

        if (plugin.react || plugin.reactOnProcessing) {
            await ctx.react(plugin.react || plugin.reactOnProcessing);
        }

        log.command(plugin.name, ctx.senderNumber || ctx.sender, ctx.isGroup ? ctx.groupName : 'DM');

        try {
            await plugin.handler({
                sock,
                msg,
                args: argsArray,
                argsText: args,
                flags,
                prefix: config.prefix,
                command: commandUsed,
                context: ctx,
                ctx,
                match,
                quoted: ctx.quoted,
                mentions: ctx.mentions,
                pluginManager,

                reply: ctx.reply,
                send: ctx.send,
                react: ctx.react,
                from: ctx.from,
                sender: ctx.sender,
                isGroup: ctx.isGroup,
                isOwner: ctx.isOwner,
                isAdmin: ctx.isAdmin,
                isPremium: ctx.isPremium,
                pushName: ctx.pushName,
                groupMetadata: ctx.groupMetadata
            });

            const responseTime = Date.now() - startTime;
            pluginManager.recordUsage(plugin.name, ctx.sender, ctx.isGroup ? ctx.from : null, responseTime);

            if (plugin.reactOnSuccess && plugin.react) {
                await ctx.react(plugin.reactOnSuccess);
            }

            await pluginManager.executeHook('afterCommand', ctx, plugin, { success: true, responseTime });

        } catch (err) {

            pluginManager.recordError(plugin.name, err);

            if (plugin.reactOnError) {
                await ctx.react(plugin.reactOnError);
            }

            log.error(`Command ${plugin.name} error:`, err.message);

            if (config.debug) {
                await ctx.reply(`❌ Error: ${err.message}`);
            } else if (config.errorMessage) {
                await ctx.reply(config.errorMessage);
            }

            await pluginManager.executeHook('onError', ctx, plugin, err);
        }

    } catch (err) {
        log.error('Message handler error:', err.message, err.stack);
    }
}

async function handlePermissionDenied(ctx, plugin, check) {
    const messages = {
        owner_only: '⛔ This command is for bot owners only.',
        admin_only: '⛔ This command requires admin privileges.',
        group_only: '⛔ This command can only be used in groups.',
        private_only: '⛔ This command can only be used in private chat.',
        bot_admin_required: '⛔ Bot needs to be admin to use this command.',
        channel_only: '⛔ This command can only be used in channels.',
        premium_only: '⭐ This is a premium feature. Contact owner for access.',
        nsfw_group_required: '🔞 This command can only be used in NSFW-enabled groups.',
        media_required: '📎 Please send or reply to media.',
        quote_required: '↩️ Please reply to a message.',
        cooldown: `⏳ Please wait ${check.remaining}s before using this command again.`,
        rate_limit: `🚫 Rate limit exceeded. Try again in ${check.resetIn}s.`,
        daily_limit_reached: '📊 Daily limit reached. Try again tomorrow.'
    };

    const message = messages[check.reason] || `⛔ Permission denied: ${check.reason}`;
    await ctx.reply(message);

    await pluginManager.executeHook('onPermissionDenied', ctx, plugin, check);
}

async function handleReaction(ctx) {
    const { reaction } = ctx;

    try {
        await pluginManager.handleReaction({
            ...ctx,
            emoji: reaction.emoji,
            messageKey: reaction.key,
            isRemoval: reaction.isRemoval,
            reactor: reaction.reactor
        });
    } catch (err) {
        log.error('Reaction handler error:', err.message);
    }
}

async function handlePollVote(ctx) {
    const { pollVote } = ctx;

    try {
        await pluginManager.handlePollVote({
            ...ctx,
            pollId: pollVote.pollCreationMessageKey?.id,
            pollKey: pollVote.pollCreationMessageKey,
            vote: pollVote.vote,
            voter: pollVote.voter,
            timestamp: pollVote.senderTimestampMs
        });
    } catch (err) {
        log.error('Poll vote handler error:', err.message);
    }
}

async function handleInteractiveResponse(ctx) {
    const { buttonResponse } = ctx;

    try {
        switch (buttonResponse.type) {
            case 'button':
                await pluginManager.handleButton({
                    ...ctx,
                    buttonId: buttonResponse.selectedButtonId,
                    selectedButtonId: buttonResponse.selectedButtonId,
                    displayText: buttonResponse.selectedDisplayText
                });
                break;

            case 'list':
                await pluginManager.handleListSelection({
                    ...ctx,
                    listId: buttonResponse.listId,
                    selectedRowId: buttonResponse.selectedRowId,
                    displayText: buttonResponse.selectedDisplayText
                });
                break;

            case 'template':
                await pluginManager.handleButton({
                    ...ctx,
                    buttonId: buttonResponse.selectedId,
                    selectedButtonId: buttonResponse.selectedId,
                    displayText: buttonResponse.selectedDisplayText,
                    selectedIndex: buttonResponse.selectedIndex
                });
                break;

            case 'interactive':

                await pluginManager.handleButton({
                    ...ctx,
                    ...buttonResponse
                });
                break;
        }
    } catch (err) {
        log.error('Interactive response handler error:', err.message);
    }
}

export async function handleGroupUpdate(sock, update) {
    let { id: jid, participants, action } = update;

    if (!jid || typeof jid !== 'string') {
        log.debug('Skipping group update: Invalid JID');
        return;
    }

    const author = typeof update.author === 'string'
        ? update.author
        : update.author?.id || update.author?.jid || '';

    log.debug(`Group update: ${action} in ${jid} by ${author}`);

    try {

        groupMetadataCache.delete(`group:${jid}`);

        let groupMetadata = null;
        try {
            groupMetadata = await sock.groupMetadata(jid);
            groupMetadataCache.set(`group:${jid}`, groupMetadata);
        } catch { }

        const ctx = {
            sock,
            jid,
            from: jid,
            groupMetadata,
            groupName: groupMetadata?.subject || '',
            action,
            participants: participants || [],
            author,
            isOwner: author ? config.isOwner(author) : false,

            send: async (content, options = {}) => {
                const msgContent = typeof content === 'string' ? { text: content } : content;
                return sock.sendMessage(jid, msgContent, options);
            },

            mention: (jids, text) => {
                const jidArray = Array.isArray(jids) ? jids : [jids];
                const validJids = jidArray.filter(j => typeof j === 'string');
                return {
                    text: text || validJids.map(j => `@${jidToPhone(j)}`).join(' '),
                    mentions: validJids
                };
            }
        };

        await pluginManager.executeHook('onGroupUpdate', ctx, update);

        switch (action) {
            case 'add':
                await handleGroupJoin(ctx);
                break;

            case 'remove':
                await handleGroupLeave(ctx);
                break;

            case 'promote':
                await handleGroupPromote(ctx);
                break;

            case 'demote':
                await handleGroupDemote(ctx);
                break;

            case 'subject':

                log.info(`Group ${jid} renamed to: ${groupMetadata?.subject}`);
                break;

            case 'desc':

                log.info(`Group ${jid} description updated`);
                break;

            case 'announce':

                log.info(`Group ${jid} announcement mode: ${update.announce}`);
                break;

            case 'restrict':

                log.info(`Group ${jid} restrict mode: ${update.restrict}`);
                break;
        }

    } catch (err) {
        log.error('Group update handler error:', err.message);
    }
}

async function handleGroupJoin(ctx) {
    const { participants, groupName, groupMetadata } = ctx;

    await pluginManager.executeHook('onGroupJoin', ctx);

    if (!config.welcomeMessage) return;

    for (const participant of participants) {
        const welcomeText = config.welcomeMessage
            .replace(/{user}/g, `@${jidToPhone(participant)}`)
            .replace(/{group}/g, groupName)
            .replace(/{desc}/g, groupMetadata?.desc || '')
            .replace(/{count}/g, groupMetadata?.participants?.length || '?');

        await ctx.send({
            text: welcomeText,
            mentions: [participant]
        });

        if (config.welcomeWithRules && groupMetadata?.desc) {
            await ctx.send(`📋 *Group Rules:*\n\n${groupMetadata.desc}`);
        }
    }
}

async function handleGroupLeave(ctx) {
    const { participants, groupName } = ctx;

    await pluginManager.executeHook('onGroupLeave', ctx);

    if (!config.goodbyeMessage) return;

    for (const participant of participants) {
        const goodbyeText = config.goodbyeMessage
            .replace(/{user}/g, `@${jidToPhone(participant)}`)
            .replace(/{group}/g, groupName);

        await ctx.send({
            text: goodbyeText,
            mentions: [participant]
        });
    }
}

async function handleGroupPromote(ctx) {
    const { participants, groupName } = ctx;

    await pluginManager.executeHook('onGroupPromote', ctx);

    if (!config.promoteMessage) return;

    for (const participant of participants) {
        await ctx.send({
            text: config.promoteMessage
                .replace(/{user}/g, `@${jidToPhone(participant)}`)
                .replace(/{group}/g, groupName),
            mentions: [participant]
        });
    }
}

async function handleGroupDemote(ctx) {
    const { participants, groupName } = ctx;

    await pluginManager.executeHook('onGroupDemote', ctx);

    if (!config.demoteMessage) return;

    for (const participant of participants) {
        await ctx.send({
            text: config.demoteMessage
                .replace(/{user}/g, `@${jidToPhone(participant)}`)
                .replace(/{group}/g, groupName),
            mentions: [participant]
        });
    }
}

export async function handleCall(sock, call) {
    const { from, id, status, isGroup, isVideo } = call;

    log.debug(`Call ${status} from ${from} (${isVideo ? 'video' : 'audio'})`);

    try {

        await pluginManager.executeHook('onCall', { sock, call, from, isVideo });

        if (config.rejectCalls && status === 'offer') {
            await sock.rejectCall(id, from);

            if (config.callRejectMessage) {
                await sock.sendMessage(from, {
                    text: config.callRejectMessage
                });
            }

            log.info(`Rejected ${isVideo ? 'video' : 'audio'} call from ${jidToPhone(from)}`);
        }
    } catch (err) {
        log.error('Call handler error:', err.message);
    }
}

export async function handlePresence(sock, presence) {
    const { id, presences } = presence;

    try {
        await pluginManager.executeHook('onPresenceUpdate', { sock, jid: id, presences });
    } catch (err) {
        log.error('Presence handler error:', err.message);
    }
}

export async function handleChannelUpdate(sock, update) {
    try {
        const ctx = {
            sock,
            type: update.type,
            update,
            channelId: update.id,
            send: async (content) => sock.sendMessage(update.id,
                typeof content === 'string' ? { text: content } : content)
        };

        await pluginManager.handleChannelUpdate(ctx);
    } catch (err) {
        log.error('Channel update handler error:', err.message);
    }
}

export async function handleMessageDelete(sock, msg) {
    try {
        const ctx = {
            sock,
            key: msg.key,
            jid: msg.key.remoteJid,
            messageId: msg.key.id,
            deletedBy: msg.key.participant || msg.key.remoteJid
        };

        await pluginManager.executeHook('onMessageDelete', ctx);

        if (config.antiDelete) {

            log.info(`Message ${msg.key.id} deleted by ${jidToPhone(ctx.deletedBy)}`);
        }
    } catch (err) {
        log.error('Message delete handler error:', err.message);
    }
}

export async function handleMessageUpdate(sock, update) {
    try {
        const ctx = {
            sock,
            key: update.key,
            update: update.update,
            jid: update.key.remoteJid,
            messageId: update.key.id
        };

        await pluginManager.executeHook('onMessageUpdate', ctx);
    } catch (err) {
        log.error('Message update handler error:', err.message);
    }
}

export default {
    handleMessage,
    handleGroupUpdate,
    handleCall,
    handlePresence,
    handleChannelUpdate,
    handleMessageDelete,
    handleMessageUpdate,

    buildContext,
    getMessageText,
    getMessageType,
    getQuotedMessage,
    getMentions,
    getButtonResponse,
    getPollVote,
    hasMedia,

    caches: {
        cooldown: cooldownCache,
        rateLimit: rateLimitCache,
        groupMetadata: groupMetadataCache,
        processedMessages,
        spam: spamTracker
    }
};
