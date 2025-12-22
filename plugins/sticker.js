import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const CONFIG = {
    PACK_NAME: process.env.STICKER_PACK_NAME || '✧ Vesperr Bot ✧',
    AUTHOR: process.env.STICKER_AUTHOR || '@vesperr',
    TEMP_DIR: './temp',
    MAX_SIZE: 1024 * 1024 * 10,
    QUALITY: 80,
};

async function ensureTempDir() {
    try {
        await fs.mkdir(CONFIG.TEMP_DIR, { recursive: true });
    } catch { }
}

async function cleanup(...files) {
    for (const file of files) {
        try {
            if (file) await fs.unlink(file);
        } catch { }
    }
}

function tempFile(ext) {
    return path.join(CONFIG.TEMP_DIR, `${randomUUID()}.${ext}`);
}

async function createStickerFromImage(buffer, options = {}) {
    const {
        pack = CONFIG.PACK_NAME,
        author = CONFIG.AUTHOR,
        type = StickerTypes.FULL,
        quality = CONFIG.QUALITY,
        categories = ['🤖'],
    } = options;

    if (!buffer || buffer.length < 100) {
        throw new Error('Invalid image buffer');
    }

    let processedBuffer = buffer;
    try {

        processedBuffer = await sharp(buffer, { failOnError: false })
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
    } catch (sharpErr) {
        console.log('Sharp preprocessing skipped:', sharpErr.message);

        processedBuffer = buffer;
    }

    const sticker = new Sticker(processedBuffer, {
        pack,
        author,
        type,
        quality,
        categories,
    });

    return await sticker.toBuffer();
}

async function createStickerFromVideo(buffer, options = {}) {
    await ensureTempDir();

    const inputPath = tempFile('mp4');
    const outputPath = tempFile('webp');

    try {
        await fs.writeFile(inputPath, buffer);

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .inputOptions(['-t', '10'])
                .outputOptions([
                    '-vcodec', 'libwebp',
                    '-vf', "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white@0.0,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse",
                    '-loop', '0',
                    '-ss', '00:00:00',
                    '-t', '00:00:06',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                ])
                .toFormat('webp')
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });

        const webpBuffer = await fs.readFile(outputPath);

        const sticker = new Sticker(webpBuffer, {
            pack: options.pack || CONFIG.PACK_NAME,
            author: options.author || CONFIG.AUTHOR,
            type: StickerTypes.FULL,
            categories: options.categories || ['🤖'],
        });

        return await sticker.toBuffer();

    } finally {
        await cleanup(inputPath, outputPath);
    }
}

async function stickerToImage(buffer) {
    try {
        return await sharp(buffer, { failOnError: false })
            .png()
            .toBuffer();
    } catch (err) {
        console.error('stickerToImage sharp error:', err.message);
        throw new Error('Failed to convert sticker');
    }
}

async function createCircleSticker(buffer, options = {}) {
    try {
        const image = sharp(buffer, { failOnError: false });
        const metadata = await image.metadata();

        const size = Math.min(metadata.width || 512, metadata.height || 512);
        const circleShape = Buffer.from(
            `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
        );

        const circularBuffer = await sharp(buffer, { failOnError: false })
            .resize(size, size, { fit: 'cover' })
            .composite([{
                input: circleShape,
                blend: 'dest-in',
            }])
            .png()
            .toBuffer();

        return await createStickerFromImage(circularBuffer, options);
    } catch (err) {
        console.error('createCircleSticker error:', err.message);
        throw new Error('Failed to create circle sticker');
    }
}

async function createRoundedSticker(buffer, options = {}) {
    try {
        const image = sharp(buffer, { failOnError: false });
        const metadata = await image.metadata();

        const width = metadata.width || 512;
        const height = metadata.height || 512;
        const radius = Math.min(width, height) * 0.15;

        const roundedCorners = Buffer.from(
            `<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/></svg>`
        );

        const roundedBuffer = await sharp(buffer, { failOnError: false })
            .composite([{
                input: roundedCorners,
                blend: 'dest-in',
            }])
            .png()
            .toBuffer();

        return await createStickerFromImage(roundedBuffer, options);
    } catch (err) {
        console.error('createRoundedSticker error:', err.message);
        throw new Error('Failed to create rounded sticker');
    }
}

const stickerPlugin = {
    name: 'sticker',
    alias: ['s', 'stiker', 'stickr', 'st'],
    category: 'sticker',
    desc: 'Create sticker from image, video, or URL',
    usage: '.sticker [pack|author] | Reply to image/video',
    cooldown: 5000,
    react: '🎨',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        const imageMsg = quoted?.imageMessage || msg.message?.imageMessage;
        const videoMsg = quoted?.videoMessage || msg.message?.videoMessage;
        const stickerMsg = quoted?.stickerMessage || msg.message?.stickerMessage;

        if (!imageMsg && !videoMsg && !stickerMsg) {
            return sock.sendMessage(chat, {
                text: `─── ✧ *STICKER* ✧ ───

*Usage:*
⊹ Send/reply to an image
⊹ Send/reply to a video (max 10s)
⊹ Reply to a sticker to convert

*Custom metadata:*
\`.sticker pack_name | author\`

*Examples:*
\`.sticker MyPack | @user\`
\`.sticker\` (uses defaults)

───────────────────
_*Vesperr* ⋆ Stickers_`,
            }, { quoted: msg });
        }

        let pack = CONFIG.PACK_NAME;
        let author = CONFIG.AUTHOR;

        if (args.length > 0) {
            const parts = args.join(' ').split('|').map(s => s.trim());
            if (parts[0]) pack = parts[0];
            if (parts[1]) author = parts[1];
        }

        const options = { pack, author };

        await sock.sendMessage(chat, { react: { text: '⏳', key: msg.key } });

        try {
            let stickerBuffer;

            if (stickerMsg) {

                const buffer = await downloadMediaMessage(
                    { message: { stickerMessage: stickerMsg } },
                    'buffer',
                    {}
                );
                stickerBuffer = await createStickerFromImage(buffer, options);

            } else if (imageMsg) {
                const buffer = await downloadMediaMessage(
                    { message: { imageMessage: imageMsg } },
                    'buffer',
                    {}
                );
                stickerBuffer = await createStickerFromImage(buffer, options);

            } else if (videoMsg) {

                if (videoMsg.seconds > 15) {
                    return sock.sendMessage(chat, {
                        text: '❌ *Video too long!*\n\nMaximum duration is 10 seconds.',
                    }, { quoted: msg });
                }

                const buffer = await downloadMediaMessage(
                    { message: { videoMessage: videoMsg } },
                    'buffer',
                    {}
                );
                stickerBuffer = await createStickerFromVideo(buffer, options);
            }

            if (stickerBuffer) {
                await sock.sendMessage(chat, {
                    sticker: stickerBuffer,
                }, { quoted: msg });

                await sock.sendMessage(chat, { react: { text: '✅', key: msg.key } });
            }

        } catch (error) {
            console.error('Sticker error:', error);
            await sock.sendMessage(chat, { react: { text: '❌', key: msg.key } });
            await sock.sendMessage(chat, {
                text: '❌ *Failed to create sticker*\n\nTry a different image/video.',
            }, { quoted: msg });
        }
    },
};

