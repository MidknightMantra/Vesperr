const JID_SUFFIXES = {
    USER: '@s.whatsapp.net',
    GROUP: '@g.us',
    BROADCAST: '@broadcast',
    NEWSLETTER: '@newsletter',
    STATUS: 'status@broadcast',
};

const COUNTRY_CODES = {

    '1': 'US/CA',
    '7': 'RU',
    '20': 'EG',
    '27': 'ZA',
    '30': 'GR',
    '31': 'NL',
    '32': 'BE',
    '33': 'FR',
    '34': 'ES',
    '36': 'HU',
    '39': 'IT',
    '40': 'RO',
    '41': 'CH',
    '43': 'AT',
    '44': 'UK',
    '45': 'DK',
    '46': 'SE',
    '47': 'NO',
    '48': 'PL',
    '49': 'DE',
    '51': 'PE',
    '52': 'MX',
    '53': 'CU',
    '54': 'AR',
    '55': 'BR',
    '56': 'CL',
    '57': 'CO',
    '58': 'VE',
    '60': 'MY',
    '61': 'AU',
    '62': 'ID',
    '63': 'PH',
    '64': 'NZ',
    '65': 'SG',
    '66': 'TH',
    '81': 'JP',
    '82': 'KR',
    '84': 'VN',
    '86': 'CN',
    '90': 'TR',
    '91': 'IN',
    '92': 'PK',
    '93': 'AF',
    '94': 'LK',
    '95': 'MM',
    '98': 'IR',
    '212': 'MA',
    '213': 'DZ',
    '216': 'TN',
    '218': 'LY',
    '220': 'GM',
    '221': 'SN',
    '234': 'NG',
    '249': 'SD',
    '254': 'KE',
    '255': 'TZ',
    '256': 'UG',
    '260': 'ZM',
    '263': 'ZW',
    '351': 'PT',
    '352': 'LU',
    '353': 'IE',
    '354': 'IS',
    '358': 'FI',
    '370': 'LT',
    '371': 'LV',
    '372': 'EE',
    '380': 'UA',
    '381': 'RS',
    '385': 'HR',
    '420': 'CZ',
    '421': 'SK',
    '852': 'HK',
    '853': 'MO',
    '855': 'KH',
    '856': 'LA',
    '880': 'BD',
    '886': 'TW',
    '960': 'MV',
    '961': 'LB',
    '962': 'JO',
    '963': 'SY',
    '964': 'IQ',
    '965': 'KW',
    '966': 'SA',
    '967': 'YE',
    '968': 'OM',
    '970': 'PS',
    '971': 'AE',
    '972': 'IL',
    '973': 'BH',
    '974': 'QA',
    '975': 'BT',
    '976': 'MN',
    '977': 'NP',
    '992': 'TJ',
    '993': 'TM',
    '994': 'AZ',
    '995': 'GE',
    '996': 'KG',
    '998': 'UZ',
};

export function jidToPhone(jid) {
    if (!jid || typeof jid !== 'string') return '';

    return jid
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');
}

export function phoneToJid(phone, defaultCountryCode = '') {
    if (!phone) return '';

    let cleaned = phone.replace(/\D/g, '');

    cleaned = cleaned.replace(/^0+/, '');

    if (defaultCountryCode && !hasCountryCode(cleaned)) {
        cleaned = defaultCountryCode.replace(/\D/g, '') + cleaned;
    }

    return `${cleaned}${JID_SUFFIXES.USER}`;
}

export function createGroupJid(groupId) {
    if (!groupId) return '';
    const cleaned = groupId.split('@')[0];
    return `${cleaned}${JID_SUFFIXES.GROUP}`;
}

export function createChannelJid(channelId) {
    if (!channelId) return '';
    const cleaned = channelId.split('@')[0];
    return `${cleaned}${JID_SUFFIXES.NEWSLETTER}`;
}

export function isUserJid(jid) {
    return jid?.endsWith(JID_SUFFIXES.USER) || false;
}

export function isGroupJid(jid) {
    return jid?.endsWith(JID_SUFFIXES.GROUP) || false;
}

export function isBroadcastJid(jid) {
    return jid?.endsWith(JID_SUFFIXES.BROADCAST) && jid !== JID_SUFFIXES.STATUS;
}

export function isStatusJid(jid) {
    return jid === JID_SUFFIXES.STATUS;
}

export function isChannelJid(jid) {
    return jid?.endsWith(JID_SUFFIXES.NEWSLETTER) || false;
}

export function hasCountryCode(phone) {
    if (!phone) return false;
    const cleaned = phone.replace(/\D/g, '');

    const sortedCodes = Object.keys(COUNTRY_CODES).sort((a, b) => b.length - a.length);

    for (const code of sortedCodes) {
        if (cleaned.startsWith(code)) {

            const remaining = cleaned.slice(code.length);
            if (remaining.length >= 6 && remaining.length <= 15) {
                return true;
            }
        }
    }

    return false;
}

