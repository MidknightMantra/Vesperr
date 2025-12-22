import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

const scheduledMessages = new LRUCache({ max: 10000, ttl: 86400000 * 7 });
const activePolls = new LRUCache({ max: 5000, ttl: 86400000 });
const confessions = new LRUCache({ max: 50000, ttl: 86400000 * 30 });
const reports = new LRUCache({ max: 50000, ttl: 86400000 * 30 });

export const schedule = {
    name: 'schedule',
    alias: ['sched', 'timer', 'remind'],
    category: 'misc',
    desc: 'Schedule a message',
    usage: '.schedule <time> <message>',
    cooldown: 5000,
    react: '⏰',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (args.length < 2) {
            return sock.sendMessage(chat, {
                text: `⏰ *Message Scheduler*

*Usage:*
\`${prefix}schedule <time> <message>\`

*Time formats:*
• 30s, 5m, 2h, 1d
• 10:30 (today at 10:30)
• 2024-12-25 10:30

*Examples:*
\`${prefix}schedule 30m Meeting reminder!\`
\`${prefix}schedule 2h Check the oven\`

*Manage:*
\`${prefix}schedule list\` - View scheduled
\`${prefix}schedule cancel <id>\` - Cancel`,
            }, { quoted: msg });
        }

        if (args[0] === 'list') {
            const userSchedules = [];
            scheduledMessages.forEach((val, key) => {
                if (val.sender === sender) userSchedules.push({ id: key, ...val });
            });

            if (userSchedules.length === 0) {
                return sock.sendMessage(chat, { text: '⏰ No scheduled messages' }, { quoted: msg });
            }

            let text = '⏰ *Scheduled Messages*\n\n';
            userSchedules.slice(0, 10).forEach(s => {
                const timeLeft = Math.max(0, s.triggerAt - Date.now());
                const mins = Math.floor(timeLeft / 60000);
                text += `ID: \`${s.id.slice(0, 8)}\`\nIn ${mins}m: ${s.message.slice(0, 30)}...\n\n`;
            });

            return sock.sendMessage(chat, { text }, { quoted: msg });
        }

        if (args[0] === 'cancel') {
            const scheduleId = args[1];
            let found = false;

            scheduledMessages.forEach((val, key) => {
                if (key.startsWith(scheduleId) && val.sender === sender) {
                    clearTimeout(val.timeout);
                    scheduledMessages.delete(key);
                    found = true;
                }
            });

            return sock.sendMessage(chat, {
                text: found ? '✅ Schedule cancelled' : '❌ Schedule not found'
            }, { quoted: msg });
        }

        const timeStr = args[0].toLowerCase();
        let delayMs = 0;

        const timeMatch = timeStr.match(/^(\d+)(s|m|h|d)$/);
        if (timeMatch) {
            const value = parseInt(timeMatch[1]);
            const unit = timeMatch[2];
            switch (unit) {
                case 's': delayMs = value * 1000; break;
                case 'm': delayMs = value * 60000; break;
                case 'h': delayMs = value * 3600000; break;
                case 'd': delayMs = value * 86400000; break;
            }
        }

        if (delayMs < 10000 || delayMs > 7 * 86400000) {
            return sock.sendMessage(chat, { text: '❌ Time must be between 10s and 7 days' }, { quoted: msg });
        }

        const message = args.slice(1).join(' ');
        const scheduleId = crypto.randomUUID();

        const timeout = setTimeout(async () => {
            try {
                await sock.sendMessage(chat, {
                    text: `⏰ *Scheduled Message*\n\n${message}`,
                });
                scheduledMessages.delete(scheduleId);
            } catch (e) {
                console.error('Schedule send error:', e);
            }
        }, delayMs);

        scheduledMessages.set(scheduleId, {
            message,
            chat,
            sender,
            triggerAt: Date.now() + delayMs,
            timeout,
        });

        const mins = Math.floor(delayMs / 60000);
        await sock.sendMessage(chat, {
            text: `✅ *Scheduled!*\n\nID: \`${scheduleId.slice(0, 8)}\`\nIn: ${mins} minute(s)\nMessage: ${message.slice(0, 50)}...`,
        }, { quoted: msg });
    },
};

