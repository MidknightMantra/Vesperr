import { templates, emoji, format, levelBar } from '../utils/deluxeUI.js';
import { getProfile, reputation } from './social.js';
import config from '../config.js';

const CONFIG = {
    BOT_NAME: process.env.BOT_NAME || 'Vesperr',
    OWNER_NAME: process.env.OWNER_NAME || 'MidKnightMantra',
};

const CATEGORIES = {
    ai: { name: 'Neural Networks', emoji: '🔮', order: 1, desc: 'Advanced AI & Chat Models' },
    download: { name: 'Media Fetcher', emoji: '🛰️', order: 2, desc: 'High-speed Downloaders' },
    media: { name: 'Studio Suite', emoji: '💿', order: 3, desc: 'Image & Video Manipulation' },
    sticker: { name: 'Sticker Factory', emoji: '✨', order: 4, desc: 'Creative Sticker Tools' },
    utility: { name: 'Core Utilities', emoji: '🔌', order: 5, desc: 'Essential System Tools' },
    search: { name: 'Global Search', emoji: '🔭', order: 6, desc: 'Search Engines & APIs' },
    fun: { name: 'Entertainment', emoji: '🎲', order: 7, desc: 'Games & Fun Commands' },
    social: { name: 'Social Hub', emoji: '🪐', order: 8, desc: 'Community & Profiles' },
    economy: { name: 'Vault System', emoji: '💎', order: 9, desc: 'Earn & Spend Money' },
    tools: { name: 'Forge Tools', emoji: '⚒️', order: 10, desc: 'Advanced Power Tools' },
    group: { name: 'Vesperr Command', emoji: '💠', order: 11, desc: 'Group Management' },
    admin: { name: 'Inner Circle', emoji: '🧿', order: 12, desc: 'Staff Privileges' },
    owner: { name: 'Core System', emoji: '👑', order: 13, desc: 'Developer Access' },
    misc: { name: 'Archive', emoji: '📦', order: 99, desc: 'Other Commands' },
};

function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return { text: 'Good Morning', emoji: '🌅' };
    if (hour >= 12 && hour < 17) return { text: 'Good Afternoon', emoji: '☀️' };
    if (hour >= 17 && hour < 21) return { text: 'Good Evening', emoji: '🌆' };
    return { text: 'Good Night', emoji: '🌙' };
}

function getCommands(pluginManager) {
    const commands = new Map();
    if (!pluginManager?.plugins) return commands;

    for (const [name, plugin] of pluginManager.plugins) {
        if (plugin.disabled) continue;
        commands.set(plugin.name || name, {
            name: plugin.name || name,
            alias: plugin.alias || plugin.aliases || [],
            category: (plugin.category || 'misc').toLowerCase(),
            desc: plugin.desc || plugin.description || 'No description',
            usage: plugin.usage,
            ownerOnly: plugin.ownerOnly,
            adminOnly: plugin.adminOnly,
        });
    }
    return commands;
}

function organizeByCategory(commands, options = {}) {
    const { showOwner = false, showAdmin = true } = options;
    const categories = new Map();

    for (const [, cmd] of commands) {
        if (cmd.ownerOnly && !showOwner) continue;
        if (cmd.adminOnly && !showAdmin) continue;

        const cat = cmd.category || 'misc';
        if (!categories.has(cat)) categories.set(cat, []);
        categories.get(cat).push(cmd);
    }

    const sorted = new Map([...categories.entries()].sort((a, b) => {
        return (CATEGORIES[a[0]]?.order || 99) - (CATEGORIES[b[0]]?.order || 99);
    }));

    return sorted;
}

