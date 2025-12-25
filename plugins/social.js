import { LRUCache } from 'lru-cache';
import fetch from 'node-fetch';
import { levelBar } from '../utils/deluxeUI.js';
import config from '../config.js';

const afkUsers = new LRUCache({ max: 10000, ttl: 86400000 * 7 });
const profiles = new LRUCache({ max: 50000, ttl: 86400000 * 365 });
const reputation = new LRUCache({ max: 50000, ttl: 86400000 * 365 });
const repCooldowns = new LRUCache({ max: 50000, ttl: 86400000 });

function getProfile(jid) {
    const id = jid.split('@')[0];
    if (!profiles.has(id)) {
        profiles.set(id, {
            bio: '',
            xp: 0,
            level: 1,
            messages: 0,
            lastMessage: 0,
            badges: [],
            joined: Date.now(),
        });
    }
    return profiles.get(id);
}

function saveProfile(jid, data) {
    profiles.set(jid.split('@')[0], data);
}

const XP_CONFIG = {
    MIN_XP: 10,
    MAX_XP: 25,
    COOLDOWN: 60000,
    LEVEL_MULTIPLIER: 100,
};

function calculateLevel(xp) {
    return Math.floor(0.1 * Math.sqrt(xp)) + 1;
}

function xpForLevel(level) {
    return Math.pow((level - 1) / 0.1, 2);
}

export async function addMessageXP(sock, msg) {
    const jid = msg.key.participant || msg.key.remoteJid;
    if (jid.includes('broadcast')) return;
    if (!config.levelingEnabled) return;

    const profile = getProfile(jid);
    const now = Date.now();

    if (now - profile.lastMessage < XP_CONFIG.COOLDOWN) {
        profile.messages++;
        saveProfile(jid, profile);
        return;
    }

    const xpGain = Math.floor(Math.random() * (XP_CONFIG.MAX_XP - XP_CONFIG.MIN_XP + 1)) + XP_CONFIG.MIN_XP;
    const oldLevel = profile.level;

    profile.xp += xpGain;
    profile.messages++;
    profile.lastMessage = now;
    profile.level = calculateLevel(profile.xp);

    saveProfile(jid, profile);

    if (profile.level > oldLevel) {
        const chat = msg.key.remoteJid;
        await sock.sendMessage(chat, {
            text: `🎉 *Level Up!*\n\n@${jid.split('@')[0]} reached level ${profile.level}! 🌟`,
            mentions: [jid],
        });
    }
}

export const afk = {
    name: 'afk',
    alias: ['away', 'brb'],
    category: 'social',
    desc: 'Set AFK status',
    usage: '.afk [reason]',
    cooldown: 5000,
    react: '💤',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const reason = args.join(' ') || 'AFK';

        afkUsers.set(userJid, {
            reason,
            since: Date.now(),
        });

        await sock.sendMessage(chat, {
            text: `─── ☆ *AFK* ☆ ───\n\n💤 @${userJid.split('@')[0]} is now away\n\n★ *Reason:* ${reason}\n\n───────────────────\n_*Vesperr* ⋆ Social_`,
            mentions: [userJid],
        }, { quoted: msg });
    },
};

export async function checkAFK(sock, msg) {
    const chat = msg.key.remoteJid;
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

    if (afkUsers.has(senderJid)) {
        const afkData = afkUsers.get(senderJid);
        const duration = Math.floor((Date.now() - afkData.since) / 60000);
        afkUsers.delete(senderJid);

        await sock.sendMessage(chat, {
            text: `👋 *Welcome back* @${senderJid.split('@')[0]}!\n\nYou were AFK for ${duration} minutes.`,
            mentions: [senderJid],
        });
    }

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    for (const jid of mentioned) {
        if (afkUsers.has(jid)) {
            const afkData = afkUsers.get(jid);
            const duration = Math.floor((Date.now() - afkData.since) / 60000);

            await sock.sendMessage(chat, {
                text: `💤 @${jid.split('@')[0]} is AFK\n📝 ${afkData.reason}\n⏱️ For ${duration} minutes`,
                mentions: [jid],
            });
        }
    }
}

