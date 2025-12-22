import fetch from 'node-fetch';
import crypto from 'crypto';
import { templates } from '../utils/deluxeUI.js';

const CONFIG = { TIMEOUT: 30000 };

export const shorturl = {
    name: 'shorturl',
    alias: ['short', 'tinyurl'],
    category: 'tools',
    desc: 'Shorten a URL',
    usage: '.shorturl <url>',
    cooldown: 3000,
    react: '🔗',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', `${prefix}shorturl <url>\nExample: ${prefix}shorturl google.com`, 'info'),
            }, { quoted: msg });
        }

        let url = args[0];
        if (!url.startsWith('http')) url = 'https://' + url;

        try {
            const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
            const shortened = await res.text();

            await sock.sendMessage(chat, {
                text: templates.card(
                    'URL Shortener',
                    {
                        'Original': url.slice(0, 50) + '...',
                        'Shortened': shortened
                    }
                )
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(chat, { text: '◉ *Failed to shorten URL*' }, { quoted: msg });
        }
    },
};

export const screenshot = {
    name: 'screenshot',
    alias: ['ss', 'webss'],
    category: 'tools',
    desc: 'Website screenshot',
    usage: '.ss <url>',
    cooldown: 15000,
    react: '📸',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', `${prefix}ss <url>\nExample: ${prefix}ss google.com`, 'info'),
            }, { quoted: msg });
        }

        let url = args[0];
        if (!url.startsWith('http')) url = 'https://' + url;

        const statusMsg = await sock.sendMessage(chat, { text: '◈ *Capturing screenshot...*' }, { quoted: msg });

        try {
            const apiUrl = `https://image.thum.io/get/width/1280/crop/720/${encodeURIComponent(url)}`;
            const res = await fetch(apiUrl, { timeout: CONFIG.TIMEOUT });
            const buffer = Buffer.from(await res.arrayBuffer());

            await sock.sendMessage(chat, {
                image: buffer,
                caption: templates.card('Screenshot', { 'URL': url }),
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });
        } catch {
            await sock.sendMessage(chat, { text: '◉ *Failed to capture*', edit: statusMsg.key });
        }
    },
};

export const whois = {
    name: 'whois',
    alias: ['domain'],
    category: 'tools',
    desc: 'Domain WHOIS lookup',
    usage: '.whois <domain>',
    cooldown: 5000,
    react: '🌐',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', `${prefix}whois <domain>\nExample: ${prefix}whois google.com`, 'info'),
            }, { quoted: msg });
        }

        const domain = args[0].replace(/^https?:\/\//, '').replace(/\/.*$/, '');

        try {
            const res = await fetch(`https://api.giftedtech.co.ke/api/tools/whois?apikey=gifted&domain=${domain}`);
            const data = await res.json();
            const info = data.result || data;

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Whois Lookup',
                    {
                        'Domain': info.domainName || domain,
                        'Registrar': info.registrar || 'N/A',
                        'Created': info.creationDate || 'N/A',
                        'Expires': info.expirationDate || 'N/A',
                        'NS': Array.isArray(info.nameServers) ? info.nameServers.slice(0, 2).join(', ') : (info.nameServers || 'N/A')
                    }
                )
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(chat, { text: '◉ *Lookup failed*' }, { quoted: msg });
        }
    },
};

export const ip = {
    name: 'ip',
    alias: ['iplookup', 'geoip'],
    category: 'tools',
    desc: 'IP address lookup',
    usage: '.ip <address>',
    cooldown: 3000,
    react: '📍',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', `${prefix}ip <address>\nExample: ${prefix}ip 8.8.8.8`, 'info'),
            }, { quoted: msg });
        }

        try {
            const res = await fetch(`http://ip-api.com/json/${args[0]}`);
            const d = await res.json();

            if (d.status !== 'success') {
                return sock.sendMessage(chat, { text: '◉ *Invalid IP address*' }, { quoted: msg });
            }

            await sock.sendMessage(chat, {
                text: templates.card(
                    'IP Lookup',
                    {
                        'IP': d.query,
                        'Location': `${d.city}, ${d.regionName}`,
                        'Country': d.country,
                        'ISP': d.isp,
                        'Timezone': d.timezone
                    }
                )
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(chat, { text: '◉ *Lookup failed*' }, { quoted: msg });
        }
    },
};