const menuPlugin = {
    name: 'menu',
    alias: ['help', 'h', '?'],
    category: 'utility',
    desc: 'Show bot commands and help',
    usage: '.menu',
    cooldown: 0,

    async execute({ sock, msg, args, prefix, pluginManager, isOwner, isAdmin, pushName, isPremium }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const commands = getCommands(pluginManager);
        const greeting = getGreeting();
        const date = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        const prof = getProfile(sender);
        const rep = reputation.get(sender.split('@')[0]) || 0;

        if (args[0] === 'search') {
            const query = args.slice(1).join(' ').toLowerCase();
            if (!query) return sock.sendMessage(chat, { text: templates.notification('Search', 'Please provide a query', 'warning') }, { quoted: msg });
            const matches = [];
            for (const [, cmd] of commands) {
                if (cmd.name.includes(query) || cmd.desc.toLowerCase().includes(query)) {
                    matches.push(`*${prefix}${cmd.name}*: ${cmd.desc}`);
                }
            }
            if (!matches.length) return sock.sendMessage(chat, { text: templates.notification('Search', `No results for "${query}"`, 'error') }, { quoted: msg });
            return sock.sendMessage(chat, { text: templates.card(`Search Results`, matches) }, { quoted: msg });
        }

        const sub = args[0] ? args[0].toLowerCase().replace(prefix, '') : null;

        if (sub && CATEGORIES[sub]) {
            const options = { isOwner, isAdmin };
            const categoriesMap = organizeByCategory(commands, options);
            const cmds = categoriesMap.get(sub) || [];
            const catInfo = CATEGORIES[sub];

            let catMenu = `╭╾── 『 *${catInfo.name.toUpperCase()}* 』 ──╼╮\n`;
            catMenu += `│ ${catInfo.emoji} ${catInfo.desc}\n`;
            catMenu += `┝╾──────────────────╼\n`;

            cmds.forEach((cmd, i) => {
                catMenu += `│ ${i + 1}. ${prefix}${cmd.name}\n`;
            });

            catMenu += `╰╾──────────────────╼╯\n`;
            catMenu += `\n_💡 Tip: Type ${prefix}help <command> for info_`;

            return sock.sendMessage(chat, { text: catMenu }, { quoted: msg });
        }

        if (sub && (commands.has(sub) || [...commands.values()].some(c => c.alias.includes(sub)))) {
            const cmd = commands.get(sub) || [...commands.values()].find(c => c.alias.includes(sub));
            return sock.sendMessage(chat, {
                text: templates.card(
                    `Command: ${cmd.name.toUpperCase()}`,
                    {
                        'Description': cmd.desc,
                        'Usage': cmd.usage || prefix + cmd.name,
                        'Alias': cmd.alias.join(', ') || 'none',
                        'Category': cmd.category
                    },
                    { icon: '💠', footer: `Vesperr System` }
                )
            }, { quoted: msg });
        }

        let mainDashboard = `╭╾── 『 *VESPERR COMMAND CENTER* 』 ──╼╮\n`;
        mainDashboard += `│ ${greeting.emoji} ${greeting.text}, *${pushName}*\n`;
        mainDashboard += `│ 📅 ${date} | ⏱️ ${new Date().toLocaleTimeString()}\n`;
        mainDashboard += `┝╾──────── User Status ────────╼\n`;
        if (config.levelingEnabled) {
            mainDashboard += `│ 💠 *Rank:* ${prof.level >= 50 ? 'Elite' : prof.level >= 20 ? 'Officer' : 'Recruit'}\n`;
            mainDashboard += `│ 🌟 *Level:* ${prof.level} | *XP:* ${prof.xp}\n`;
            mainDashboard += `│ 📊 [${levelBar(prof.xp % 100, 100, 10)}]\n`;
        }
        mainDashboard += `│ 🏆 *Reputation:* ${rep >= 0 ? '+' : ''}${rep}\n`;
        mainDashboard += `┝╾──────── Bot Information ──────╼\n`;
        mainDashboard += `│ 🤖 *Build:* v3.0 Stable\n`;
        mainDashboard += `│ ⚡ *Commands:* ${commands.size} Active\n`;
        mainDashboard += `│ ⏳ *Uptime:* ${Math.round(process.uptime() / 60)} Minutes\n`;
        mainDashboard += `│ 👑 *Creator:* MidKnightMantra\n`;
        mainDashboard += `┝╾──────── Command Categories ──╼\n`;

        const sortedCats = Object.entries(CATEGORIES).sort((a, b) => a[1].order - b[1].order);
        sortedCats.forEach(([key, val]) => {
            if (key === 'owner' && !isOwner) return;
            if (key === 'admin' && !isAdmin && !isOwner) return;
            mainDashboard += `│ ${val.emoji} *${val.name}* \n│   └ \`${prefix}menu ${key}\`\n`;
        });

        mainDashboard += `╰╾───────────────────╼╯\n`;
        mainDashboard += `\n_Type ${prefix}menu <category> to see commands_\n_Example: ${prefix}menu ai_`;

        await sock.sendMessage(chat, {
            text: mainDashboard,
            contextInfo: {
                externalAdReply: {
                    title: 'Vesperr Ultimate Dashboard',
                    body: `User: ${pushName} | Commands: ${commands.size}`,
                    mediaType: 1,
                    thumbnailUrl: 'https://files.catbox.moe/o8o8og.jpg',
                    sourceUrl: 'https://github.com/MidknightMantra/Vesperr'
                }
            }
        }, { quoted: msg });
    }
};

export default menuPlugin;
