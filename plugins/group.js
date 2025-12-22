import { LRUCache } from 'lru-cache';
import { templates } from '../utils/deluxeUI.js';

const groupSettings = new LRUCache({
    max: 5000,
    ttl: 86400000 * 30,
});

const warnings = new LRUCache({
    max: 50000,
    ttl: 86400000 * 7,
});

function isGroup(jid) {
    return jid?.endsWith('@g.us');
}

async function getGroupMetadata(sock, groupId) {
    try {
        return await sock.groupMetadata(groupId);
    } catch {
        return null;
    }
}

async function getGroupAdmins(sock, groupId) {
    const metadata = await getGroupMetadata(sock, groupId);
    if (!metadata) return [];
    return metadata.participants.filter(p => p.admin).map(p => p.id);
}

async function isBotAdmin(sock, groupId) {
    const botJid = sock.user?.id;
    const botNumber = botJid?.split(':')[0] || botJid?.split('@')[0];
    const admins = await getGroupAdmins(sock, groupId);
    return admins.some(a => a.includes(botNumber));
}

async function isUserAdmin(sock, groupId, userJid) {
    const userNumber = userJid?.split('@')[0];
    const admins = await getGroupAdmins(sock, groupId);
    return admins.some(a => a.includes(userNumber));
}

function getMentionedUsers(msg) {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quoted && !mentioned.includes(quoted)) {
        mentioned.push(quoted);
    }
    return mentioned;
}

function getGroupSettings(groupId) {
    return groupSettings.get(groupId) || {
        welcome: false,
        welcomeMsg: 'Welcome @user to *@group*! 👋\n\nEnjoy your stay!',
        goodbye: false,
        goodbyeMsg: 'Goodbye @user! 👋',
        antilink: false,
        antilinkAction: 'warn',
        antilinkWarnLimit: 3,
        antiSpam: false,
        muted: false,
        onlyAdmins: false,
    };
}

function saveGroupSettings(groupId, settings) {
    groupSettings.set(groupId, settings);
}

function getWarnings(groupId, userjid) {
    const key = `${groupId}:${userjid}`;
    return warnings.get(key) || 0;
}

function addWarning(groupId, userJid) {
    const key = `${groupId}:${userJid}`;
    const current = warnings.get(key) || 0;
    warnings.set(key, current + 1);
    return current + 1;
}

function clearWarnings(groupId, userJid) {
    const key = `${groupId}:${userJid}`;
    warnings.delete(key);
}