export const password = {
    name: 'password',
    alias: ['pass', 'genpass'],
    category: 'tools',
    desc: 'Generate secure password',
    usage: '.password [length]',
    cooldown: 2000,
    react: '🔐',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const length = Math.min(128, Math.max(8, parseInt(args[0]) || 16));
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';

        let pass = '';
        const bytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) pass += charset[bytes[i] % charset.length];

        const strength = length >= 20 ? '◉ Very Strong' : length >= 16 ? '◎ Strong' : length >= 12 ? '○ Good' : '◌ Moderate';

        await sock.sendMessage(chat, {
            text: templates.card(
                'Password Generator',
                {
                    'Password': `\`\`\`${pass}\`\`\``,
                    'Length': length,
                    'Strength': strength
                }
            )
        }, { quoted: msg });
    },
};

export const hash = {
    name: 'hash',
    alias: ['md5', 'sha256'],
    category: 'tools',
    desc: 'Generate hash',
    usage: '.hash <type> <text>',
    cooldown: 2000,
    react: '#️⃣',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length < 2) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', `${prefix}hash <type> <text>\nTypes: md5, sha1, sha256, sha512`, 'info'),
            }, { quoted: msg });
        }

        const type = args[0].toLowerCase();
        const text = args.slice(1).join(' ');

        if (!['md5', 'sha1', 'sha256', 'sha512'].includes(type)) {
            return sock.sendMessage(chat, { text: '◉ *Invalid type.* Use: md5, sha1, sha256, sha512' }, { quoted: msg });
        }

        const result = crypto.createHash(type).update(text).digest('hex');

        await sock.sendMessage(chat, {
            text: templates.card(
                'Hash Generator',
                {
                    'Algorithm': type.toUpperCase(),
                    'Input': text.slice(0, 50) + (text.length > 50 ? '...' : ''),
                    'Hash': `\`\`\`${result}\`\`\``
                }
            )
        }, { quoted: msg });
    },
};

export const base64 = {
    name: 'base64',
    alias: ['b64'],
    category: 'tools',
    desc: 'Base64 encode/decode',
    usage: '.base64 <e/d> <text>',
    cooldown: 2000,
    react: '🔣',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length < 2) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', `${prefix}base64 <e/d> <text>`, 'info'),
            }, { quoted: msg });
        }

        const action = args[0].toLowerCase();
        const text = args.slice(1).join(' ');

        let result;
        let mode;
        if (action === 'e') {
            result = Buffer.from(text).toString('base64');
            mode = 'Encoded';
        } else if (action === 'd') {
            result = Buffer.from(text, 'base64').toString('utf-8');
            mode = 'Decoded';
        } else {
            return sock.sendMessage(chat, { text: '◉ *Use e (encode) or d (decode)*' }, { quoted: msg });
        }

        await sock.sendMessage(chat, {
            text: templates.card(
                'Base64',
                {
                    'Mode': mode,
                    'Input': text.slice(0, 50) + (text.length > 50 ? '...' : ''),
                    'Result': `\`\`\`${result.slice(0, 1500)}\`\`\``
                }
            )
        }, { quoted: msg });
    },
};

export const timestamp = {
    name: 'timestamp',
    alias: ['ts', 'epoch'],
    category: 'tools',
    desc: 'Unix timestamp',
    usage: '.timestamp [unix]',
    cooldown: 2000,
    react: '⏰',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            const now = Math.floor(Date.now() / 1000);
            const date = new Date();

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Timestamp',
                    {
                        'Unix': now,
                        'ISO': date.toISOString(),
                        'Local': date.toLocaleString()
                    }
                )
            }, { quoted: msg });
        } else {
            const ts = parseInt(args[0]);
            const ms = ts > 10000000000 ? ts : ts * 1000;
            const date = new Date(ms);

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Timestamp',
                    {
                        'Unix': ts,
                        'ISO': date.toISOString(),
                        'Local': date.toLocaleString(),
                        'Relative': getRelativeTime(date)
                    }
                )
            }, { quoted: msg });
        }
    },
};

function getRelativeTime(date) {
    const diff = Date.now() - date.getTime();
    const abs = Math.abs(diff);
    const past = diff > 0;

    const units = [
        [31536000000, 'year'],
        [2592000000, 'month'],
        [86400000, 'day'],
        [3600000, 'hour'],
        [60000, 'minute'],
    ];

    for (const [ms, unit] of units) {
        if (abs >= ms) {
            const n = Math.floor(abs / ms);
            return `${n} ${unit}${n > 1 ? 's' : ''} ${past ? 'ago' : 'from now'}`;
        }
    }
    return 'just now';
}