export const bio = {
    name: 'bio',
    alias: ['setbio', 'about'],
    category: 'social',
    desc: 'Set or view bio',
    usage: '.bio [new bio]',
    cooldown: 5000,
    react: '📝',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const profile = getProfile(userJid);

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `─── ☆ *BIO* ☆ ───\n\n📝 *Your Bio:*\n${profile.bio || '_No bio set_'}\n\n★ Use \`.bio <text>\` to set\n\n───────────────────\n_*Vesperr* ⋆ Social_`,
            }, { quoted: msg });
        }

        const newBio = args.join(' ').slice(0, 200);
        profile.bio = newBio;
        saveProfile(userJid, profile);

        await sock.sendMessage(chat, {
            text: `─── ☆ *BIO UPDATED* ☆ ───\n\n✅ ${newBio}\n\n───────────────────\n_*Vesperr* ⋆ Social_`,
        }, { quoted: msg });
    },
};

export const profile = {
    name: 'profile',
    alias: ['me', 'myprofile', 'user'],
    category: 'social',
    desc: 'View user profile',
    usage: '.profile [@user]',
    cooldown: 5000,
    react: '👤',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const targetJid = mentioned || msg.key.participant || msg.key.remoteJid;

        const prof = getProfile(targetJid);
        const rep = reputation.get(targetJid.split('@')[0]) || 0;

        let levelingStats = '';
        if (config.levelingEnabled) {
            const nextLevelXp = xpForLevel(prof.level + 1);
            levelingStats = `┝╾─────── Statistics ───────╼
│ 🌟 *Level:* ${prof.level}
│ 💬 *Messages:* ${prof.messages.toLocaleString()}
│ 💠 *Reputation:* ${rep >= 0 ? '+' : ''}${rep}
│ ⚡ *Current XP:* ${prof.xp.toLocaleString()}
│
┝╾─────── Progression ──────╼
│ 🪐 *Next Level:* ${prof.level + 1}
│ 📊 [${levelBar(prof.xp % 100, 100, 15)}]
│`;
        } else {
            levelingStats = `┝╾─────── Statistics ───────╼
│ 💬 *Messages:* ${prof.messages.toLocaleString()}
│ 💠 *Reputation:* ${rep >= 0 ? '+' : ''}${rep}
│ 📊 *Leveling:* _Disabled_
│`;
        }



        const badges = prof.badges?.length > 0 ? prof.badges.join(' ') : '_None_';

        const text = `┌── 『 *USER PROFILE* 』 ──┐
│
│ 👤 *User:* @${targetJid.split('@')[0]}
│ 📝 *Bio:* ${prof.bio || '_Not set_'}
│
${levelingStats}
│
┝╾──────── Badges ────────╼
│ 🧿 ${badges}
│
└──────────────────────────╼
_*Vesperr Social Hub*_`;

        await sock.sendMessage(chat, { text, mentions: [targetJid] }, { quoted: msg });
    },
};