export const poll = {
    name: 'poll',
    alias: ['vote', 'survey'],
    category: 'misc',
    desc: 'Create a poll',
    usage: '.poll <question> | <option1> | <option2> ...',
    cooldown: 10000,
    react: '📊',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `📊 *Poll Creator*

*Usage:*
\`${prefix}poll Question | Option1 | Option2 | Option3\`

*Example:*
\`${prefix}poll Best color? | Red | Blue | Green\`

*Manage:*
\`${prefix}poll end\` - End active poll
\`${prefix}poll results\` - Show results`,
            }, { quoted: msg });
        }

        if (args[0] === 'end' || args[0] === 'results') {
            const activePoll = activePolls.get(chat);

            if (!activePoll) {
                return sock.sendMessage(chat, { text: '❌ No active poll' }, { quoted: msg });
            }

            const totalVotes = Object.values(activePoll.votes).reduce((a, b) => a + b.length, 0);
            let results = `📊 *Poll Results*\n\n❓ ${activePoll.question}\n\n`;

            activePoll.options.forEach((opt, i) => {
                const votes = activePoll.votes[i]?.length || 0;
                const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
                results += `${i + 1}. ${opt}\n[${bar}] ${votes} (${percent}%)\n\n`;
            });

            results += `Total votes: ${totalVotes}`;

            if (args[0] === 'end') {
                activePolls.delete(chat);
                results = '🏁 *Poll Ended!*\n\n' + results;
            }

            return sock.sendMessage(chat, { text: results }, { quoted: msg });
        }

        const input = args.join(' ');
        const parts = input.split('|').map(p => p.trim());

        if (parts.length < 3) {
            return sock.sendMessage(chat, { text: '❌ Need question + at least 2 options' }, { quoted: msg });
        }

        const question = parts[0];
        const options = parts.slice(1, 11);

        if (activePolls.has(chat)) {
            return sock.sendMessage(chat, { text: '❌ Poll already active. Use `.poll end` first.' }, { quoted: msg });
        }

        const pollId = crypto.randomUUID();
        const votes = {};
        options.forEach((_, i) => votes[i] = []);

        activePolls.set(chat, {
            id: pollId,
            question,
            options,
            votes,
            creator: sender,
            created: Date.now(),
        });

        let pollText = `📊 *NEW POLL*\n\n❓ ${question}\n\n`;
        options.forEach((opt, i) => {
            pollText += `*${i + 1}.* ${opt}\n`;
        });
        pollText += `\n_Vote by typing the number (1-${options.length})_`;

        await sock.sendMessage(chat, { text: pollText }, { quoted: msg });
    },
};

export async function handlePollVote(sock, msg) {
    const chat = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

    const poll = activePolls.get(chat);
    if (!poll) return false;

    const vote = parseInt(text);
    if (isNaN(vote) || vote < 1 || vote > poll.options.length) return false;

    const optionIndex = vote - 1;

    Object.values(poll.votes).forEach(voters => {
        const idx = voters.indexOf(sender);
        if (idx > -1) voters.splice(idx, 1);
    });

    poll.votes[optionIndex].push(sender);
    activePolls.set(chat, poll);

    await sock.sendMessage(chat, {
        text: `✅ @${sender.split('@')[0]} voted for *${poll.options[optionIndex]}*`,
        mentions: [sender],
    });

    return true;
}

const confessionChannels = new LRUCache({ max: 1000, ttl: 86400000 * 365 });

