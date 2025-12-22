import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { templates } from '../utils/deluxeUI.js';

const warnings = new LRUCache({ max: 50000, ttl: 86400000 * 30 });
const spamTracker = new LRUCache({ max: 50000, ttl: 60000 });
const captchaStore = new LRUCache({ max: 10000, ttl: 300000 });
const actionLogs = new LRUCache({ max: 100000, ttl: 86400000 * 7 });
const groupSettings = new LRUCache({ max: 5000, ttl: 86400000 * 365 });

function getGroupMod(groupId) {
    return groupSettings.get(groupId) || {
        antispam: false,
        antilink: false,
        linkAction: 'delete',
        whitelistedLinks: [],
        spamLimit: 5,
        spamAction: 'warn',
        antibot: false,
        captcha: false,
        maxWarns: 3,
    };
}

function saveGroupMod(groupId, settings) {
    groupSettings.set(groupId, settings);
}

function logAction(groupId, action, by, target, reason) {
    const key = `${groupId}:${Date.now()}`;
    actionLogs.set(key, { action, by, target, reason, timestamp: Date.now(), groupId });
}

function getWarnings(groupId, userJid) {
    const key = `${groupId}:${userJid.split('@')[0]}`;
    return warnings.get(key) || [];
}

function addWarning(groupId, userJid, reason, by) {
    const key = `${groupId}:${userJid.split('@')[0]}`;
    const userWarnings = getWarnings(groupId, userJid);
    userWarnings.push({ reason, by: by.split('@')[0], timestamp: Date.now() });
    warnings.set(key, userWarnings);
    return userWarnings.length;
}

function clearWarnings(groupId, userJid) {
    warnings.delete(`${groupId}:${userJid.split('@')[0]}`);
}

export const warn = {
    name: 'warn',
    alias: ['warning'],
    category: 'moderation',
    desc: 'Warn a user',
    usage: '.warn @user [reason]',
    cooldown: 3000,
    groupOnly: true,
    adminOnly: true,
    react: '⚠️',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const targetJid = mentioned || quoted;

        if (!targetJid) return sock.sendMessage(chat, { text: templates.notification('Usage', 'Please @mention or reply to a user to warn.', 'warning') }, { quoted: msg });

        const reason = args.slice(1).join(' ') || 'No reason';
        const settings = getGroupMod(chat);
        const warnCount = addWarning(chat, targetJid, reason, sender);
        logAction(chat, 'warn', sender, targetJid, reason);

        await sock.sendMessage(chat, {
            text: templates.notification('Warned', `User @${targetJid.split('@')[0]} received a warning.\nReason: ${reason}\nTotal: ${warnCount}/${settings.maxWarns}`, 'warning'),
            mentions: [targetJid],
        }, { quoted: msg });

        if (warnCount >= settings.maxWarns) {
            try {
                await sock.groupParticipantsUpdate(chat, [targetJid], 'remove');
                clearWarnings(chat, targetJid);
                await sock.sendMessage(chat, { text: templates.notification('Removed', `@${targetJid.split('@')[0]} has been removed for exceeding max warnings.`, 'error'), mentions: [targetJid] });
            } catch (e) { }
        }
    },
};

export const unwarn = {
    name: 'unwarn',
    alias: ['clearwarn'],
    category: 'moderation',
    desc: 'Clear user warnings',
    usage: '.unwarn @user',
    cooldown: 3000,
    groupOnly: true,
    adminOnly: true,
    react: '✅',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const targetJid = mentioned || quoted;

        if (!targetJid) return sock.sendMessage(chat, { text: templates.notification('Usage', 'Please @mention or reply to a user to clear warnings.', 'warning') }, { quoted: msg });

        clearWarnings(chat, targetJid);
        await sock.sendMessage(chat, { text: templates.notification('Success', `Warnings cleared for @${targetJid.split('@')[0]}`, 'success'), mentions: [targetJid] }, { quoted: msg });
    },
};