export const level = {
    name: 'level',
    alias: ['rank', 'xp', 'lvl'],
    category: 'social',
    desc: 'Check your level',
    usage: '.level [@user]',
    cooldown: 5000,
    react: '📊',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        if (!config.levelingEnabled) {
            return sock.sendMessage(chat, { text: '❌ *Leveling system is currently disabled.*' }, { quoted: msg });
        }
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const targetJid = mentioned || msg.key.participant || msg.key.remoteJid;

        const prof = getProfile(targetJid);
        const currentXp = prof.xp;
        const currentLevel = prof.level;
        const nextLevelXp = xpForLevel(currentLevel + 1);
        const prevLevelXp = xpForLevel(currentLevel);
        const progress = Math.floor(((currentXp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100);

        const filled = Math.floor(progress / 5);
        const progressBar = '▓'.repeat(filled) + '░'.repeat(20 - filled);

        await sock.sendMessage(chat, {
            text: `─── ☆ *LEVEL* ☆ ───\n\n👤 @${targetJid.split('@')[0]}\n\n🌟 *Level:* ${currentLevel}\n⭐ *XP:* ${currentXp.toLocaleString()}\n\n★ *Progress to Level ${currentLevel + 1}:*\n[ ${progressBar} ]\n${currentXp.toLocaleString()} / ${Math.floor(nextLevelXp).toLocaleString()} XP\n\n───────────────────\n_*Vesperr* ⋆ Social_`,
            mentions: [targetJid],
        }, { quoted: msg });
    },
};

export const rep = {
    name: 'rep',
    alias: ['reputation', '+rep', 'giverep'],
    category: 'social',
    desc: 'Give reputation to a user',
    usage: '.rep @user',
    cooldown: 5000,
    react: '⭐',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

        if (!mentioned) {
            return sock.sendMessage(chat, {
                text: `─── ☆ *REP* ☆ ───\n\n⭐ *Give Reputation*\n\n★ *Usage:* \`.rep @user\`\n\n───────────────────\n_*Vesperr* ⋆ Social_`,
            }, { quoted: msg });
        }

        if (mentioned === senderJid) {
            return sock.sendMessage(chat, { text: '❌ *You cannot rep yourself!*' }, { quoted: msg });
        }

        const cooldownKey = `${senderJid.split('@')[0]}-${mentioned.split('@')[0]}`;
        if (repCooldowns.has(cooldownKey)) {
            return sock.sendMessage(chat, { text: '⏰ *You already gave rep today!*' }, { quoted: msg });
        }

        const targetId = mentioned.split('@')[0];
        const currentRep = reputation.get(targetId) || 0;
        reputation.set(targetId, currentRep + 1);
        repCooldowns.set(cooldownKey, true);

        await sock.sendMessage(chat, {
            text: `─── ☆ *+1 REP* ☆ ───\n\n⭐ @${targetId} now has *${currentRep + 1}* rep!\n\n───────────────────\n_*Vesperr* ⋆ Social_`,
            mentions: [mentioned],
        }, { quoted: msg });
    },
};

export const levelingToggle = {
    name: 'leveling',
    alias: ['lvltoggle', 'setup-leveling'],
    category: 'social',
    desc: 'Toggle leveling system on/off',
    usage: '.leveling [on/off]',
    cooldown: 5000,
    react: '⚙️',

    async execute({ sock, msg, args, isAdmin, isOwner }) {
        const chat = msg.key.remoteJid;
        if (!isAdmin && !isOwner) {
            return sock.sendMessage(chat, { text: '❌ *Admins only!*' }, { quoted: msg });
        }

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `─── ☆ *LEVELING* ☆ ───\n\n📊 *Status:* ${config.levelingEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n★ *Usage:* \`.leveling on\` or \`.leveling off\`\n\n───────────────────\n_*Vesperr* ⋆ Social_`,
            }, { quoted: msg });
        }

        const action = args[0].toLowerCase();
        if (action === 'on' || action === 'enable') {
            config.levelingEnabled = true;
            config.save();
            await sock.sendMessage(chat, { text: '✅ *Leveling system has been enabled.*' }, { quoted: msg });
        } else if (action === 'off' || action === 'disable') {
            config.levelingEnabled = false;
            config.save();
            await sock.sendMessage(chat, { text: '❌ *Leveling system has been disabled.*' }, { quoted: msg });
        } else {
            await sock.sendMessage(chat, { text: '❓ *Invalid action. Use "on" or "off".*' }, { quoted: msg });
        }
    },
};

export const levels = {
    name: 'levels',
    alias: ['xpleaderboard', 'toplevel', 'lvlboard'],
    category: 'social',
    desc: 'View level leaderboard',
    usage: '.levels',
    cooldown: 10000,
    react: '🏆',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        if (!config.levelingEnabled) {
            return sock.sendMessage(chat, { text: '❌ *Leveling system is currently disabled.*' }, { quoted: msg });
        }

        const allProfiles = Array.from(profiles.entries());
        const sorted = allProfiles
            .map(([id, data]) => ({ id, level: data.level, xp: data.xp }))
            .sort((a, b) => b.xp - a.xp)
            .slice(0, 10);

        if (sorted.length === 0) {
            return sock.sendMessage(chat, { text: '🏆 *No users yet!*' }, { quoted: msg });
        }

        let list = '';
        const medals = ['🥇', '🥈', '🥉'];
        sorted.forEach((user, i) => {
            const medal = medals[i] || `${i + 1}.`;
            list += `${medal} ${user.id}\n   Lv.${user.level} • ${user.xp.toLocaleString()} XP\n`;
        });

        await sock.sendMessage(chat, {
            text: `─── ☆ *LEADERBOARD* ☆ ───\n\n${list}\n───────────────────\n_*Vesperr* ⋆ Social_`,
        }, { quoted: msg });
    },
};

