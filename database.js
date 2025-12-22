import { promises as fs } from 'fs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import config from './config.js';
import { log } from './utils/logger.js';

const DB_CONFIG = {
    type: config.database?.type || 'json',
    uri: config.database?.uri || process.env.DATABASE_URL || '',
    name: config.database?.name || 'whatsapp_bot',
    dataDir: config.database?.dataDir || './data',

    cache: {
        enabled: true,
        ttl: 300000,
        maxSize: 10000,
        checkPeriod: 60000,
    },

    autoSave: true,
    autoSaveInterval: 30000,

    backup: {
        enabled: true,
        interval: 3600000,
        maxBackups: 24,
        dir: './data/backups',
    },
};

class Cache {
    constructor(options = {}) {
        this.store = new Map();
        this.ttl = options.ttl || 300000;
        this.maxSize = options.maxSize || 10000;
        this.hits = 0;
        this.misses = 0;

        if (options.checkPeriod) {
            this.cleanupInterval = setInterval(() => this.cleanup(), options.checkPeriod);
        }
    }

    generateKey(collection, id) {
        return `${collection}:${id}`;
    }

    get(collection, id) {
        const key = this.generateKey(collection, id);
        const item = this.store.get(key);

        if (!item) {
            this.misses++;
            return null;
        }

        if (Date.now() > item.expires) {
            this.store.delete(key);
            this.misses++;
            return null;
        }

        this.hits++;
        return item.value;
    }

    set(collection, id, value, ttl = this.ttl) {

        if (this.store.size >= this.maxSize) {
            this.evict();
        }

        const key = this.generateKey(collection, id);
        this.store.set(key, {
            value,
            expires: Date.now() + ttl,
            created: Date.now(),
        });
    }

    delete(collection, id) {
        const key = this.generateKey(collection, id);
        return this.store.delete(key);
    }

    invalidate(collection) {
        const prefix = `${collection}:`;
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) {
                this.store.delete(key);
            }
        }
    }

    clear() {
        this.store.clear();
    }

    evict() {

        const entries = Array.from(this.store.entries())
            .sort((a, b) => a[1].created - b[1].created);

        const toRemove = Math.ceil(entries.length * 0.1);
        for (let i = 0; i < toRemove; i++) {
            this.store.delete(entries[i][0]);
        }
    }

    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.store) {
            if (now > item.expires) {
                this.store.delete(key);
            }
        }
    }

    getStats() {
        return {
            size: this.store.size,
            hits: this.hits,
            misses: this.misses,
            hitRate: this.hits + this.misses > 0
                ? (this.hits / (this.hits + this.misses) * 100).toFixed(2) + '%'
                : '0%',
        };
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.store.clear();
    }
}

class DatabaseAdapter extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;
        this.isConnected = false;
        this.name = 'base';
    }

    async connect() { throw new Error('Not implemented'); }
    async disconnect() { throw new Error('Not implemented'); }
    async get(collection, id) { throw new Error('Not implemented'); }
    async set(collection, id, data) { throw new Error('Not implemented'); }
    async delete(collection, id) { throw new Error('Not implemented'); }
    async find(collection, query) { throw new Error('Not implemented'); }
    async findOne(collection, query) { throw new Error('Not implemented'); }
    async update(collection, id, data) { throw new Error('Not implemented'); }
    async upsert(collection, id, data) { throw new Error('Not implemented'); }
    async count(collection, query) { throw new Error('Not implemented'); }
    async exists(collection, id) { throw new Error('Not implemented'); }
    async clear(collection) { throw new Error('Not implemented'); }
    async list(collection) { throw new Error('Not implemented'); }
    async backup() { throw new Error('Not implemented'); }
}

class JsonAdapter extends DatabaseAdapter {
    constructor(options = {}) {
        super(options);
        this.name = 'json';
        this.dataDir = options.dataDir || DB_CONFIG.dataDir;
        this.data = new Map();
        this.dirty = new Set();
        this.autoSaveTimer = null;
    }

