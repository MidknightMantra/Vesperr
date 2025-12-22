import fetch from 'node-fetch';
import QRCode from 'qrcode';
import { Jimp } from 'jimp';
import jsQR from 'jsqr';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { templates } from '../utils/deluxeUI.js';

const LANGUAGES = {
    af: 'Afrikaans', sq: 'Albanian', ar: 'Arabic', hy: 'Armenian', az: 'Azerbaijani',
    eu: 'Basque', be: 'Belarusian', bn: 'Bengali', bs: 'Bosnian', bg: 'Bulgarian',
    ca: 'Catalan', zh: 'Chinese', hr: 'Croatian', cs: 'Czech', da: 'Danish',
    nl: 'Dutch', en: 'English', et: 'Estonian', fi: 'Finnish', fr: 'French',
    de: 'German', el: 'Greek', hi: 'Hindi', hu: 'Hungarian', id: 'Indonesian',
    it: 'Italian', ja: 'Japanese', ko: 'Korean', lv: 'Latvian', lt: 'Lithuanian',
    ms: 'Malay', no: 'Norwegian', fa: 'Persian', pl: 'Polish', pt: 'Portuguese',
    ro: 'Romanian', ru: 'Russian', sr: 'Serbian', sk: 'Slovak', sl: 'Slovenian',
    es: 'Spanish', sw: 'Swahili', sv: 'Swedish', ta: 'Tamil', th: 'Thai',
    tr: 'Turkish', uk: 'Ukrainian', ur: 'Urdu', vi: 'Vietnamese',
};

async function translateText(text, targetLang, sourceLang = 'auto') {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();

        const translated = data[0].map(item => item[0]).join('');
        const detectedLang = data[2];

        return {
            text: translated,
            from: detectedLang,
            to: targetLang,
        };
    } catch (error) {
        console.error('Translate error:', error);
        return null;
    }
}

export const translate = {
    name: 'translate',
    alias: ['tr', 'trans', 'tl', 'trt'],
    category: 'utility',
    desc: 'Translate text to any language',
    usage: '.translate <lang> <text> | Reply with .tr <lang>',
    cooldown: 3000,
    react: '🌐',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;

        if (args.length === 0 && !quotedText) {
            const langList = Object.entries(LANGUAGES).slice(0, 10).map(([code, name]) => `${code}: ${name}`);
            return sock.sendMessage(chat, {
                text: templates.card(
                    'Translation',
                    [
                        `*Usage:* ${prefix}tr <lang> <text>`,
                        `*Reply:* ${prefix}tr <lang>`,
                        '',
                        '*Common Languages:*',
                        ...langList,
                        '_...and many more_'
                    ],
                    { footer: 'Powered by Google Translate' }
                )
            }, { quoted: msg });
        }

        const targetLang = args[0]?.toLowerCase();
        let textToTranslate;

        if (quotedText) {
            textToTranslate = quotedText;
        } else {
            textToTranslate = args.slice(1).join(' ');
        }

        if (!targetLang || !textToTranslate) {
            return sock.sendMessage(chat, {
                text: templates.notification('Warning', `Missing arguments. Usage: ${prefix}tr <lang> <text>`, 'warning'),
            }, { quoted: msg });
        }

        try {
            const result = await translateText(textToTranslate, targetLang);

            if (!result) {
                return sock.sendMessage(chat, {
                    text: templates.notification('Error', 'Translation failed. Please check the language code.', 'error'),
                }, { quoted: msg });
            }

            const fromLang = LANGUAGES[result.from] || result.from;
            const toLang = LANGUAGES[result.to] || result.to;

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Translation Result',
                    {
                        'From': fromLang,
                        'To': toLang,
                        'Original': textToTranslate.slice(0, 500),
                        'Translated': result.text
                    }
                ),
            }, { quoted: msg });

        } catch (error) {
            console.error('Translate error:', error);
            await sock.sendMessage(chat, {
                text: templates.notification('Error', 'An error occurred during translation.', 'error'),
            }, { quoted: msg });
        }
    },
};

