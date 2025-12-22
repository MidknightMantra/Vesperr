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

export const encode = {
    name: 'encode',
    alias: ['enc', 'encrypt'],
    category: 'tools',
    desc: 'Encode text (hex, binary, rot13)',
    usage: '.encode <type> <text>',
    cooldown: 2000,
    react: '🔐',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const types = ['hex', 'binary', 'rot13'];
        if (!args[0] || !types.includes(args[0].toLowerCase())) {
            return sock.sendMessage(chat, { text: `❌ Usage: .encode <${types.join('|')}> <text>` }, { quoted: msg });
        }
        if (!args[1]) return sock.sendMessage(chat, { text: '❌ Provide text to encode!' }, { quoted: msg });
        const type = args[0].toLowerCase();
        const text = args.slice(1).join(' ');
        let result;
        switch (type) {
            case 'hex': result = Buffer.from(text).toString('hex'); break;
            case 'binary': result = text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' '); break;
            case 'rot13': result = text.replace(/[a-z]/gi, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13))); break;
        }
        await sock.sendMessage(chat, { text: `🔐 *${type.toUpperCase()} Encoded:*\n\n\`\`\`${result}\`\`\`` }, { quoted: msg });
    },
};

export const decode = {
    name: 'decode',
    alias: ['dec', 'decrypt'],
    category: 'tools',
    desc: 'Decode text (hex, binary, rot13)',
    usage: '.decode <type> <text>',
    cooldown: 2000,
    react: '🔓',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const types = ['hex', 'binary', 'rot13'];
        if (!args[0] || !types.includes(args[0].toLowerCase())) {
            return sock.sendMessage(chat, { text: `❌ Usage: .decode <${types.join('|')}> <text>` }, { quoted: msg });
        }
        if (!args[1]) return sock.sendMessage(chat, { text: '❌ Provide text to decode!' }, { quoted: msg });
        const type = args[0].toLowerCase();
        const text = args.slice(1).join(' ');
        let result;
        try {
            switch (type) {
                case 'hex': result = Buffer.from(text, 'hex').toString('utf8'); break;
                case 'binary': result = text.split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join(''); break;
                case 'rot13': result = text.replace(/[a-z]/gi, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13))); break;
            }
            await sock.sendMessage(chat, { text: `🔓 *${type.toUpperCase()} Decoded:*\n\n${result}` }, { quoted: msg });
        } catch { await sock.sendMessage(chat, { text: '❌ Failed to decode. Invalid input!' }, { quoted: msg }); }
    },
};

export const color = {
    name: 'color',
    alias: ['hex', 'rgb'],
    category: 'tools',
    desc: 'Color information',
    usage: '.color <hex>',
    cooldown: 2000,
    react: '🎨',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ Provide a hex color (e.g., #FF5733)' }, { quoted: msg });
        let hex = args[0].replace('#', '');
        if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return sock.sendMessage(chat, { text: '❌ Invalid hex color!' }, { quoted: msg });
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const hsl = rgbToHsl(r, g, b);
        await sock.sendMessage(chat, {
            text: `🎨 *Color Info*\n\n*HEX:* #${hex.toUpperCase()}\n*RGB:* rgb(${r}, ${g}, ${b})\n*HSL:* hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)\n\n_Preview: █████████_`
        }, { quoted: msg });
    },
};

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export const matheval = {
    name: 'solve',
    alias: ['calc', 'calculate', 'math'],
    category: 'tools',
    desc: 'Calculate math expressions',
    usage: '.math <expression>',
    cooldown: 2000,
    react: '🔢',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ Provide a math expression!' }, { quoted: msg });
        const expr = args.join(' ').replace(/[^0-9+\-*/.()%^sqrt ]/gi, '');
        try {
            const sanitized = expr.replace(/\^/g, '**').replace(/sqrt\(([^)]+)\)/gi, 'Math.sqrt($1)');
            const result = Function('"use strict"; return (' + sanitized + ')')();
            if (typeof result !== 'number' || !isFinite(result)) throw new Error('Invalid');
            await sock.sendMessage(chat, { text: `🔢 *Math Result*\n\n*Expression:* ${expr}\n*Result:* ${result}` }, { quoted: msg });
        } catch { await sock.sendMessage(chat, { text: '❌ Invalid expression!' }, { quoted: msg }); }
    },
};