    getFilePath(collection) {
        return join(this.dataDir, `${collection}.json`);
    }

    async connect() {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }

        try {
            const files = await fs.readdir(this.dataDir);
            for (const file of files) {
                if (file.endsWith('.json') && !file.includes('backup')) {
                    const collection = file.replace('.json', '');
                    await this.loadCollection(collection);
                }
            }
        } catch (err) {

        }

        if (DB_CONFIG.autoSave) {
            this.autoSaveTimer = setInterval(() => this.saveAll(), DB_CONFIG.autoSaveInterval);
        }

        this.isConnected = true;
        this.emit('connected');
        log.debug('JSON database connected');
    }

    async disconnect() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
        await this.saveAll();
        this.data.clear();
        this.isConnected = false;
        this.emit('disconnected');
    }

    async loadCollection(collection) {
        const filePath = this.getFilePath(collection);

        try {
            if (existsSync(filePath)) {
                const content = await fs.readFile(filePath, 'utf8');
                const parsed = JSON.parse(content);
                this.data.set(collection, new Map(Object.entries(parsed)));
            } else {
                this.data.set(collection, new Map());
            }
        } catch (err) {
            log.warn(`Failed to load collection ${collection}:`, err.message);
            this.data.set(collection, new Map());
        }
    }

    async saveCollection(collection) {
        const filePath = this.getFilePath(collection);
        const collectionData = this.data.get(collection);

        if (!collectionData) return;

        try {
            const obj = Object.fromEntries(collectionData);
            await fs.writeFile(filePath, JSON.stringify(obj, null, 2));
            this.dirty.delete(collection);
        } catch (err) {
            log.error(`Failed to save collection ${collection}:`, err.message);
        }
    }

    async saveAll() {
        for (const collection of this.dirty) {
            await this.saveCollection(collection);
        }
    }

    ensureCollection(collection) {
        if (!this.data.has(collection)) {
            this.data.set(collection, new Map());
        }
        return this.data.get(collection);
    }

    markDirty(collection) {
        this.dirty.add(collection);
    }

    async get(collection, id) {
        const col = this.ensureCollection(collection);
        return col.get(String(id)) || null;
    }

    async set(collection, id, data) {
        const col = this.ensureCollection(collection);
        const doc = {
            ...data,
            _id: String(id),
            _createdAt: data._createdAt || new Date().toISOString(),
            _updatedAt: new Date().toISOString(),
        };
        col.set(String(id), doc);
        this.markDirty(collection);
        return doc;
    }

    async delete(collection, id) {
        const col = this.ensureCollection(collection);
        const existed = col.delete(String(id));
        if (existed) this.markDirty(collection);
        return existed;
    }

    async find(collection, query = {}) {
        const col = this.ensureCollection(collection);
        const results = [];

        for (const doc of col.values()) {
            if (this.matchQuery(doc, query)) {
                results.push(doc);
            }
        }

        return results;
    }

    async findOne(collection, query = {}) {
        const col = this.ensureCollection(collection);

        for (const doc of col.values()) {
            if (this.matchQuery(doc, query)) {
                return doc;
            }
        }

        return null;
    }

    async update(collection, id, data) {
        const existing = await this.get(collection, id);
        if (!existing) return null;

        return this.set(collection, id, { ...existing, ...data });
    }

    async upsert(collection, id, data) {
        const existing = await this.get(collection, id);
        return this.set(collection, id, { ...existing, ...data });
    }

    async count(collection, query = {}) {
        const results = await this.find(collection, query);
        return results.length;
    }

    async exists(collection, id) {
        const col = this.ensureCollection(collection);
        return col.has(String(id));
    }

    async clear(collection) {
        this.data.set(collection, new Map());
        this.markDirty(collection);
    }

    async list(collection) {
        const col = this.ensureCollection(collection);
        return Array.from(col.keys());
    }

    async listCollections() {
        return Array.from(this.data.keys());
    }

    matchQuery(doc, query) {
        for (const [key, value] of Object.entries(query)) {

            if (typeof value === 'object' && value !== null) {
                if (!this.matchOperators(doc[key], value)) {
                    return false;
                }
            } else if (doc[key] !== value) {
                return false;
            }
        }
        return true;
    }

    matchOperators(docValue, operators) {
        for (const [op, value] of Object.entries(operators)) {
            switch (op) {
                case '$eq': if (docValue !== value) return false; break;
                case '$ne': if (docValue === value) return false; break;
                case '$gt': if (!(docValue > value)) return false; break;
                case '$gte': if (!(docValue >= value)) return false; break;
                case '$lt': if (!(docValue < value)) return false; break;
                case '$lte': if (!(docValue <= value)) return false; break;
                case '$in': if (!value.includes(docValue)) return false; break;
                case '$nin': if (value.includes(docValue)) return false; break;
                case '$exists': if ((docValue !== undefined) !== value) return false; break;
                case '$regex': if (!new RegExp(value).test(docValue)) return false; break;
                case '$contains': if (!docValue?.includes?.(value)) return false; break;
            }
        }
        return true;
    }

    async backup() {
        const backupDir = DB_CONFIG.backup.dir;
        if (!existsSync(backupDir)) {
            mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = join(backupDir, `backup-${timestamp}`);
        mkdirSync(backupPath, { recursive: true });

        await this.saveAll();

        for (const collection of this.data.keys()) {
            const src = this.getFilePath(collection);
            const dest = join(backupPath, `${collection}.json`);
            if (existsSync(src)) {
                await fs.copyFile(src, dest);
            }
        }

        await this.cleanOldBackups(backupDir);

        return backupPath;
    }

    async cleanOldBackups(backupDir) {
        try {
            const entries = await fs.readdir(backupDir, { withFileTypes: true });
            const backups = entries
                .filter(e => e.isDirectory() && e.name.startsWith('backup-'))
                .map(e => ({
                    name: e.name,
                    path: join(backupDir, e.name),
                }))
                .sort((a, b) => b.name.localeCompare(a.name));

            for (let i = DB_CONFIG.backup.maxBackups; i < backups.length; i++) {
                await fs.rm(backups[i].path, { recursive: true });
            }
        } catch (err) {
            log.warn('Failed to clean old backups:', err.message);
        }
    }
}