export const tts = {
    name: 'tts',
    alias: ['say', 'speak', 'speech'],
    category: 'utility',
    desc: 'Convert text to speech',
    usage: '.tts [lang] <text>',
    cooldown: 5000,
    react: '🔊',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;

        if (args.length === 0 && !quotedText) {
            return sock.sendMessage(chat, {
                text: templates.card(
                    'Text to Speech',
                    [
                        `*Usage:* ${prefix}tts <lang> <text>`,
                        `*Reply:* ${prefix}tts <lang>`,
                        '',
                        '*Example:*',
                        `${prefix}tts en Hello world`,
                        '',
                        '*Langs:* en, es, fr, de, ja, ko, hi, sw, etc.'
                    ],
                    { footer: 'Google TTS Engine' }
                )
            }, { quoted: msg });
        }

        let lang = 'en';
        let text;

        if (quotedText) {
            text = quotedText;
            if (args[0] && args[0].length === 2) {
                lang = args[0].toLowerCase();
            }
        } else {
            if (args[0].length === 2 && LANGUAGES[args[0].toLowerCase()]) {
                lang = args[0].toLowerCase();
                text = args.slice(1).join(' ');
            } else {
                text = args.join(' ');
            }
        }

        if (!text) {
            return sock.sendMessage(chat, {
                text: templates.notification('Warning', 'Please provide some text to convert.', 'warning'),
            }, { quoted: msg });
        }

        text = text.slice(0, 500);

        try {
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                },
            });

            if (!response.ok) {
                throw new Error('TTS API failed');
            }

            const audioBuffer = Buffer.from(await response.arrayBuffer());

            await sock.sendMessage(chat, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: true,
            }, { quoted: msg });

        } catch (error) {
            console.error('TTS error:', error);
            await sock.sendMessage(chat, {
                text: templates.notification('Error', 'TTS failed. Try shorter text or different lang.', 'error'),
            }, { quoted: msg });
        }
    },
};

export const qr = {
    name: 'qr',
    alias: ['qrcode', 'makeqr', 'createqr'],
    category: 'utility',
    desc: 'Generate QR code from text/URL',
    usage: '.qr <text or url>',
    cooldown: 3000,
    react: '📱',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', `\.qr <text or url>\nExample: \.qr https://vesperr.ai`, 'info'),
            }, { quoted: msg });
        }

        const text = args.join(' ');

        try {
            const qrBuffer = await QRCode.toBuffer(text, {
                errorCorrectionLevel: 'M',
                type: 'png',
                margin: 2,
                width: 512,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF',
                },
            });

            await sock.sendMessage(chat, {
                image: qrBuffer,
                caption: templates.card('QR Code', { 'Content': text.slice(0, 100) }),
            }, { quoted: msg });

        } catch (error) {
            console.error('QR error:', error);
            await sock.sendMessage(chat, {
                text: templates.notification('Error', 'Failed to generate QR code.', 'error'),
            }, { quoted: msg });
        }
    },
};

export const readqr = {
    name: 'readqr',
    alias: ['scanqr', 'qrread', 'qrscan'],
    category: 'utility',
    desc: 'Read/scan QR code from image',
    usage: '.readqr (reply to image)',
    cooldown: 3000,
    react: '🔍',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imageMsg = quoted?.imageMessage || msg.message?.imageMessage;

        if (!imageMsg) {
            return sock.sendMessage(chat, {
                text: templates.notification('Warning', 'Please reply to an image with a QR code.', 'warning'),
            }, { quoted: msg });
        }

        try {
            const buffer = await downloadMediaMessage(
                { message: { imageMessage: imageMsg } },
                'buffer',
                {}
            );

            const image = await Jimp.read(buffer);
            const { data, width, height } = image.bitmap;

            const code = jsQR(new Uint8ClampedArray(data), width, height);

            if (!code) {
                return sock.sendMessage(chat, {
                    text: templates.notification('Not Found', 'No QR code detected in this image.', 'error'),
                }, { quoted: msg });
            }

            await sock.sendMessage(chat, {
                text: templates.card('QR Scan Result', { 'Data': code.data }),
            }, { quoted: msg });

        } catch (error) {
            console.error('QR Read error:', error);
            await sock.sendMessage(chat, {
                text: templates.notification('Error', 'Failed to read QR code.', 'error'),
            }, { quoted: msg });
        }
    },
};