export const seen = {
    name: 'seen',
    alias: ['lastseen', 'lastactive'],
    category: 'social',
    desc: 'Check when user was last active',
    usage: '.seen @user',
    cooldown: 5000,
    react: '👀',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

        if (!mentioned) {
            return sock.sendMessage(chat, {
                text: `─── ☆ *SEEN* ☆ ───\n\n👀 *Check Last Active*\n\n★ *Usage:* \`.seen @user\`\n\n───────────────────\n_*Vesperr* ⋆ Social_`,
            }, { quoted: msg });
        }

        const prof = getProfile(mentioned);

        if (!prof.lastMessage) {
            return sock.sendMessage(chat, {
                text: `👀 @${mentioned.split('@')[0]} has never been seen.`,
                mentions: [mentioned],
            }, { quoted: msg });
        }

        const lastSeen = new Date(prof.lastMessage);
        const timeSince = Date.now() - prof.lastMessage;
        const minutes = Math.floor(timeSince / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        let timeStr;
        if (days > 0) timeStr = `${days}d ago`;
        else if (hours > 0) timeStr = `${hours}h ago`;
        else timeStr = `${minutes}m ago`;

        await sock.sendMessage(chat, {
            text: `─── ☆ *LAST SEEN* ☆ ───\n\n👀 @${mentioned.split('@')[0]}\n\n★ *Active:* ${timeStr}\n☆ *Time:* ${lastSeen.toLocaleString()}\n\n───────────────────\n_*Vesperr* ⋆ Social_`,
            mentions: [mentioned],
        }, { quoted: msg });
    },
};

export const tiktokstalk = {
    name: 'tiktokstalk',
    alias: ['ttstalk', 'ttuser', 'tiktokuser'],
    category: 'social',
    desc: 'Get TikTok user info',
    usage: '.tiktokstalk <username>',
    cooldown: 5000,
    react: '🎵',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length === 0) {
            return sock.sendMessage(chat, { text: '❌ Usage: `.tiktokstalk <username>`' }, { quoted: msg });
        }

        const username = args[0].replace('@', '');
        const statusMsg = await sock.sendMessage(chat, { text: `🎵 *Fetching TikTok user...*` }, { quoted: msg });

        try {
            const res = await fetch(`https://api.giftedtech.co.ke/api/stalk/tiktok?apikey=gifted&username=${encodeURIComponent(username)}`);
            const data = await res.json();

            if (data.status && data.result) {
                const u = data.result;
                await sock.sendMessage(chat, {
                    text: `🎵 *TikTok User*

👤 *Name:* ${u.nickname || u.name || username}
📛 *Username:* @${u.username || username}
📝 *Bio:* ${u.bio || 'No bio'}

📊 *Stats:*
👥 Followers: ${u.followers?.toLocaleString() || 0}
👤 Following: ${u.following?.toLocaleString() || 0}
❤️ Likes: ${u.likes?.toLocaleString() || 0}
🎬 Videos: ${u.videos || 0}

${u.verified ? '✅ *Verified Account*' : ''}

───────────────────
_*Vesperr* ⋆ TikTok_`,
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, { text: `❌ *User not found*`, edit: statusMsg.key });
            }
        } catch (error) {
            await sock.sendMessage(chat, { text: '❌ *Failed to fetch user*', edit: statusMsg.key });
        }
    },
};