export const warnlist = {
    name: 'warnings',
    alias: ['warns', 'warnlist'],
    category: 'moderation',
    desc: 'Check warnings',
    usage: '.warnings [@user]',
    cooldown: 3000,
    groupOnly: true,
    react: '📋',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const targetJid = mentioned || msg.key.participant;
        const userWarnings = getWarnings(chat, targetJid);
        const settings = getGroupMod(chat);

        if (userWarnings.length === 0) {
            return sock.sendMessage(chat, { text: templates.notification('Info', `@${targetJid.split('@')[0]} has no warnings.`, 'info'), mentions: [targetJid] }, { quoted: msg });
        }

        const listItems = userWarnings.map((w, i) => `${w.reason} (by ${w.by})`);

        await sock.sendMessage(chat, {
            text: templates.list(`Warnings: @${targetJid.split('@')[0]}`, listItems, {
                bullet: '⚠️',
                footer: `Status: ${userWarnings.length}/${settings.maxWarns}`
            }),
            mentions: [targetJid]
        }, { quoted: msg });
    },
};

export const antispam = {
    name: 'antispam',
    alias: ['spam'],
    category: 'moderation',
    desc: 'Toggle anti-spam',
    usage: '.antispam [on/off/limit]',
    cooldown: 3000,
    groupOnly: true,
    adminOnly: true,
    react: '🛡️',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const settings = getGroupMod(chat);
        const action = args[0]?.toLowerCase();

        if (!action) {
            return sock.sendMessage(chat, {
                text: templates.card('Anti-Spam Settings', {
                    'Status': settings.antispam ? '✅ Enabled' : '❌ Disabled',
                    'Limit': `${settings.spamLimit} msgs/min`,
                    'Action': settings.spamAction,
                    'Usage': `${prefix}antispam <on/off>\n${prefix}antispam limit <num>\n${prefix}antispam action <warn/kick/mute>`
                })
            }, { quoted: msg });
        }

        if (action === 'on') settings.antispam = true;
        else if (action === 'off') settings.antispam = false;
        else if (action === 'limit' && args[1]) settings.spamLimit = parseInt(args[1]) || 5;
        else if (action === 'action' && args[1]) settings.spamAction = args[1];

        saveGroupMod(chat, settings);
        await sock.sendMessage(chat, { text: templates.notification('Update', `Anti-Spam: ${settings.antispam ? 'Enabled' : 'Disabled'}${action === 'limit' ? ` (Limit: ${settings.spamLimit})` : ''}${action === 'action' ? ` (Action: ${settings.spamAction})` : ''}`, 'info') }, { quoted: msg });
    },
};

export async function checkSpam(sock, msg) {
    const chat = msg.key.remoteJid;
    if (!chat.endsWith('@g.us')) return false;

    const settings = getGroupMod(chat);
    if (!settings.antispam) return false;

    const sender = msg.key.participant;
    const key = `${chat}:${sender}`;
    const data = spamTracker.get(key) || { count: 0 };
    data.count++;
    spamTracker.set(key, data);

    if (data.count > settings.spamLimit) {
        spamTracker.delete(key);

        if (settings.spamAction === 'kick') {
            await sock.groupParticipantsUpdate(chat, [sender], 'remove');
            await sock.sendMessage(chat, { text: templates.notification('Anti-Spam', `@${sender.split('@')[0]} was removed for spamming.`, 'error'), mentions: [sender] });
        } else if (settings.spamAction === 'warn') {
            addWarning(chat, sender, 'Spamming', 'AutoMod');
            await sock.sendMessage(chat, { text: templates.notification('Anti-Spam', `@${sender.split('@')[0]} was warned for spamming.`, 'warning'), mentions: [sender] });
        } else {
            await sock.sendMessage(chat, { text: templates.notification('Slow Down', `@${sender.split('@')[0]}, please slow down!`, 'warning'), mentions: [sender] });
        }
        return true;
    }
    return false;
}

export const captcha = {
    name: 'captcha',
    alias: ['verify'],
    category: 'moderation',
    desc: 'Toggle captcha verification',
    usage: '.captcha [on/off]',
    cooldown: 3000,
    groupOnly: true,
    adminOnly: true,
    react: '🔐',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const settings = getGroupMod(chat);

        if (args[0] === 'on') settings.captcha = true;
        else if (args[0] === 'off') settings.captcha = false;
        else {
            return sock.sendMessage(chat, {
                text: templates.card('Captcha Verification', {
                    'Status': settings.captcha ? '✅ Enabled' : '❌ Disabled',
                    'Note': 'New members must verify their identity.',
                    'Usage': `${prefix}captcha <on/off>`
                }),
            }, { quoted: msg });
        }

        saveGroupMod(chat, settings);
        await sock.sendMessage(chat, { text: templates.notification('Update', `Captcha: ${settings.captcha ? 'Enabled' : 'Disabled'}`, 'info') }, { quoted: msg });
    },
};

