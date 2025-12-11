import config from './config.js';
import { log } from './utils/logger.js';

let mongoose = null;
let isConnected = false;
const memoryStore = { users: new Map(), groups: new Map(), settings: new Map(), messages: new Map() };

const db = {
    async connect() {
        if (!config.mongoUri) {
            log.warn('MongoDB URI not configured, using in-memory storage');
            return false;
        }
        try {
            const mongooseModule = await import('mongoose');
            mongoose = mongooseModule.default;
            mongoose.set('strictQuery', false);
            await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
            isConnected = true;
            log.success('Connected to MongoDB');
            return true;
        } catch (err) {
            log.warn('MongoDB connection failed, using in-memory storage');
            return false;
        }
    },
    async close() { if (mongoose && isConnected) await mongoose.connection.close(); },
    get connected() { return isConnected; },
    async getUser(jid) { return memoryStore.users.get(jid) || null; },
    async setUser(jid, data) { memoryStore.users.set(jid, { ...memoryStore.users.get(jid), ...data }); return true; },
    async getGroup(jid) { return memoryStore.groups.get(jid) || null; },
    async setGroup(jid, data) { memoryStore.groups.set(jid, { ...memoryStore.groups.get(jid), ...data }); return true; },
    async getMessage(jid, msgId) { return memoryStore.messages.get(`${jid}:${msgId}`); },
    async storeMessage(jid, msgId, message) { memoryStore.messages.set(`${jid}:${msgId}`, message); return true; }
};

export default db;
