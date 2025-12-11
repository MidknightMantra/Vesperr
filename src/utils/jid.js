export function isValidJid(jid) {
    if (!jid || typeof jid !== 'string') return false;
    return jid.includes('@s.whatsapp.net') || jid.includes('@g.us') || jid.includes('@lid') || jid.includes('@newsletter');
}

export function jidToPhone(jid) {
    if (!isValidJid(jid)) return null;
    return jid.split('@')[0].split(':')[0];
}

export function phoneToJid(phone) {
    if (!phone) return null;
    const cleaned = String(phone).replace(/[^0-9]/g, '');
    return cleaned.length >= 10 ? `${cleaned}@s.whatsapp.net` : null;
}

export function isGroupJid(jid) { return isValidJid(jid) && jid.endsWith('@g.us'); }
export function isUserJid(jid) { return isValidJid(jid) && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')); }
export function isLidJid(jid) { return isValidJid(jid) && jid.endsWith('@lid'); }

export function normalizeJid(jid) {
    if (!isValidJid(jid)) return jid;
    const [id, domain] = jid.split('@');
    return `${id.split(':')[0]}@${domain}`;
}

export function getBotJid(sock) {
    return sock?.user?.id ? normalizeJid(sock.user.id) : null;
}

export function extractMentions(text) {
    if (!text) return [];
    const matches = text.match(/@(\d{10,15})/g);
    return matches ? matches.map(m => phoneToJid(m.slice(1))).filter(Boolean) : [];
}

export default { isValidJid, jidToPhone, phoneToJid, isGroupJid, isUserJid, isLidJid, normalizeJid, getBotJid, extractMentions };