class MongoAdapter extends DatabaseAdapter {
    constructor(options = {}) {
        super(options);
        this.name = 'mongodb';
        this.uri = options.uri || DB_CONFIG.uri;
        this.dbName = options.dbName || DB_CONFIG.name;
        this.client = null;
        this.db = null;
    }

    async connect() {
        try {

            const { MongoClient } = await import('mongodb');

            this.client = new MongoClient(this.uri, {
                maxPoolSize: 10,
                minPoolSize: 2,
                maxIdleTimeMS: 30000,
            });

            await this.client.connect();
            this.db = this.client.db(this.dbName);
            this.isConnected = true;
            this.emit('connected');
            log.debug('MongoDB connected');
        } catch (err) {
            log.error('MongoDB connection failed:', err.message);
            throw err;
        }
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.isConnected = false;
            this.emit('disconnected');
        }
    }

    getCollection(name) {
        return this.db.collection(name);
    }

    async get(collection, id) {
        const col = this.getCollection(collection);
        return col.findOne({ _id: id });
    }

    async set(collection, id, data) {
        const col = this.getCollection(collection);
        const doc = {
            ...data,
            _id: id,
            _updatedAt: new Date(),
        };

        await col.replaceOne(
            { _id: id },
            { ...doc, _createdAt: data._createdAt || new Date() },
            { upsert: true }
        );

        return doc;
    }

    async delete(collection, id) {
        const col = this.getCollection(collection);
        const result = await col.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async find(collection, query = {}) {
        const col = this.getCollection(collection);
        return col.find(query).toArray();
    }

    async findOne(collection, query = {}) {
        const col = this.getCollection(collection);
        return col.findOne(query);
    }

    async update(collection, id, data) {
        const col = this.getCollection(collection);
        const result = await col.updateOne(
            { _id: id },
            { $set: { ...data, _updatedAt: new Date() } }
        );
        return result.modifiedCount > 0 ? this.get(collection, id) : null;
    }

    async upsert(collection, id, data) {
        const col = this.getCollection(collection);
        await col.updateOne(
            { _id: id },
            {
                $set: { ...data, _updatedAt: new Date() },
                $setOnInsert: { _createdAt: new Date() }
            },
            { upsert: true }
        );
        return this.get(collection, id);
    }

    async count(collection, query = {}) {
        const col = this.getCollection(collection);
        return col.countDocuments(query);
    }

    async exists(collection, id) {
        const col = this.getCollection(collection);
        const count = await col.countDocuments({ _id: id }, { limit: 1 });
        return count > 0;
    }

    async clear(collection) {
        const col = this.getCollection(collection);
        await col.deleteMany({});
    }

    async list(collection) {
        const col = this.getCollection(collection);
        const docs = await col.find({}, { projection: { _id: 1 } }).toArray();
        return docs.map(d => d._id);
    }

    async listCollections() {
        const collections = await this.db.listCollections().toArray();
        return collections.map(c => c.name);
    }

    async createIndex(collection, fields, options = {}) {
        const col = this.getCollection(collection);
        return col.createIndex(fields, options);
    }

    async aggregate(collection, pipeline) {
        const col = this.getCollection(collection);
        return col.aggregate(pipeline).toArray();
    }

    async backup() {

        log.warn('MongoDB backup should be done via mongodump');
        return null;
    }
}