export const lorem = {
    name: 'lorem',
    alias: ['loremipsum', 'placeholder'],
    category: 'tools',
    desc: 'Generate lorem ipsum text',
    usage: '.lorem [words]',
    cooldown: 2000,
    react: '📝',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate', 'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat'];
        const count = Math.min(parseInt(args[0]) || 50, 200);
        const text = Array.from({ length: count }, () => words[Math.floor(Math.random() * words.length)]).join(' ');
        const result = text.charAt(0).toUpperCase() + text.slice(1) + '.';
        await sock.sendMessage(chat, { text: `📝 *Lorem Ipsum (${count} words)*\n\n${result}` }, { quoted: msg });
    },
};

export const uuid = {
    name: 'uuid',
    alias: ['guid', 'uniqueid'],
    category: 'tools',
    desc: 'Generate UUID',
    usage: '.uuid [count]',
    cooldown: 2000,
    react: '🆔',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const count = Math.min(parseInt(args[0]) || 1, 5);
        const uuids = Array.from({ length: count }, () => crypto.randomUUID());
        await sock.sendMessage(chat, { text: `🆔 *Generated UUID${count > 1 ? 's' : ''}*\n\n${uuids.map(u => '`' + u + '`').join('\n')}` }, { quoted: msg });
    },
};

export const getpp = {
    name: 'getpp',
    alias: ['pp', 'profilepic', 'getprofilepic'],
    category: 'tools',
    desc: 'Download profile picture of a user',
    usage: '.getpp [@user or number]',
    cooldown: 5000,
    react: '👤',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        let target = mention || msg.key.participant || msg.key.remoteJid;

        if (!mention && args[0]) {
            let number = args[0].replace(/[^0-9]/g, '');
            if (number.length >= 10) {
                target = number + '@s.whatsapp.net';
            }
        }

        try {
            const ppUrl = await sock.profilePictureUrl(target, 'image').catch(() => null);
            if (!ppUrl) return sock.sendMessage(chat, { text: '❌ No profile picture found for this user!' }, { quoted: msg });

            await sock.sendMessage(chat, {
                image: { url: ppUrl },
                caption: `👤 *Profile Picture of @${target.split('@')[0]}*`,
                mentions: [target]
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(chat, { text: '❌ Failed to fetch profile picture!' }, { quoted: msg });
        }
    },
};

export const fancy = {
    name: 'fancy',
    alias: ['font', 'style'],
    category: 'tools',
    desc: 'Transform text into fancy fonts',
    usage: '.fancy <text>',
    cooldown: 5000,
    react: '✨',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ provide text to transform!' }, { quoted: msg });
        const text = args.join(' ');

        const styles = {
            bold: text.split('').map(c => c.match(/[a-z]/i) ? String.fromCodePoint(c.charCodeAt(0) + (c.match(/[a-z]/) ? 120205 : 120211)) : c).join(''),
            italic: text.split('').map(c => c.match(/[a-z]/i) ? String.fromCodePoint(c.charCodeAt(0) + (c.match(/[a-z]/) ? 120257 : 120263)) : c).join(''),
            mono: '```' + text + '```',
            bubbles: text.split('').map(c => c.match(/[a-z0-9]/i) ? String.fromCodePoint(c.charCodeAt(0) + (c.match(/[a-z]/) ? 9327 : c.match(/[A-Z]/) ? 9333 : 9263)) : c).join('')
        };

        const response = `✨ *Fancy Text Styles*\n\n` +
            `*Bold:* ${styles.bold}\n` +
            `*Italic:* ${styles.italic}\n` +
            `*Mono:* ${styles.mono}\n` +
            `*Bubbles:* ${styles.bubbles}`;

        await sock.sendMessage(chat, { text: response }, { quoted: msg });
    },
};

export const toolsCommands = [shorturl, screenshot, whois, ip, password, hash, base64, timestamp, tempmail, horoscope, encode, decode, color, matheval, lorem, uuid, getpp, fancy];

export default toolsCommands;