export const calc = {
    name: 'calc',
    alias: ['calculate', 'math', 'cal'],
    category: 'utility',
    desc: 'Calculate mathematical expressions',
    usage: '.calc <expression>',
    cooldown: 2000,
    react: '🔢',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.card(
                    'Calculator',
                    [
                        `*Usage:* ${prefix}calc <expression>`,
                        '',
                        '*Examples:*',
                        '• 2 + 2',
                        '• 15 * 3.5',
                        '• sqrt(144)',
                        '• 2^10'
                    ],
                    { footer: 'Supports basic math, trig, & constants' }
                )
            }, { quoted: msg });
        }

        let expression = args.join(' ')
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/\^/g, '**')
            .replace(/sqrt\(/gi, 'Math.sqrt(')
            .replace(/sin\(/gi, 'Math.sin(')
            .replace(/cos\(/gi, 'Math.cos(')
            .replace(/tan\(/gi, 'Math.tan(')
            .replace(/log\(/gi, 'Math.log10(')
            .replace(/ln\(/gi, 'Math.log(')
            .replace(/abs\(/gi, 'Math.abs(')
            .replace(/round\(/gi, 'Math.round(')
            .replace(/floor\(/gi, 'Math.floor(')
            .replace(/ceil\(/gi, 'Math.ceil(')
            .replace(/pi/gi, 'Math.PI')
            .replace(/\be\b/gi, 'Math.E');

        if (/[a-zA-Z_$]/.test(expression.replace(/Math\.\w+/g, '').replace(/\d/g, ''))) {
            return sock.sendMessage(chat, {
                text: templates.notification('Security', 'Invalid expression! Only mathematical operations are allowed.', 'error'),
            }, { quoted: msg });
        }

        try {

            const result = Function('"use strict"; return (' + expression + ')')();

            if (typeof result !== 'number' || !isFinite(result)) {
                throw new Error('Invalid result');
            }

            const formatted = Number.isInteger(result) ? result : result.toFixed(10).replace(/\.?0+$/, '');

            await sock.sendMessage(chat, {
                text: templates.card(
                    'Calculation',
                    {
                        'Expression': args.join(' '),
                        'Result': formatted
                    }
                ),
            }, { quoted: msg });

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.notification('Error', 'Invalid expression! Please check your syntax.', 'error'),
            }, { quoted: msg });
        }
    },
};

const reminders = new Map();

function parseTimeString(str) {
    const regex = /(\d+)\s*(s|sec|second|m|min|minute|h|hr|hour|d|day)s?/gi;
    let totalMs = 0;
    let match;

    while ((match = regex.exec(str)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        switch (unit[0]) {
            case 's': totalMs += value * 1000; break;
            case 'm': totalMs += value * 60 * 1000; break;
            case 'h': totalMs += value * 60 * 60 * 1000; break;
            case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
        }
    }

    return totalMs;
}

export const remind = {
    name: 'remind',
    alias: ['reminder', 'remindme', 'alarm'],
    category: 'utility',
    desc: 'Set a reminder',
    usage: '.remind <time> <message>',
    cooldown: 3000,
    react: '⏰',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const user = msg.key.participant || msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.card(
                    'Reminder',
                    [
                        `*Usage:* ${prefix}remind <time> <message>`,
                        '',
                        '*Examples:*',
                        '• 30m Take a break',
                        '• 2h Meeting',
                        '',
                        '*Manage:*',
                        `• ${prefix}remind list`,
                        `• ${prefix}remind clear`
                    ],
                    { footer: 'Units: s, m, h, d' }
                )
            }, { quoted: msg });
        }

        const subcommand = args[0].toLowerCase();

        if (subcommand === 'list') {
            const userReminders = reminders.get(user) || [];

            if (userReminders.length === 0) {
                return sock.sendMessage(chat, {
                    text: templates.notification('Reminder', 'No active reminders found.', 'info'),
                }, { quoted: msg });
            }

            const listItems = userReminders.map((r, i) => {
                const timeLeft = Math.max(0, r.triggerAt - Date.now());
                const minutes = Math.floor(timeLeft / 60000);
                return `${r.message.slice(0, 30)}... (In ${minutes}m)`;
            });

            return sock.sendMessage(chat, {
                text: templates.list('Your Reminders', listItems, { bullet: '⏰' })
            }, { quoted: msg });
        }

        if (subcommand === 'clear') {
            const userReminders = reminders.get(user) || [];
            userReminders.forEach(r => clearTimeout(r.timeout));
            reminders.delete(user);

            return sock.sendMessage(chat, {
                text: templates.notification('Reminder', 'All reminders cleared.', 'success'),
            }, { quoted: msg });
        }

        const timeMs = parseTimeString(args[0] + (args[1]?.match(/^(s|m|h|d)/i) ? args[1] : ''));

        if (timeMs < 1000 || timeMs > 7 * 24 * 60 * 60 * 1000) {
            return sock.sendMessage(chat, {
                text: templates.notification('Error', 'Invalid time! Min: 1s, Max: 7 days.', 'error'),
            }, { quoted: msg });
        }

        const timePartLength = args[0].match(/\d+[smhd]/gi)?.join('').length || args[0].length;
        const message = args.slice(1).join(' ').replace(/^\d+[smhd]\s*/i, '') || 'Reminder!';

        const reminder = {
            message,
            triggerAt: Date.now() + timeMs,
            chat,
            user,
            timeout: setTimeout(async () => {
                try {
                    await sock.sendMessage(chat, {
                        text: templates.notification('REMINDER', message, 'update'),
                        mentions: [user],
                    });

                    const userReminders = reminders.get(user) || [];
                    const index = userReminders.indexOf(reminder);
                    if (index > -1) userReminders.splice(index, 1);
                } catch (e) {
                    console.error('Reminder send error:', e);
                }
            }, timeMs),
        };

        if (!reminders.has(user)) {
            reminders.set(user, []);
        }
        reminders.get(user).push(reminder);

        const minutes = Math.floor(timeMs / 60000);
        const timeDisplay = minutes >= 60
            ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
            : `${minutes}m`;

        await sock.sendMessage(chat, {
            text: templates.notification('Reminder Set', `I'll remind you in ${timeDisplay}.`, 'success'),
        }, { quoted: msg });
    },
};

export const currency = {
    name: 'currency',
    alias: ['convert', 'cur', 'fx', 'exchange'],
    category: 'utility',
    desc: 'Convert currency',
    usage: '.currency <amount> <from> <to>',
    cooldown: 3000,
    react: '💱',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length < 3) {
            return sock.sendMessage(chat, {
                text: templates.card(
                    'Currency',
                    [
                        `*Usage:* ${prefix}currency <amount> <from> <to>`,
                        '',
                        '*Example:*',
                        '• 100 USD EUR',
                        '• 50 GBP KES',
                        '',
                        '*Popular:* USD, EUR, GBP, KES, NGN, INR'
                    ]
                )
            }, { quoted: msg });
        }

        const amount = parseFloat(args[0]);
        const from = args[1].toUpperCase();
        const to = args[2].toUpperCase();

        if (isNaN(amount) || amount <= 0) {
            return sock.sendMessage(chat, { text: templates.notification('Error', 'Invalid amount. Use a positive number.', 'error') }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, { text: `💱 *Converting ${amount} ${from} to ${to}...*` }, { quoted: msg });

        try {
            const apis = [

                async () => {
                    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
                    const data = await res.json();
                    if (data.rates?.[to]) {
                        return { rate: data.rates[to], converted: amount * data.rates[to] };
                    }
                    return null;
                },

                async () => {
                    const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from.toLowerCase()}.json`);
                    const data = await res.json();
                    if (data[from.toLowerCase()]?.[to.toLowerCase()]) {
                        const rate = data[from.toLowerCase()][to.toLowerCase()];
                        return { rate, converted: amount * rate };
                    }
                    return null;
                },

                async () => {
                    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
                    const data = await res.json();
                    if (data.rates?.[to]) {
                        return { rate: data.rates[to], converted: amount * data.rates[to] };
                    }
                    return null;
                },

                async () => {
                    const res = await fetch(`https://api.giftedtech.co.ke/api/tools/currency?from=${from}&to=${to}&amount=${amount}`);
                    const data = await res.json();
                    if (data.status && data.result) {
                        return { rate: data.result.rate, converted: data.result.converted };
                    }
                    return null;
                },

                async () => {
                    const res = await fetch(`https://api.freecurrencyapi.com/v1/latest?base_currency=${from}`);
                    const data = await res.json();
                    if (data.data?.[to]) {
                        return { rate: data.data[to], converted: amount * data.data[to] };
                    }
                    return null;
                },
            ];

            let result = null;
            for (const api of apis) {
                try {
                    result = await api();
                    if (result) break;
                } catch (e) { continue; }
            }

            if (result) {
                await sock.sendMessage(chat, {
                    text: templates.card(
                        'Currency Result',
                        {
                            'Amount': `${amount.toLocaleString()} ${from}`,
                            'Converted': `${result.converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${to}`,
                            'Rate': `1 ${from} = ${result.rate.toFixed(4)} ${to}`
                        }
                    ),
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, { text: templates.notification('Error', 'Conversion failed. Check codes and try again.', 'error'), edit: statusMsg.key });
            }

        } catch (error) {
            console.error('Currency error:', error);
            await sock.sendMessage(chat, { text: '❌ *Conversion failed*', edit: statusMsg.key });
        }
    },
};

export const shorten = {
    name: 'shorten',
    alias: ['short', 'shorturl', 'bitly', 'tinyurl'],
    category: 'utility',
    desc: 'Shorten a URL',
    usage: '.shorten <url>',
    cooldown: 3000,
    react: '🔗',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.notification('Usage', `${prefix}shorten <url>`, 'info'),
            }, { quoted: msg });
        }

        let url = args[0];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const statusMsg = await sock.sendMessage(chat, { text: `🔗 *Shortening URL...*` }, { quoted: msg });

        try {
            const apis = [

                async () => {
                    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
                    const text = await res.text();
                    if (text.startsWith('http')) return text;
                    return null;
                },

                async () => {
                    const res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
                    const text = await res.text();
                    if (text.startsWith('http')) return text;
                    return null;
                },

                async () => {
                    const res = await fetch(`https://v.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
                    const text = await res.text();
                    if (text.startsWith('http')) return text;
                    return null;
                },

                async () => {
                    const res = await fetch('https://cleanuri.com/api/v1/shorten', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: `url=${encodeURIComponent(url)}`,
                    });
                    const data = await res.json();
                    return data.result_url || null;
                },

                async () => {
                    const res = await fetch(`https://api.giftedtech.co.ke/api/tools/shorten?url=${encodeURIComponent(url)}`);
                    const data = await res.json();
                    if (data.status && data.result) return data.result.short;
                    return null;
                },

                async () => {
                    const res = await fetch(`https://api.shrtco.de/v2/shorten?url=${encodeURIComponent(url)}`);
                    const data = await res.json();
                    if (data.ok) return data.result.full_short_link;
                    return null;
                },
            ];

            let shortUrl = null;
            for (const api of apis) {
                try {
                    shortUrl = await api();
                    if (shortUrl) break;
                } catch (e) { continue; }
            }

            if (shortUrl) {
                await sock.sendMessage(chat, {
                    text: templates.card(
                        'URL Shortener',
                        {
                            'Original': url.slice(0, 50) + '...',
                            'Shortened': shortUrl
                        }
                    ),
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, { text: templates.notification('Error', 'Failed to shorten URL', 'error'), edit: statusMsg.key });
            }

        } catch (error) {
            console.error('Shorten error:', error);
        }
    },
};

