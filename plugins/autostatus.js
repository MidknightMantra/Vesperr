import { LRUCache } from 'lru-cache';
import { templates } from '../utils/deluxeUI.js';

const CONFIG = {

    VIEW_DELAY_MIN: 500,
    VIEW_DELAY_MAX: 1200,
    REACTION_DELAY_MIN: 1000,
    REACTION_DELAY_MAX: 2500,
    BATCH_SIZE: 5,
    BATCH_DELAY: 1500,

    MAX_VIEWS_PER_MINUTE: 30,
    MAX_REACTIONS_PER_HOUR: 50,
    COOLDOWN_AFTER_LIMIT: 60000,

    DEFAULT_REACT_CHANCE: 0.15,
    REACTIONS: ['❤️', '🔥', '😍', '👏', '💯', '🙌'],

    CACHE_MAX: 15000,
    CACHE_TTL: 24 * 60 * 60 * 1000,
    PROFILE_TTL: 30 * 24 * 60 * 60 * 1000,
};

const viewedCache = new LRUCache({
    max: CONFIG.CACHE_MAX,
    ttl: CONFIG.CACHE_TTL,
});

const contactProfiles = new LRUCache({
    max: 5000,
    ttl: CONFIG.PROFILE_TTL,
});

const rateLimiter = {
    views: { count: 0, resetAt: Date.now() + 60000 },
    reactions: { count: 0, resetAt: Date.now() + 3600000 },
    blocked: false,
    blockedUntil: 0,
};

const stats = {
    total: { views: 0, reactions: 0 },
    today: { views: 0, reactions: 0, date: new Date().toDateString() },
    session: { views: 0, reactions: 0, startedAt: Date.now() },
    errors: 0,
    lastView: null,
    lastReaction: null,
};

const state = {
    enabled: false,
    autoReact: false,
    reactChance: CONFIG.DEFAULT_REACT_CHANCE,
    logging: false,
    paused: false,
    blacklist: new Set(),
    whitelist: new Set(),
    queue: [],
    processing: false,
};

const utils = {

    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    extractNumber(jid) {
        return jid?.split('@')[0] || '';
    },

    statusKey(msg) {
        const sender = msg.key.participant || msg.key.remoteJid;
        return `${utils.extractNumber(sender)}:${msg.key.id}`;
    },

    formatNum(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return String(n);
    },

    formatDuration(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);

        if (d > 0) return `${d}d ${h % 24}h`;
        if (h > 0) return `${h}h ${m % 60}m`;
        if (m > 0) return `${m}m ${s % 60}s`;
        return `${s}s`;
    },

    formatTime(timestamp) {
        if (!timestamp) return 'never';
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    },

    randomReaction() {
        return CONFIG.REACTIONS[Math.floor(Math.random() * CONFIG.REACTIONS.length)];
    },

    shouldReact() {
        return state.autoReact && Math.random() < state.reactChance;
    },

    log(message, type = 'info') {
        if (!state.logging) return;
        const prefix = { info: '[STATUS]', error: '[STATUS ERROR]', success: '[STATUS ✓]' };
        console.log(`${prefix[type] || '[STATUS]'} ${message}`);
    },
};

const limiter = {

    isBlocked() {
        if (rateLimiter.blocked && Date.now() < rateLimiter.blockedUntil) {
            return true;
        }
        rateLimiter.blocked = false;
        return false;
    },

    canView() {
        if (this.isBlocked()) return false;

        const now = Date.now();
        if (now >= rateLimiter.views.resetAt) {
            rateLimiter.views.count = 0;
            rateLimiter.views.resetAt = now + 60000;
        }

        if (rateLimiter.views.count >= CONFIG.MAX_VIEWS_PER_MINUTE) {
            this.block('view limit');
            return false;
        }

        rateLimiter.views.count++;
        return true;
    },

    canReact() {
        if (this.isBlocked()) return false;

        const now = Date.now();
        if (now >= rateLimiter.reactions.resetAt) {
            rateLimiter.reactions.count = 0;
            rateLimiter.reactions.resetAt = now + 3600000;
        }

        if (rateLimiter.reactions.count >= CONFIG.MAX_REACTIONS_PER_HOUR) {
            return false;
        }

        rateLimiter.reactions.count++;
        return true;
    },

    block(reason) {
        rateLimiter.blocked = true;
        rateLimiter.blockedUntil = Date.now() + CONFIG.COOLDOWN_AFTER_LIMIT;
        utils.log(`Rate limited (${reason}) - cooling down for ${CONFIG.COOLDOWN_AFTER_LIMIT / 1000}s`, 'error');
    },

    getInfo() {
        return {
            views: `${rateLimiter.views.count}/${CONFIG.MAX_VIEWS_PER_MINUTE}`,
            reactions: `${rateLimiter.reactions.count}/${CONFIG.MAX_REACTIONS_PER_HOUR}`,
            blocked: rateLimiter.blocked,
            blockedFor: rateLimiter.blocked ? Math.ceil((rateLimiter.blockedUntil - Date.now()) / 1000) : 0,
        };
    },
};