export const confession = {
    name: 'confession',
    alias: ['confess', 'anon'],
    category: 'misc',
    desc: 'Send anonymous confession',
    usage: '.confession <message>',
    cooldown: 60000,
    react: '🤫',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `🤫 *Anonymous Confessions*

*Send confession:*
\`${prefix}confess <your message>\`

*Admin commands:*
\`${prefix}confess setup\` - Enable in group
\`${prefix}confess disable\` - Disable

_Your identity stays completely anonymous!_`,
            }, { quoted: msg });
        }

        if (args[0] === 'setup' && chat.endsWith('@g.us')) {
            confessionChannels.set(chat, { enabled: true });
            return sock.sendMessage(chat, { text: '✅ Confessions enabled in this group!' }, { quoted: msg });
        }

        if (args[0] === 'disable' && chat.endsWith('@g.us')) {
            confessionChannels.delete(chat);
            return sock.sendMessage(chat, { text: '❌ Confessions disabled' }, { quoted: msg });
        }

        const confessionText = args.join(' ');

        if (confessionText.length < 10) {
            return sock.sendMessage(chat, { text: '❌ Confession too short (min 10 chars)' }, { quoted: msg });
        }

        if (confessionText.length > 1000) {
            return sock.sendMessage(chat, { text: '❌ Confession too long (max 1000 chars)' }, { quoted: msg });
        }

        if (chat.endsWith('@g.us') && confessionChannels.has(chat)) {
            const confessionId = crypto.randomBytes(4).toString('hex');

            confessions.set(confessionId, {
                sender,
                group: chat,
                message: confessionText,
                timestamp: Date.now(),
            });

            await sock.sendMessage(chat, {
                text: `🤫 *Anonymous Confession #${confessionId}*\n\n${confessionText}\n\n_Reply with \`.reply ${confessionId} <message>\` to respond anonymously_`,
            });
        } else {

            await sock.sendMessage(sender, {
                text: `🤫 *Your confession was sent anonymously!*\n\n"${confessionText.slice(0, 100)}..."`,
            });
        }
    },
};

const reportChannels = new LRUCache({ max: 1000, ttl: 86400000 * 365 });

export const report = {
    name: 'report',
    alias: ['reportuser', 'reportbug'],
    category: 'misc',
    desc: 'Report a user or issue',
    usage: '.report @user <reason>',
    cooldown: 30000,
    react: '🚨',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `🚨 *Report System*

*Report user:*
\`${prefix}report @user <reason>\`

*Report bug:*
\`${prefix}report bug <description>\`

*Admin:*
\`${prefix}report setup <chat jid>\` - Set report channel
\`${prefix}report list\` - View reports`,
            }, { quoted: msg });
        }

        if (args[0] === 'setup') {
            reportChannels.set('default', args[1] || chat);
            return sock.sendMessage(chat, { text: '✅ Report channel configured' }, { quoted: msg });
        }

        if (args[0] === 'list') {
            const allReports = [];
            reports.forEach((val, key) => allReports.push({ id: key, ...val }));

            if (allReports.length === 0) {
                return sock.sendMessage(chat, { text: '📋 No reports' }, { quoted: msg });
            }

            let text = '🚨 *Recent Reports*\n\n';
            allReports.slice(-10).forEach(r => {
                text += `#${r.id.slice(0, 6)} | ${r.type}\n${r.reason.slice(0, 50)}...\n\n`;
            });

            return sock.sendMessage(chat, { text }, { quoted: msg });
        }

        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const reportId = crypto.randomBytes(4).toString('hex');

        let reportType = 'general';
        let reportTarget = null;
        let reason = args.join(' ');

        if (args[0] === 'bug') {
            reportType = 'bug';
            reason = args.slice(1).join(' ');
        } else if (mentioned) {
            reportType = 'user';
            reportTarget = mentioned;
            reason = args.slice(1).join(' ');
        }

        if (reason.length < 10) {
            return sock.sendMessage(chat, { text: '❌ Please provide more details' }, { quoted: msg });
        }

        reports.set(reportId, {
            type: reportType,
            target: reportTarget,
            reason,
            reporter: sender,
            chat,
            timestamp: Date.now(),
            status: 'pending',
        });

        await sock.sendMessage(chat, {
            text: `✅ *Report Submitted*\n\nID: #${reportId}\nType: ${reportType}\n\nThank you for your report!`,
        }, { quoted: msg });

        const reportChannel = reportChannels.get('default');
        if (reportChannel) {
            await sock.sendMessage(reportChannel, {
                text: `🚨 *New Report #${reportId}*\n\nType: ${reportType}\n${reportTarget ? `Target: @${reportTarget.split('@')[0]}\n` : ''}Reporter: @${sender.split('@')[0]}\n\nReason:\n${reason}`,
                mentions: [sender, reportTarget].filter(Boolean),
            });
        }
    },
};