export const countdown = {
    name: 'countdown',
    alias: ['cd', 'timer'],
    category: 'utility',
    desc: 'Set a visual countdown timer',
    usage: '.countdown <seconds>',
    cooldown: 10000,
    react: '⏳',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        let seconds = parseInt(args[0]);
        if (isNaN(seconds) || seconds < 5 || seconds > 60) return sock.sendMessage(chat, { text: '❌ Provide seconds (5-60)!' }, { quoted: msg });
        const { key } = await sock.sendMessage(chat, { text: `⏳ *Countdown:* ${seconds}s` }, { quoted: msg });
        const interval = setInterval(async () => {
            seconds -= 5;
            if (seconds <= 0) {
                clearInterval(interval);
                await sock.sendMessage(chat, { text: '⏰ *Time is up!*', edit: key });
            } else {
                await sock.sendMessage(chat, { text: `⏳ *Countdown:* ${seconds}s`, edit: key });
            }
        }, 5000);
    }
};

const notes = new Map();
export const mynote = {
    name: 'note',
    alias: ['notes', 'savenote'],
    category: 'utility',
    desc: 'Save or retrieve small notes',
    usage: '.note <name> <content> or .note <name>',
    cooldown: 2000,
    react: '📝',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ Provide a note name!' }, { quoted: msg });
        const noteName = args[0].toLowerCase();
        if (args.length > 1) {
            const content = args.slice(1).join(' ');
            if (!notes.has(userId)) notes.set(userId, {});
            notes.get(userId)[noteName] = content;
            await sock.sendMessage(chat, { text: `✅ Note *${noteName}* saved!` }, { quoted: msg });
        } else {
            const userNotes = notes.get(userId);
            if (userNotes && userNotes[noteName]) {
                await sock.sendMessage(chat, { text: `📝 *Note: ${noteName}*\n\n${userNotes[noteName]}` }, { quoted: msg });
            } else {
                await sock.sendMessage(chat, { text: '❌ Note not found!' }, { quoted: msg });
            }
        }
    }
};