const filter = {

    isBlacklisted(jid) {
        const num = utils.extractNumber(jid);
        return state.blacklist.has(num) || state.blacklist.has(jid);
    },

    passesWhitelist(jid) {
        if (state.whitelist.size === 0) return true;
        const num = utils.extractNumber(jid);
        return state.whitelist.has(num) || state.whitelist.has(jid);
    },

    shouldProcess(msg) {

        if (msg.key.remoteJid !== 'status@broadcast') return false;

        if (msg.key.fromMe) return false;

        if (!msg.key.participant) return false;

        if (this.isBlacklisted(msg.key.participant)) return false;

        if (!this.passesWhitelist(msg.key.participant)) return false;

        if (viewedCache.has(utils.statusKey(msg))) return false;

        return true;
    },

    addBlacklist(number) {
        const clean = number.replace(/\D/g, '');
        if (clean) {
            state.blacklist.add(clean);
            return true;
        }
        return false;
    },

    removeBlacklist(number) {
        const clean = number.replace(/\D/g, '');
        return state.blacklist.delete(clean);
    },

    addWhitelist(number) {
        const clean = number.replace(/\D/g, '');
        if (clean) {
            state.whitelist.add(clean);
            return true;
        }
        return false;
    },

    removeWhitelist(number) {
        const clean = number.replace(/\D/g, '');
        return state.whitelist.delete(clean);
    },
};

const statsManager = {

    checkDayReset() {
        const today = new Date().toDateString();
        if (stats.today.date !== today) {
            stats.today = { views: 0, reactions: 0, date: today };
        }
    },

    recordView(sender) {
        this.checkDayReset();
        stats.total.views++;
        stats.today.views++;
        stats.session.views++;
        stats.lastView = Date.now();

        const num = utils.extractNumber(sender);
        const profile = contactProfiles.get(num) || { views: 0, reactions: 0, lastSeen: 0 };
        profile.views++;
        profile.lastSeen = Date.now();
        contactProfiles.set(num, profile);
    },

    recordReaction(sender) {
        this.checkDayReset();
        stats.total.reactions++;
        stats.today.reactions++;
        stats.session.reactions++;
        stats.lastReaction = Date.now();

        const num = utils.extractNumber(sender);
        const profile = contactProfiles.get(num) || { views: 0, reactions: 0, lastSeen: 0 };
        profile.reactions++;
        contactProfiles.set(num, profile);
    },

    recordError() {
        stats.errors++;
    },

    getTopContacts(limit = 5) {
        const entries = [];
        contactProfiles.forEach((profile, num) => {
            entries.push({ num, ...profile });
        });
        return entries
            .sort((a, b) => b.views - a.views)
            .slice(0, limit);
    },

    reset() {
        stats.total = { views: 0, reactions: 0 };
        stats.today = { views: 0, reactions: 0, date: new Date().toDateString() };
        stats.session = { views: 0, reactions: 0, startedAt: Date.now() };
        stats.errors = 0;
        stats.lastView = null;
        stats.lastReaction = null;
        contactProfiles.clear();
        viewedCache.clear();
    },
};

