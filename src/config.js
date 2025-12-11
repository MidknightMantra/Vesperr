import 'dotenv/config';

function parseOwnerNumbers(ownerStr) {
    if (!ownerStr) return [];
    return ownerStr.split(',').map(num => num.trim().replace(/[^0-9]/g, '')).filter(num => num.length >= 10).map(num => `${num}@s.whatsapp.net`);
}

const config = {
    sessionId: process.env.SESSION_ID || '',
    pastebinCode: process.env.SESSION_ID?.includes('~') ? process.env.SESSION_ID.split('~')[1] : process.env.SESSION_ID,
    sessionDir: process.env.SESSION_DIR || './auth_info',
    botName: process.env.BOT_NAME || 'Vesperr',
    prefix: process.env.PREFIX || '.',
    mode: process.env.MODE || 'public',
    ownerNumber: process.env.OWNER_NUMBER || '',
    ownerNumbers: parseOwnerNumbers(process.env.OWNER_NUMBER),
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    mongoUri: process.env.MONGODB_URI || '',
    sentryDsn: process.env.SENTRY_DSN || '',
    logLevel: process.env.LOG_LEVEL || 'info',
    autoJoinGroupUrl: process.env.AUTO_JOIN_GROUP || '',
    autoFollowChannelUrl: process.env.AUTO_FOLLOW_CHANNEL || '',
    antiCall: process.env.ANTI_CALL === 'true',

    isOwner(jid) {
        if (!jid) return false;
        const normalized = jid.replace(/@.*$/, '');
        return this.ownerNumbers.some(owner => owner.replace(/@.*$/, '') === normalized);
    },

    shouldRespond(isGroup, isOwner) {
        switch (this.mode) {
            case 'private': return isOwner;
            case 'groups': return isGroup;
            default: return true;
        }
    }
};

export default config;