export const unitconvert = {
    name: 'unitconvert',
    alias: ['uconv', 'units'],
    category: 'utility',
    desc: 'Simple unit conversion',
    usage: '.unitconvert <val> <from> <to>',
    cooldown: 2000,
    react: '⚖️',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length < 3) return sock.sendMessage(chat, { text: '❌ Usage: .unitconvert 100 kg lbs' }, { quoted: msg });
        const val = parseFloat(args[0]);
        const from = args[1].toLowerCase();
        const to = args[2].toLowerCase();
        if (isNaN(val)) return sock.sendMessage(chat, { text: '❌ Invalid value!' }, { quoted: msg });

        let result;
        if (from === 'kg' && to === 'lbs') result = val * 2.20462;
        else if (from === 'lbs' && to === 'kg') result = val / 2.20462;
        else if (from === 'm' && to === 'ft') result = val * 3.28084;
        else if (from === 'ft' && to === 'm') result = val / 3.28084;
        else if (from === 'km' && to === 'mi') result = val * 0.621371;
        else if (from === 'mi' && to === 'km') result = val / 0.621371;
        else return sock.sendMessage(chat, { text: '❌ Unsupported units! (Try: kg/lbs, m/ft, km/mi)' }, { quoted: msg });

        await sock.sendMessage(chat, { text: `⚖️ *Conversion*\n\n${val} ${from} = *${result.toFixed(2)} ${to}*` }, { quoted: msg });
    }
};