export const kick = {
    name: 'kick',
    alias: ['remove', 'out'],
    category: 'group',
    desc: 'Kick member from group',
    usage: '.kick @user',
    cooldown: 5000,
    groupOnly: true,
    adminOnly: true,
    react: '👢',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isBotAdmin(sock, chat)) {
            return sock.sendMessage(chat, { text: '❌ *I need admin rights!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        const mentioned = getMentionedUsers(msg);

        if (mentioned.length === 0) {
            return sock.sendMessage(chat, {
                text: '❓ *Mention or reply to user(s) to kick*\n\nUsage: `.kick @user`'
            }, { quoted: msg });
        }

        const admins = await getGroupAdmins(sock, chat);
        const toKick = mentioned.filter(u => !admins.includes(u));

        if (toKick.length === 0) {
            return sock.sendMessage(chat, { text: templates.notification('Error', 'I cannot kick admins or no users were specified.', 'error') }, { quoted: msg });
        }

        try {
            await sock.groupParticipantsUpdate(chat, toKick, 'remove');

            const names = toKick.map(u => `@${u.split('@')[0]}`).join(', ');
            await sock.sendMessage(chat, {
                text: templates.notification('Success', `Kicked members: ${names}`, 'success'),
                mentions: toKick,
            }, { quoted: msg });

        } catch (error) {
            console.error('Kick error:', error);
            await sock.sendMessage(chat, { text: templates.notification('Error', 'Failed to kick members. Make sure I have admin rights.', 'error') }, { quoted: msg });
        }
    },
};

export const add = {
    name: 'add',
    alias: ['invite'],
    category: 'group',
    desc: 'Add member to group',
    usage: '.add 1234567890',
    cooldown: 5000,
    groupOnly: true,
    adminOnly: true,
    react: '➕',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isBotAdmin(sock, chat)) {
            return sock.sendMessage(chat, { text: '❌ *I need admin rights!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', `Please provide phone numbers to add.\nExample: .add 1234567890`, 'warning')
            }, { quoted: msg });
        }

        const numbers = args.join(' ').match(/\d{10,15}/g);

        if (!numbers || numbers.length === 0) {
            return sock.sendMessage(chat, { text: templates.notification('Error', 'Invalid phone number format!', 'error') }, { quoted: msg });
        }

        const jids = numbers.map(n => n + '@s.whatsapp.net');

        try {
            const result = await sock.groupParticipantsUpdate(chat, jids, 'add');

            const added = [];
            const failed = [];

            result.forEach((r, i) => {
                if (r.status === '200') {
                    added.push(numbers[i]);
                } else {
                    failed.push(numbers[i]);
                }
            });

            const details = [];
            if (added.length > 0) details.push(`✅ Added: ${added.join(', ')}`);
            if (failed.length > 0) details.push(`❌ Failed: ${failed.join(', ')} (Private/Blocked)`);

            await sock.sendMessage(chat, { text: templates.card('Add Results', details) || templates.notification('Error', 'Failed to add members.', 'error') }, { quoted: msg });

        } catch (error) {
            console.error('Add error:', error);
            await sock.sendMessage(chat, { text: templates.notification('Error', 'Failed to add members.', 'error') }, { quoted: msg });
        }
    },
};

export const promote = {
    name: 'promote',
    alias: ['admin', 'makeadmin'],
    category: 'group',
    desc: 'Promote member to admin',
    usage: '.promote @user',
    cooldown: 5000,
    groupOnly: true,
    adminOnly: true,
    react: '👑',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isBotAdmin(sock, chat)) {
            return sock.sendMessage(chat, { text: '❌ *I need admin rights!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        const mentioned = getMentionedUsers(msg);

        if (mentioned.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', 'Please @mention common users to promote.', 'warning')
            }, { quoted: msg });
        }

        try {
            await sock.groupParticipantsUpdate(chat, mentioned, 'promote');

            const names = mentioned.map(u => `@${u.split('@')[0]}`).join(', ');
            await sock.sendMessage(chat, {
                text: templates.notification('Success', `Promoted to admin: ${names}`, 'success'),
                mentions: mentioned,
            }, { quoted: msg });

        } catch (error) {
            console.error('Promote error:', error);
            await sock.sendMessage(chat, { text: templates.notification('Error', 'Failed to promote members.', 'error') }, { quoted: msg });
        }
    },
};

