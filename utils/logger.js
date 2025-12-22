import { createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',

    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

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
};

const LOG_LEVELS = {
    debug: { priority: 0, color: colors.gray, label: 'DEBUG', emoji: '🔍' },
    info: { priority: 1, color: colors.cyan, label: 'INFO', emoji: 'ℹ️' },
    success: { priority: 1, color: colors.green, label: 'SUCCESS', emoji: '✅' },
    command: { priority: 1, color: colors.magenta, label: 'CMD', emoji: '⚡' },
    warn: { priority: 2, color: colors.yellow, label: 'WARN', emoji: '⚠️' },
    security: { priority: 3, color: colors.bgRed + colors.white, label: 'SECURITY', emoji: '🛡️' },
    error: { priority: 4, color: colors.red, label: 'ERROR', emoji: '❌' },
    fatal: { priority: 5, color: colors.brightRed, label: 'FATAL', emoji: '💀' },
};

class Logger {
    constructor(options = {}) {
        this.level = options.level || process.env.LOG_LEVEL || 'info';
        this.useColors = options.colors !== false && process.stdout.isTTY;
        this.useEmoji = options.emoji !== false && process.env.LOG_USE_EMOJI !== 'false';
        this.showTimestamp = options.timestamp !== false && process.env.LOG_SHOW_TIMESTAMP !== 'false';
        this.showLevel = options.showLevel !== false && process.env.LOG_SHOW_LEVEL !== 'false';

        this.logToFile = options.logToFile ?? (process.env.LOG_TO_FILE === 'true');
        this.logDir = options.logDir || process.env.LOG_DIR || './logs';
        this.maxFiles = options.maxFiles || parseInt(process.env.LOG_MAX_FILES) || 7;
        this.fileStream = null;
        this.currentLogDate = null;

        this.context = options.context || null;

        if (this.logToFile) {
            this.initFileLogging();
        }
    }

    initFileLogging() {
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
        }