export const checksite = {
    name: 'checksite',
    alias: ['isup', 'pingweb'],
    category: 'utility',
    desc: 'Check if a website is up',
    usage: '.checksite <url>',
    cooldown: 5000,
    react: '🌐',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ Provide a URL!' }, { quoted: msg });
        let url = args[0];
        if (!url.startsWith('http')) url = 'https://' + url;
        const statusMsg = await sock.sendMessage(chat, { text: `🌐 Checking *${url}*...` }, { quoted: msg });
        try {
            const start = Date.now();
            const res = await fetch(url, { timeout: 10000 });
            const end = Date.now();
            await sock.sendMessage(chat, {
                text: `✅ *${url}* is UP!\n⏱️ Response time: ${end - start}ms\n📊 Status: ${res.status} ${res.statusText}`,
                edit: statusMsg.key
            });
        } catch {
            await sock.sendMessage(chat, { text: `❌ *${url}* appears to be DOWN or unreachable.`, edit: statusMsg.key });
        }
    }
};

export const timezone = {
    name: 'timezone',
    alias: ['tz', 'time'],
    category: 'utility',
    desc: 'Get current time in a specific timezone',
    usage: '.timezone <region/city>',
    cooldown: 5000,
    react: '⏰',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ Provide a timezone (e.g., Africa/Nairobi, Asia/Tokyo)!' }, { quoted: msg });
        const tz = args.join('_');
        try {
            const time = new Date().toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            const date = new Date().toLocaleString('en-US', { timeZone: tz, dateStyle: 'full' });
            await sock.sendMessage(chat, { text: `⏰ *Current Time in ${tz}*\n\n🕒 *Time:* ${time}\n📅 *Date:* ${date}` }, { quoted: msg });
        } catch {
            await sock.sendMessage(chat, { text: '❌ *Invalid Timezone!*\n\nUse formats like `Europe/London`, `America/New_York`, etc.' }, { quoted: msg });
        }
    }
};

