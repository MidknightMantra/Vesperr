export const ansi = {

    reset: '\x1b[0m',

    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',
    blink: '\x1b[5m',
    inverse: '\x1b[7m',
    hidden: '\x1b[8m',
    strikethrough: '\x1b[9m',

    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    grey: '\x1b[90m',

    brightRed: '\x1b[91m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan: '\x1b[96m',
    brightWhite: '\x1b[97m',

    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m',

    bgBrightRed: '\x1b[101m',
    bgBrightGreen: '\x1b[102m',
    bgBrightYellow: '\x1b[103m',
    bgBrightBlue: '\x1b[104m',
    bgBrightMagenta: '\x1b[105m',
    bgBrightCyan: '\x1b[106m',
    bgBrightWhite: '\x1b[107m',
};

export const emoji = {

    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    question: '❔',
    loading: '↻',
    done: '✔',
    failed: '✖',
    pending: '⏳',

    arrow: '➔',
    arrowUp: '⬆️',
    arrowDown: '⬇️',
    arrowLeft: '⬅️',
    arrowRight: '➡️',
    point: '👉',
    back: '🔙',
    bullet: '⟡',
    dot: '•',
    line: '│',
    branch: '├──',
    corner: '└──',

    ai: '🧠',
    chat: '💬',
    search: '🔍',
    download: '⬇️',
    upload: '⬆️',
    media: '🎬',
    music: '🎵',
    game: '🎮',
    sticker: '🎨',
    palette: '🖌️',
    tool: '🛠️',
    settings: '⚙️',
    link: '🔗',
    lock: '🔒',
    unlock: '🔓',

    user: '👤',
    users: '👥',
    admin: '🛡️',
    owner: '👑',
    bot: '🤖',
    premium: '💎',
    vip: '🌟',

    sparkles: '✨',
    star: '⭐',
    heart: '❤️',
    fire: '🔥',
    time: '🕒',
    calendar: '📅',
    location: '📍',

    numbers: ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'],

    home: '🏠',
    utility: '🔧',
    fun: '🎲',
    group: '👥',
    news: '📰',
    weather: '🌤️',

    numbers: ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'],

    verified: '✓',
    cross: '✗',
    bullet: '•',
    diamond: '◆',
    circle: '●',
    square: '■',
    triangle: '▲',

    command: '⌘',
    alias: '📎',
    point: '⦿',
    arrowShort: '➜',
    feature: '✨',
    system: '🖥️',

    chevronRight: '›',
    chevronDown: '⌄',
    circleOutline: '○',
    circleFilled: '●',
    radioOn: '◉',
    radioOff: '○',
    checkboxOn: '☑',
    checkboxOff: '☐',
    close: '✕',
    more: '⋯',

    home: '🏠',
    ai: '🧠',
    chat: '💬',
    download: '⬇️',
    media: '🎬',
    search: '🔍',
    tool: '🔧',
    utility: '🛠️',
    fun: '🎮',
    game: '🎲',
    sticker: '🎨',
    group: '👥',
    admin: '🛡️',
    owner: '👑',
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    success: '✅',
};

export const box = {

    single: {
        topLeft: '┌',
        topRight: '┐',
        bottomLeft: '└',
        bottomRight: '┘',
        horizontal: '─',
        vertical: '│',
        leftT: '├',
        rightT: '┤',
        topT: '┬',
        bottomT: '┴',
        cross: '┼',
    },

    double: {
        topLeft: '╔',
        topRight: '╗',
        bottomLeft: '╚',
        bottomRight: '╝',
        horizontal: '═',
        vertical: '║',
        leftT: '╠',
        rightT: '╣',
        topT: '╦',
        bottomT: '╩',
        cross: '╬',
    },

    rounded: {
        topLeft: '╭',
        topRight: '╮',
        bottomLeft: '╰',
        bottomRight: '╯',
        horizontal: '─',
        vertical: '│',
        leftT: '├',
        rightT: '┤',
        topT: '┬',
        bottomT: '┴',
        cross: '┼',
    },

    bold: {
        topLeft: '┏',
        topRight: '┓',
        bottomLeft: '┗',
        bottomRight: '┛',
        horizontal: '━',
        vertical: '┃',
        leftT: '┣',
        rightT: '┫',
        topT: '┳',
        bottomT: '┻',
        cross: '╋',
    },
};

export const format = {

    bold: (text) => `*${text}*`,

    italic: (text) => `_${text}_`,

    strike: (text) => `~${text}~`,

    mono: (text) => `\`\`\`${text}\`\`\``,

    code: (text) => `\`${text}\``,

    quote: (text) => `> ${text}`,

    blockquote: (text) => text.split('\n').map(line => `> ${line}`).join('\n'),

    mention: (number) => `@${number}`,

    combine: (...formats) => (text) => formats.reduce((t, f) => f(t), text),
};

export const console_ui = {

    box: (content, options = {}) => {
        const {
            title = '',
            style = 'rounded',
            padding = 1,
            color = ansi.cyan,
            titleColor = ansi.brightWhite,
            width = null,
        } = options;

        const chars = box[style] || box.rounded;
        const lines = content.split('\n');

        const contentWidth = Math.max(
            ...lines.map(l => stripAnsi(l).length),
            stripAnsi(title).length
        );
        const boxWidth = width || contentWidth + (padding * 2);

        const result = [];

        if (title) {
            const titleText = ` ${title} `;
            const leftPad = Math.floor((boxWidth - titleText.length) / 2);
            const rightPad = boxWidth - titleText.length - leftPad;
            result.push(
                color + chars.topLeft +
                chars.horizontal.repeat(leftPad) +
                titleColor + titleText + color +
                chars.horizontal.repeat(rightPad) +
                chars.topRight + ansi.reset
            );
        } else {
            result.push(
                color + chars.topLeft +
                chars.horizontal.repeat(boxWidth) +
                chars.topRight + ansi.reset
            );
        }

        for (let i = 0; i < padding; i++) {
            result.push(
                color + chars.vertical + ansi.reset +
                ' '.repeat(boxWidth) +
                color + chars.vertical + ansi.reset
            );
        }

        for (const line of lines) {
            const stripped = stripAnsi(line);
            const pad = boxWidth - stripped.length - padding;
            result.push(
                color + chars.vertical + ansi.reset +
                ' '.repeat(padding) +
                line +
                ' '.repeat(Math.max(0, pad)) +
                color + chars.vertical + ansi.reset
            );
        }

        for (let i = 0; i < padding; i++) {
            result.push(
                color + chars.vertical + ansi.reset +
                ' '.repeat(boxWidth) +
                color + chars.vertical + ansi.reset
            );
        }

        result.push(
            color + chars.bottomLeft +
            chars.horizontal.repeat(boxWidth) +
            chars.bottomRight + ansi.reset
        );

        return result.join('\n');
    },

    table: (data, options = {}) => {
        const {
            headers = null,
            style = 'single',
            headerColor = ansi.brightCyan,
            borderColor = ansi.gray,
            cellPadding = 1,
        } = options;

        const chars = box[style] || box.single;

        const rows = headers ? [headers, ...data] : data;
        const colWidths = [];

        for (const row of rows) {
            row.forEach((cell, i) => {
                const len = stripAnsi(String(cell)).length + (cellPadding * 2);
                colWidths[i] = Math.max(colWidths[i] || 0, len);
            });
        }

        const result = [];
        const totalWidth = colWidths.reduce((a, b) => a + b, 0) + colWidths.length + 1;

        result.push(
            borderColor + chars.topLeft +
            colWidths.map(w => chars.horizontal.repeat(w)).join(chars.topT) +
            chars.topRight + ansi.reset
        );

        rows.forEach((row, rowIndex) => {
            const isHeader = headers && rowIndex === 0;
            const color = isHeader ? headerColor : '';

            const cells = row.map((cell, i) => {
                const str = String(cell);
                const pad = colWidths[i] - stripAnsi(str).length - cellPadding;
                return ' '.repeat(cellPadding) + color + str + ansi.reset + ' '.repeat(pad);
            });

            result.push(
                borderColor + chars.vertical + ansi.reset +
                cells.join(borderColor + chars.vertical + ansi.reset) +
                borderColor + chars.vertical + ansi.reset
            );

            if (isHeader) {
                result.push(
                    borderColor + chars.leftT +
                    colWidths.map(w => chars.horizontal.repeat(w)).join(chars.cross) +
                    chars.rightT + ansi.reset
                );
            }
        });

        result.push(
            borderColor + chars.bottomLeft +
            colWidths.map(w => chars.horizontal.repeat(w)).join(chars.bottomT) +
            chars.bottomRight + ansi.reset
        );

        return result.join('\n');
    },

    progressBar: (current, total, options = {}) => {
        const {
            width = 30,
            filled = '█',
            empty = '░',
            showPercent = true,
            showCount = true,
            color = ansi.green,
            emptyColor = ansi.gray,
            label = '',
        } = options;

        const percent = Math.min(100, Math.round((current / total) * 100));
        const filledWidth = Math.round((percent / 100) * width);
        const emptyWidth = width - filledWidth;

        let bar = color + filled.repeat(filledWidth) + emptyColor + empty.repeat(emptyWidth) + ansi.reset;

        const parts = [label, `[${bar}]`];
        if (showPercent) parts.push(`${percent}%`);
        if (showCount) parts.push(`(${current}/${total})`);

        return parts.filter(Boolean).join(' ');
    },

    spinnerFrames: {
        dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
        line: ['-', '\\', '|', '/'],
        circle: ['◐', '◓', '◑', '◒'],
        square: ['◰', '◳', '◲', '◱'],
        arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
        bounce: ['⠁', '⠂', '⠄', '⠂'],
        clock: ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'],
        moon: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
        earth: ['🌍', '🌎', '🌏'],
    },

    spinner: (text = 'Loading', style = 'dots') => {
        const frames = console_ui.spinnerFrames[style] || console_ui.spinnerFrames.dots;
        let frameIndex = 0;
        let interval = null;

        return {
            start: () => {
                interval = setInterval(() => {
                    process.stdout.write(`\r${ansi.cyan}${frames[frameIndex]}${ansi.reset} ${text}`);
                    frameIndex = (frameIndex + 1) % frames.length;
                }, 80);
            },
            stop: (finalText = '') => {
                if (interval) {
                    clearInterval(interval);
                    process.stdout.write(`\r${' '.repeat(text.length + 5)}\r`);
                    if (finalText) {
                        console.log(finalText);
                    }
                }
            },
            update: (newText) => {
                text = newText;
            },
        };
    },

    gradient: (text, startColor, endColor) => {

        const colors = [196, 202, 208, 214, 220, 226, 190, 154, 118, 82, 46];
        return text.split('').map((char, i) => {
            const colorIndex = Math.floor((i / text.length) * colors.length);
            return `\x1b[38;5;${colors[colorIndex]}m${char}`;
        }).join('') + ansi.reset;
    },

    banner: (text, options = {}) => {
        const {
            font = 'standard',
            color = ansi.cyan,
        } = options;

        const letters = {
            'A': ['  █  ', ' █ █ ', '█████', '█   █', '█   █'],
            'B': ['████ ', '█   █', '████ ', '█   █', '████ '],
            'C': [' ████', '█    ', '█    ', '█    ', ' ████'],
            'D': ['████ ', '█   █', '█   █', '█   █', '████ '],
            'E': ['█████', '█    ', '████ ', '█    ', '█████'],
            'F': ['█████', '█    ', '████ ', '█    ', '█    '],
            'G': [' ████', '█    ', '█  ██', '█   █', ' ████'],
            'H': ['█   █', '█   █', '█████', '█   █', '█   █'],
            'I': ['█████', '  █  ', '  █  ', '  █  ', '█████'],
            'J': ['█████', '   █ ', '   █ ', '█  █ ', ' ██  '],
            'K': ['█   █', '█  █ ', '███  ', '█  █ ', '█   █'],
            'L': ['█    ', '█    ', '█    ', '█    ', '█████'],
            'M': ['█   █', '██ ██', '█ █ █', '█   █', '█   █'],
            'N': ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
            'O': [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
            'P': ['████ ', '█   █', '████ ', '█    ', '█    '],
            'Q': [' ███ ', '█   █', '█ █ █', '█  █ ', ' ██ █'],
            'R': ['████ ', '█   █', '████ ', '█  █ ', '█   █'],
            'S': [' ████', '█    ', ' ███ ', '    █', '████ '],
            'T': ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
            'U': ['█   █', '█   █', '█   █', '█   █', ' ███ '],
            'V': ['█   █', '█   █', '█   █', ' █ █ ', '  █  '],
            'W': ['█   █', '█   █', '█ █ █', '██ ██', '█   █'],
            'X': ['█   █', ' █ █ ', '  █  ', ' █ █ ', '█   █'],
            'Y': ['█   █', ' █ █ ', '  █  ', '  █  ', '  █  '],
            'Z': ['█████', '   █ ', '  █  ', ' █   ', '█████'],
            ' ': ['     ', '     ', '     ', '     ', '     '],
        };

        const lines = ['', '', '', '', ''];
        for (const char of text.toUpperCase()) {
            const letter = letters[char] || letters[' '];
            for (let i = 0; i < 5; i++) {
                lines[i] += letter[i] + ' ';
            }
        }

        return color + lines.join('\n') + ansi.reset;
    },

    divider: (char = '─', width = 50, color = ansi.gray) => {
        return color + char.repeat(width) + ansi.reset;
    },

    columns: (left, right, options = {}) => {
        const {
            width = 80,
            separator = ' │ ',
            leftWidth = Math.floor(width * 0.5),
        } = options;

        const leftLines = left.split('\n');
        const rightLines = right.split('\n');
        const maxLines = Math.max(leftLines.length, rightLines.length);
        const rightWidth = width - leftWidth - separator.length;

        const result = [];
        for (let i = 0; i < maxLines; i++) {
            const l = (leftLines[i] || '').padEnd(leftWidth);
            const r = (rightLines[i] || '').padEnd(rightWidth);
            result.push(l + separator + r);
        }

        return result.join('\n');
    },
};

export const templates = {

    menu: (title, items, options = {}) => {
        const {
            prefix = '.',
            footer = '',
            emoji: itemEmoji = '⟡',
            headerEmoji = '✨',
            numbered = false,
            subtitle = '',
        } = options;

        const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        let text = `◆ ━━━━━━❪ ${title.toUpperCase()} ❫━━━━━━ ◆\n\n`;
        text += `📅 *${subtitle || date}*\n\n`;

        items.forEach((item, index) => {
            const bullet = numbered
                ? `${index + 1}.`
                : itemEmoji;

            if (typeof item === 'string') {
                text += `  ${bullet} ${format.code(prefix + item)}\n`;
            } else {
                const cmd = item.command || item.cmd || item.name;

                text += `  ${bullet} ${format.code(prefix + cmd)}\n`;
            }
        });

        text += `\n◆ ━━━━━━━━━━━━━━━━━━━━━━━━━ ◆`;

        if (footer) {
            text += `\n\n${footer}`;
        }

        return text.trim();
    },

    categoryMenu: (categories, options = {}) => {
        const { prefix = '.', title = 'Menu' } = options;

        let text = `◆ ━━━━━━❪ ${title.toUpperCase()} ❫━━━━━━ ◆\n`;

        for (const [category, items] of Object.entries(categories)) {
            const catEmoji = emoji[category.toLowerCase()] || '📂';
            text += `\n◆ ${catEmoji} *${category.toUpperCase()}*\n`;

            for (const item of items) {
                const cmd = typeof item === 'string' ? item : item.name;
                text += `  ⟡ ${format.code(prefix + cmd)}\n`;
            }
        }
        text += `\n◆ ━━━━━━━━━━━━━━━━━━━━━━━━━ ◆`;

        return text.trim();
    },

    card: (title, fields, options = {}) => {
        const {
            headerEmoji = '📝',
        } = options;

        let text = `◆ ━━━━━━❪ ${title.toUpperCase()} ❫━━━━━━ ◆\n\n`;

        for (const [label, value] of Object.entries(fields)) {
            text += `  ◆ *${label}:* ${value}\n`;
        }

        text += `\n◆ ━━━━━━━━━━━━━━━━━━━━━━━━━ ◆`;

        return text.trim();
    },

    success: (message, details = null) => {
        let text = `✅ *SUCCESS*\n\n${message}`;
        if (details) {
            text += `\n\n\`${details}\``;
        }
        return text;
    },

    error: (message, solution = null) => {
        let text = `❌ *ERROR*\n\n${message}`;
        if (solution) {
            text += `\n\n💡 *Tip:* ${solution}`;
        }
        return text;
    },

    warning: (message) => {
        return `⚠️ *WARNING*\n\n${message}`;
    },

    commandHelp: (command, options = {}) => {
        const {
            prefix = '.',
            name,
            description,
            usage,
            examples = [],
            aliases = [],
            cooldown,
            permissions = [],
        } = { ...command, ...options };

        let text = `◆ ━━━━━━❪ ${name.toUpperCase()} ❫━━━━━━ ◆\n\n`;

        if (description) {
            text += `  📝 ${description}\n`;
        }

        if (usage) {
            text += `  ⌨️ Using: ${format.code(usage.replace('{prefix}', prefix))}\n`;
        }

        if (aliases.length > 0) {
            text += `  📎 Aliases: ${aliases.join(', ')}\n`;
        }

        if (permissions.length > 0) {
            text += `  🔒 Perms: ${permissions.join(', ')}\n`;
        }

        if (cooldown) {
            text += `  ⏱️ Cooldown: ${cooldown / 1000}s\n`;
        }

        text += `\n◆ ━━━━━━━━━━━━━━━━━━━━━━━━━ ◆\n`;

        if (examples.length > 0) {
            text += `\n*Examples:*\n`;
            examples.forEach(ex => {
                text += `• ${format.code(ex.replace('{prefix}', prefix))}\n`;
            });
        }

        return text.trim();
    },

    header: (title, subtitle = '', options = {}) => {
        const { emoji: icon = '◈' } = options;
        let text = `${icon} ━━━━━━❪ *${title.toUpperCase()}* ❫━━━━━━\n`;
        if (subtitle) {
            text += `\n${subtitle}\n`;
        }
        text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        return text;
    },

    menu: (title, categories, options = {}) => {
        const {
            subtitle = '',
            footer = '',
            prefix = '.',
            headerIcon = '🎒'
        } = options;

        let text = `◈ ━━━━━━❪ *${title.toUpperCase()}* ❫━━━━━━\n`;

        if (subtitle) {
            text += `\n${subtitle}\n`;
        }

        text += `\n`;

        for (const [cat, items] of Object.entries(categories)) {
            const catEmoji = emoji[cat.toLowerCase()] || '📂';
            text += `${catEmoji} *${cat.toUpperCase()}*\n`;

            if (Array.isArray(items)) {
                items.forEach(item => {
                    text += `  ⟡ ${format.code(prefix + item)}\n`;
                });
            } else {
                text += `  ${items}\n`;
            }
            text += `\n`;
        }

        if (footer) {
            text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            text += `${footer}`;
        }

        return text.trim();
    },

    card: (title, fields, options = {}) => {
        const {
            icon = '✦',
            footer = ''
        } = options;

        let text = `${icon} ━━━━━━❪ *${title.toUpperCase()}* ❫━━━━━━\n\n`;

        if (Array.isArray(fields)) {
            fields.forEach(field => {
                text += `  • ${field}\n`;
            });
        } else if (typeof fields === 'object') {
            for (const [key, value] of Object.entries(fields)) {
                text += `  *${key}:* ${value}\n`;
            }
        } else {
            text += `  ${fields}\n`;
        }

        if (footer) {
            text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            text += `_${footer}_`;
        }

        return text.trim();
    },

    list: (title, items, options = {}) => {
        const {
            numbered = false,
            bullet = '⟡',
            headerEmoji = '📋',
        } = options;

        let text = `◆ ━━━━━━❪ ${title.toUpperCase()} ❫━━━━━━ ◆\n\n`;

        items.forEach((item, index) => {
            const marker = numbered ? `${index + 1}.` : bullet;
            text += `  ${marker} ${item}\n`;
        });

        text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        return text.trim();
    },

    leaderboard: (title, entries, options = {}) => {
        const {
            valueLabel = 'Score',
            showRank = true,
        } = options;

        const medals = ['🥇', '🥈', '🥉'];

        let text = `◈ ━━━━━━❪ *${title.toUpperCase()}* ❫━━━━━━\n\n`;

        entries.forEach((entry, index) => {
            const rank = showRank
                ? (medals[index] || `${index + 1}.`)
                : '⟡';
            const name = entry.name || entry.user || entry.id;
            const value = entry.value || entry.score || entry.xp || 0;

            text += `  ${rank} *${name}*\n`;
            text += `     └ ${valueLabel}: ${value}\n`;
        });

        text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        return text.trim();
    },

    profile: (user, options = {}) => {
        const {
            showBadges = true,
        } = options;

        let text = `👤 ━━━━━━❪ *USER PROFILE* ❫━━━━━━\n\n`;

        text += `  *Name:* ${user.name || 'Unknown'}\n`;
        text += `  *Number:* ${user.phone || user.jid || 'N/A'}\n`;

        if (user.level !== undefined) {
            text += `  *Level:* ${user.level}\n`;
        }
        if (user.xp !== undefined) {
            text += `  *XP:* ${user.xp}\n`;
        }
        if (user.coins !== undefined) {
            text += `  *Coins:* ${user.coins}\n`;
        }

        if (showBadges) {
            const badges = [];
            if (user.isOwner) badges.push(`🛡️ Owner`);
            if (user.isAdmin) badges.push(`👑 Admin`);
            if (user.isPremium) badges.push(`💎 Premium`);

            if (badges.length > 0) {
                text += `\n  *Badges:*\n`;
                badges.forEach(b => text += `  ${b}\n`);
            }
        }

        text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        return text.trim();
    },

    progress: (title, current, total, options = {}) => {
        const {
            width = 10,
            filled = '▰',
            empty = '▱',
        } = options;

        const percent = Math.round((current / total) * 100);
        const filledCount = Math.round((percent / 100) * width);
        const emptyCount = width - filledCount;

        const bar = filled.repeat(filledCount) + empty.repeat(emptyCount);

        let text = `◈ ━━━━━━❪ *${title.toUpperCase()}* ❫━━━━━━\n\n`;
        text += `  ${bar} ${percent}%\n`;
        text += `  [ ${current} / ${total} ]\n`;
        text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        return text;
    },

    confirm: (action, details = '') => {
        let text = `❓ *Confirm Action*\n\n`;
        text += `Are you sure you want to ${action}?\n`;
        if (details) {
            text += `\n${details}\n`;
        }
        text += `\n✅ Reply *yes* to confirm\n`;
        text += `❌ Reply *no* to cancel`;
        return text;
    },

    notification: (title, message, type = 'info') => {
        const icons = {
            info: '🔹',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            update: '🔄',
        };

        const icon = icons[type] || '🔔';

        return `${icon} *${title}*\n\n${message}`;
    },

    quote: (text, author = null) => {
        let result = `✨ _"${text}"_`;
        if (author) {
            result += `\n\n— *${author}*`;
        }
        return result;
    },

    aiResponse: (content, options = {}) => {
        const {
            provider = null,
            responseTime = null,
            showMetadata = false,
        } = options;

        let text = content;

        const parts = text.split(/(```[\s\S]*?```)/g);
        text = parts.map((part, index) => {
            if (index % 2 === 1) {

                return part;
            } else {

                return part
                    .replace(/^\s*[-*]\s+/gm, '• ')
                    .replace(/^\s*\d+\.\s+/gm, (match) => match.trim() + ' ')
                    .replace(/\n{3,}/g, '\n\n');
            }
        }).join('');

        let header = '';

        let footer = '';
        if (showMetadata && (provider || responseTime)) {
            footer += `\n\n━━━━━━━━━━━━━━━━━━━━`;
            if (provider) {
                footer += `\n_Provider: ${provider}_`;
            }
            if (responseTime) {
                footer += `\n_Response time: ${responseTime}ms_`;
            }
        }

        return (header + text + footer).trim();
    },

    features: (title, featureList) => {
        let text = `✨ *${title}*\n\n`;

        featureList.forEach(feature => {
            const icon = feature.icon || '✅';
            const name = feature.name || feature;
            const desc = feature.description || '';

            text += `${icon} *${name}*`;
            if (desc) text += `\n   ${desc}`;
            text += '\n\n';
        });

        return text.trim();
    },
};

export function stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function truncate(text, maxLength, suffix = '...') {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
}

export function pad(str, length, char = ' ', direction = 'right') {
    const stripped = stripAnsi(str);
    const padLength = length - stripped.length;
    if (padLength <= 0) return str;

    const padding = char.repeat(padLength);
    switch (direction) {
        case 'left': return padding + str;
        case 'center':
            const left = Math.floor(padLength / 2);
            const right = padLength - left;
            return char.repeat(left) + str + char.repeat(right);
        default: return str + padding;
    }
}

export function wordWrap(text, width = 80) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        if (currentLine.length + word.length + 1 <= width) {
            currentLine += (currentLine ? ' ' : '') + word;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);

    return lines.join('\n');
}

export function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

export function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

export function timeAgo(date) {
    const now = Date.now();
    const diff = now - new Date(date).getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
    if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
}

export function randomColor() {
    return `\x1b[38;5;${Math.floor(Math.random() * 256)}m`;
}

export function levelBar(current, max, size = 10) {
    const filled = Math.round((current / max) * size);
    const empty = size - filled;
    return '▰'.repeat(filled) + '▱'.repeat(empty);
}

export default {
    ansi,
    emoji,
    box,
    format,
    console: console_ui,
    templates,

    stripAnsi,
    truncate,
    pad,
    wordWrap,
    formatNumber,
    formatBytes,
    formatDuration,
    timeAgo,
    randomColor,
    levelBar,
};
