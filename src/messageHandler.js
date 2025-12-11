import { isJidGroup } from '@whiskeysockets/baileys';
import config from './config.js';
import pluginManager from './pluginManager.js';
import { log } from './utils/logger.js';
import { jidToPhone } from './utils/jid.js';

function getMessageText(msg) {
    const m = msg.message;
    if (!m) return '';
    return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '';
}

async function buildContext(sock, msg, extra = {}) {
    const jid = msg.key.remoteJid;
    const isGroup = isJidGroup(jid);
    const sender = extra.sender || (isGroup ? msg.key.participant || msg.key.participantAlt : jid);
    const text = getMessageText(msg);

    let groupMetadata = null, isAdmin = false, isBotAdmin = false;

    if (isGroup) {
        try {
            groupMetadata = await sock.groupMetadata(jid);
            const botId = sock.user?.id?.replace(/:.*@/, '@');
            for (const p of groupMetadata.participants) {
                const pId = p.id.replace(/:.*@/, '@');
                if (pId === sender?.replace(/:.*@/, '@') && (p.admin === 'admin' || p.admin === 'superadmin')) isAdmin = true;
                if (pId === botId && (p.admin === 'admin' || p.admin === 'superadmin')) isBotAdmin = true;
            }
        } catch { }
    }

    return {
        msg, text, jid, sender, senderNumber: jidToPhone(sender),
        isGroup, isOwner: config.isOwner(sender), isAdmin, isBotAdmin, isFromMe: msg.key.fromMe,
        groupMetadata, groupName: groupMetadata?.subject || '',
        ...extra,
        reply: async (content) => sock.sendMessage(jid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
        send: async (content) => sock.sendMessage(jid, typeof content === 'string' ? { text: content } : content),
        react: async (emoji) => sock.sendMessage(jid, { react: { text: emoji, key: msg.key } })
    };
}

export async function handleMessage(sock, msg, extra = {}) {
    try {
        if (msg.key.remoteJid === 'status@broadcast' || !msg.message) return;
        if (msg.message.protocolMessage || msg.message.senderKeyDistributionMessage) return;

        const text = getMessageText(msg);
        const ctx = await buildContext(sock, msg, extra);

        if (!config.shouldRespond(ctx.isGroup, ctx.isOwner)) return;
        if (!text.startsWith(config.prefix)) return;

        const result = pluginManager.findCommand(text);
        if (!result) return;

        const { plugin, match } = result;

        if (plugin.isOwner && !ctx.isOwner) return ctx.reply('⛔ Owner only.');
        if (plugin.isGroup && !ctx.isGroup) return ctx.reply('⛔ Groups only.');
        if (plugin.isAdmin && !ctx.isAdmin && !ctx.isOwner) return ctx.reply('⛔ Admin only.');

        if (plugin.react) await ctx.react(plugin.react);

        log.command(plugin.name, ctx.senderNumber || ctx.sender);

        const args = text.slice(config.prefix.length).trim().split(/\s+/).slice(1);
        await plugin.handler({ sock, msg, args, context: ctx, match });

    } catch (err) {
        log.error('Message handler error:', err.message);
    }
}

export async function handleGroupUpdate(sock, update) {
    log.debug(`Group update: ${update.action} in ${update.id}`);
}

export default { handleMessage, handleGroupUpdate };
