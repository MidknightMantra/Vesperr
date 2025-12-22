import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { LRUCache } from 'lru-cache';
import { templates } from '../utils/deluxeUI.js';

const execAsync = promisify(exec);

const ICONS = {

    active: '●',
    inactive: '○',
    warning: '◐',

    diamond: '◆',
    hexagon: '⬡',
    square: '▣',

    arrow: '▸',
    pointer: '➤',

    success: '✓',
    error: '✗',

    owner: '⬡',
    system: '◈',
    user: '◇',
};

const bannedUsers = new LRUCache({
    max: 10000,
    ttl: 86400000 * 365,
});

const banReasons = new Map();

export function isBanned(jid) {
    const number = jid?.split('@')[0];
    return bannedUsers.has(number) || bannedUsers.has(jid);
}

export function banUser(jid, reason = 'No reason', bannedBy = 'Owner') {
    const number = jid?.split('@')[0];
    const banData = {
        reason,
        bannedAt: Date.now(),
        bannedBy,
        number
    };
    bannedUsers.set(number, banData);
    banReasons.set(number, banData);
}

export function unbanUser(jid) {
    const number = jid?.split('@')[0];
    bannedUsers.delete(number);
    bannedUsers.delete(jid);
    banReasons.delete(number);
}

export function getBannedUsers() {
    return Array.from(bannedUsers.entries());
}

export function getBanInfo(jid) {
    const number = jid?.split('@')[0];
    return banReasons.get(number) || bannedUsers.get(number);
}

export const evalCmd = {
    name: 'eval',
    alias: ['ev', '$', 'js', '>'],
    category: 'owner',
    desc: 'Execute JavaScript code',
    usage: '.eval <code>',
    cooldown: 0,
    ownerOnly: true,

    async execute({ sock, msg, args, prefix, db, pluginManager }) {
        const chat = msg.key.remoteJid;
        const user = msg.key.participant || msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.card(
                    'Eval',
                    [
                        'Execute JavaScript code',
                        'Variables: m, s, c, reply',
                        '',
                        `*Usage:* ${prefix}eval <code>`,
                        `*Example:* ${prefix}eval 2 + 2`
                    ]
                )
            }, { quoted: msg });
        }

        const code = args.join(' ');
        const startTime = Date.now();

        try {

            const m = msg;
            const s = sock;
            const c = chat;
            const u = user;
            const p = pluginManager;
            const d = db;
            const reply = (text) => sock.sendMessage(chat, { text: String(text) }, { quoted: msg });
            const send = (text, jid = chat) => sock.sendMessage(jid, { text: String(text) });

            let result = eval(code);

            if (result instanceof Promise) {
                result = await result;
            }

            let output;
            if (result === undefined) {
                output = 'undefined';
            } else if (result === null) {
                output = 'null';
            } else if (typeof result === 'object') {
                try {
                    output = JSON.stringify(result, null, 2);
                } catch {
                    output = String(result);
                }
            } else {
                output = String(result);
            }

            const execTime = Date.now() - startTime;
            output = output.slice(0, 3000);

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Eval Result',
                    {
                        'Output': `\`\`\`${output}\`\`\``,
                        'Time': `${execTime}ms`
                    }
                )
            }, { quoted: msg });

        } catch (error) {
            const execTime = Date.now() - startTime;

            await sock.sendMessage(chat, {
                text: templates.notification(
                    'Eval Error',
                    `\`\`\`${error.message}\`\`\``,
                    'error'
                )
            }, { quoted: msg });
        }
    },
};

