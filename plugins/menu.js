export default {
    name: 'menu',
    alias: ['help', 'commands', 'cmd', '?'],
    category: 'core',
    desc: 'Display all available bot commands',
    react: '📋',

    command: {
        pattern: 'menu',
        run: async ({ sock, msg, args, context }) => {
            const jid = msg.key.remoteJid;
            const prefix = context?.prefix || '.';
            const pluginManager = global.VESPERR?.pluginManager;

            // Get all plugins organized by category
            const plugins = pluginManager?.getAll?.() || [];
            const categories = {};

            // Organize plugins by category
            for (const plugin of plugins) {
                if (plugin.hidden) continue;

                const cat = plugin.category || 'misc';
                if (!categories[cat]) {
                    categories[cat] = [];
                }
                categories[cat].push(plugin);
            }

            // Category emojis
            const categoryEmojis = {
                core: '⚡',
                media: '♪',
                fun: '✦',
                utility: '⌬',
                group: '❖',
                owner: '♕',
                download: '⤓',
                search: '⌕',
                ai: '✧',
                tools: '⚒',
                misc: '◈'
            };

            // Category descriptions
            const categoryDesc = {
                core: 'Essential bot commands',
                media: 'Music, videos & audio',
                fun: 'Games & entertainment',
                utility: 'Useful tools',
                group: 'Group management',
                owner: 'Bot owner only',
                download: 'Download content',
                search: 'Search the web',
                ai: 'AI features',
                tools: 'Developer tools',
                misc: 'Other commands'
            };

            // If specific category requested
            if (args[0]) {
                const requestedCat = args[0].toLowerCase();
                const catPlugins = categories[requestedCat];

                if (!catPlugins || catPlugins.length === 0) {
                    const availableCats = Object.keys(categories).join(', ');
                    return sock.sendMessage(jid, {
                        text: `❌ Category "${requestedCat}" not found.\n\n📂 Available categories:\n${availableCats}`
                    }, { quoted: msg });
                }

                const emoji = categoryEmojis[requestedCat] || '📦';
                let categoryMenu = `${emoji} *${requestedCat.toUpperCase()} COMMANDS*\n`;
                categoryMenu += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

                for (const plugin of catPlugins) {
                    const aliases = plugin.alias?.length ? ` _(${plugin.alias.join(', ')})_` : '';
                    categoryMenu += `▸ *${prefix}${plugin.name}*${aliases}\n`;
                    categoryMenu += `   ${plugin.desc || 'No description'}\n\n`;
                }

                categoryMenu += `━━━━━━━━━━━━━━━━━━━━━\n`;
                categoryMenu += `📝 Use *${prefix}menu* for all categories`;

                return sock.sendMessage(jid, { text: categoryMenu }, { quoted: msg });
            }

            // Build full menu
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            const dateStr = now.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            let menuText = `
╭──── ◈ *VESPERR* ◈ ────╮
│
│  ♢ ${dateStr}
│  ♢ ${timeStr}
│  ♢ Version: 0.1.0
│  ♢ Prefix: ${prefix}
│
╰────────────────────────╯

`;

            // Add categories
            const sortedCategories = Object.keys(categories).sort();

            for (const cat of sortedCategories) {
                const emoji = categoryEmojis[cat] || '📦';
                const desc = categoryDesc[cat] || '';
                const cmds = categories[cat];

                menuText += `╭─── ${emoji} *${cat.toUpperCase()}* ───╮\n`;
                if (desc) menuText += `│ _${desc}_\n`;
                menuText += `│\n`;

                for (const plugin of cmds) {
                    menuText += `│ ▸ ${prefix}${plugin.name}\n`;
                }

                menuText += `╰${'─'.repeat(20)}╯\n\n`;
            }

            // Footer
            const totalCommands = plugins.filter(p => !p.hidden).length;
            menuText += `━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *Total Commands:* ${totalCommands}
💡 *Tip:* ${prefix}menu <category> for details

_Powered by Vesperr_
━━━━━━━━━━━━━━━━━━━━━━━━━`;

            // Send menu
            await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
        }
    }
};