export const tempmail = {
    name: 'tempmail',
    alias: ['fakemail', 'mail', 'disposablemail'],
    category: 'tools',
    desc: 'Generate temporary email',
    usage: '.tempmail',
    cooldown: 5000,
    react: '📧',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const statusMsg = await sock.sendMessage(chat, { text: `📧 *Generating temporary email...*` }, { quoted: msg });

        try {

            const domains = ['@tempmail.com', '@fakeinbox.com', '@mailinator.com', '@guerrillamail.com', '@10minutemail.com'];
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
            let username = '';
            for (let i = 0; i < 10; i++) {
                username += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const email = username + domains[Math.floor(Math.random() * domains.length)];

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Temp Mail',
                    {
                        'Email': `\`${email}\``,
                        'Duration': '10 minutes',
                        'Note': 'Disposable email for sign-ups'
                    }
                ),
                edit: statusMsg.key,
            });
        } catch (error) {
            await sock.sendMessage(chat, { text: '❌ *Failed to generate email*', edit: statusMsg.key });
        }
    },
};

const ZODIAC_SIGNS = {
    aries: { emoji: '♈', dates: 'Mar 21 - Apr 19' },
    taurus: { emoji: '♉', dates: 'Apr 20 - May 20' },
    gemini: { emoji: '♊', dates: 'May 21 - Jun 20' },
    cancer: { emoji: '♋', dates: 'Jun 21 - Jul 22' },
    leo: { emoji: '♌', dates: 'Jul 23 - Aug 22' },
    virgo: { emoji: '♍', dates: 'Aug 23 - Sep 22' },
    libra: { emoji: '♎', dates: 'Sep 23 - Oct 22' },
    scorpio: { emoji: '♏', dates: 'Oct 23 - Nov 21' },
    sagittarius: { emoji: '♐', dates: 'Nov 22 - Dec 21' },
    capricorn: { emoji: '♑', dates: 'Dec 22 - Jan 19' },
    aquarius: { emoji: '♒', dates: 'Jan 20 - Feb 18' },
    pisces: { emoji: '♓', dates: 'Feb 19 - Mar 20' },
};

export const horoscope = {
    name: 'horoscope',
    alias: ['zodiac', 'astro', 'sign'],
    category: 'tools',
    desc: 'Get daily horoscope',
    usage: '.horoscope <sign>',
    cooldown: 5000,
    react: '🔮',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            const signsList = Object.entries(ZODIAC_SIGNS).map(([name, data]) =>
                `${data.emoji} ${name.charAt(0).toUpperCase() + name.slice(1)}`
            );

            return sock.sendMessage(chat, {
                text: templates.list('Horoscope Signs', signsList, { footer: `Use ${prefix}horoscope <sign>` })
            }, { quoted: msg });
        }

        const sign = args[0].toLowerCase();
        if (!ZODIAC_SIGNS[sign]) {
            return sock.sendMessage(chat, { text: '❌ Invalid zodiac sign. Try `.horoscope` to see all signs.' }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, { text: `🔮 *Fetching ${sign} horoscope...*` }, { quoted: msg });

        try {
            const res = await fetch(`https://aztro.sameerkumar.website/?sign=${sign}&day=today`, { method: 'POST' });
            const data = await res.json();

            if (data.description) {
                const signInfo = ZODIAC_SIGNS[sign];
                await sock.sendMessage(chat, {
                    text: templates.card(
                        `${signInfo.emoji} ${sign.toUpperCase()} HOROSCOPE`,
                        {
                            'Description': data.description,
                            'Lucky Number': data.lucky_number,
                            'Lucky Time': data.lucky_time,
                            'Mood': data.mood
                        },
                        { footer: signInfo.dates }
                    ),
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, { text: '❌ *Failed to fetch horoscope*', edit: statusMsg.key });
            }
        } catch (error) {
            await sock.sendMessage(chat, { text: '❌ *Failed to fetch horoscope*', edit: statusMsg.key });
        }
    },
};

export const toolsCommands = [shorturl, screenshot, whois, ip, password, hash, base64, timestamp, tempmail, horoscope];

export default toolsCommands;
