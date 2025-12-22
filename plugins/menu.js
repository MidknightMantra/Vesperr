import { templates, emoji } from '../utils/deluxeUI.js';

const CONFIG = {
    BOT_NAME: process.env.BOT_NAME || 'Vesperr',
    OWNER_NAME: process.env.OWNER_NAME || 'MidKnightMantra',
};

const CATEGORIES = {
    ai: { name: 'AI & Chat', emoji: '🧠', order: 1 },
    download: { name: 'Download', emoji: '📥', order: 2 },
    media: { name: 'Media', emoji: '🎬', order: 3 },
    sticker: { name: 'Stickers', emoji: '🎨', order: 4 },
    utility: { name: 'Utility', emoji: '🔧', order: 5 },
    search: { name: 'Search', emoji: '🔍', order: 6 },
    fun: { name: 'Fun', emoji: '🎮', order: 7 },
    group: { name: 'Group', emoji: '👥', order: 8 },
    admin: { name: 'Admin', emoji: '👑', order: 9 },
    owner: { name: 'Owner', emoji: '🛡️', order: 10 },
    misc: { name: 'Misc', emoji: '📦', order: 99 },
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

    async execute({ sock, msg, args, prefix, pluginManager, isOwner, isAdmin, pushName }) {
        const chat = msg.key.remoteJid;
        const commands = getCommands(pluginManager);

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
            return sock.sendMessage(chat, { text: templates.card(`Search: ${query}`, matches) }, { quoted: msg });
        }

        const sub = args[0] ? args[0].toLowerCase().replace(prefix, '') : null;
        if (sub && (commands.has(sub) || [...commands.values()].some(c => c.alias.includes(sub)))) {
            const cmd = commands.get(sub) || [...commands.values()].find(c => c.alias.includes(sub));
            return sock.sendMessage(chat, {
                text: templates.card(
                    `Command Help`,
                    {
                        'Name': cmd.name.toUpperCase(),
                        'Desc': cmd.desc,
                        'Usage': cmd.usage || prefix + cmd.name,
                        'Aliases': cmd.alias.join(', ') || 'none',
                        'Category': cmd.category
                    },
                    { footer: `Use ${prefix}menu for full list` }
                )
            }, { quoted: msg });
        }

        const options = { isOwner, isAdmin };
        const categoriesMap = organizeByCategory(commands, options);
        const categoriesObj = {};

        for (const [cat, cmds] of categoriesMap) {
            const catName = CATEGORIES[cat]?.name || cat;
            categoriesObj[catName] = cmds.map(c => c.name);
        }

        const date = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const greeting = getGreeting();

        const menuText = templates.menu(
            'Main Menu',
            categoriesObj,
            {
                subtitle: `${greeting.emoji} ${greeting.text}, *${pushName || 'User'}*\n📅 ${date}\n👑 Owner: ${CONFIG.OWNER_NAME}`,
                footer: `Powered by ${CONFIG.BOT_NAME} v3.0\nType ${prefix}help <cmd> for details`,
                prefix
            }
        );

        await sock.sendMessage(chat, { text: menuText }, { quoted: msg });
    }
};

export default menuPlugin;