export async function sendCaptcha(sock, groupId, userJid) {
    const settings = getGroupMod(groupId);
    if (!settings.captcha) return;

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    captchaStore.set(userJid, { code, groupId, attempts: 0 });

    await sock.sendMessage(groupId, {
        text: templates.notification('Verification', `@${userJid.split('@')[0]}, please type this code to verify:\n\n*${code}*\n\nYou have 5 minutes.`, 'warning'),
        mentions: [userJid],
    });
}

export async function verifyCaptcha(sock, msg) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const captchaData = captchaStore.get(sender);

    if (!captchaData) return false;

    if (text.toUpperCase() === captchaData.code) {
        captchaStore.delete(sender);
        await sock.sendMessage(captchaData.groupId, {
            text: templates.notification('Verified', `@${sender.split('@')[0]} has successfully verified!`, 'success'),
            mentions: [sender],
        });
        return true;
    }

    captchaData.attempts++;
    if (captchaData.attempts >= 3) {
        captchaStore.delete(sender);
        try {
            await sock.groupParticipantsUpdate(captchaData.groupId, [sender], 'remove');
            await sock.sendMessage(captchaData.groupId, {
                text: templates.notification('Failed', `@${sender.split('@')[0]} removed for failing verification.`, 'error'),
                mentions: [sender],
            });
        } catch (e) { }
    }

    return false;
}

const mutedUsers = new LRUCache({ max: 50000, ttl: 86400000 });

export const muteuser = {
    name: 'muteuser',
    alias: ['silence', 'shutup'],
    category: 'moderation',
    desc: 'Mute a user (delete their messages)',
    usage: '.muteuser @user [duration]',
    cooldown: 3000,
    groupOnly: true,
    adminOnly: true,
    react: '🔇',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const targetJid = mentioned || quoted;

        if (!targetJid) return sock.sendMessage(chat, { text: templates.notification('Usage', 'Please @mention or reply to a user to mute.', 'warning') }, { quoted: msg });

        const duration = parseInt(args[1]) || 60;
        const key = `${chat}:${targetJid}`;
        mutedUsers.set(key, { until: Date.now() + duration * 60000 });

        await sock.sendMessage(chat, {
            text: templates.notification('Muted', `@${targetJid.split('@')[0]} muted for ${duration} minutes.`, 'info'),
            mentions: [targetJid],
        }, { quoted: msg });
    },
};

export const unmuteuser = {
    name: 'unmuteuser',
    alias: ['unmute'],
    category: 'moderation',
    desc: 'Unmute a user',
    usage: '.unmuteuser @user',
    cooldown: 3000,
    groupOnly: true,
    adminOnly: true,
    react: '🔊',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const targetJid = mentioned || quoted;

        if (!targetJid) return sock.sendMessage(chat, { text: templates.notification('Usage', 'Please @mention or reply to a user to unmute.', 'warning') }, { quoted: msg });

        mutedUsers.delete(`${chat}:${targetJid}`);
        await sock.sendMessage(chat, { text: templates.notification('Unmuted', `@${targetJid.split('@')[0]} has been unmuted.`, 'success'), mentions: [targetJid] }, { quoted: msg });
    },
};

export function isUserMuted(groupId, userJid) {
    const key = `${groupId}:${userJid}`;
    const data = mutedUsers.get(key);
    if (!data) return false;
    if (Date.now() > data.until) {
        mutedUsers.delete(key);
        return false;
    }
    return true;
}

export const purge = {
    name: 'purge',
    alias: ['clear', 'clean'],
    category: 'moderation',
    desc: 'Delete multiple messages',
    usage: '.purge <count>',
    cooldown: 10000,
    groupOnly: true,
    adminOnly: true,
    react: '🗑️',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const count = Math.min(parseInt(args[0]) || 10, 50);

        await sock.sendMessage(chat, {
            text: templates.card('Purge Action', [
                `Target: ${count} messages`,
                '',
                'WhatsApp API limits bulk deletion.',
                'Messages older than 24h cannot be deleted.'
            ]),
        }, { quoted: msg });
    },
};