export const execCmd = {
    name: 'exec',
    alias: ['shell', 'sh', 'bash', 'terminal', '#'],
    category: 'owner',
    desc: 'Execute shell commands',
    usage: '.exec <command>',
    cooldown: 0,
    ownerOnly: true,

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.card(
                    'Shell',
                    [
                        'Execute terminal commands',
                        'Timeout: 60 seconds',
                        '',
                        `*Usage:* ${prefix}exec <command>`,
                        `*Example:* ${prefix}exec ls`
                    ]
                )
            }, { quoted: msg });
        }

        const command = args.join(' ');
        const startTime = Date.now();

        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('Running', `Exec: \`${command.slice(0, 30)}...\``, 'warning'),
        }, { quoted: msg });

        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout: 60000,
                maxBuffer: 1024 * 1024 * 10,
            });

            const output = (stdout || stderr || 'No output').slice(0, 3000);
            const execTime = Date.now() - startTime;

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Shell Result',
                    {
                        'Command': `\`${command.slice(0, 50)}\``,
                        'Output': `\`\`\`${output}\`\`\``,
                        'Time': `${execTime}ms`
                    }
                ),
                edit: statusMsg.key,
            });

        } catch (error) {
            const execTime = Date.now() - startTime;
            const errorMsg = error.stderr || error.message || 'Unknown error';

            await sock.sendMessage(chat, {
                text: templates.notification(
                    'Shell Error',
                    `*$* \`${command.slice(0, 100)}\`\n\n\`\`\`${errorMsg.slice(0, 2000)}\`\`\``,
                    'error'
                ),
                edit: statusMsg.key,
            });
        }
    },
};

export const broadcast = {
    name: 'broadcast',
    alias: ['bc', 'announce'],
    category: 'owner',
    desc: 'Broadcast message to all chats',
    usage: '.broadcast <message>',
    cooldown: 60000,
    ownerOnly: true,

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.card(
                    'Broadcast',
                    [
                        'Send message to all chats',
                        '',
                        '*Flags:*',
                        '• `-g` Groups only',
                        '• `-p` Private only',
                        '• `-f` Forward quoted',
                        '',
                        `*Usage:* ${prefix}bc Hello everyone!`
                    ]
                )
            }, { quoted: msg });
        }

        let mode = 'all';
        let message = args.join(' ');
        let forward = false;

        if (args[0] === '-g') {
            mode = 'groups';
            message = args.slice(1).join(' ');
        } else if (args[0] === '-p') {
            mode = 'private';
            message = args.slice(1).join(' ');
        } else if (args[0] === '-f') {
            forward = true;
            message = args.slice(1).join(' ');
        }

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (forward && quoted) {
            message = quoted.conversation || quoted.extendedTextMessage?.text || message;
        }

        if (!message) {
            return sock.sendMessage(chat, {
                text: templates.notification('Error', 'No message provided!', 'error'),
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('Wait', `Broadcasting to ${mode}...`, 'warning'),
        }, { quoted: msg });

        try {

            const store = sock.store || {};
            const chats = Object.keys(store.chats || {});

            let sent = 0;
            let failed = 0;
            let skipped = 0;

            for (const jid of chats) {

                const isGroup = jid.endsWith('@g.us');
                if (mode === 'groups' && !isGroup) { skipped++; continue; }
                if (mode === 'private' && isGroup) { skipped++; continue; }
                if (jid === chat) { skipped++; continue; }

                try {
                    await sock.sendMessage(jid, {
                        text: templates.header('announcement', message),
                    });
                    sent++;

                    if (sent % 5 === 0) {
                        await sock.sendMessage(chat, {
                            text: templates.notification('Progress', `Sent: ${sent} | Failed: ${failed}`, 'warning'),
                            edit: statusMsg.key,
                        });
                    }

                    await new Promise(r => setTimeout(r, 1500));
                } catch {
                    failed++;
                }
            }

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Broadcast Complete',
                    {
                        'Sent': sent,
                        'Failed': failed,
                        'Skipped': skipped,
                        'Mode': mode
                    }
                ),
                edit: statusMsg.key,
            });

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.notification('Error', `Broadcast failed: ${error.message}`, 'error'),
                edit: statusMsg.key,
            });
        }
    },
};