export const pick = {
    name: 'pick',
    alias: ['choose', 'random', 'select'],
    category: 'misc',
    desc: 'Pick random option or member',
    usage: '.pick <option1> | <option2> OR .pick member',
    cooldown: 3000,
    react: '🎲',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: '🎲 Usage:\n`.pick opt1 | opt2 | opt3`\n`.pick member` (random group member)',
            }, { quoted: msg });
        }

        if (args[0] === 'member' && chat.endsWith('@g.us')) {
            try {
                const metadata = await sock.groupMetadata(chat);
                const members = metadata.participants.map(p => p.id);
                const picked = members[Math.floor(Math.random() * members.length)];

                return sock.sendMessage(chat, {
                    text: `🎲 *Random Member*\n\n@${picked.split('@')[0]}`,
                    mentions: [picked],
                }, { quoted: msg });
            } catch (e) {
                return sock.sendMessage(chat, { text: '❌ Failed to get members' }, { quoted: msg });
            }
        }

        const options = args.join(' ').split('|').map(o => o.trim()).filter(Boolean);

        if (options.length < 2) {
            return sock.sendMessage(chat, { text: '❌ Provide at least 2 options separated by |' }, { quoted: msg });
        }

        const picked = options[Math.floor(Math.random() * options.length)];

        await sock.sendMessage(chat, {
            text: `🎲 *Random Pick*\n\nOptions: ${options.join(', ')}\n\n✨ Winner: *${picked}*`,
        }, { quoted: msg });
    },
};

export const repo = {
    name: 'repo',
    alias: ['repository', 'github', 'source', 'sc', 'script'],
    category: 'misc',
    desc: 'Get Vesperr repository info',
    usage: '.repo',
    cooldown: 5000,
    react: '📦',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;

        const GITHUB_USER = 'MidknightMantra';
        const REPO_NAME = 'Vesperr';
        const REPO_URL = `https://github.com/${GITHUB_USER}/${REPO_NAME}`;

        try {

            const res = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}`);
            const data = await res.json();

            const stars = data.stargazers_count || 0;
            const forks = data.forks_count || 0;
            const watchers = data.subscribers_count || 0;
            const issues = data.open_issues_count || 0;
            const language = data.language || 'JavaScript';
            const license = data.license?.name || 'MIT';
            const updatedAt = data.updated_at ? new Date(data.updated_at).toLocaleDateString() : 'Unknown';

            await sock.sendMessage(chat, {
                text: `╭─────────────────────╮
│    ✧ *VESPERR* ✧
╰─────────────────────╯

📦 *Repository Information*

👤 *Author:* @${GITHUB_USER}
📁 *Repo:* ${REPO_NAME}
🔗 *URL:* ${REPO_URL}

📊 *Stats:*
⭐ Stars: ${stars}
🍴 Forks: ${forks}
👀 Watchers: ${watchers}
❗ Open Issues: ${issues}

💻 *Language:* ${language}
📄 *License:* ${license}
📅 *Last Updated:* ${updatedAt}

───────────────────

🔘 *Deploy Now:*
${REPO_URL}

📢 *Channel:* wa.me/channel/0029VbBs1ph6RGJlhteNql3r
💬 *Support:* wa.me/li8sOw8WEBZAxreBovBZf2

───────────────────
_*Vesperr* ⋆ Repository_`,
            }, { quoted: msg });

        } catch (error) {

            await sock.sendMessage(chat, {
                text: `╭─────────────────────╮
│    ✧ *VESPERR* ✧
╰─────────────────────╯

📦 *Repository Information*

👤 *Author:* @${GITHUB_USER}
📁 *Repo:* ${REPO_NAME}
🔗 *URL:* ${REPO_URL}

───────────────────

🔘 *Deploy Now:*
${REPO_URL}

📢 *Channel:* wa.me/channel/0029VbBs1ph6RGJlhteNql3r
💬 *Support:* wa.me/li8sOw8WEBZAxreBovBZf2

───────────────────
_*Vesperr* ⋆ Repository_`,
            }, { quoted: msg });
        }
    },
};

export const miscCommands = [
    schedule,
    poll,
    confession,
    report,
    pick,
    repo,
];

export default miscCommands;