export const demote = {
    name: 'demote',
    alias: ['unadmin', 'removeadmin'],
    category: 'group',
    desc: 'Demote admin to member',
    usage: '.demote @user',
    cooldown: 5000,
    groupOnly: true,
    adminOnly: true,
    react: '⬇️',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isBotAdmin(sock, chat)) {
            return sock.sendMessage(chat, { text: '❌ *I need admin rights!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        const mentioned = getMentionedUsers(msg);

        if (mentioned.length === 0) {
            return sock.sendMessage(chat, { text: templates.notification('Usage', 'Please @mention common users to demote.', 'warning') }, { quoted: msg });
        }

        try {
            await sock.groupParticipantsUpdate(chat, mentioned, 'demote');

            const names = mentioned.map(u => `@${u.split('@')[0]}`).join(', ');
            await sock.sendMessage(chat, {
                text: templates.notification('Success', `Demoted members: ${names}`, 'success'),
                mentions: mentioned,
            }, { quoted: msg });

        } catch (error) {
            console.error('Demote error:', error);
            await sock.sendMessage(chat, { text: templates.notification('Error', 'Failed to demote members.', 'error') }, { quoted: msg });
        }
    },
};

export const mute = {
    name: 'mute',
    alias: ['close', 'lock'],
    category: 'group',
    desc: 'Only admins can send messages',
    usage: '.mute',
    cooldown: 5000,
    groupOnly: true,
    adminOnly: true,
    react: '🔇',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isBotAdmin(sock, chat)) {
            return sock.sendMessage(chat, { text: '❌ *I need admin rights!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        try {
            await sock.groupSettingUpdate(chat, 'announcement');
            await sock.sendMessage(chat, { text: templates.notification('Group Muted', 'Only admins can send messages now.', 'info') }, { quoted: msg });
        } catch (error) {
            console.error('Mute error:', error);
            await sock.sendMessage(chat, { text: templates.notification('Error', 'Failed to mute group. Make sure I am admin.', 'error') }, { quoted: msg });
        }
    },
};

export const unmute = {
    name: 'unmute',
    alias: ['open', 'unlock'],
    category: 'group',
    desc: 'Everyone can send messages',
    usage: '.unmute',
    cooldown: 5000,
    groupOnly: true,
    adminOnly: true,
    react: '🔊',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isBotAdmin(sock, chat)) {
            return sock.sendMessage(chat, { text: '❌ *I need admin rights!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        try {
            await sock.groupSettingUpdate(chat, 'not_announcement');
            await sock.sendMessage(chat, { text: templates.notification('Group Unmuted', 'Everyone can send messages now.', 'info') }, { quoted: msg });
        } catch (error) {
            console.error('Unmute error:', error);
            await sock.sendMessage(chat, { text: templates.notification('Error', 'Failed to unmute group. Make sure I am admin.', 'error') }, { quoted: msg });
        }
    },
};

export const welcome = {
    name: 'welcome',
    alias: ['setwelcome', 'welcomemsg'],
    category: 'group',
    desc: 'Toggle/set welcome message',
    usage: '.welcome [on/off/message]',
    cooldown: 3000,
    groupOnly: true,
    adminOnly: true,
    react: '👋',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        const settings = getGroupSettings(chat);
        const action = args[0]?.toLowerCase();

        if (!action) {
            return sock.sendMessage(chat, {
                text: templates.card('Welcome Settings', {
                    'Status': settings.welcome ? '✅ Enabled' : '❌ Disabled',
                    'Message': settings.welcomeMsg,
                    'Variables': '@user, @group, @desc',
                    'Usage': `${prefix}welcome on/off\n${prefix}welcome <message>`
                })
            }, { quoted: msg });
        }

        if (action === 'on' || action === 'enable') {
            settings.welcome = true;
        } else if (action === 'off' || action === 'disable') {
            settings.welcome = false;
        } else {
            settings.welcome = true;
            settings.welcomeMsg = args.join(' ');
        }

        saveGroupSettings(chat, settings);
        await sock.sendMessage(chat, {
            text: templates.notification('Welcome Update', `Status: ${settings.welcome ? 'Enabled' : 'Disabled'}${settings.welcome ? `\nMessage: ${settings.welcomeMsg}` : ''}`, 'info'),
        }, { quoted: msg });
    },
};

export const goodbye = {
    name: 'goodbye',
    alias: ['setgoodbye', 'byemsg', 'bye'],
    category: 'group',
    desc: 'Toggle/set goodbye message',
    usage: '.goodbye [on/off/message]',
    cooldown: 3000,
    groupOnly: true,
    adminOnly: true,
    react: '👋',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        const settings = getGroupSettings(chat);
        const action = args[0]?.toLowerCase();

        if (!action) {
            return sock.sendMessage(chat, {
                text: templates.card('Goodbye Settings', {
                    'Status': settings.goodbye ? '✅ Enabled' : '❌ Disabled',
                    'Current Message': settings.goodbyeMsg,
                    'Usage': `${prefix}goodbye on/off\n${prefix}goodbye <message>`
                })
            }, { quoted: msg });
        }

        if (action === 'on' || action === 'enable') {
            settings.goodbye = true;
        } else if (action === 'off' || action === 'disable') {
            settings.goodbye = false;
        } else {
            settings.goodbye = true;
            settings.goodbyeMsg = args.join(' ');
        }

        saveGroupSettings(chat, settings);
        await sock.sendMessage(chat, {
            text: templates.notification('Goodbye Update', `Status: ${settings.goodbye ? 'Enabled' : 'Disabled'}${settings.goodbye ? `\nMessage: ${settings.goodbyeMsg}` : ''}`, 'info'),
        }, { quoted: msg });
    },
};