export const igstalk = {
    name: 'igstalk',
    alias: ['instastalk', 'iguser', 'instagramuser'],
    category: 'social',
    desc: 'Get Instagram user info',
    usage: '.igstalk <username>',
    cooldown: 5000,
    react: '📸',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length === 0) {
            return sock.sendMessage(chat, { text: '❌ Usage: `.igstalk <username>`' }, { quoted: msg });
        }

        const username = args[0].replace('@', '');
        const statusMsg = await sock.sendMessage(chat, { text: `📸 *Fetching Instagram user...*` }, { quoted: msg });

        try {
            const res = await fetch(`https://api.giftedtech.co.ke/api/stalk/instagram?apikey=gifted&username=${encodeURIComponent(username)}`);
            const data = await res.json();

            if (data.status && data.result) {
                const u = data.result;
                await sock.sendMessage(chat, {
                    text: `📸 *Instagram User*

👤 *Name:* ${u.fullname || u.name || username}
📛 *Username:* @${u.username || username}
📝 *Bio:* ${u.bio || 'No bio'}

📊 *Stats:*
👥 Followers: ${u.followers?.toLocaleString() || 0}
👤 Following: ${u.following?.toLocaleString() || 0}
📷 Posts: ${u.posts || 0}

${u.isPrivate ? '🔒 *Private Account*' : '🌐 *Public Account*'}
${u.isVerified ? '✅ *Verified*' : ''}

───────────────────
_*Vesperr* ⋆ Instagram_`,
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, { text: `❌ *User not found*`, edit: statusMsg.key });
            }
        } catch (error) {
            await sock.sendMessage(chat, { text: '❌ *Failed to fetch user*', edit: statusMsg.key });
        }
    },
};

export const ytstalk = {
    name: 'ytstalk',
    alias: ['youtubestalk', 'ytchannel', 'ytuser'],
    category: 'social',
    desc: 'Get YouTube channel info',
    usage: '.ytstalk <channel name>',
    cooldown: 5000,
    react: '📺',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length === 0) {
            return sock.sendMessage(chat, { text: '❌ Usage: `.ytstalk <channel name>`' }, { quoted: msg });
        }

        const channel = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, { text: `📺 *Fetching YouTube channel...*` }, { quoted: msg });

        try {
            const res = await fetch(`https://api.giftedtech.co.ke/api/stalk/youtube?apikey=gifted&channel=${encodeURIComponent(channel)}`);
            const data = await res.json();

            if (data.status && data.result) {
                const c = data.result;
                await sock.sendMessage(chat, {
                    text: `📺 *YouTube Channel*

📛 *Name:* ${c.name || channel}
📝 *Description:* ${(c.description || 'No description').slice(0, 150)}...

📊 *Stats:*
👥 Subscribers: ${c.subscribers?.toLocaleString() || 0}
🎬 Videos: ${c.videos?.toLocaleString() || 0}
👀 Views: ${c.views?.toLocaleString() || 0}

📅 *Joined:* ${c.joined || 'Unknown'}
🌍 *Country:* ${c.country || 'Unknown'}

───────────────────
_*Vesperr* ⋆ YouTube_`,
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, { text: `❌ *Channel not found*`, edit: statusMsg.key });
            }
        } catch (error) {
            await sock.sendMessage(chat, { text: '❌ *Failed to fetch channel*', edit: statusMsg.key });
        }
    },
};

export const ghstalk = {
    name: 'ghstalk',
    alias: ['githubstalk', 'ghuser'],
    category: 'social',
    desc: 'Get detailed GitHub profile info',
    usage: '.ghstalk <username>',
    cooldown: 5000,
    react: '🐙',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: `.ghstalk <username>`' }, { quoted: msg });
        const username = args[0].replace('@', '');
        const statusMsg = await sock.sendMessage(chat, { text: `🐙 *Fetching GitHub profile...*` }, { quoted: msg });
        try {
            const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
            const u = await res.json();
            if (u.login) {
                await sock.sendMessage(chat, {
                    text: `🐙 *GitHub Profile*
 
📛 *Name:* ${u.name || u.login}
👤 *Username:* ${u.login}
📝 *Bio:* ${u.bio || 'No bio'}
📍 *Location:* ${u.location || 'Unknown'}
🔗 *Blog:* ${u.blog || 'None'}
 
📊 *Stats:*
📁 Public Repos: ${u.public_repos}
👥 Followers: ${u.followers}
👤 Following: ${u.following}
 
📅 *Joined:* ${new Date(u.created_at).toLocaleDateString()}
 
───────────────────
_*Vesperr* ⋆ GitHub_`,
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, { text: `❌ *User not found*`, edit: statusMsg.key });
            }
        } catch { await sock.sendMessage(chat, { text: '❌ *Failed to fetch GitHub profile*', edit: statusMsg.key }); }
    },
};

