// Deluxe UI utilities for beautiful message formatting

const BORDERS = {
    top: '╭━━━━━━━━━━━━━━━━━━━━━━━╮',
    bottom: '╰━━━━━━━━━━━━━━━━━━━━━━━╯',
    line: '━━━━━━━━━━━━━━━━━━━━━━━━━'
};

const deluxeUI = {
    header(title, emoji = '✨') {
        return `${BORDERS.top}\n┃ ${emoji} *${title}*\n┃${BORDERS.line}`;
    },

    footer(text = '') {
        return `┃${BORDERS.line}\n${text ? `┃ ${text}\n` : ''}${BORDERS.bottom}`;
    },

    line(text, bullet = '▸') {
        return `┃ ${bullet} ${text}`;
    },

    section(title, content) {
        return `┃ *${title}*\n${content.map(c => `┃   ${c}`).join('\n')}`;
    },

    box(title, lines, emoji = '📦') {
        return [
            this.header(title, emoji),
            ...lines.map(l => this.line(l)),
            this.footer()
        ].join('\n');
    },

    menu(title, commands, emoji = '📋') {
        const cmds = commands.map(c => this.line(`${c.name} - ${c.desc}`));
        return [this.header(title, emoji), ...cmds, this.footer()].join('\n');
    },

    progress(current, total, width = 20) {
        const filled = Math.round((current / total) * width);
        const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
        return `[${bar}] ${Math.round((current / total) * 100)}%`;
    },

    divider() { return `┃${BORDERS.line}`; }
};

export default deluxeUI;