export const ban = {
    name: 'ban',
    alias: ['block', 'blacklist'],
    category: 'owner',
    desc: 'Ban a user from using the bot',
    usage: '.ban @user [reason]',
    cooldown: 3000,
    ownerOnly: true,

    async execute({ sock, msg, args, prefix, pushName }) {
        const chat = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;

        let targetJid = mentioned[0] || quoted;

        if (!targetJid && args[0]) {
            const number = args[0].replace(/[^0-9]/g, '');
            if (number.length >= 10) {
                targetJid = number + '@s.whatsapp.net';
                args = args.slice(1);
            }
        }

        if (!targetJid) {
            return sock.sendMessage(chat, {
                text: templates.card(
                    'Ban User',
                    [
                        'Ban a user from using the bot',
                        '',
                        `*Usage:* ${prefix}ban @user [reason]`,
                        `*Example:* ${prefix}ban @spammer Spamming`
                    ]
                )
            }, { quoted: msg });
        }

        const reasonArgs = mentioned[0] ? args : args;
        const reason = reasonArgs.length > 0 ? reasonArgs.join(' ') : 'No reason specified';
        const number = targetJid.split('@')[0];

        if (isBanned(targetJid)) {
            return sock.sendMessage(chat, {
                text: templates.notification('Warning', `${number} is already banned!`, 'warning'),
            }, { quoted: msg });
        }

        banUser(targetJid, reason, pushName || 'Owner');

        await sock.sendMessage(chat, {
            text: templates.card(
                'User Banned',
                {
                    'Number': number,
                    'Reason': reason,
                    'By': pushName || 'Owner',
                    'Time': new Date().toLocaleString()
                }
            ),
            mentions: [targetJid],
        }, { quoted: msg });
    },
};

export const unban = {
    name: 'unban',
    alias: ['unblock', 'unblacklist', 'pardon'],
    category: 'owner',
    desc: 'Unban a user',
    usage: '.unban @user',
    cooldown: 3000,
    ownerOnly: true,

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;

        let targetJid = mentioned[0] || quoted;

        if (!targetJid && args[0]) {
            const number = args[0].replace(/[^0-9]/g, '');
            if (number.length >= 10) {
                targetJid = number + '@s.whatsapp.net';
            }
        }

        if (!targetJid) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', `${prefix}unban @user`, 'info'),
            }, { quoted: msg });
        }

        const number = targetJid.split('@')[0];

        if (!isBanned(targetJid)) {
            return sock.sendMessage(chat, {
                text: templates.notification('Warning', `${number} is not banned!`, 'warning'),
            }, { quoted: msg });
        }

        const banInfo = getBanInfo(targetJid);
        unbanUser(targetJid);

        await sock.sendMessage(chat, {
            text: templates.card(
                'User Unbanned',
                {
                    'Number': number,
                    'Note': 'User can now use the bot again',
                    'Was Banned For': banInfo ? banInfo.reason : 'N/A'
                }
            ),
            mentions: [targetJid],
        }, { quoted: msg });
    },
};

export const banlist = {
    name: 'banlist',
    alias: ['banned', 'blacklisted', 'bans'],
    category: 'owner',
    desc: 'Show banned users',
    usage: '.banlist',
    cooldown: 5000,
    ownerOnly: true,

    async execute({ sock, msg, prefix }) {
        const chat = msg.key.remoteJid;
        const banned = getBannedUsers();

        if (banned.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.notification('Banlist', 'No banned users found! Everyone is playing nice.', 'info'),
            }, { quoted: msg });
        }

        const listItems = banned.slice(0, 15).map(([number, data]) => {
            const reason = data?.reason || 'No reason';
            return `${number}: ${reason.slice(0, 30)}`;
        });

        await sock.sendMessage(chat, {
            text: templates.list('Banlist', listItems, { footer: `Use ${prefix}unban <number> to unban` })
        }, { quoted: msg });
    },
};

export const status = {
    name: 'status',
    alias: ['stats', 'info', 'botinfo', 'runtime', 'sys'],
    category: 'owner',
    desc: 'Show bot status and system info',
    usage: '.status',
    cooldown: 5000,

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;

        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        let uptimeStr = '';
        if (days > 0) uptimeStr += `${days}d `;
        if (hours > 0) uptimeStr += `${hours}h `;
        if (minutes > 0) uptimeStr += `${minutes}m `;
        uptimeStr += `${seconds}s`;

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = ((usedMem / totalMem) * 100).toFixed(1);

        const processMemory = process.memoryUsage();
        const heapUsed = (processMemory.heapUsed / 1024 / 1024).toFixed(1);
        const heapTotal = (processMemory.heapTotal / 1024 / 1024).toFixed(1);
        const rss = (processMemory.rss / 1024 / 1024).toFixed(1);

        const cpuUsage = os.loadavg();
        const cpuModel = os.cpus()[0]?.model?.split('@')[0]?.trim().slice(0, 35) || 'Unknown';

        const memBar = createProgressBar(parseFloat(memUsage), 100, 10);
        const heapBar = createProgressBar(parseFloat(heapUsed), parseFloat(heapTotal), 10);

        const fields = {
            'Runtime': uptimeStr,
            'Platform': `${os.platform()} ${os.arch()}`,
            'Node': process.version,
            'Memory System': `${(usedMem / 1024 / 1024 / 1024).toFixed(2)}/${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB (${memUsage}%)`,
            'Memory Heap': `${heapUsed}/${heapTotal} MB`,
            'CPU': cpuModel,
            'Banned': `${getBannedUsers().length} users`
        };

        await sock.sendMessage(chat, {
            text: templates.card('System Status', fields, { footer: 'Vesperr v3.0 Premium' })
        }, { quoted: msg });
    },
};

