import { downloadMediaMessage } from '@whiskeysockets/baileys';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import fetch, { FormData, Blob } from 'node-fetch';

const CONFIG = {
    TEMP_DIR: './temp',
    TIMEOUT: 60000,
};

async function ensureTempDir() {
    try { await fs.mkdir(CONFIG.TEMP_DIR, { recursive: true }); } catch { }
}

function tempFile(ext) {
    return path.join(CONFIG.TEMP_DIR, `${randomUUID()}.${ext}`);
}

async function cleanup(...files) {
    for (const f of files) {
        if (f) await fs.unlink(f).catch(() => { });
    }
}

async function getBuffer(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const media = quoted?.imageMessage || quoted?.videoMessage || quoted?.audioMessage || quoted?.stickerMessage ||
        msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage;

    if (!media) return null;
    return await downloadMediaMessage({ message: quoted ? quoted : msg.message }, 'buffer', {});
}

export const tomp3 = {
    name: 'tomp3',
    alias: ['mp3', 'toaudio'],
    category: 'converter',
    desc: 'Convert video/audio to MP3',
    usage: '.tomp3 (reply to media)',
    cooldown: 5000,
    react: '🎵',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const buffer = await getBuffer(msg);
        if (!buffer) return sock.sendMessage(chat, { text: '❌ Reply to a video or audio!' }, { quoted: msg });

        await ensureTempDir();
        const input = tempFile('mp4');
        const output = tempFile('mp3');

        await fs.writeFile(input, buffer);
        await sock.sendMessage(chat, { text: '🎵 *Converting...*' }, { quoted: msg });

        ffmpeg(input)
            .toFormat('mp3')
            .on('end', async () => {
                const audio = await fs.readFile(output);
                await sock.sendMessage(chat, { audio, mimetype: 'audio/mpeg' }, { quoted: msg });
                cleanup(input, output);
            })
            .on('error', (err) => {
                console.error(err);
                sock.sendMessage(chat, { text: '❌ Conversion failed!' }, { quoted: msg });
                cleanup(input, output);
            })
            .save(output);
    }
};

export const tovideo = {
    name: 'tovideo',
    alias: ['tovid', 'tomp4'],
    category: 'converter',
    desc: 'Convert sticker/gif to Video',
    usage: '.tovideo (reply to sticker)',
    cooldown: 10000,
    react: '🎥',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const buffer = await getBuffer(msg);
        if (!buffer) return sock.sendMessage(chat, { text: '❌ Reply to a sticker!' }, { quoted: msg });

        await ensureTempDir();
        const input = tempFile('webp');
        const output = tempFile('mp4');

        await fs.writeFile(input, buffer);
        await sock.sendMessage(chat, { text: '🎥 *Converting...*' }, { quoted: msg });

        ffmpeg(input)
            .inputFormat('webp')
            .outputOptions([
                "-movflags faststart",
                "-pix_fmt yuv420p",
                "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2"
            ])
            .toFormat('mp4')
            .on('end', async () => {
                const video = await fs.readFile(output);
                await sock.sendMessage(chat, { video, caption: '🎥 *Converted*' }, { quoted: msg });
                cleanup(input, output);
            })
            .on('error', (err) => {
                console.error(err);
                sock.sendMessage(chat, { text: '❌ Conversion failed! Is the sticker animated?' }, { quoted: msg });
                cleanup(input, output);
            })
            .save(output);
    }
};

export const togif = {
    name: 'togif',
    alias: ['gif'],
    category: 'converter',
    desc: 'Convert video to GIF',
    usage: '.togif (reply to video)',
    cooldown: 10000,
    react: '🎞️',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const buffer = await getBuffer(msg);
        if (!buffer) return sock.sendMessage(chat, { text: '❌ Reply to a video!' }, { quoted: msg });

        await ensureTempDir();
        const input = tempFile('mp4');
        const output = tempFile('gif');

        await fs.writeFile(input, buffer);
        await sock.sendMessage(chat, { text: '🎞️ *Converting...*' }, { quoted: msg });

        ffmpeg(input)
            .outputOptions([
                "-vf", "fps=10,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"
            ])
            .toFormat('gif')
            .on('end', async () => {
                const video = await fs.readFile(output);
                await sock.sendMessage(chat, { video, gifPlayback: true, caption: '🎞️ *Converted*' }, { quoted: msg });
                cleanup(input, output);
            })
            .on('error', (err) => {
                console.error(err);
                sock.sendMessage(chat, { text: '❌ Conversion failed!' }, { quoted: msg });
                cleanup(input, output);
            })
            .save(output);
    }
};