export function isValidPhone(phone) {
    if (!phone) return false;
    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.length < 7 || cleaned.length > 15) return false;

    return hasCountryCode(cleaned);
}

export function isValidJid(jid) {
    if (!jid || typeof jid !== 'string') return false;

    return isUserJid(jid) ||
        isGroupJid(jid) ||
        isBroadcastJid(jid) ||
        isStatusJid(jid) ||
        isChannelJid(jid);
}

export function normalizeJid(jid) {
    if (!jid) return '';

    const base = jid.split('@')[0].split(':')[0];

    if (jid.endsWith(JID_SUFFIXES.GROUP)) {
        return `${base}${JID_SUFFIXES.GROUP}`;
    }
    if (jid.endsWith(JID_SUFFIXES.NEWSLETTER)) {
        return `${base}${JID_SUFFIXES.NEWSLETTER}`;
    }
    if (jid.endsWith(JID_SUFFIXES.BROADCAST)) {
        return `${base}${JID_SUFFIXES.BROADCAST}`;
    }

    return `${base}${JID_SUFFIXES.USER}`;
}

export function compareJids(jid1, jid2) {
    return normalizeJid(jid1) === normalizeJid(jid2);
}

export function getBaseId(jid) {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0];
}

export function getDeviceId(jid) {
    if (!jid) return null;
    const match = jid.match(/:(\d+)@/);
    return match ? parseInt(match[1]) : null;
}

export function formatPhone(phone, format = 'international') {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');

    switch (format) {
        case 'e164':
            return `+${cleaned}`;

        case 'international':

            if (cleaned.length === 10 && cleaned.startsWith('1')) {

                return `+${cleaned.slice(0, 1)} ${cleaned.slice(1, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
            }
            if (cleaned.length === 12 && cleaned.startsWith('44')) {

                return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`;
            }
            if (cleaned.length === 12 && cleaned.startsWith('91')) {

                return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
            }

            return `+${cleaned}`;

        case 'national':

            return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;

        default:
            return cleaned;
    }
}

export function formatJid(jid) {
    if (!jid) return 'Unknown';

    if (isGroupJid(jid)) {
        return `Group ${getBaseId(jid)}`;
    }

    if (isChannelJid(jid)) {
        return `Channel ${getBaseId(jid)}`;
    }

    if (isStatusJid(jid)) {
        return 'Status';
    }

    if (isBroadcastJid(jid)) {
        return 'Broadcast';
    }

    return formatPhone(jidToPhone(jid), 'international');
}

export function createMention(jid, name = null) {
    const phone = jidToPhone(jid);
    return name ? `@${name}` : `@${phone}`;
}

export function parseGroupJid(jid) {
    if (!isGroupJid(jid)) return null;

    const base = getBaseId(jid);
    const parts = base.split('-');

    if (parts.length === 2) {
        return {
            timestamp: parseInt(parts[0]) * 1000,
            creator: parts[1]
        };
    }

    return null;
}

export function extractPhoneNumbers(text) {
    if (!text) return [];

    const patterns = [
        /\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
        /\d{10,15}/g
    ];

    const matches = new Set();

    for (const pattern of patterns) {
        const found = text.match(pattern) || [];
        for (const match of found) {
            const cleaned = match.replace(/\D/g, '');
            if (cleaned.length >= 10 && cleaned.length <= 15) {
                matches.add(cleaned);
            }
        }
    }

    return Array.from(matches);
}

export function extractJids(text) {
    if (!text) return [];

    const jidPattern = /\d{5,}@[sg]\.whatsapp\.net|@newsletter/g;
    return (text.match(jidPattern) || []).map(normalizeJid);
}

export function getCountryFromPhone(phone) {
    if (!phone) return null;
    const cleaned = phone.replace(/\D/g, '');

    const sortedCodes = Object.keys(COUNTRY_CODES).sort((a, b) => b.length - a.length);

    for (const code of sortedCodes) {
        if (cleaned.startsWith(code)) {
            return {
                code,
                country: COUNTRY_CODES[code]
            };
        }
    }

    return null;
}

export function getCountryCodes() {
    return { ...COUNTRY_CODES };
}

export default {

    jidToPhone,
    phoneToJid,
    createGroupJid,
    createChannelJid,

    isUserJid,
    isGroupJid,
    isBroadcastJid,
    isStatusJid,
    isChannelJid,
    hasCountryCode,
    isValidPhone,
    isValidJid,

    normalizeJid,
    compareJids,
    getBaseId,
    getDeviceId,

    formatPhone,
    formatJid,
    createMention,

    parseGroupJid,
    extractPhoneNumbers,
    extractJids,

    getCountryFromPhone,
    getCountryCodes,

    JID_SUFFIXES,
    COUNTRY_CODES,
};