export const toImage = {
    name: 'toimg',
    alias: ['toimage', 'stickertoimg', 'stimg'],
    category: 'sticker',
    desc: 'Convert sticker to image',
    usage: '.toimg (reply to sticker)',
    cooldown: 3000,
    react: '🖼️',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const stickerMsg = quoted?.stickerMessage;

        if (!stickerMsg) {
            return sock.sendMessage(chat, {
                text: '❌ *Reply to a sticker!*\n\nUsage: Reply to a sticker with `.toimg`',
            }, { quoted: msg });
        }

        try {
            const buffer = await downloadMediaMessage(
                { message: { stickerMessage: stickerMsg } },
                'buffer',
                {}
            );

            const imageBuffer = await stickerToImage(buffer);

            await sock.sendMessage(chat, {
                image: imageBuffer,
                caption: '✅ *Converted to image*',
            }, { quoted: msg });

        } catch (error) {
            console.error('ToImage error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to convert sticker*',
            }, { quoted: msg });
        }
    },
};

export const circle = {
    name: 'circle',
    alias: ['circsticker', 'round'],
    category: 'sticker',
    desc: 'Create circular sticker',
    usage: '.circle (reply to image)',
    cooldown: 5000,
    react: '⭕',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imageMsg = quoted?.imageMessage || msg.message?.imageMessage;

        if (!imageMsg) {
            return sock.sendMessage(chat, {
                text: '❌ *Send or reply to an image!*',
            }, { quoted: msg });
        }

        try {
            const buffer = await downloadMediaMessage(
                { message: { imageMessage: imageMsg } },
                'buffer',
                {}
            );

            let pack = CONFIG.PACK_NAME;
            let author = CONFIG.AUTHOR;
            if (args.length > 0) {
                const parts = args.join(' ').split('|').map(s => s.trim());
                if (parts[0]) pack = parts[0];
                if (parts[1]) author = parts[1];
            }

            const stickerBuffer = await createCircleSticker(buffer, { pack, author });

            await sock.sendMessage(chat, {
                sticker: stickerBuffer,
            }, { quoted: msg });

        } catch (error) {
            console.error('Circle sticker error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to create circle sticker*',
            }, { quoted: msg });
        }
    },
};

export const steal = {
    name: 'steal',
    alias: ['take', 'swipe'],
    category: 'sticker',
    desc: 'Change sticker pack name and author',
    usage: '.steal pack | author',
    cooldown: 3000,
    react: '🏴‍☠️',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const stickerMsg = quoted?.stickerMessage;

        if (!stickerMsg) {
            return sock.sendMessage(chat, {
                text: '❌ *Reply to a sticker!*\n\nUsage: `.steal MyPack | MyName`',
            }, { quoted: msg });
        }

        let pack = CONFIG.PACK_NAME;
        let author = CONFIG.AUTHOR;

        if (args.length > 0) {
            const parts = args.join(' ').split('|').map(s => s.trim());
            if (parts[0]) pack = parts[0];
            if (parts[1]) author = parts[1];
        }

        try {
            const buffer = await downloadMediaMessage(
                { message: { stickerMessage: stickerMsg } },
                'buffer',
                {}
            );

            const sticker = new Sticker(buffer, {
                pack,
                author,
                type: StickerTypes.FULL,
            });

            const stickerBuffer = await sticker.toBuffer();

            await sock.sendMessage(chat, {
                sticker: stickerBuffer,
            }, { quoted: msg });

        } catch (error) {
            console.error('Steal sticker error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to steal sticker*',
            }, { quoted: msg });
        }
    },
};

export default [stickerPlugin, toImage, circle, steal];