export const tourl = {
    name: 'tourl',
    alias: ['upload', 'url'],
    category: 'converter',
    desc: 'Upload media to URL',
    usage: '.tourl (reply to media)',
    cooldown: 10000,
    react: '🔗',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const buffer = await getBuffer(msg);
        if (!buffer) return sock.sendMessage(chat, { text: '❌ Reply to media!' }, { quoted: msg });

        try {

            const formData = new FormData();
            formData.append('reqtype', 'fileupload');
            formData.append('fileToUpload', new Blob([buffer]), 'media.jpg');

            const res = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                body: formData
            });

            const link = await res.text();

            if (link.startsWith('http')) {
                await sock.sendMessage(chat, { text: `🔗 *URL Created:*\n\n${link}` }, { quoted: msg });
            } else {
                throw new Error(link);
            }
        } catch (e) {
            console.error(e);
            await sock.sendMessage(chat, { text: '❌ Upload failed!' }, { quoted: msg });
        }
    }
};

export const tinyurl = {
    name: 'tinyurl',
    alias: ['shorten', 'short'],
    category: 'converter',
    desc: 'Shorten URL',
    usage: '.tinyurl <link>',
    cooldown: 5000,
    react: '🔗',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ Provide a link!' }, { quoted: msg });

        try {
            const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(args[0])}`);
            const link = await res.text();
            await sock.sendMessage(chat, { text: `🔗 *Shortened:*\n${link}` }, { quoted: msg });
        } catch (e) {
            await sock.sendMessage(chat, { text: '❌ Failed to shorten!' }, { quoted: msg });
        }
    }
};

export const attp = {
    name: 'attp',
    alias: ['animtext'],
    category: 'sticker',
    desc: 'Animated Text Sticker',
    usage: '.attp <text>',
    cooldown: 5000,
    react: '🌈',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const text = args.join(' ');
        if (!text) return sock.sendMessage(chat, { text: '❌ Provide text!' }, { quoted: msg });

        try {
            const url = `https://api.giftedtech.co.ke/api/tools/attp?apikey=gifted&text=${encodeURIComponent(text)}`;
            await sock.sendMessage(chat, { sticker: { url } }, { quoted: msg });
        } catch (e) {
            sock.sendMessage(chat, { text: '❌ Failed!' }, { quoted: msg });
        }
    }
};

export const ttp = {
    name: 'ttp',
    alias: ['textsticker'],
    category: 'sticker',
    desc: 'Text Sticker',
    usage: '.ttp <text>',
    cooldown: 5000,
    react: '📝',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const text = args.join(' ');
        if (!text) return sock.sendMessage(chat, { text: '❌ Provide text!' }, { quoted: msg });

        try {
            const url = `https://api.giftedtech.co.ke/api/tools/ttp?apikey=gifted&text=${encodeURIComponent(text)}`;
            await sock.sendMessage(chat, { sticker: { url } }, { quoted: msg });
        } catch (e) {
            sock.sendMessage(chat, { text: '❌ Failed!' }, { quoted: msg });
        }
    }
};

export const emojimix = {
    name: 'emojimix',
    alias: ['mix'],
    category: 'sticker',
    desc: 'Mix two emojis',
    usage: '.emojimix 😭+💀',
    cooldown: 5000,
    react: '🧪',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const text = args.join('');
        if (!text.includes('+')) return sock.sendMessage(chat, { text: '❌ Use: emoji+emoji (e.g., 😭+💀)' }, { quoted: msg });

        const [e1, e2] = text.split('+');

        try {
            const url = `https://api.giftedtech.co.ke/api/tools/emojimix?apikey=gifted&emoji1=${encodeURIComponent(e1)}&emoji2=${encodeURIComponent(e2)}`;
            await sock.sendMessage(chat, { sticker: { url } }, { quoted: msg });
        } catch (e) {
            sock.sendMessage(chat, { text: '❌ Failed to mix! (Try different emojis)' }, { quoted: msg });
        }
    }
};

export default [tomp3, tovideo, togif, tourl, tinyurl, attp, ttp, emojimix];