export const groupinfo = {
    name: 'groupinfo',
    alias: ['ginfo', 'gcinfo', 'group'],
    category: 'group',
    desc: 'Get group information',
    usage: '.groupinfo',
    cooldown: 5000,
    groupOnly: true,
    react: '📊',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        try {
            const metadata = await getGroupMetadata(sock, chat);

            if (!metadata) {
                return sock.sendMessage(chat, { text: '❌ *Failed to get group info*' }, { quoted: msg });
            }

            const admins = metadata.participants.filter(p => p.admin).length;
            const superAdmins = metadata.participants.filter(p => p.admin === 'superadmin').length;
            const settings = getGroupSettings(chat);

            await sock.sendMessage(chat, {
                text: templates.card('Group Information', {
                    'Name': metadata.subject,
                    'Created': new Date(metadata.creation * 1000).toLocaleDateString(),
                    'Creator': metadata.owner ? `@${metadata.owner.split('@')[0]}` : 'Unknown',
                    'Members': metadata.participants.length,
                    'Admins': `${admins} (${superAdmins} Super)`,
                    'Welcome': settings.welcome ? '✅' : '❌',
                    'Goodbye': settings.goodbye ? '✅' : '❌',
                    'Status': metadata.announce ? '🔇 Muted' : '🔊 Open',
                    'Description': metadata.desc || 'No description'
                }),
                mentions: metadata.owner ? [metadata.owner] : [],
            }, { quoted: msg });

        } catch (error) {
            console.error('Group info error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed to get group info*' }, { quoted: msg });
        }
    },
};

export const tagall = {
    name: 'tagall',
    alias: ['everyone', 'all', 'mentionall'],
    category: 'group',
    desc: 'Tag all members',
    usage: '.tagall [message]',
    cooldown: 30000,
    groupOnly: true,
    adminOnly: true,
    react: '📢',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        try {
            const metadata = await getGroupMetadata(sock, chat);
            const participants = metadata.participants.map(p => p.id);
            const message = args.join(' ') || 'Attention Everyone!';

            await sock.sendMessage(chat, {
                text: templates.notification('Tag All', message, 'info') + '\n\n' + participants.map(p => `@${p.split('@')[0]}`).join(' '),
                mentions: participants,
            }, { quoted: msg });

        } catch (error) {
            console.error('Tagall error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed to tag members*' }, { quoted: msg });
        }
    },
};

export const hidetag = {
    name: 'hidetag',
    alias: ['htag', 'h'],
    category: 'group',
    desc: 'Tag all members invisibly',
    usage: '.hidetag <message>',
    cooldown: 30000,
    groupOnly: true,
    adminOnly: true,
    react: '📢',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        const message = args.join(' ');

        if (!message) {
            return sock.sendMessage(chat, { text: templates.notification('Usage', 'Please provide a message to tag everyone.', 'warning') }, { quoted: msg });
        }

        try {
            const metadata = await getGroupMetadata(sock, chat);
            const participants = metadata.participants.map(p => p.id);

            await sock.sendMessage(chat, {
                text: message,
                mentions: participants,
            });

        } catch (error) {
            console.error('Hidetag error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed*' }, { quoted: msg });
        }
    },
};