export const modset = {
    name: 'modset',
    alias: ['modsettings', 'modconfig'],
    category: 'moderation',
    desc: 'View/set moderation settings',
    usage: '.modset [setting] [value]',
    cooldown: 3000,
    groupOnly: true,
    adminOnly: true,
    react: '⚙️',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const settings = getGroupMod(chat);

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.card('Moderation Settings', {
                    'Anti-Spam': settings.antispam ? '✅ Enabled' : '❌ Disabled',
                    'Spam Limit': `${settings.spamLimit} msgs/min`,
                    'Spam Action': settings.spamAction,
                    'Captcha': settings.captcha ? '✅ Enabled' : '❌ Disabled',
                    'Max Warns': settings.maxWarns,
                    'Anti-Link': settings.antilink ? '✅ Enabled' : '❌ Disabled',
                    'Link Action': settings.linkAction || 'delete'
                })
            }, { quoted: msg });
        }

        const [setting, value] = args;

        if (setting === 'maxwarns' && value) {
            settings.maxWarns = parseInt(value) || 3;
            saveGroupMod(chat, settings);
            await sock.sendMessage(chat, { text: templates.notification('Update', `Max warnings set to ${settings.maxWarns}`, 'success') }, { quoted: msg });
        }
    },
};

const LINK_PATTERNS = [
    /https?:\/\/[^\s]+/gi,
    /(?:www\.)[^\s]+/gi,
    /(?:chat\.whatsapp\.com\/)[^\s]+/gi,
    /(?:wa\.me\/)[^\s]+/gi,
    /(?:t\.me\/)[^\s]+/gi,
    /(?:discord\.gg\/)[^\s]+/gi,
    /(?:bit\.ly\/)[^\s]+/gi,
    /(?:tinyurl\.com\/)[^\s]+/gi,
];

function containsLink(text) {
    if (!text) return false;
    return LINK_PATTERNS.some(pattern => pattern.test(text));
}

function isWhitelisted(text, whitelist = []) {
    if (!whitelist.length) return false;
    return whitelist.some(domain => text.toLowerCase().includes(domain.toLowerCase()));
}

export const antilink = {
    name: 'antilink',
    alias: ['nolink', 'linkguard'],
    category: 'moderation',
    desc: 'Toggle anti-link protection',
    usage: '.antilink <on/off> or .antilink action <delete/warn/kick> or .antilink whitelist <add/remove> <domain>',
    cooldown: 3000,
    react: '🔗',
    groupOnly: true,
    adminOnly: true,

    async execute({ sock, msg, args, isAdmin, isBotAdmin }) {
        const chat = msg.key.remoteJid;

        if (!isBotAdmin) {
            return sock.sendMessage(chat, { text: templates.notification('Error', 'I need admin rights to manage anti-link protection.', 'error') }, { quoted: msg });
        }

        const settings = getGroupMod(chat);

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.card('Anti-Link Settings', {
                    'Status': settings.antilink ? '✅ Enabled' : '❌ Disabled',
                    'Action': settings.linkAction || 'delete',
                    'Whitelisted': settings.whitelistedLinks?.length ? settings.whitelistedLinks.join(', ') : 'None',
                    'Usage': '.antilink on/off\n.antilink action <delete/warn/kick>\n.antilink whitelist add/remove <domain>'
                })
            }, { quoted: msg });
        }

        const subcommand = args[0].toLowerCase();

        if (subcommand === 'on') {
            settings.antilink = true;
            saveGroupMod(chat, settings);
            return sock.sendMessage(chat, {
                text: templates.notification('Update', `Anti-Link enabled. Action: ${settings.linkAction === 'delete' ? 'Delete' : settings.linkAction === 'warn' ? 'Warn' : 'Kick'}`, 'info'),
            }, { quoted: msg });
        }

        if (subcommand === 'off') {
            settings.antilink = false;
            saveGroupMod(chat, settings);
            return sock.sendMessage(chat, { text: templates.notification('Update', 'Anti-Link disabled.', 'info') }, { quoted: msg });
        }

        if (subcommand === 'action' && args[1]) {
            const action = args[1].toLowerCase();
            if (!['delete', 'warn', 'kick'].includes(action)) {
                return sock.sendMessage(chat, { text: '❌ Action must be: delete, warn, or kick' }, { quoted: msg });
            }
            settings.linkAction = action;
            saveGroupMod(chat, settings);
            return sock.sendMessage(chat, { text: templates.notification('Update', `Link action set to: ${action}`, 'info') }, { quoted: msg });
        }

        if (subcommand === 'whitelist' && args[1] && args[2]) {
            const action = args[1].toLowerCase();
            const domain = args[2].toLowerCase();

            if (action === 'add') {
                settings.whitelistedLinks = settings.whitelistedLinks || [];
                if (!settings.whitelistedLinks.includes(domain)) {
                    settings.whitelistedLinks.push(domain);
                    saveGroupMod(chat, settings);
                    return sock.sendMessage(chat, { text: templates.notification('Success', `Added *${domain}* to whitelist.`, 'success') }, { quoted: msg });
                }
                return sock.sendMessage(chat, { text: `⚠️ *${domain}* is already whitelisted` }, { quoted: msg });
            }

            if (action === 'remove') {
                settings.whitelistedLinks = (settings.whitelistedLinks || []).filter(d => d !== domain);
                saveGroupMod(chat, settings);
                return sock.sendMessage(chat, { text: templates.notification('Success', `Removed *${domain}* from whitelist.`, 'success') }, { quoted: msg });
            }
        }

        await sock.sendMessage(chat, { text: '❌ Invalid usage. Try `.antilink` for help.' }, { quoted: msg });
    },
};