const viewEngine = {

    async viewStatus(sock, msg) {
        const key = utils.statusKey(msg);
        const sender = msg.key.participant;
        const senderNum = utils.extractNumber(sender);

        if (viewedCache.has(key)) {
            return { success: false, reason: 'duplicate' };
        }

        if (!limiter.canView()) {
            return { success: false, reason: 'rate_limited' };
        }

        try {

            await sock.readMessages([msg.key]);

            try {
                await sock.sendReceipt(
                    msg.key.remoteJid,
                    sender,
                    [msg.key.id],
                    'read'
                );
            } catch { }

            viewedCache.set(key, Date.now());
            statsManager.recordView(sender);

            utils.log(`Viewed: ${senderNum}`, 'success');

            if (utils.shouldReact() && limiter.canReact()) {
                await this.reactToStatus(sock, msg);
            }

            return { success: true, sender: senderNum };

        } catch (error) {
            statsManager.recordError();
            utils.log(`Failed to view ${senderNum}: ${error.message}`, 'error');
            return { success: false, reason: 'error', error: error.message };
        }
    },

    async reactToStatus(sock, msg) {
        const sender = msg.key.participant;
        const senderNum = utils.extractNumber(sender);

        try {

            await utils.sleep(utils.randomDelay(CONFIG.REACTION_DELAY_MIN, CONFIG.REACTION_DELAY_MAX));

            const reaction = utils.randomReaction();

            await sock.sendMessage(msg.key.remoteJid, {
                react: { text: reaction, key: msg.key },
            });

            statsManager.recordReaction(sender);
            utils.log(`Reacted ${reaction} to ${senderNum}`, 'success');

            return { success: true, reaction };

        } catch (error) {
            utils.log(`Failed to react to ${senderNum}: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    },

    async processQueue(sock) {
        if (state.processing || state.queue.length === 0) return;
        if (state.paused || !state.enabled) return;
        if (limiter.isBlocked()) return;

        state.processing = true;

        try {
            while (state.queue.length > 0 && state.enabled && !state.paused) {

                if (limiter.isBlocked()) {
                    utils.log('Pausing queue - rate limited', 'info');
                    break;
                }

                const batch = state.queue.splice(0, CONFIG.BATCH_SIZE);

                for (const msg of batch) {
                    if (!state.enabled || state.paused) break;

                    await this.viewStatus(sock, msg);

                    await utils.sleep(utils.randomDelay(CONFIG.VIEW_DELAY_MIN, CONFIG.VIEW_DELAY_MAX));
                }

                if (state.queue.length > 0) {
                    await utils.sleep(CONFIG.BATCH_DELAY);
                }
            }
        } finally {
            state.processing = false;
        }
    },

    enqueue(msg) {
        if (filter.shouldProcess(msg)) {
            state.queue.push(msg);
            return true;
        }
        return false;
    },
};

async function handleStatusUpdate(sock, update) {
    if (!state.enabled || state.paused) return;

    const { messages, type } = update;

    if (type !== 'notify' || !messages?.length) return;

    let queued = 0;
    for (const msg of messages) {
        if (viewEngine.enqueue(msg)) {
            queued++;
        }
    }

    if (queued > 0) {
        utils.log(`Queued ${queued} status(es)`, 'info');
        viewEngine.processQueue(sock);
    }
}

function createHandler(sock, options = {}) {

    if (options.enabled !== undefined) state.enabled = options.enabled;
    if (options.autoReact !== undefined) state.autoReact = options.autoReact;
    if (options.reactChance !== undefined) state.reactChance = options.reactChance;
    if (options.logging !== undefined) state.logging = options.logging;

    return (update) => handleStatusUpdate(sock, update);
}

const plugin = {
    name: 'autostatus',
    alias: ['asv', 'sv', 'autoview', 'statusview'],
    category: 'utility',
    desc: 'Auto-view WhatsApp statuses',
    usage: '.autostatus [on/off/stats/react/help]',
    cooldown: 2000,
    ownerOnly: true,

    async execute({ sock, msg, args, prefix, db, isOwner }) {
        const chat = msg.key.remoteJid;

        if (!isOwner) {
            return sock.sendMessage(chat, {
                text: templates.notification('Access Denied', `This command is restricted to the bot owner.\nPlease check your .env configuration.`, 'error')
            }, { quoted: msg });
        }

        const cmd = args[0]?.toLowerCase();
        const param = args.slice(1).join(' ');

        if (!cmd) return showStatus(sock, chat, msg, prefix);

        const commands = {
            'on': () => enable(sock, chat, msg, db),
            'enable': () => enable(sock, chat, msg, db),
            '1': () => enable(sock, chat, msg, db),

            'off': () => disable(sock, chat, msg, db),
            'disable': () => disable(sock, chat, msg, db),
            '0': () => disable(sock, chat, msg, db),

            'pause': () => pause(sock, chat, msg),
            'resume': () => resume(sock, chat, msg),

            'stats': () => showStats(sock, chat, msg),
            's': () => showStats(sock, chat, msg),

            'react': () => toggleReact(sock, chat, msg, param, db),
            'r': () => toggleReact(sock, chat, msg, param, db),

            'blacklist': () => manageList(sock, chat, msg, param, 'blacklist', prefix),
            'bl': () => manageList(sock, chat, msg, param, 'blacklist', prefix),

            'whitelist': () => manageList(sock, chat, msg, param, 'whitelist', prefix),
            'wl': () => manageList(sock, chat, msg, param, 'whitelist', prefix),

            'log': () => toggleLog(sock, chat, msg),
            'logs': () => toggleLog(sock, chat, msg),

            'clear': () => clearStats(sock, chat, msg),
            'reset': () => clearStats(sock, chat, msg),

            'queue': () => showQueue(sock, chat, msg),
            'q': () => showQueue(sock, chat, msg),

            'help': () => showHelp(sock, chat, msg, prefix),
            '?': () => showHelp(sock, chat, msg, prefix),
        };

        const handler = commands[cmd];
        if (handler) {
            return handler();
        }

        return sock.sendMessage(chat, {
            text: templates.notification('Warning', `Unknown command. Try ${prefix}autostatus help`, 'warning'),
        }, { quoted: msg });
    },
};

async function showStatus(sock, chat, msg, prefix) {
    const status = state.enabled ? (state.paused ? 'Paused' : 'Enabled') : 'Disabled';
    const react = state.autoReact ? `On (${Math.round(state.reactChance * 100)}%)` : 'Off';
    const limits = limiter.getInfo();

    const text = templates.card(
        'Auto Status',
        {
            'State': status,
            'Reactions': react,
            'Logging': state.logging ? 'On' : 'Off',
            'Queue': `${state.queue.length} pending`,
            'Views Today': utils.formatNum(stats.today.views),
            'Reacts Today': utils.formatNum(stats.today.reactions)
        },
        { footer: `Use ${prefix}asv help for commands` }
    );

    return sock.sendMessage(chat, { text }, { quoted: msg });
}

async function enable(sock, chat, msg, db) {
    state.enabled = true;
    state.paused = false;
    await db?.set?.('autostatus', 'enabled', true);

    return sock.sendMessage(chat, {
        text: templates.notification('Auto Status', 'Enabled! Viewing all new statuses automatically.', 'success'),
    }, { quoted: msg });
}

async function disable(sock, chat, msg, db) {
    state.enabled = false;
    state.queue = [];
    await db?.set?.('autostatus', 'enabled', false);

    return sock.sendMessage(chat, {
        text: templates.notification('Auto Status', 'Disabled', 'info'),
    }, { quoted: msg });
}

async function pause(sock, chat, msg) {
    state.paused = true;
    return sock.sendMessage(chat, {
        text: templates.notification('Auto Status', 'Paused. Queue preserved.', 'warning'),
    }, { quoted: msg });
}

async function resume(sock, chat, msg) {
    state.paused = false;
    viewEngine.processQueue(sock);
    return sock.sendMessage(chat, {
        text: templates.notification('Auto Status', 'Resumed. Processing queue...', 'success'),
    }, { quoted: msg });
}

async function showStats(sock, chat, msg) {
    const uptime = utils.formatDuration(Date.now() - stats.session.startedAt);
    const topContacts = statsManager.getTopContacts(5);
    const topList = topContacts.length > 0
        ? topContacts.map((c, i) => `${i + 1}. ${c.num}: ${c.views}`).join('\n')
        : 'No data yet';

    const text = templates.card(
        'Statistics',
        {
            'Total Views': utils.formatNum(stats.total.views),
            'Total Reacts': utils.formatNum(stats.total.reactions),
            'Sess. Views': utils.formatNum(stats.session.views),
            'Uptime': uptime,
            'Top Viewers': `\n${topList}`
        }
    );

    return sock.sendMessage(chat, { text }, { quoted: msg });
}

async function toggleReact(sock, chat, msg, param, db) {
    if (!param) {
        return sock.sendMessage(chat, {
            text: templates.card('Reactions', [
                `Status: ${state.autoReact ? 'Enabled' : 'Disabled'}`,
                `Chance: ${Math.round(state.reactChance * 100)}%`,
                '',
                'Usage:',
                '• react on/off',
                '• react 25 (set 25% chance)'
            ])
        }, { quoted: msg });
    }

    const lower = param.toLowerCase();
    if (lower === 'on' || lower === 'enable') {
        state.autoReact = true;
        await db?.set?.('autostatus', 'autoReact', true);
        return sock.sendMessage(chat, { text: templates.notification('Reactions', `Enabled (${Math.round(state.reactChance * 100)}% chance)`, 'success') }, { quoted: msg });
    }

    if (lower === 'off' || lower === 'disable') {
        state.autoReact = false;
        await db?.set?.('autostatus', 'autoReact', false);
        return sock.sendMessage(chat, { text: templates.notification('Reactions', 'Disabled', 'info') }, { quoted: msg });
    }

    const percent = parseInt(param);
    if (!isNaN(percent) && percent >= 0 && percent <= 100) {
        state.reactChance = percent / 100;
        await db?.set?.('autostatus', 'reactChance', state.reactChance);
        return sock.sendMessage(chat, { text: templates.notification('Reactions', `Chance: ${percent}%`, 'success') }, { quoted: msg });
    }

    return sock.sendMessage(chat, { text: templates.notification('Error', 'Invalid usage. Use on/off or 0-100.', 'error') }, { quoted: msg });
}

async function manageList(sock, chat, msg, param, listType, prefix) {
    const list = listType === 'blacklist' ? state.blacklist : state.whitelist;
    const items = Array.from(list);

    if (!param) {
        return sock.sendMessage(chat, {
            text: templates.list(listType, items.length ? items : ['(Empty)'])
        }, { quoted: msg });
    }

    const [action, ...rest] = param.split(' ');
    const number = rest.join('').replace(/\D/g, '');

    if (action === 'add' && number) {
        list.add(number);
        return sock.sendMessage(chat, { text: templates.notification(listType, `Added ${number}`, 'success') }, { quoted: msg });
    }

    if ((action === 'remove' || action === 'rm') && number) {
        list.delete(number);
        return sock.sendMessage(chat, { text: templates.notification(listType, `Removed ${number}`, 'success') }, { quoted: msg });
    }

    if (action === 'clear') {
        list.clear();
        return sock.sendMessage(chat, { text: templates.notification(listType, `Cleared`, 'success') }, { quoted: msg });
    }

    return sock.sendMessage(chat, { text: templates.notification('Error', `Usage: ${listType} add/remove <number>`, 'error') }, { quoted: msg });
}

async function toggleLog(sock, chat, msg) {
    state.logging = !state.logging;
    return sock.sendMessage(chat, { text: templates.notification('Logging', state.logging ? 'Enabled' : 'Disabled', 'info') }, { quoted: msg });
}

async function clearStats(sock, chat, msg) {
    statsManager.reset();
    return sock.sendMessage(chat, { text: templates.notification('Stats', 'Reset', 'success') }, { quoted: msg });
}

async function showQueue(sock, chat, msg) {
    return sock.sendMessage(chat, {
        text: templates.card('Queue Status', {
            'Pending': state.queue.length,
            'Processing': state.processing,
            'Paused': state.paused
        })
    }, { quoted: msg });
}

async function showHelp(sock, chat, msg, prefix) {
    const p = prefix;
    return sock.sendMessage(chat, {
        text: templates.card('AutoStatus Help', [
            `${p}asv [on/off]`,
            `${p}asv stats`,
            `${p}asv react [on/off/chance]`,
            `${p}asv blacklist [add/rm]`,
            `${p}asv whitelist [add/rm]`
        ])
    }, { quoted: msg });
}

async function init(db) {
    try {
        const enabled = await db?.get?.('autostatus', 'enabled');
        const autoReact = await db?.get?.('autostatus', 'autoReact');
        const reactChance = await db?.get?.('autostatus', 'reactChance');

        if (enabled !== undefined) state.enabled = enabled;
        if (autoReact !== undefined) state.autoReact = autoReact;
        if (reactChance !== undefined) state.reactChance = reactChance;

        console.log(`[AUTOSTATUS] ${state.enabled ? 'Enabled' : 'Disabled'}`);
    } catch { }
}

export default plugin;

export {
    handleStatusUpdate,
    createHandler,
    init as initAutoStatus,
    state as autoStatusState,
    stats as autoStatusStats,
    CONFIG as autoStatusConfig,
    viewEngine,
    filter as autoStatusFilter,
    statsManager as autoStatusStatsManager,
};