export const invite = {
    name: 'invite',
    alias: ['link', 'grouplink', 'getlink'],
    category: 'group',
    desc: 'Get group invite link',
    usage: '.invite',
    cooldown: 10000,
    groupOnly: true,
    adminOnly: true,
    react: '🔗',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isBotAdmin(sock, chat)) {
            return sock.sendMessage(chat, { text: '❌ *I need admin rights!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        try {
            const code = await sock.groupInviteCode(chat);
            const link = `https://chat.whatsapp.com/${code}`;

            await sock.sendMessage(chat, {
                text: templates.card('Group Invite Link', link),
            }, { quoted: msg });

        } catch (error) {
            console.error('Invite error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed to get invite link*' }, { quoted: msg });
        }
    },
};

export const revoke = {
    name: 'revoke',
    alias: ['resetlink', 'newlink'],
    category: 'group',
    desc: 'Revoke group invite link',
    usage: '.revoke',
    cooldown: 30000,
    groupOnly: true,
    adminOnly: true,
    react: '🔄',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (!isGroup(chat)) {
            return sock.sendMessage(chat, { text: '❌ *Group only command!*' }, { quoted: msg });
        }

        if (!await isBotAdmin(sock, chat)) {
            return sock.sendMessage(chat, { text: '❌ *I need admin rights!*' }, { quoted: msg });
        }

        if (!await isUserAdmin(sock, chat, sender)) {
            return sock.sendMessage(chat, { text: '❌ *Admin only command!*' }, { quoted: msg });
        }

        try {
            await sock.groupRevokeInvite(chat);
            await sock.sendMessage(chat, {
                text: templates.notification('Success', 'Invite link revoked! Old links no longer work.', 'success'),
            }, { quoted: msg });

        } catch (error) {
            console.error('Revoke error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed to revoke link*' }, { quoted: msg });
        }
    },
};

export async function handleGroupMessage(ctx) {
    if (!ctx.isGroup) return;
    const chat = ctx.jid;
    const settings = getGroupSettings(chat);

}

export async function handleGroupParticipantsUpdate(sock, update) {
    const { id: chat, participants, action } = update;
    const settings = getGroupSettings(chat);

    if (action === 'add' && settings.welcome) {
        const metadata = await getGroupMetadata(sock, chat);

        for (const participant of participants) {
            let welcomeMsg = settings.welcomeMsg
                .replace(/@user/g, `@${participant.split('@')[0]}`)
                .replace(/@group/g, metadata?.subject || 'the group')
                .replace(/@desc/g, metadata?.desc || '');

            await sock.sendMessage(chat, {
                text: templates.notification('Welcome', welcomeMsg, 'info'),
                mentions: [participant],
            });
        }
    }

    if (action === 'remove' && settings.goodbye) {
        for (const participant of participants) {
            let goodbyeMsg = settings.goodbyeMsg
                .replace(/@user/g, `@${participant.split('@')[0]}`);

            await sock.sendMessage(chat, {
                text: templates.notification('Goodbye', goodbyeMsg, 'info'),
                mentions: [participant],
            });
        }
    }
}

export const groupHandlers = {
    id: 'group_handler',
    onMessage: handleGroupMessage,
    hooks: {
        onGroupJoin: async (ctx) => {
            const { action, jid, participants } = ctx;
            if (action === 'add') {
                await handleGroupParticipantsUpdate(ctx.sock, { id: jid, participants, action });
            }
        },
        onGroupLeave: async (ctx) => {
            const { action, jid, participants } = ctx;
            if (action === 'remove') {
                await handleGroupParticipantsUpdate(ctx.sock, { id: jid, participants, action });
            }
        }
    }
};

export const groupCommands = [
    kick,
    add,
    promote,
    demote,
    mute,
    unmute,
    welcome,
    goodbye,
    groupinfo,
    tagall,
    hidetag,
    invite,
    revoke,
    groupHandlers
];

export default groupCommands;

export {
    getGroupSettings,
    saveGroupSettings,
    getGroupAdmins,
    isBotAdmin,
    isUserAdmin,
};