export async function handleAntiLink(ctx) {
    const { sock, msg, jid: chat, sender, text, isGroup, isAdmin } = ctx;
    if (!isGroup || isAdmin) return false;

    const settings = getGroupMod(chat);
    if (!settings || !settings.antilink) return false;

    if (!containsLink(text)) return false;
    if (isWhitelisted(text, settings.whitelistedLinks)) return false;

    const action = settings.linkAction || 'delete';

    try {
        await sock.sendMessage(chat, { delete: msg.key });
    } catch (e) {
        console.log('Failed to delete link message:', e.message);
    }

    if (action === 'warn') {
        addWarning(chat, sender, 'Posted a link (antilink)', 'Vesperr');
        const warnCount = getWarnings(chat, sender).length;
        await sock.sendMessage(chat, {
            text: templates.notification('Anti-Link', `@${sender.split('@')[0]}, links are not allowed!\nWarning: ${warnCount}/${settings.maxWarns}`, 'warning'),
            mentions: [sender],
        });

        if (warnCount >= settings.maxWarns) {
            try {
                await sock.sendMessage(chat, { text: templates.notification('Removed', `@${sender.split('@')[0]} removed for exceeding warning limit.`, 'error'), mentions: [sender] });
            } catch (e) {
                console.log('Failed to kick user:', e.message);
            }
        }
    } else if (action === 'kick') {
        try {
            await sock.groupParticipantsUpdate(chat, [sender], 'remove');
            await sock.sendMessage(chat, {
                text: templates.notification('Removed', `@${sender.split('@')[0]} removed for posting links.`, 'error'),
                mentions: [sender],
            });
        } catch (e) {
            console.log('Failed to kick user:', e.message);
        }
    } else {
        await sock.sendMessage(chat, {
            text: templates.notification('Anti-Link', `@${sender.split('@')[0]}, links are not allowed in this group!`, 'warning'),
            mentions: [sender],
        });
    }

    logAction(chat, 'antilink', 'Vesperr', sender, 'Posted a link');
    return true;
}

export const moderationHandlers = {
    id: 'moderation_handler',
    onMessage: handleAntiLink
};

export const moderationCommands = [
    warn,
    unwarn,
    warnlist,
    antispam,
    captcha,
    muteuser,
    unmuteuser,
    purge,
    modset,
    antilink,
    moderationHandlers
];

export default moderationCommands;

export {
    getGroupMod,
    saveGroupMod,
    addWarning,
    clearWarnings,
    getWarnings,
    containsLink,
    isWhitelisted,
};
