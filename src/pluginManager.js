import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = join(__dirname, '..', 'plugins');

class PluginManager {
    constructor() {
        this.plugins = new Map();
        this.commands = new Map();
        this.categories = new Map();
    }

    get count() { return this.plugins.size; }

    async loadAll() {
        if (!existsSync(PLUGINS_DIR)) {
            log.warn('Plugins directory not found');
            return;
        }

        const files = readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));

        for (const file of files) {
            await this.loadPlugin(join(PLUGINS_DIR, file));
        }
    }

    async loadPlugin(filePath) {
        try {
            const module = await import(`file://${filePath}`);
            const plugin = module.default || module;
            const commands = Array.isArray(plugin) ? plugin : [plugin];

            for (const cmd of commands) {
                const pluginData = {
                    name: cmd.name || cmd.command?.pattern,
                    description: cmd.desc || cmd.description || '',
                    pattern: cmd.command?.pattern ? new RegExp(`^\\.${cmd.command.pattern}`, 'i') : null,
                    alias: cmd.alias || [],
                    category: cmd.category || 'misc',
                    react: cmd.react,
                    handler: cmd.command?.run || cmd.handler || cmd.execute,
                    isOwner: cmd.isOwner || false,
                    isGroup: cmd.isGroup || false,
                    isAdmin: cmd.isAdmin || false,
                    filePath
                };

                if (pluginData.handler) {
                    this.plugins.set(pluginData.name, pluginData);
                    if (!this.categories.has(pluginData.category)) {
                        this.categories.set(pluginData.category, []);
                    }
                    this.categories.get(pluginData.category).push(pluginData);
                    log.debug(`Loaded: ${pluginData.name}`);
                }
            }
        } catch (err) {
            log.error(`Failed to load ${filePath}: ${err.message}`);
        }
    }

    findCommand(text) {
        if (!text) return null;
        for (const [name, plugin] of this.plugins) {
            if (plugin.pattern?.test(text)) return { plugin, match: text.match(plugin.pattern) };
            for (const alias of plugin.alias || []) {
                if (text.toLowerCase().startsWith(`.${alias}`)) return { plugin, match: [text] };
            }
        }
        return null;
    }

    getAll() { return Array.from(this.plugins.values()); }
    getByCategory(cat) { return this.categories.get(cat) || []; }
    getCategories() { return Array.from(this.categories.keys()); }
}

const pluginManager = new PluginManager();
export default pluginManager;