export const shoutout = {
    name: 'shoutout',
    alias: ['so'],
    category: 'social',
    desc: 'Give a grand shoutout to someone',
    usage: '.shoutout @user',
    cooldown: 5000,
    react: '📢',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mention) return sock.sendMessage(chat, { text: '❌ Mention someone to shoutout!' }, { quoted: msg });
        const user = mention.split('@')[0];
        const shouts = [
            `📢 *ATTENTION EVERYONE!*\n\nLet's give a massive shoutout to @${user}! They are absolutely legendary! 🌟🚀`,
            `📢 *VIP ALERT!*\n\nBig respect to @${user} for being an absolute unit in this group! 👑💎`,
            `📢 *SHOUTOUT!*\n\nEveryone, show some love to @${user}! One of the realest ones out here! ❤️🔥`
        ];
        const shout = shouts[Math.floor(Math.random() * shouts.length)];
        await sock.sendMessage(chat, { text: shout, mentions: [mention] }, { quoted: msg });
    },
};

export const hug = {
    name: 'hug',
    alias: ['sendinghug'],
    category: 'social',
    desc: 'Send a virtual hug',
    usage: '.hug @user',
    cooldown: 5000,
    react: '🫂',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mention) return sock.sendMessage(chat, { text: '❌ Who do you want to hug?' }, { quoted: msg });
        const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];
        const target = mention.split('@')[0];
        await sock.sendMessage(chat, {
            text: `🫂 @${sender} is giving @${target} a big, warm virtual hug! ✨`,
            mentions: [msg.key.participant || msg.key.remoteJid, mention]
        }, { quoted: msg });
    },
};

export const slap = {
    name: 'slap',
    alias: ['smack'],
    category: 'social',
    desc: 'Give a virtual slap (funny)',
    usage: '.slap @user',
    cooldown: 5000,
    react: '👋',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mention) return sock.sendMessage(chat, { text: '❌ Who needs a slap?' }, { quoted: msg });
        const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];
        const target = mention.split('@')[0];
        const slaps = [
            `👋 @${sender} just slapped @${target} with a large trout! 🐟`,
            `👋 @${sender} gave @${target} a legendary smackdown! 💥`,
            `👋 @${sender} slapped @${target}. Ouch! That's gotta hurt. 😂`
        ];
        const slap = slaps[Math.floor(Math.random() * slaps.length)];
        await sock.sendMessage(chat, {
            text: slap,
            mentions: [msg.key.participant || msg.key.remoteJid, mention]
        }, { quoted: msg });
    },
};