        this.rotateLogFile();
        this.cleanOldLogs();
    }

    rotateLogFile() {
        const today = new Date().toISOString().split('T')[0];

        if (this.currentLogDate !== today) {
            if (this.fileStream) {
                this.fileStream.end();
            }

            const logPath = join(this.logDir, `${today}.log`);
            this.fileStream = createWriteStream(logPath, { flags: 'a' });
            this.currentLogDate = today;
        }
    }

    cleanOldLogs() {
        try {
            const files = readdirSync(this.logDir)
                .filter(f => f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: join(this.logDir, f),
                    time: statSync(join(this.logDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            for (let i = this.maxFiles; i < files.length; i++) {
                unlinkSync(files[i].path);
            }
        } catch (err) {

        }
    }

    getTimestamp() {
        const now = new Date();
        return now.toISOString().replace('T', ' ').substring(0, 19);
    }

    formatConsole(level, message, ...args) {
        const config = LOG_LEVELS[level] || LOG_LEVELS.info;
        const parts = [];

        if (this.showTimestamp) {
            const timestamp = this.getTimestamp();
            parts.push(this.useColors
                ? `${colors.gray}[${timestamp}]${colors.reset}`
                : `[${timestamp}]`
            );
        }

        if (this.showLevel) {
            const label = this.useEmoji
                ? `${config.emoji} ${config.label}`
                : config.label;
            parts.push(this.useColors
                ? `${config.color}${label}${colors.reset}`
                : label
            );
        }

        if (this.context) {
            parts.push(this.useColors
                ? `${colors.blue}[${this.context}]${colors.reset}`
                : `[${this.context}]`
            );
        }

        parts.push(message);

        return { formatted: parts.join(' '), args };
    }

    formatFile(level, message, ...args) {
        const config = LOG_LEVELS[level] || LOG_LEVELS.info;
        const timestamp = this.getTimestamp();
        const context = this.context ? `[${this.context}] ` : '';

        let fullMessage = `[${timestamp}] ${config.label} ${context}${message}`;

        if (args.length > 0) {
            const argsStr = args.map(arg => {
                if (arg instanceof Error) {
                    return `${arg.message}\n${arg.stack}`;
                }
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
            fullMessage += ' ' + argsStr;
        }

        return fullMessage;
    }

    shouldLog(level) {
        const current = LOG_LEVELS[this.level]?.priority ?? 1;
        const target = LOG_LEVELS[level]?.priority ?? 1;
        return target >= current;
    }

    log(level, message, ...args) {
        if (!this.shouldLog(level)) return;

        const { formatted, args: restArgs } = this.formatConsole(level, message, ...args);

        const consoleFn = level === 'error' || level === 'fatal'
            ? console.error
            : level === 'warn'
                ? console.warn
                : console.log;

        if (restArgs.length > 0) {
            consoleFn(formatted, ...restArgs);
        } else {
            consoleFn(formatted);
        }

        if (this.logToFile && this.fileStream) {
            this.rotateLogFile();
            const fileMessage = this.formatFile(level, message, ...args);
            this.fileStream.write(fileMessage + '\n');
        }
    }

    debug(message, ...args) {
        this.log('debug', message, ...args);
    }

    info(message, ...args) {
        this.log('info', message, ...args);
    }

    success(message, ...args) {
        this.log('success', message, ...args);
    }

    warn(message, ...args) {
        this.log('warn', message, ...args);
    }

    error(message, ...args) {
        this.log('error', message, ...args);
    }

    fatal(message, ...args) {
        this.log('fatal', message, ...args);
    }

    security(message, ...args) {
        this.log('security', message, ...args);
    }

    setContext(context) {
        this.context = context;
        return this;
    }

    command(name, user, context = '') {
        const ctx = context ? ` in ${context}` : '';
        this.log('command', `${name} by ${user}${ctx}`);
    }

    child(context) {
        return new Logger({
            level: this.level,
            colors: this.useColors,
            emoji: this.useEmoji,
            timestamp: this.showTimestamp,
            showLevel: this.showLevel,
            logToFile: this.logToFile,
            logDir: this.logDir,
            maxFiles: this.maxFiles,
            context: this.context ? `${this.context}:${context}` : context,
        });
    }

    setLevel(level) {
        if (LOG_LEVELS[level]) {
            this.level = level;
        }
    }

    time(label) {
        const start = process.hrtime.bigint();
        return {
            end: (message) => {
                const end = process.hrtime.bigint();
                const duration = Number(end - start) / 1e6;
                this.debug(`${label || message}: ${duration.toFixed(2)}ms`);
                return duration;
            }
        };
    }

    table(data, columns) {
        if (!this.shouldLog('debug')) return;
        console.table(data, columns);
    }

    separator(char = '─', length = 50) {
        if (!this.shouldLog('info')) return;
        console.log(this.useColors
            ? `${colors.gray}${char.repeat(length)}${colors.reset}`
            : char.repeat(length)
        );
    }

    box(message, title = '') {
        if (!this.shouldLog('info')) return;

        const lines = message.split('\n');
        const maxLen = Math.max(...lines.map(l => l.length), title.length);
        const top = '┌' + '─'.repeat(maxLen + 2) + '┐';
        const bottom = '└' + '─'.repeat(maxLen + 2) + '┘';

        const colorize = (str) => this.useColors ? `${colors.cyan}${str}${colors.reset}` : str;

        console.log(colorize(top));
        if (title) {
            console.log(colorize(`│ ${title.padEnd(maxLen)} │`));
            console.log(colorize('├' + '─'.repeat(maxLen + 2) + '┤'));
        }
        for (const line of lines) {
            console.log(colorize(`│ ${line.padEnd(maxLen)} │`));
        }
        console.log(colorize(bottom));
    }

    banner(name, version, extra = []) {
        const lines = [
            name,
            `Version: ${version}`,
            ...extra
        ];
        this.box(lines.join('\n'));
    }

    progress(current, total, label = '') {
        if (!process.stdout.isTTY) return;

        const percent = Math.round((current / total) * 100);
        const filled = Math.round(percent / 5);
        const empty = 20 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        process.stdout.write(`\r${label} [${bar}] ${percent}% (${current}/${total})`);

        if (current >= total) {
            process.stdout.write('\n');
        }
    }

    clearLine() {
        if (process.stdout.isTTY) {
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
        }
    }

    close() {
        if (this.fileStream) {
            this.fileStream.end();
            this.fileStream = null;
        }
    }
}

const log = new Logger();

export { Logger, log, colors, LOG_LEVELS };
export default log;