function createProgressBar(current, max, length = 10) {
    const percentage = Math.min(current / max, 1);
    const filled = Math.round(percentage * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}

export const restart = {
    name: 'restart',
    alias: ['reboot', 'restartvesperr'],
    category: 'owner',
    desc: 'Restart the bot',
    usage: '.restart',
    cooldown: 60000,
    ownerOnly: true,

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;

        await sock.sendMessage(chat, {
            text: templates.notification('Bot Status', 'Restarting Vesperr... Be right back!', 'warning'),
        }, { quoted: msg });

        setTimeout(() => {
            process.exit(0);
        }, 2000);
    },
};

export const setvar = {
    name: 'setvar',
    alias: ['setenv', 'env'],
    category: 'owner',
    desc: 'Set/view environment variables',
    usage: '.setvar [KEY=value]',
    cooldown: 3000,
    ownerOnly: true,

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            const safeVars = [
                'NODE_ENV', 'BOT_NAME', 'PREFIX', 'LOG_LEVEL',
                'OWNER_NUMBER', 'TZ', 'DEBUG'
            ];

            const envFields = {};
            for (const v of safeVars) {
                const value = process.env[v];
                envFields[v] = value ? value.slice(0, 30) : '_not set_';
            }

            return sock.sendMessage(chat, {
                text: templates.card('Environment', envFields, { footer: `Use ${prefix}setvar KEY=value` })
            }, { quoted: msg });
        }

        const input = args.join(' ');
        const [key, ...valueParts] = input.split('=');
        const value = valueParts.join('=');

        if (!key) {
            return sock.sendMessage(chat, {
                text: templates.notification('Error', `Invalid format. Use ${prefix}setvar KEY=value`, 'error'),
            }, { quoted: msg });
        }

        const trimmedKey = key.trim().toUpperCase();
        const trimmedValue = value?.trim() || '';

        const blockedKeys = ['API_KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'PRIVATE'];
        if (blockedKeys.some(blocked => trimmedKey.includes(blocked))) {
            return sock.sendMessage(chat, {
                text: templates.notification('Security', 'Cannot set sensitive variables via command!', 'error'),
            }, { quoted: msg });
        }

        if (trimmedValue === '') {

            delete process.env[trimmedKey];
            await sock.sendMessage(chat, {
                text: templates.notification('Success', `Variable ${trimmedKey} has been unset.`, 'success'),
            }, { quoted: msg });
        } else {

            process.env[trimmedKey] = trimmedValue;
            await sock.sendMessage(chat, {
                text: templates.notification('Success', `${trimmedKey} set to ${trimmedValue.slice(0, 30)}...`, 'success'),
            }, { quoted: msg });
        }
    },
};

export const clearcache = {
    name: 'clearcache',
    alias: ['cc', 'clearmem', 'gc'],
    category: 'owner',
    desc: 'Clear bot caches and run garbage collection',
    usage: '.clearcache',
    cooldown: 30000,
    ownerOnly: true,

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;

        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('Memory', 'Clearing caches and running GC...', 'warning'),
        }, { quoted: msg });

        try {
            const memBefore = process.memoryUsage().heapUsed;
            let cleared = 0;

            Object.keys(require.cache).forEach(key => {
                if (!key.includes('node_modules')) {
                    delete require.cache[key];
                    cleared++;
                }
            });

            if (global.gc) {
                global.gc();
            }

            const memAfter = process.memoryUsage().heapUsed;
            const freed = ((memBefore - memAfter) / 1024 / 1024).toFixed(2);

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Cache Cleared',
                    {
                        'Modules': cleared,
                        'Freed': `~${freed} MB`,
                        'Heap': `${(memAfter / 1024 / 1024).toFixed(1)} MB`
                    }
                ),
                edit: statusMsg.key,
            });

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.notification('Error', `Cache clear failed: ${error.message}`, 'error'),
                edit: statusMsg.key,
            });
        }
    },
};