export const whoami = {
    name: 'whoami',
    alias: ['me', 'myinfo'],
    category: 'utility',
    desc: 'Show your user information',
    usage: '.whoami',
    cooldown: 5000,
    react: '👤',
    async execute({ sock, msg, pushName }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const number = sender.split('@')[0];
        const text = `👤 *User Information*\n\n🌟 *Name:* ${pushName || 'User'}\n🔢 *Number:* ${number}\n📍 *JID:* ${sender}\n\n_Vesperr User_`;
        await sock.sendMessage(chat, { text }, { quoted: msg });
    }
};

export const server = {
    name: 'server',
    alias: ['host', 'os'],
    category: 'utility',
    desc: 'Show bot server information',
    usage: '.server',
    cooldown: 5000,
    react: '🖥️',
    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const text = `🖥️ *Server Information*\n\n📟 *Platform:* ${process.platform}\n🏛️ *Arch:* ${process.arch}\n🚀 *Node:* ${process.version}\n🔋 *Uptime:* ${Math.round(process.uptime())}s\n\n_Vesperr Engine_`;
        await sock.sendMessage(chat, { text }, { quoted: msg });
    }
};

export const listgroups = {
    name: 'groups',
    alias: ['grouplist', 'listgroups'],
    category: 'utility',
    desc: 'List all groups the bot is in',
    usage: '.groups',
    cooldown: 10000,
    react: '🏢',
    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        try {
            const groups = await sock.groupFetchAllParticipating();
            const list = Object.values(groups);
            if (list.length === 0) return sock.sendMessage(chat, { text: '❌ No groups found!' }, { quoted: msg });
            let text = `🏢 *Total Groups: ${list.length}*\n\n`;
            list.slice(0, 20).forEach((g, i) => {
                text += `${i + 1}. ${g.subject}\n   🆔 ${g.id}\n\n`;
            });
            await sock.sendMessage(chat, { text }, { quoted: msg });
        } catch {
            await sock.sendMessage(chat, { text: '❌ Failed to fetch groups' }, { quoted: msg });
        }
    }
};

export default [translate, tts, qr, readqr, calc, remind, currency, shorten, countdown, mynote, unitconvert, checksite, timezone, whoami, server, listgroups];