export const vv = {
    name: 'vv',
    alias: ['viewonce', 'reveal'],
    category: 'social',
    desc: 'Reveal view once message',
    usage: '.vv (reply to view once)',
    cooldown: 3000,
    react: '👁️',
    async execute({ sock, msg, isGroup }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quoted) {
            return sock.sendMessage(chat, {
                text: `─── ☆ *VIEW ONCE* ☆ ───\n\n👁️ *Reveal ViewOnce*\n\n★ *Usage:* Reply to a view once message\n${isGroup ? '📢 Group: Reveals in chat' : '💾 Private: Sends to your saved messages'}\n\n───────────────────\n_*Vesperr* ⋆ Social_`,
            }, { quoted: msg });
        }

        const viewOnceMessage = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message;

        if (!viewOnceMessage) {
            return sock.sendMessage(chat, {
                text: '❌ *Please reply to a view once message.*'
            }, { quoted: msg });
        }

        try {
            const quotedMsg = {
                key: {
                    remoteJid: chat,
                    id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                    participant: msg.message.extendedTextMessage.contextInfo.participant
                },
                message: quoted
            };

            const sender = msg.message.extendedTextMessage.contextInfo.participant || chat;
            const senderName = sender.split('@')[0];

            const targetChat = isGroup ? chat : userJid;

            if (viewOnceMessage.imageMessage) {
                const media = await sock.downloadMediaMessage(quotedMsg);
                await sock.sendMessage(targetChat, {
                    image: media,
                    caption: `Vesperr Reveal\n\nFrom: @${senderName}\n${viewOnceMessage.imageMessage.caption || ''}`,
                    mentions: [sender]
                });

                if (!isGroup) {
                    await sock.sendMessage(chat, {
                        text: 'Vesperr Revealed'
                    }, { quoted: msg });
                }
            } else if (viewOnceMessage.videoMessage) {
                const media = await sock.downloadMediaMessage(quotedMsg);
                await sock.sendMessage(targetChat, {
                    video: media,
                    caption: `Vesperr Reveal\n\nFrom: @${senderName}\n${viewOnceMessage.videoMessage.caption || ''}`,
                    mentions: [sender]
                });

                if (!isGroup) {
                    await sock.sendMessage(chat, {
                        text: 'Vesperr Revealed'
                    }, { quoted: msg });
                }
            } else if (viewOnceMessage.audioMessage) {
                const media = await sock.downloadMediaMessage(quotedMsg);
                await sock.sendMessage(targetChat, {
                    audio: media,
                    mimetype: 'audio/mp4',
                    ptt: viewOnceMessage.audioMessage.ptt || false
                });
                await sock.sendMessage(targetChat, {
                    text: `Vesperr Reveal\n\nFrom: @${senderName}`,
                    mentions: [sender]
                });

                if (!isGroup) {
                    await sock.sendMessage(chat, {
                        text: 'Vesperr Revealed'
                    }, { quoted: msg });
                }
            }
        } catch (error) {
            console.error('View once reveal error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to reveal view once message.*'
            }, { quoted: msg });
        }
    },
};

export async function handleAntiViewOnce(sock, msg) {
    if (!config.antiViewOnce) return;

    const chat = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const message = msg.message;

    if (!message) return;

    const viewOnceMessage = message.viewOnceMessageV2?.message || message.viewOnceMessage?.message;

    if (viewOnceMessage) {
        try {
            const senderName = sender.split('@')[0];

            if (viewOnceMessage.imageMessage) {
                const media = await sock.downloadMediaMessage(msg);
                await sock.sendMessage(chat, {
                    image: media,
                    caption: `Vesperr Reveal\n\nFrom: @${senderName}\n${viewOnceMessage.imageMessage.caption || ''}`,
                    mentions: [sender]
                });
            } else if (viewOnceMessage.videoMessage) {
                const media = await sock.downloadMediaMessage(msg);
                await sock.sendMessage(chat, {
                    video: media,
                    caption: `Vesperr Reveal\n\nFrom: @${senderName}\n${viewOnceMessage.videoMessage.caption || ''}`,
                    mentions: [sender]
                });
            } else if (viewOnceMessage.audioMessage) {
                const media = await sock.downloadMediaMessage(msg);
                await sock.sendMessage(chat, {
                    audio: media,
                    mimetype: 'audio/mp4',
                    caption: `Vesperr Reveal\n\nFrom: @${senderName}`,
                    mentions: [sender]
                });
            }
        } catch (error) {
            console.error('Anti-ViewOnce error:', error);
        }
    }
}

export const xpTracker = {
    category: 'social',
    desc: 'Internal XP tracker',
    enabled: true,
    hooks: {
        beforeCommand: async (ctx) => {
            try {
                await addMessageXP(ctx.sock, ctx.msg);
            } catch (e) {
                console.error('XP Hook Error:', e);
            }
        }
    },
    onMessage: async (ctx) => {
        try {
            await addMessageXP(ctx.sock, ctx.msg);
        } catch (e) {
            console.error('XP Message Error:', e);
        }
    },
    priority: 10
};

export const socialCommands = [
    afk,
    bio,
    profile,
    level,
    levelingToggle,
    rep,
    levels,
    seen,
    tiktokstalk,
    igstalk,
    ytstalk,
    ghstalk,
    shoutout,
    hug,
    slap,
    vv,
    xpTracker
];

export default socialCommands;

export {
    getProfile,
    saveProfile,
    afkUsers,
    reputation,
    handleAntiViewOnce,
};