export const join = {
    name: 'join',
    alias: ['joingroup', 'joingrp', 'jg'],
    category: 'owner',
    desc: 'Join a group via invite link',
    usage: '.join <invite link>',
    cooldown: 10000,
    ownerOnly: true,

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.card(
                    'Join Group',
                    [
                        'Join a WhatsApp group',
                        '',
                        `*Usage:* ${prefix}join <invite link>`,
                        `*Example:* ${prefix}join https://chat.whatsapp.com/ABC123`
                    ]
                )
            }, { quoted: msg });
        }

        const link = args[0];
        const codeMatch = link.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]{15,25})/);

        if (!codeMatch) {
            return sock.sendMessage(chat, {
                text: templates.notification('Error', 'Invalid invite link! Make sure it\'s a valid WhatsApp group link.', 'error'),
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('Wait', 'Joining group...', 'warning'),
        }, { quoted: msg });

        try {
            const code = codeMatch[1];
            const result = await sock.groupAcceptInvite(code);

            await sock.sendMessage(chat, {
                text: templates.notification('Success', `Successfully joined group: ${result?.slice(0, 30) || 'Unknown'}`, 'success'),
                edit: statusMsg.key,
            });

        } catch (error) {
            let errorMsg = error.message;

            if (errorMsg.includes('not-authorized')) {
                errorMsg = 'Invite link has expired or been revoked';
            } else if (errorMsg.includes('gone')) {
                errorMsg = 'Group no longer exists';
            } else if (errorMsg.includes('conflict')) {
                errorMsg = 'Already a member of this group';
            }

            await sock.sendMessage(chat, {
                text: templates.notification('Error', `Failed to join: ${errorMsg}`, 'error'),
                edit: statusMsg.key,
            });
        }
    },
};

export const leave = {
    name: 'leave',
    alias: ['leavegroup', 'bye', 'exit'],
    category: 'owner',
    desc: 'Leave current group',
    usage: '.leave',
    cooldown: 10000,
    ownerOnly: true,

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        let targetGroup = chat;
        if (args[0] && args[0].includes('@g.us')) {
            targetGroup = args[0];
        }

        if (!targetGroup.endsWith('@g.us')) {
            return sock.sendMessage(chat, {
                text: templates.notification('Error', 'This command only works in groups! Or specify a group: .leave <jid>', 'error'),
            }, { quoted: msg });
        }

        await sock.sendMessage(targetGroup, {
            text: templates.notification('Goodbye', 'Vesperr is leaving this group. It was nice being here!', 'info'),
        });

        await new Promise(r => setTimeout(r, 1000));
        await sock.groupLeave(targetGroup);

        if (targetGroup !== chat) {
            await sock.sendMessage(chat, {
                text: templates.notification('Success', `Left group: ${targetGroup}`, 'success'),
            }, { quoted: msg });
        }
    },
};

export const getlink = {
    name: 'getlink',
    alias: ['grouplink', 'link', 'invite'],
    category: 'owner',
    desc: 'Get group invite link',
    usage: '.getlink',
    cooldown: 5000,
    ownerOnly: true,

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;

        if (!chat.endsWith('@g.us')) {
            return sock.sendMessage(chat, {
                text: templates.notification('Error', 'This command only works in groups!', 'error'),
            }, { quoted: msg });
        }

        try {
            const code = await sock.groupInviteCode(chat);
            const link = `https://chat.whatsapp.com/${code}`;

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Group Link',
                    {
                        'Link': link,
                        'Note': 'Link will expire if revoked'
                    }
                )
            }, { quoted: msg });

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.notification('Error', 'Failed to get link. Make sure bot is admin!', 'error'),
            }, { quoted: msg });
        }
    },
};

export const ownerCommands = [
    evalCmd,
    execCmd,
    broadcast,
    ban,
    unban,
    banlist,
    status,
    restart,
    setvar,
    clearcache,
    join,
    leave,
    getlink,
];

export default ownerCommands;
