import { readdirSync, existsSync, watchFile, unwatchFile, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { log } from './utils/logger.js';
import { EventEmitter } from 'events';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = join(__dirname, 'plugins');

class PluginManager extends EventEmitter {
    constructor() {
        super();
        this.plugins = new Map();
        this.categories = new Map();
        this.cooldowns = new Map();
        this.rateLimits = new Map();
        this.hooks = new Map();
        this.middleware = [];
        this.watchedFiles = new Set();
        this.dependencies = new Map();
        this.messageHandlers = new Map();
        this.reactionHandlers = new Map();
        this.pollHandlers = new Map();
        this.buttonHandlers = new Map();
        this.listHandlers = new Map();
        this.channelHandlers = new Map();

        this.globalLimits = {
            messagesPerDay: 1000,
            messagesPerMinute: 30,
            broadcastsPerDay: 100,
            marketingMessagesPerDay: 250,
        };
        this.dailyStats = {
            messages: 0,
            broadcasts: 0,
            marketing: 0,
            lastReset: Date.now()
        };
    }

    get count() { return this.plugins.size; }
    get enabledCount() { return this.getAll().filter(p => p.enabled).length; }
    get disabledCount() { return this.getAll().filter(p => !p.enabled).length; }

    normalizeMessageType(type) {
        const typeMap = {
            'conversation': 'text',
            'extendedTextMessage': 'extendedText',
            'imageMessage': 'image',
            'videoMessage': 'video',
            'audioMessage': 'audio',
            'documentMessage': 'document',
            'stickerMessage': 'sticker',
            'contactMessage': 'contact',
            'locationMessage': 'location',
            'buttonsResponseMessage': 'buttonResponse',
            'listResponseMessage': 'listResponse',
            'text': 'text',
            'extendedText': 'extendedText',
        };
        return typeMap[type] || type;
    }

    async loadAll(bustCache = false) {
        this.plugins.clear();
        this.categories.clear();
        this.resetHandlers();

        if (!existsSync(PLUGINS_DIR)) {
            log.warn('Plugins directory not found');
            return { loaded: 0, failed: 0, skipped: 0, errors: [] };
        }

        const files = readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
        const results = { loaded: 0, failed: 0, skipped: 0, errors: [] };

        files.sort((a, b) => {
            const numA = parseInt(a.match(/^(\d+)/)?.[1] || '99');
            const numB = parseInt(b.match(/^(\d+)/)?.[1] || '99');
            return numA - numB;
        });

        for (const file of files) {
            const result = await this.loadPlugin(join(PLUGINS_DIR, file), bustCache);
            if (result.success) {
                results.loaded += result.count;
            } else if (result.skipped) {
                results.skipped++;
            } else {
                results.failed++;
                results.errors.push({ file, error: result.error });
            }
        }

        await this.resolveDependencies();
        this.emit('loaded', results);
        log.info(`Loaded ${results.loaded} plugins (${results.failed} failed, ${results.skipped} skipped)`);
        return results;
    }

    resetHandlers() {
        this.messageHandlers.clear();
        this.reactionHandlers.clear();
        this.pollHandlers.clear();
        this.buttonHandlers.clear();
        this.listHandlers.clear();
        this.channelHandlers.clear();
        this.hooks.clear();
    }

    async loadPlugin(filePath, bustCache = false) {
        const fileName = basename(filePath);

        if (fileName.startsWith('_')) {
            log.debug(`Skipping disabled plugin: ${fileName}`);
            return { success: false, skipped: true };
        }

        if (bustCache) {
            this.unregisterByFile(filePath);
        }

        try {
            const url = bustCache
                ? `file://${filePath}?update=${Date.now()}`
                : `file://${filePath}`;

            const module = await import(url);
            const plugin = module.default || module;
            const commands = Array.isArray(plugin) ? plugin : [plugin];
            let loadedCount = 0;

            for (const cmd of commands) {
                const result = this.registerCommand(cmd, filePath);
                if (result) loadedCount++;
            }

            return { success: true, count: loadedCount };
        } catch (err) {
            log.error(`Failed to load ${fileName}: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    unregisterByFile(filePath) {

        for (const [name, plugin] of this.plugins.entries()) {
            if (plugin.filePath === filePath) {
                this.plugins.delete(name);

                for (const [cat, items] of this.categories.entries()) {
                    this.categories.set(cat, items.filter(p => p.name !== name));
                }

                for (const [hookName, hookSet] of this.hooks.entries()) {
                    for (const hook of hookSet) {
                        if (hook.plugin === name) {
                            hookSet.delete(hook);
                        }
                    }
                }
            }
        }

        for (const [id, handler] of this.messageHandlers.entries()) {
            if (handler.filePath === filePath) {
                this.messageHandlers.delete(id);
            }
        }

        for (const [emoji, handlers] of this.reactionHandlers.entries()) {
            this.reactionHandlers.set(emoji, handlers.filter(h => h.filePath !== filePath));
        }

        for (const [pollId, handlers] of this.pollHandlers.entries()) {
            this.pollHandlers.set(pollId, handlers.filter(h => h.filePath !== filePath));
        }

        for (const [id, handler] of this.buttonHandlers.entries()) {
            if (handler.filePath === filePath) {
                this.buttonHandlers.delete(id);
            }
        }

        for (const [id, handler] of this.listHandlers.entries()) {
            if (handler.filePath === filePath) {
                this.listHandlers.delete(id);
            }
        }

        for (const [type, handlers] of this.channelHandlers.entries()) {
            this.channelHandlers.set(type, handlers.filter(h => h.filePath !== filePath));
        }

        log.debug(`Unregistered all components from: ${basename(filePath)}`);
    }

    registerCommand(cmd, filePath) {

        const name = cmd.name || cmd.command?.pattern || cmd.cmd;
        const aliases = [
            ...(cmd.aliases || []),
            ...(cmd.alias ? [cmd.alias] : []),
            ...(cmd.alt || [])
        ].flat().filter(Boolean);

        const handler = cmd.execute || cmd.handler || cmd.command?.run || cmd.run || cmd.exec;

        if (!name || typeof name !== 'string' || name.trim() === '') {

            if (this.registerNonCommandHandler(cmd, filePath)) {
                return true;
            }
            log.warn(`Plugin missing or invalid name: ${filePath}`);
            return null;
        }

        if (!handler || typeof handler !== 'function') {
            log.warn(`Plugin missing or invalid handler: ${filePath}`);
            return null;
        }

        if (this.plugins.has(name.toLowerCase())) {
            log.warn(`Duplicate plugin name "${name}" from ${filePath}, skipping`);
            return null;
        }

        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const allCommands = [name, ...aliases].map(escapeRegex);
        const prefix = cmd.prefix ?? '\\.';
        const pattern = new RegExp(`^${prefix}(${allCommands.join('|')})(?:\\s|$)`, 'i');

        const pluginData = {
            name: name.toLowerCase(),
            displayName: cmd.displayName || name,
            description: cmd.description || cmd.desc || '',
            usage: cmd.usage || `{prefix}${name}`,
            examples: cmd.examples || [],
            pattern,
            aliases,
            category: cmd.category || 'misc',

            react: cmd.react || null,
            reactOnSuccess: cmd.reactOnSuccess || '✅',
            reactOnError: cmd.reactOnError || '❌',
            reactOnProcessing: cmd.reactOnProcessing || '⏳',

            handler,

            isOwner: cmd.isOwner || cmd.ownerOnly || false,
            isGroup: cmd.isGroup || cmd.groupOnly || false,
            isPrivate: cmd.isPrivate || cmd.privateOnly || false,
            isAdmin: cmd.isAdmin || cmd.adminOnly || false,
            isBotAdmin: cmd.isBotAdmin || false,
            isSuperAdmin: cmd.isSuperAdmin || false,
            isNsfw: cmd.isNsfw || false,
            isPremium: cmd.isPremium || false,
            permissions: cmd.permissions || [],

            cooldown: cmd.cooldown || 0,
            rateLimit: cmd.rateLimit || null,
            globalCooldown: cmd.globalCooldown || 0,

            supportedTypes: cmd.supportedTypes || ['text', 'extendedText'],
            requiresMedia: cmd.requiresMedia || false,
            requiresQuote: cmd.requiresQuote || cmd.requiresReply || false,
            requiresMention: cmd.requiresMention || false,

            buttons: cmd.buttons || null,
            list: cmd.list || null,
            template: cmd.template || null,
            interactive: cmd.interactive || null,

            channelOnly: cmd.channelOnly || false,
            supportsChannels: cmd.supportsChannels || false,

            version: cmd.version || '1.0.0',
            author: cmd.author || 'Unknown',
            dependencies: cmd.dependencies || [],
            tags: cmd.tags || [],
            priority: cmd.priority || 50,

            hooks: cmd.hooks || {},

            filePath,
            enabled: cmd.enabled !== false,
            loadedAt: Date.now(),
            lastModified: statSync(filePath).mtimeMs,
            stats: {
                calls: 0,
                errors: 0,
                avgResponseTime: 0,
                lastUsed: null,
                usageByUser: new Map(),
                usageByGroup: new Map()
            }
        };

        this.plugins.set(name.toLowerCase(), pluginData);
        this.addToCategory(pluginData);
        this.registerHooks(pluginData);
        this.registerInteractiveHandlers(pluginData);

        if (pluginData.dependencies.length > 0) {
            this.dependencies.set(name.toLowerCase(), new Set(pluginData.dependencies));
        }

        log.debug(`Loaded: ${name}${aliases.length ? ` (${aliases.join(', ')})` : ''}`);

        if (typeof cmd.onLoad === 'function') {
            this.safeExecute(() => cmd.onLoad(this), `onLoad for ${name}`);
        }

        this.emit('pluginLoaded', pluginData);
        return pluginData;
    }

    registerNonCommandHandler(cmd, filePath) {
        let registered = false;

        if (cmd.onMessage && typeof cmd.onMessage === 'function') {
            const id = cmd.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            this.messageHandlers.set(id, {
                handler: cmd.onMessage,
                filter: cmd.messageFilter || (() => true),
                priority: cmd.priority || 50,
                filePath
            });
            registered = true;
        }

        if (cmd.onReaction && typeof cmd.onReaction === 'function') {
            const emoji = cmd.reactionEmoji || '*';
            if (!this.reactionHandlers.has(emoji)) {
                this.reactionHandlers.set(emoji, []);
            }
            this.reactionHandlers.get(emoji).push({
                handler: cmd.onReaction,
                filePath
            });
            registered = true;
        }

        if (cmd.onPollVote && typeof cmd.onPollVote === 'function') {
            const pollId = cmd.pollId || '*';
            if (!this.pollHandlers.has(pollId)) {
                this.pollHandlers.set(pollId, []);
            }
            this.pollHandlers.get(pollId).push({
                handler: cmd.onPollVote,
                filePath
            });
            registered = true;
        }

        if (cmd.onButton && typeof cmd.onButton === 'function') {
            const buttonId = cmd.buttonId || '*';
            this.buttonHandlers.set(buttonId, {
                handler: cmd.onButton,
                filePath
            });
            registered = true;
        }

        if (cmd.onListSelect && typeof cmd.onListSelect === 'function') {
            const listId = cmd.listId || '*';
            this.listHandlers.set(listId, {
                handler: cmd.onListSelect,
                filePath
            });
            registered = true;
        }

        if (cmd.onChannelUpdate && typeof cmd.onChannelUpdate === 'function') {
            const channelType = cmd.channelType || '*';
            if (!this.channelHandlers.has(channelType)) {
                this.channelHandlers.set(channelType, []);
            }
            this.channelHandlers.get(channelType).push({
                handler: cmd.onChannelUpdate,
                filePath
            });
            registered = true;
        }

        return registered;
    }

    registerInteractiveHandlers(plugin) {

        if (plugin.buttons?.callback && typeof plugin.buttons.callback === 'function') {
            const buttonIds = plugin.buttons.ids || [`${plugin.name}_btn`];
            buttonIds.forEach(id => {
                this.buttonHandlers.set(id, {
                    handler: plugin.buttons.callback,
                    plugin: plugin.name
                });
            });
        }

        if (plugin.list?.callback && typeof plugin.list.callback === 'function') {
            this.listHandlers.set(plugin.list.id || `${plugin.name}_list`, {
                handler: plugin.list.callback,
                plugin: plugin.name
            });
        }
    }

    addToCategory(plugin) {
        const cat = plugin.category.toLowerCase();
        if (!this.categories.has(cat)) {
            this.categories.set(cat, []);
        }
        this.categories.get(cat).push(plugin);
    }

    registerHooks(plugin) {
        const defaultHooks = [
            'beforeCommand', 'afterCommand',
            'onError', 'onCooldown',
            'onPermissionDenied', 'onRateLimit',
            'onGroupJoin', 'onGroupLeave',
            'onCall', 'onPresenceUpdate',
            'onMessageDelete', 'onMessageUpdate'
        ];

        for (const [hookName, hookHandler] of Object.entries(plugin.hooks)) {
            if (typeof hookHandler !== 'function') continue;
            if (!this.hooks.has(hookName)) {
                this.hooks.set(hookName, new Set());
            }
            this.hooks.get(hookName).add({
                plugin: plugin.name,
                handler: hookHandler,
                priority: plugin.priority
            });
        }
    }

    async resolveDependencies() {
        for (const [name, deps] of this.dependencies) {
            const plugin = this.plugins.get(name);
            if (!plugin) continue;

            const missing = [];
            for (const dep of deps) {
                if (!this.plugins.has(dep.toLowerCase())) {
                    missing.push(dep);
                }
            }

            if (missing.length > 0) {
                log.warn(`Plugin "${name}" has unmet dependencies: ${missing.join(', ')}`);
                plugin.enabled = false;
                plugin.disabledReason = `Missing dependencies: ${missing.join(', ')}`;
            }
        }
    }

    findCommand(text, messageType = 'text') {
        if (!text) return null;

        const prefixMatch = text.match(/^[.!/\\]/);
        if (!prefixMatch) return null;

        const normalizedType = this.normalizeMessageType(messageType);

        for (const [name, plugin] of this.plugins) {
            if (!plugin.enabled) continue;

            const typeMatch = plugin.supportedTypes.some(t =>
                t === '*' ||
                t === messageType ||
                t === normalizedType ||
                this.normalizeMessageType(t) === normalizedType
            );
            if (!typeMatch) continue;

            const match = text.match(plugin.pattern);
            if (match) {
                const args = text.slice(match[0].length).trim();
                return {
                    plugin,
                    match,
                    commandUsed: match[1].toLowerCase(),
                    args,
                    argsArray: args ? args.split(/\s+/) : [],
                    flags: this.parseFlags(args)
                };
            }
        }
        return null;
    }

    parseFlags(args) {
        const flags = {};
        const regex = /--?(\w+)(?:=(\S+))?/g;
        let match;
        while ((match = regex.exec(args)) !== null) {
            flags[match[1]] = match[2] || true;
        }
        return flags;
    }

    async canExecute(plugin, ctx) {
        const { sender, isGroup, isAdmin, isBotAdmin, isOwner, groupMetadata } = ctx;
        const checks = [];

        if (plugin.isOwner && !isOwner) {
            checks.push({ allowed: false, reason: 'owner_only' });
        }

        if (plugin.isGroup && !isGroup) {
            checks.push({ allowed: false, reason: 'group_only' });
        }
        if (plugin.isPrivate && isGroup) {
            checks.push({ allowed: false, reason: 'private_only' });
        }

        if (plugin.isAdmin && isGroup && !isAdmin && !isOwner) {
            checks.push({ allowed: false, reason: 'admin_only' });
        }
        if (plugin.isBotAdmin && isGroup && !isBotAdmin) {
            checks.push({ allowed: false, reason: 'bot_admin_required' });
        }

        if (plugin.channelOnly && !ctx.isChannel) {
            checks.push({ allowed: false, reason: 'channel_only' });
        }

        if (plugin.isNsfw && isGroup) {
            const isNsfwGroup = groupMetadata?.subject?.toLowerCase().includes('nsfw') ||
                groupMetadata?.desc?.toLowerCase().includes('nsfw');
            if (!isNsfwGroup) {
                checks.push({ allowed: false, reason: 'nsfw_group_required' });
            }
        }

        if (plugin.isPremium && !ctx.isPremium && !isOwner) {
            checks.push({ allowed: false, reason: 'premium_only' });
        }

        const cooldownCheck = this.checkCooldown(plugin.name, sender, plugin.cooldown);
        if (!cooldownCheck.allowed) {
            checks.push(cooldownCheck);
        }

        if (plugin.rateLimit) {
            const rateLimitCheck = this.checkRateLimit(plugin.name, sender, plugin.rateLimit);
            if (!rateLimitCheck.allowed) {
                checks.push(rateLimitCheck);
            }
        }

        const globalCheck = this.checkGlobalLimits();
        if (!globalCheck.allowed) {
            checks.push(globalCheck);
        }

        if (plugin.requiresMedia && !ctx.hasMedia) {
            checks.push({ allowed: false, reason: 'media_required' });
        }

        if (plugin.requiresQuote && !ctx.quoted) {
            checks.push({ allowed: false, reason: 'quote_required' });
        }

        if (plugin.hooks.checkPermission) {
            const customCheck = await this.safeExecute(
                () => plugin.hooks.checkPermission(ctx),
                `permission check for ${plugin.name}`
            );
            if (customCheck && !customCheck.allowed) {
                checks.push(customCheck);
            }
        }

        const failed = checks.find(c => !c.allowed);
        return failed || { allowed: true };
    }

    checkCooldown(pluginName, userId, cooldownMs) {
        if (cooldownMs <= 0) return { allowed: true };

        const userCooldowns = this.cooldowns.get(userId);
        if (!userCooldowns?.has(pluginName)) return { allowed: true };

        const lastUsed = userCooldowns.get(pluginName);
        const remaining = cooldownMs - (Date.now() - lastUsed);

        if (remaining > 0) {
            return {
                allowed: false,
                reason: 'cooldown',
                remaining: Math.ceil(remaining / 1000),
                remainingMs: remaining
            };
        }
        return { allowed: true };
    }

    checkRateLimit(pluginName, userId, config) {
        const { max, window } = config;
        const key = `${userId}:${pluginName}`;
        const now = Date.now();

        let data = this.rateLimits.get(key);
        if (!data || now - data.windowStart > window) {
            data = { count: 0, windowStart: now };
        }

        if (data.count >= max) {
            const resetIn = window - (now - data.windowStart);
            return {
                allowed: false,
                reason: 'rate_limit',
                resetIn: Math.ceil(resetIn / 1000),
                limit: max,
                window: window / 1000
            };
        }

        return { allowed: true };
    }

    checkGlobalLimits() {
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;

        if (now - this.dailyStats.lastReset > dayMs) {
            this.dailyStats = { messages: 0, broadcasts: 0, marketing: 0, lastReset: now };
        }

        if (this.dailyStats.messages >= this.globalLimits.messagesPerDay) {
            return {
                allowed: false,
                reason: 'daily_limit_reached',
                limit: this.globalLimits.messagesPerDay
            };
        }

        return { allowed: true };
    }

    recordUsage(pluginName, userId, groupId = null, responseTime = 0) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) return;

        const now = Date.now();
        plugin.stats.calls++;
        plugin.stats.lastUsed = now;
        plugin.stats.avgResponseTime = (
            (plugin.stats.avgResponseTime * (plugin.stats.calls - 1) + responseTime) /
            plugin.stats.calls
        );

        const userUsage = plugin.stats.usageByUser.get(userId) || 0;
        plugin.stats.usageByUser.set(userId, userUsage + 1);

        if (groupId) {
            const groupUsage = plugin.stats.usageByGroup.get(groupId) || 0;
            plugin.stats.usageByGroup.set(groupId, groupUsage + 1);
        }

        if (plugin.cooldown > 0) {
            if (!this.cooldowns.has(userId)) {
                this.cooldowns.set(userId, new Map());
            }
            this.cooldowns.get(userId).set(pluginName, now);
        }

        if (plugin.rateLimit) {
            const key = `${userId}:${pluginName}`;
            const data = this.rateLimits.get(key) || { count: 0, windowStart: now };
            data.count++;
            this.rateLimits.set(key, data);
        }

        this.dailyStats.messages++;
    }

    recordError(pluginName, error) {
        const plugin = this.plugins.get(pluginName);
        if (plugin) {
            plugin.stats.errors++;
            this.emit('pluginError', { plugin: pluginName, error });
        }
    }

    async executeHook(hookName, ctx, ...args) {
        const handlers = this.hooks.get(hookName);
        if (!handlers?.size) return [];

        const sorted = Array.from(handlers).sort((a, b) => b.priority - a.priority);
        const results = [];

        for (const { plugin, handler } of sorted) {
            const result = await this.safeExecute(
                () => handler(ctx, ...args),
                `hook ${hookName} from ${plugin}`
            );
            results.push({ plugin, result });

            if (result?.abort) break;
        }
        return results;
    }

    use(middleware) {
        if (typeof middleware === 'function') {
            this.middleware.push(middleware);
        }
        return this;
    }

    async runMiddleware(ctx, plugin) {
        for (const mw of this.middleware) {
            const result = await this.safeExecute(
                () => mw(ctx, plugin),
                'middleware'
            );
            if (result === false) return false;
        }
        return true;
    }

    async handleReaction(ctx) {
        const { emoji, messageKey } = ctx;
        const handlers = [
            ...(this.reactionHandlers.get(emoji) || []),
            ...(this.reactionHandlers.get('*') || [])
        ];

        for (const { handler } of handlers) {
            await this.safeExecute(() => handler(ctx), 'reaction handler');
        }
    }

    async handlePollVote(ctx) {
        const { pollId, selectedOptions, voter } = ctx;
        const handlers = [
            ...(this.pollHandlers.get(pollId) || []),
            ...(this.pollHandlers.get('*') || [])
        ];

        for (const { handler } of handlers) {
            await this.safeExecute(() => handler(ctx), 'poll handler');
        }
    }

    async handleButton(ctx) {
        const { buttonId, selectedButtonId } = ctx;
        const handler = this.buttonHandlers.get(buttonId) ||
            this.buttonHandlers.get(selectedButtonId) ||
            this.buttonHandlers.get('*');

        if (handler) {
            await this.safeExecute(() => handler.handler(ctx), 'button handler');
        }
    }

    async handleListSelection(ctx) {
        const { listId, selectedRowId } = ctx;
        const handler = this.listHandlers.get(listId) ||
            this.listHandlers.get(selectedRowId) ||
            this.listHandlers.get('*');

        if (handler) {
            await this.safeExecute(() => handler.handler(ctx), 'list handler');
        }
    }

    async handleChannelUpdate(ctx) {
        const { type } = ctx;
        const handlers = [
            ...(this.channelHandlers.get(type) || []),
            ...(this.channelHandlers.get('*') || [])
        ];

        for (const { handler } of handlers) {
            await this.safeExecute(() => handler(ctx), 'channel handler');
        }
    }

    async handleNonCommandMessage(ctx) {
        const handlers = Array.from(this.messageHandlers.values())
            .filter(h => h.filter(ctx))
            .sort((a, b) => b.priority - a.priority);

        for (const { handler } of handlers) {
            const result = await this.safeExecute(() => handler(ctx), 'message handler');
            if (result?.handled) break;
        }
    }

    enableHotReload(interval = 1000) {
        if (!existsSync(PLUGINS_DIR)) return;

        const files = readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));

        for (const file of files) {
            const filePath = join(PLUGINS_DIR, file);
            if (this.watchedFiles.has(filePath)) continue;

            watchFile(filePath, { interval }, async (curr, prev) => {
                if (curr.mtime !== prev.mtime) {
                    log.info(`Hot reload: ${file}`);
                    await this.reloadPlugin(filePath);
                    this.emit('hotReload', { file, filePath });
                }
            });
            this.watchedFiles.add(filePath);
        }
        log.info(`Hot reload enabled (${files.length} files watched)`);
    }

    disableHotReload() {
        for (const filePath of this.watchedFiles) {
            unwatchFile(filePath);
        }
        this.watchedFiles.clear();
        log.info('Hot reload disabled');
    }

    async reloadPlugin(filePath) {
        const fileName = basename(filePath);

        const existingPlugins = [];
        for (const [name, plugin] of this.plugins) {
            if (plugin.filePath === filePath) {
                existingPlugins.push({ name, plugin });
            }
        }

        try {

            for (const { name } of existingPlugins) {
                await this.unloadPlugin(name);
            }

            const result = await this.loadPlugin(filePath, true);

            if (result.success) {
                log.info(`Reloaded: ${fileName} (${result.count} commands)`);
                this.emit('pluginReloaded', { filePath, result });
            } else if (result.error) {
                log.error(`Failed to reload ${fileName}: ${result.error}`);

            }

            return result;
        } catch (err) {
            log.error(`Hot reload error for ${fileName}: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    async unloadPlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) return false;

        if (plugin.hooks.onUnload) {
            await this.safeExecute(plugin.hooks.onUnload, `onUnload for ${name}`);
        }

        const categoryPlugins = this.categories.get(plugin.category);
        if (categoryPlugins) {
            const idx = categoryPlugins.findIndex(p => p.name === name);
            if (idx > -1) categoryPlugins.splice(idx, 1);
        }

        for (const handlers of this.hooks.values()) {
            for (const h of handlers) {
                if (h.plugin === name) handlers.delete(h);
            }
        }

        for (const [id, handler] of this.buttonHandlers) {
            if (handler.plugin === name) this.buttonHandlers.delete(id);
        }
        for (const [id, handler] of this.listHandlers) {
            if (handler.plugin === name) this.listHandlers.delete(id);
        }

        this.plugins.delete(name);
        this.dependencies.delete(name);

        log.info(`Unloaded plugin: ${name}`);
        this.emit('pluginUnloaded', name);
        return true;
    }

    getAll() { return Array.from(this.plugins.values()); }
    get(name) { return this.plugins.get(name?.toLowerCase()); }
    has(name) { return this.plugins.has(name?.toLowerCase()); }
    getByCategory(cat) { return this.categories.get(cat?.toLowerCase()) || []; }
    getCategories() { return Array.from(this.categories.keys()).sort(); }

    getByTag(tag) {
        return this.getAll().filter(p =>
            p.tags.some(t => t.toLowerCase() === tag.toLowerCase())
        );
    }

    getByAuthor(author) {
        return this.getAll().filter(p =>
            p.author.toLowerCase().includes(author.toLowerCase())
        );
    }

    search(query) {
        const q = query.toLowerCase().trim();
        if (!q) return [];

        return this.getAll()
            .filter(p =>
                p.name.includes(q) ||
                p.displayName.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                p.aliases.some(a => a.toLowerCase().includes(q)) ||
                p.tags.some(t => t.toLowerCase().includes(q)) ||
                p.category.toLowerCase().includes(q)
            )
            .sort((a, b) => {

                if (a.name === q) return -1;
                if (b.name === q) return 1;

                if (a.aliases.includes(q)) return -1;
                if (b.aliases.includes(q)) return 1;
                return 0;
            });
    }

    enable(name) {
        const plugin = this.plugins.get(name?.toLowerCase());
        if (!plugin) return false;

        plugin.enabled = true;
        delete plugin.disabledReason;
        log.info(`Enabled plugin: ${name}`);
        this.emit('pluginEnabled', name);
        return true;
    }

    disable(name, reason = 'Manually disabled') {
        const plugin = this.plugins.get(name?.toLowerCase());
        if (!plugin) return false;

        plugin.enabled = false;
        plugin.disabledReason = reason;
        log.info(`Disabled plugin: ${name}`);
        this.emit('pluginDisabled', name);
        return true;
    }

    toggle(name) {
        const plugin = this.plugins.get(name?.toLowerCase());
        if (!plugin) return null;
        return plugin.enabled ? this.disable(name) : this.enable(name);
    }

    getStats() {
        const plugins = this.getAll();
        const enabled = plugins.filter(p => p.enabled);
        const disabled = plugins.filter(p => !p.enabled);

        return {
            total: plugins.length,
            enabled: enabled.length,
            disabled: disabled.length,
            categories: this.categories.size,

            usage: {
                totalCalls: plugins.reduce((sum, p) => sum + p.stats.calls, 0),
                totalErrors: plugins.reduce((sum, p) => sum + p.stats.errors, 0),
                avgResponseTime: plugins.length > 0
                    ? plugins.reduce((sum, p) => sum + p.stats.avgResponseTime, 0) / plugins.length
                    : 0
            },

            daily: { ...this.dailyStats },
            limits: { ...this.globalLimits },

            topPlugins: {
                mostUsed: [...plugins]
                    .sort((a, b) => b.stats.calls - a.stats.calls)
                    .slice(0, 10)
                    .map(p => ({ name: p.name, calls: p.stats.calls })),

                mostErrors: [...plugins]
                    .filter(p => p.stats.errors > 0)
                    .sort((a, b) => b.stats.errors - a.stats.errors)
                    .slice(0, 5)
                    .map(p => ({ name: p.name, errors: p.stats.errors })),

                recentlyUsed: [...plugins]
                    .filter(p => p.stats.lastUsed)
                    .sort((a, b) => b.stats.lastUsed - a.stats.lastUsed)
                    .slice(0, 10)
                    .map(p => ({ name: p.name, lastUsed: p.stats.lastUsed })),

                slowest: [...plugins]
                    .filter(p => p.stats.avgResponseTime > 0)
                    .sort((a, b) => b.stats.avgResponseTime - a.stats.avgResponseTime)
                    .slice(0, 5)
                    .map(p => ({ name: p.name, avgMs: Math.round(p.stats.avgResponseTime) }))
            },

            byCategory: Object.fromEntries(
                Array.from(this.categories.entries())
                    .map(([cat, plugins]) => [cat, {
                        total: plugins.length,
                        enabled: plugins.filter(p => p.enabled).length
                    }])
            )
        };
    }

    getPluginStats(name) {
        const plugin = this.plugins.get(name?.toLowerCase());
        if (!plugin) return null;

        return {
            name: plugin.name,
            displayName: plugin.displayName,
            category: plugin.category,
            enabled: plugin.enabled,
            ...plugin.stats,
            topUsers: Array.from(plugin.stats.usageByUser.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10),
            topGroups: Array.from(plugin.stats.usageByGroup.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
        };
    }

    async safeExecute(fn, context = 'unknown') {
        try {
            return await fn();
        } catch (err) {
            log.error(`Error in ${context}: ${err.message}`);
            this.emit('error', { context, error: err });
            return null;
        }
    }

    getHelp(name) {
        const plugin = this.plugins.get(name?.toLowerCase());
        if (!plugin) return null;

        let help = `*${plugin.displayName}*\n`;
        help += `${plugin.description}\n\n`;
        help += `*Usage:* ${plugin.usage.replace('{prefix}', '.')}\n`;

        if (plugin.aliases.length > 0) {
            help += `*Aliases:* ${plugin.aliases.join(', ')}\n`;
        }
        if (plugin.examples.length > 0) {
            help += `*Examples:*\n${plugin.examples.map(e => `  ${e}`).join('\n')}\n`;
        }

        const perms = [];
        if (plugin.isOwner) perms.push('Owner Only');
        if (plugin.isAdmin) perms.push('Admin Only');
        if (plugin.isGroup) perms.push('Group Only');
        if (plugin.isPrivate) perms.push('Private Only');
        if (plugin.isPremium) perms.push('Premium');
        if (plugin.isNsfw) perms.push('NSFW');

        if (perms.length > 0) {
            help += `*Permissions:* ${perms.join(', ')}\n`;
        }
        if (plugin.cooldown > 0) {
            help += `*Cooldown:* ${plugin.cooldown / 1000}s\n`;
        }

        return help;
    }

    exportConfig() {
        const config = {};
        for (const [name, plugin] of this.plugins) {
            config[name] = {
                enabled: plugin.enabled,
                cooldown: plugin.cooldown,
                rateLimit: plugin.rateLimit
            };
        }
        return config;
    }

    importConfig(config) {
        for (const [name, settings] of Object.entries(config)) {
            const plugin = this.plugins.get(name);
            if (plugin) {
                Object.assign(plugin, settings);
            }
        }
    }

    clearCooldowns(userId) {
        this.cooldowns.delete(userId);
        for (const key of this.rateLimits.keys()) {
            if (key.startsWith(`${userId}:`)) {
                this.rateLimits.delete(key);
            }
        }
    }

    resetStats() {
        for (const plugin of this.plugins.values()) {
            plugin.stats = {
                calls: 0,
                errors: 0,
                avgResponseTime: 0,
                lastUsed: null,
                usageByUser: new Map(),
                usageByGroup: new Map()
            };
        }
        this.dailyStats = {
            messages: 0,
            broadcasts: 0,
            marketing: 0,
            lastReset: Date.now()
        };
    }
}

const pluginManager = new PluginManager();
export default pluginManager;