class PostgresAdapter extends DatabaseAdapter {
    constructor(options = {}) {
        super(options);
        this.name = 'postgresql';
        this.uri = options.uri || DB_CONFIG.uri;
        this.pool = null;
    }

    async connect() {
        try {
            const pg = await import('pg');
            this.pool = new pg.default.Pool({ connectionString: this.uri });

            const client = await this.pool.connect();
            client.release();

            this.isConnected = true;
            this.emit('connected');
            log.debug('PostgreSQL connected');
        } catch (err) {
            log.error('PostgreSQL connection failed:', err.message);
            throw err;
        }
    }

    async disconnect() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            this.emit('disconnected');
        }
    }

    async ensureTable(collection) {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS "${collection}" (
                id VARCHAR(255) PRIMARY KEY,
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async get(collection, id) {
        await this.ensureTable(collection);
        const result = await this.pool.query(
            `SELECT data FROM "${collection}" WHERE id = $1`,
            [id]
        );
        return result.rows[0]?.data || null;
    }

    async set(collection, id, data) {
        await this.ensureTable(collection);
        const doc = { ...data, _id: id };

        await this.pool.query(`
            INSERT INTO "${collection}" (id, data, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                data = $2,
                updated_at = CURRENT_TIMESTAMP
        `, [id, JSON.stringify(doc)]);

        return doc;
    }

    async delete(collection, id) {
        await this.ensureTable(collection);
        const result = await this.pool.query(
            `DELETE FROM "${collection}" WHERE id = $1`,
            [id]
        );
        return result.rowCount > 0;
    }

    async find(collection, query = {}) {
        await this.ensureTable(collection);

        let sql = `SELECT data FROM "${collection}"`;
        const conditions = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(query)) {
            if (key === '_id') {
                conditions.push(`id = $${paramIndex}`);
            } else {
                conditions.push(`data->>'${key}' = $${paramIndex}`);
            }
            values.push(value);
            paramIndex++;
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        const result = await this.pool.query(sql, values);
        return result.rows.map(r => r.data);
    }

    async findOne(collection, query = {}) {
        const results = await this.find(collection, query);
        return results[0] || null;
    }

    async update(collection, id, data) {
        const existing = await this.get(collection, id);
        if (!existing) return null;
        return this.set(collection, id, { ...existing, ...data });
    }

    async upsert(collection, id, data) {
        const existing = await this.get(collection, id);
        return this.set(collection, id, { ...existing, ...data });
    }

    async count(collection, query = {}) {
        await this.ensureTable(collection);

        let sql = `SELECT COUNT(*) FROM "${collection}"`;
        const conditions = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(query)) {
            conditions.push(`data->>'${key}' = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        const result = await this.pool.query(sql, values);
        return parseInt(result.rows[0].count);
    }

    async exists(collection, id) {
        await this.ensureTable(collection);
        const result = await this.pool.query(
            `SELECT 1 FROM "${collection}" WHERE id = $1 LIMIT 1`,
            [id]
        );
        return result.rows.length > 0;
    }

    async clear(collection) {
        await this.ensureTable(collection);
        await this.pool.query(`DELETE FROM "${collection}"`);
    }

    async list(collection) {
        await this.ensureTable(collection);
        const result = await this.pool.query(`SELECT id FROM "${collection}"`);
        return result.rows.map(r => r.id);
    }

    async query(sql, params = []) {
        return this.pool.query(sql, params);
    }

    async backup() {
        log.warn('PostgreSQL backup should be done via pg_dump');
        return null;
    }
}

class SqliteAdapter extends DatabaseAdapter {
    constructor(options = {}) {
        super(options);
        this.name = 'sqlite';
        this.dbPath = options.path || join(DB_CONFIG.dataDir, 'database.sqlite');
        this.db = null;
    }

    async connect() {
        try {
            const sqlite = await import('better-sqlite3');

            const dir = dirname(this.dbPath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            this.db = new sqlite.default(this.dbPath);
            this.db.pragma('journal_mode = WAL');

            this.isConnected = true;
            this.emit('connected');
            log.debug('SQLite connected');
        } catch (err) {
            log.error('SQLite connection failed:', err.message);
            throw err;
        }
    }

    async disconnect() {
        if (this.db) {
            this.db.close();
            this.isConnected = false;
            this.emit('disconnected');
        }
    }

    ensureTable(collection) {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS "${collection}" (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async get(collection, id) {
        this.ensureTable(collection);
        const row = this.db.prepare(`SELECT data FROM "${collection}" WHERE id = ?`).get(id);
        return row ? JSON.parse(row.data) : null;
    }

    async set(collection, id, data) {
        this.ensureTable(collection);
        const doc = { ...data, _id: id };

        this.db.prepare(`
            INSERT OR REPLACE INTO "${collection}" (id, data, updated_at)
            VALUES (?, ?, datetime('now'))
        `).run(id, JSON.stringify(doc));

        return doc;
    }

    async delete(collection, id) {
        this.ensureTable(collection);
        const result = this.db.prepare(`DELETE FROM "${collection}" WHERE id = ?`).run(id);
        return result.changes > 0;
    }

    async find(collection, query = {}) {
        this.ensureTable(collection);
        const rows = this.db.prepare(`SELECT data FROM "${collection}"`).all();

        return rows
            .map(r => JSON.parse(r.data))
            .filter(doc => this.matchQuery(doc, query));
    }

    async findOne(collection, query = {}) {
        const results = await this.find(collection, query);
        return results[0] || null;
    }

    async update(collection, id, data) {
        const existing = await this.get(collection, id);
        if (!existing) return null;
        return this.set(collection, id, { ...existing, ...data });
    }

    async upsert(collection, id, data) {
        const existing = await this.get(collection, id);
        return this.set(collection, id, { ...existing, ...data });
    }

    async count(collection, query = {}) {
        const results = await this.find(collection, query);
        return results.length;
    }

    async exists(collection, id) {
        this.ensureTable(collection);
        const row = this.db.prepare(`SELECT 1 FROM "${collection}" WHERE id = ? LIMIT 1`).get(id);
        return !!row;
    }

    async clear(collection) {
        this.ensureTable(collection);
        this.db.prepare(`DELETE FROM "${collection}"`).run();
    }

    async list(collection) {
        this.ensureTable(collection);
        const rows = this.db.prepare(`SELECT id FROM "${collection}"`).all();
        return rows.map(r => r.id);
    }

    matchQuery(doc, query) {
        for (const [key, value] of Object.entries(query)) {
            if (doc[key] !== value) return false;
        }
        return true;
    }

    async backup() {
        const backupDir = DB_CONFIG.backup.dir;
        if (!existsSync(backupDir)) {
            mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = join(backupDir, `database-${timestamp}.sqlite`);

        await this.db.backup(backupPath);
        return backupPath;
    }
}

class Database extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = { ...DB_CONFIG, ...options };
        this.adapter = null;
        this.cache = null;
        this.backupTimer = null;
        this.models = new Map();
    }

    async connect() {

        if (this.options.cache.enabled) {
            this.cache = new Cache(this.options.cache);
        }

        const type = this.options.type.toLowerCase();

        switch (type) {
            case 'json':
                this.adapter = new JsonAdapter(this.options);
                break;
            case 'mongodb':
            case 'mongo':
                this.adapter = new MongoAdapter(this.options);
                break;
            case 'postgresql':
            case 'postgres':
            case 'pg':
                this.adapter = new PostgresAdapter(this.options);
                break;
            case 'sqlite':
            case 'sqlite3':
                this.adapter = new SqliteAdapter(this.options);
                break;
            default:
                throw new Error(`Unsupported database type: ${type}`);
        }

        await this.adapter.connect();

        this.adapter.on('connected', () => this.emit('connected'));
        this.adapter.on('disconnected', () => this.emit('disconnected'));

        if (this.options.backup.enabled) {
            this.backupTimer = setInterval(
                () => this.backup(),
                this.options.backup.interval
            );
        }

        log.info(`Database connected (${type})`);
        return this;
    }

    async disconnect() {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }

        if (this.cache) {
            this.cache.destroy();
        }

        if (this.adapter) {
            await this.adapter.disconnect();
        }

        log.info('Database disconnected');
    }

    async get(collection, id) {

        if (this.cache) {
            const cached = this.cache.get(collection, id);
            if (cached) return cached;
        }

        const result = await this.adapter.get(collection, id);

        if (result && this.cache) {
            this.cache.set(collection, id, result);
        }

        return result;
    }

    async set(collection, id, data) {
        const result = await this.adapter.set(collection, id, data);

        if (this.cache) {
            this.cache.set(collection, id, result);
        }

        this.emit('set', { collection, id, data: result });
        return result;
    }

    async delete(collection, id) {
        const result = await this.adapter.delete(collection, id);

        if (this.cache) {
            this.cache.delete(collection, id);
        }

        this.emit('delete', { collection, id });
        return result;
    }

    async find(collection, query = {}) {
        return this.adapter.find(collection, query);
    }

    async findOne(collection, query = {}) {
        return this.adapter.findOne(collection, query);
    }

    async update(collection, id, data) {
        const result = await this.adapter.update(collection, id, data);

        if (result && this.cache) {
            this.cache.set(collection, id, result);
        }

        this.emit('update', { collection, id, data: result });
        return result;
    }

    async upsert(collection, id, data) {
        const result = await this.adapter.upsert(collection, id, data);

        if (this.cache) {
            this.cache.set(collection, id, result);
        }

        this.emit('upsert', { collection, id, data: result });
        return result;
    }

    async count(collection, query = {}) {
        return this.adapter.count(collection, query);
    }

    async exists(collection, id) {
        if (this.cache) {
            const cached = this.cache.get(collection, id);
            if (cached) return true;
        }
        return this.adapter.exists(collection, id);
    }

    async clear(collection) {
        await this.adapter.clear(collection);

        if (this.cache) {
            this.cache.invalidate(collection);
        }

        this.emit('clear', { collection });
    }

    async list(collection) {
        return this.adapter.list(collection);
    }

    async backup() {
        try {
            const path = await this.adapter.backup();
            if (path) {
                log.debug(`Database backup created: ${path}`);
            }
            return path;
        } catch (err) {
            log.error('Database backup failed:', err.message);
            return null;
        }
    }

    async increment(collection, id, field, amount = 1) {
        const doc = await this.get(collection, id) || {};
        doc[field] = (doc[field] || 0) + amount;
        return this.set(collection, id, doc);
    }

    async decrement(collection, id, field, amount = 1) {
        return this.increment(collection, id, field, -amount);
    }

    async push(collection, id, field, value) {
        const doc = await this.get(collection, id) || {};
        if (!Array.isArray(doc[field])) {
            doc[field] = [];
        }
        doc[field].push(value);
        return this.set(collection, id, doc);
    }

    async pull(collection, id, field, value) {
        const doc = await this.get(collection, id);
        if (!doc || !Array.isArray(doc[field])) return doc;

        doc[field] = doc[field].filter(v => v !== value);
        return this.set(collection, id, doc);
    }

    getCacheStats() {
        return this.cache?.getStats() || null;
    }

    clearCache(collection = null) {
        if (!this.cache) return;

        if (collection) {
            this.cache.invalidate(collection);
        } else {
            this.cache.clear();
        }
    }

    model(name, schema = {}) {
        if (this.models.has(name)) {
            return this.models.get(name);
        }

        const model = new Model(this, name, schema);
        this.models.set(name, model);
        return model;
    }
}

class Model {
    constructor(db, name, schema = {}) {
        this.db = db;
        this.name = name;
        this.schema = schema;
        this.hooks = {
            beforeSave: [],
            afterSave: [],
            beforeDelete: [],
            afterDelete: [],
        };
    }

    pre(event, fn) {
        const hookName = `before${event.charAt(0).toUpperCase() + event.slice(1)}`;
        if (this.hooks[hookName]) {
            this.hooks[hookName].push(fn);
        }
        return this;
    }

    post(event, fn) {
        const hookName = `after${event.charAt(0).toUpperCase() + event.slice(1)}`;
        if (this.hooks[hookName]) {
            this.hooks[hookName].push(fn);
        }
        return this;
    }

    async runHooks(hookName, doc) {
        for (const hook of this.hooks[hookName] || []) {
            await hook(doc);
        }
    }

    validate(data) {
        const errors = [];

        for (const [field, rules] of Object.entries(this.schema)) {
            const value = data[field];

            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`${field} is required`);
                continue;
            }

            if (value === undefined || value === null) continue;

            if (rules.type) {
                const type = rules.type.name?.toLowerCase() || rules.type;
                const actualType = Array.isArray(value) ? 'array' : typeof value;

                if (type === 'array' && !Array.isArray(value)) {
                    errors.push(`${field} must be an array`);
                } else if (type !== 'array' && actualType !== type) {
                    errors.push(`${field} must be of type ${type}`);
                }
            }

            if (rules.min !== undefined) {
                if (typeof value === 'number' && value < rules.min) {
                    errors.push(`${field} must be at least ${rules.min}`);
                }
                if (typeof value === 'string' && value.length < rules.min) {
                    errors.push(`${field} must be at least ${rules.min} characters`);
                }
            }

            if (rules.max !== undefined) {
                if (typeof value === 'number' && value > rules.max) {
                    errors.push(`${field} must be at most ${rules.max}`);
                }
                if (typeof value === 'string' && value.length > rules.max) {
                    errors.push(`${field} must be at most ${rules.max} characters`);
                }
            }

            if (rules.enum && !rules.enum.includes(value)) {
                errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
            }

            if (rules.validate && typeof rules.validate === 'function') {
                const result = rules.validate(value);
                if (result !== true) {
                    errors.push(result || `${field} validation failed`);
                }
            }
        }

        return errors;
    }

    applyDefaults(data) {
        const result = { ...data };

        for (const [field, rules] of Object.entries(this.schema)) {
            if (result[field] === undefined && rules.default !== undefined) {
                result[field] = typeof rules.default === 'function'
                    ? rules.default()
                    : rules.default;
            }
        }

        return result;
    }

    async findById(id) {
        return this.db.get(this.name, id);
    }

    async find(query = {}) {
        return this.db.find(this.name, query);
    }

    async findOne(query = {}) {
        return this.db.findOne(this.name, query);
    }

    async create(data) {

        let doc = this.applyDefaults(data);

        const errors = this.validate(doc);
        if (errors.length > 0) {
            throw new Error(`Validation failed: ${errors.join(', ')}`);
        }

        const id = doc._id || doc.id || this.generateId();

        await this.runHooks('beforeSave', doc);

        const result = await this.db.set(this.name, id, doc);

        await this.runHooks('afterSave', result);

        return result;
    }

    async updateById(id, data) {

        await this.runHooks('beforeSave', data);

        const result = await this.db.update(this.name, id, data);

        if (result) {
            await this.runHooks('afterSave', result);
        }

        return result;
    }

    async deleteById(id) {
        const doc = await this.findById(id);
        if (!doc) return false;

        await this.runHooks('beforeDelete', doc);

        const result = await this.db.delete(this.name, id);

        if (result) {
            await this.runHooks('afterDelete', doc);
        }

        return result;
    }

    async count(query = {}) {
        return this.db.count(this.name, query);
    }

    async exists(id) {
        return this.db.exists(this.name, id);
    }

    generateId() {
        return createHash('sha256')
            .update(`${Date.now()}-${Math.random()}`)
            .digest('hex')
            .substring(0, 24);
    }
}

function registerDefaultModels(db) {

    db.model('users', {
        jid: { type: String, required: true },
        name: { type: String, default: '' },
        phone: { type: String },
        isOwner: { type: Boolean, default: false },
        isAdmin: { type: Boolean, default: false },
        isPremium: { type: Boolean, default: false },
        isBanned: { type: Boolean, default: false },
        banReason: { type: String },
        language: { type: String, default: 'en' },
        xp: { type: Number, default: 0 },
        level: { type: Number, default: 1 },
        coins: { type: Number, default: 0 },
        warnings: { type: Number, default: 0 },
        lastSeen: { type: String },
        createdAt: { type: String, default: () => new Date().toISOString() },
    });

    db.model('groups', {
        jid: { type: String, required: true },
        name: { type: String },
        description: { type: String },
        isWelcome: { type: Boolean, default: false },
        welcomeMessage: { type: String },
        isGoodbye: { type: Boolean, default: false },
        goodbyeMessage: { type: String },
        isAntiLink: { type: Boolean, default: false },
        isAntiBadWords: { type: Boolean, default: false },
        isNsfw: { type: Boolean, default: false },
        isMuted: { type: Boolean, default: false },
        settings: { type: Object, default: {} },
        createdAt: { type: String, default: () => new Date().toISOString() },
    });

    db.model('stats', {
        command: { type: String, required: true },
        uses: { type: Number, default: 0 },
        lastUsed: { type: String },
        errors: { type: Number, default: 0 },
    });

    db.model('chats', {
        jid: { type: String, required: true },
        messages: { type: Array, default: [] },
        lastMessage: { type: String },
    });

    return db;
}

const db = new Database();

if (config.database?.autoConnect !== false) {
    db.connect()
        .then(() => registerDefaultModels(db))
        .catch(err => log.error('Database auto-connect failed:', err.message));
}

export {
    Database,
    Model,
    Cache,
    JsonAdapter,
    MongoAdapter,
    PostgresAdapter,
    SqliteAdapter,
    registerDefaultModels,
};

export default db;
