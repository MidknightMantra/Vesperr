import fetch from 'node-fetch';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import sharp from 'sharp';

const CONFIG = {
    TIMEOUT: 60000,
    REMOVEBG_KEY: process.env.REMOVEBG_API_KEY || '',
};

async function getImageBuffer(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMsg = quoted?.imageMessage || msg.message?.imageMessage;

    if (!imageMsg) return null;

    return await downloadMediaMessage(
        { message: { imageMessage: imageMsg } },
        'buffer',
        {}
    );
}

async function enhanceImage(buffer) {
    const apis = [
        async () => {
            const formData = new FormData();
            formData.append('image', new Blob([buffer]), 'image.jpg');

            const res = await fetch('https://api.deepai.org/api/waifu2x', {
                method: 'POST',
                headers: { 'Api-Key': 'quickstart-QUdJIGlzIGNvbWluZy4uLi4K' },
                body: formData,
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.output_url) {
                const imgRes = await fetch(data.output_url);
                return Buffer.from(await imgRes.arrayBuffer());
            }
            return null;
        },
        async () => {
            const base64 = buffer.toString('base64');
            const res = await fetch('https://api.giftedtech.co.ke/api/tools/enhance?apikey=gifted', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64 }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.result) {
                return Buffer.from(data.result, 'base64');
            }
            return null;
        },
        async () => {

            return await sharp(buffer)
                .resize(null, null, {
                    kernel: sharp.kernel.lanczos3,
                    withoutEnlargement: false,
                })
                .sharpen({ sigma: 1.5 })
                .modulate({ brightness: 1.05, saturation: 1.1 })
                .toBuffer();
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result) return result;
        } catch (e) { continue; }
    }
    return null;
}

export const enhance = {
    name: 'enhance',
    alias: ['upscale', 'hd', 'remini', 'enhance'],
    category: 'media',
    desc: 'Enhance/upscale image quality',
    usage: '.enhance (reply to image)',
    cooldown: 15000,
    react: '✨',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const buffer = await getImageBuffer(msg);

        if (!buffer) {
            return sock.sendMessage(chat, {
                text: `─── ◆ *ENHANCE* ◆ ───

✨ *AI Image Enhancement*

◇ Reply to an image with:
  \`.enhance\`

◊ *Features:*
  • Upscale resolution
  • Sharpen details
  • Improve clarity

───────────────────
_*Vesperr* ⋆ Media_`,
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, { text: '◈ *Enhancing image...*' }, { quoted: msg });

        try {
            const enhanced = await enhanceImage(buffer);

            if (!enhanced) {
                return sock.sendMessage(chat, { text: '◌ *Enhancement failed*', edit: statusMsg.key });
            }

            await sock.sendMessage(chat, {
                image: enhanced,
                caption: `─── ◆ *VESPERR* ◆ ───\n\n✨ *Enhanced Image*\n\n───────────────────\n_*Vesperr* ⋆ Media_`,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('Enhance error:', error);
            await sock.sendMessage(chat, { text: '◌ *Enhancement failed*', edit: statusMsg.key });
        }
    },
};

async function removeBackground(buffer) {
    const apis = [

        async () => {
            if (!CONFIG.REMOVEBG_KEY) return null;

            const formData = new FormData();
            formData.append('image_file', new Blob([buffer]), 'image.png');
            formData.append('size', 'auto');

            const res = await fetch('https://api.remove.bg/v1.0/removebg', {
                method: 'POST',
                headers: { 'X-Api-Key': CONFIG.REMOVEBG_KEY },
                body: formData,
                timeout: CONFIG.TIMEOUT,
            });

            if (res.ok) {
                return Buffer.from(await res.arrayBuffer());
            }
            return null;
        },

        async () => {
            const base64 = buffer.toString('base64');
            const res = await fetch('https://api.giftedtech.co.ke/api/tools/removebg?apikey=gifted', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64 }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.result) {
                return Buffer.from(data.result, 'base64');
            }
            return null;
        },

        async () => {
            const formData = new FormData();
            formData.append('image_file', new Blob([buffer]), 'image.jpg');

            const res = await fetch('https://sdk.photoroom.com/v1/segment', {
                method: 'POST',
                headers: { 'x-api-key': 'sandbox_xxxxx' },
                body: formData,
                timeout: CONFIG.TIMEOUT,
            });

            if (res.ok) {
                return Buffer.from(await res.arrayBuffer());
            }
            return null;
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result) return result;
        } catch (e) { continue; }
    }
    return null;
}

export const removebg = {
    name: 'removebg',
    alias: ['rbg', 'nobg', 'rmbg'],
    category: 'media',
    desc: 'Remove image background',
    usage: '.removebg (reply to image)',
    cooldown: 15000,
    react: '🖼️',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const buffer = await getImageBuffer(msg);

        if (!buffer) {
            return sock.sendMessage(chat, {
                text: `─── ◆ *REMOVE BG* ◆ ───

🖼️ *Background Remover*

◇ Reply to an image with:
  \`.removebg\`

───────────────────
_*Vesperr* ⋆ Media_`,
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, { text: '◈ *Removing background...*' }, { quoted: msg });

        try {
            const result = await removeBackground(buffer);

            if (!result) {
                return sock.sendMessage(chat, { text: '◌ *Failed to remove background*', edit: statusMsg.key });
            }

            await sock.sendMessage(chat, {
                image: result,
                caption: `─── ◆ *VESPERR* ◆ ───\n\n🖼️ *Background Removed*\n\n───────────────────\n_*Vesperr* ⋆ Media_`,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('RemoveBG error:', error);
            await sock.sendMessage(chat, { text: '◌ *Failed*', edit: statusMsg.key });
        }
    },
};

export const blur = {
    name: 'blur',
    alias: ['blurimage'],
    category: 'media',
    desc: 'Blur an image',
    usage: '.blur [amount] (reply to image)',
    cooldown: 5000,
    react: '🌫️',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const buffer = await getImageBuffer(msg);

        if (!buffer) {
            return sock.sendMessage(chat, {
                text: `─── ◆ *BLUR* ◆ ───

🌫️ *Blur Image*

◇ Reply to an image with:
  \`.blur [1-100]\`

◊ *Default:* 10

───────────────────
_*Vesperr* ⋆ Media_`,
            }, { quoted: msg });
        }

        const amount = Math.min(100, Math.max(1, parseInt(args[0]) || 10));

        try {
            const blurred = await sharp(buffer)
                .blur(amount)
                .toBuffer();

            await sock.sendMessage(chat, {
                image: blurred,
                caption: `─── ◆ *VESPERR* ◆ ───\n\n🌫️ *Blur: ${amount}*\n\n───────────────────\n_*Vesperr* ⋆ Media_`,
            }, { quoted: msg });

        } catch (error) {
            console.error('Blur error:', error);
            await sock.sendMessage(chat, { text: '◌ *Failed to blur*' }, { quoted: msg });
        }
    },
};

export const caption = {
    name: 'caption',
    alias: ['addtext', 'textimg', 'imgtext'],
    category: 'media',
    desc: 'Add text to image',
    usage: '.caption <text> (reply to image)',
    cooldown: 5000,
    react: '📝',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const buffer = await getImageBuffer(msg);

        if (!buffer || args.length === 0) {
            return sock.sendMessage(chat, {
                text: `─── ◆ *CAPTION* ◆ ───

📝 *Add Text to Image*

◇ *Usage:*
  \`.caption <text>\`
  \`.caption top: text\`
  \`.caption bottom: text\`

───────────────────
_*Vesperr* ⋆ Media_`,
            }, { quoted: msg });
        }

        try {
            let text = args.join(' ');
            let position = 'bottom';

            if (text.toLowerCase().startsWith('top:')) {
                position = 'top';
                text = text.slice(4).trim();
            } else if (text.toLowerCase().startsWith('bottom:')) {
                position = 'bottom';
                text = text.slice(7).trim();
            }

            const metadata = await sharp(buffer).metadata();
            const { width, height } = metadata;

            const fontSize = Math.max(24, Math.min(64, Math.floor(width / 15)));
            const padding = 20;
            const textY = position === 'top' ? fontSize + padding : height - padding;

            const svg = `
                <svg width="${width}" height="${height}">
                    <style>
                        .caption {
                            fill: white;
                            font-size: ${fontSize}px;
                            font-family: Arial, sans-serif;
                            font-weight: bold;
                            text-anchor: middle;
                        }
                        .shadow {
                            fill: black;
                            font-size: ${fontSize}px;
                            font-family: Arial, sans-serif;
                            font-weight: bold;
                            text-anchor: middle;
                        }
                    </style>
                    <text x="${width / 2 + 2}" y="${textY + 2}" class="shadow">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
                    <text x="${width / 2}" y="${textY}" class="caption">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
                </svg>
            `;

            const result = await sharp(buffer)
                .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
                .png()
                .toBuffer();

            await sock.sendMessage(chat, {
                image: result,
                caption: '📝 *Caption Added*',
            }, { quoted: msg });

        } catch (error) {
            console.error('Caption error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed to add caption*' }, { quoted: msg });
        }
    },
};

async function extractText(buffer) {
    const apis = [
        async () => {
            const base64 = buffer.toString('base64');
            const res = await fetch('https://api.giftedtech.co.ke/api/tools/ocr?apikey=gifted', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64 }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            return data.result || data.text;
        },
        async () => {
            const base64 = buffer.toString('base64');
            const res = await fetch('https://api.ocr.space/parse/image', {
                method: 'POST',
                headers: {
                    'apikey': 'K87654321098765',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `base64Image=data:image/png;base64,${base64}`,
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            return data.ParsedResults?.[0]?.ParsedText;
        },
        async () => {
            const formData = new FormData();
            formData.append('image', new Blob([buffer]), 'image.png');

            const res = await fetch('https://api.api-ninjas.com/v1/imagetotext', {
                method: 'POST',
                headers: { 'X-Api-Key': 'demo' },
                body: formData,
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            return data.map(item => item.text).join(' ');
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result) return result;
        } catch (e) { continue; }
    }
    return null;
}

export const ocr = {
    name: 'ocr',
    alias: ['totext', 'readtext', 'textfromimage', 'i2t'],
    category: 'media',
    desc: 'Extract text from image',
    usage: '.ocr (reply to image)',
    cooldown: 10000,
    react: '📄',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const buffer = await getImageBuffer(msg);

        if (!buffer) {
            return sock.sendMessage(chat, {
                text: '📄 *OCR - Text Extraction*\n\nReply to an image with `.ocr`',
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, { text: '📄 *Extracting text...*' }, { quoted: msg });

        try {
            const text = await extractText(buffer);

            if (!text || text.trim().length === 0) {
                return sock.sendMessage(chat, { text: '❌ *No text found in image*', edit: statusMsg.key });
            }

            await sock.sendMessage(chat, {
                text: `📄 *Extracted Text:*\n\n${text.slice(0, 4000)}`,
                edit: statusMsg.key,
            });

        } catch (error) {
            console.error('OCR error:', error);
            await sock.sendMessage(chat, { text: '❌ *Text extraction failed*', edit: statusMsg.key });
        }
    },
};

export const effects = {
    name: 'effect',
    alias: ['filter', 'fx', 'imgfx'],
    category: 'media',
    desc: 'Apply effects to image',
    usage: '.effect <type> (reply to image)',
    cooldown: 5000,
    react: '🎨',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const buffer = await getImageBuffer(msg);

        const effectTypes = ['grayscale', 'sepia', 'blur', 'sharpen', 'negate', 'tint', 'brightness', 'saturate'];

        if (!buffer) {
            return sock.sendMessage(chat, {
                text: `🎨 *Image Effects*\n\nReply to an image with:\n\`${prefix}effect <type>\`\n\n*Available Effects:*\n${effectTypes.join(', ')}`,
            }, { quoted: msg });
        }

        const effectType = args[0]?.toLowerCase();
        const value = parseFloat(args[1]) || null;

        if (!effectType || !effectTypes.includes(effectType)) {
            return sock.sendMessage(chat, {
                text: `🎨 *Available Effects:*\n\n${effectTypes.join('\n')}`,
            }, { quoted: msg });
        }

        try {
            let pipeline = sharp(buffer);

            switch (effectType) {
                case 'grayscale':
                    pipeline = pipeline.grayscale();
                    break;
                case 'sepia':

                    pipeline = pipeline.modulate({ saturation: 0.5 }).tint({ r: 112, g: 66, b: 20 });
                    break;
                case 'blur':
                    pipeline = pipeline.blur(value || 5);
                    break;
                case 'sharpen':
                    pipeline = pipeline.sharpen({ sigma: value || 2 });
                    break;
                case 'negate':
                    pipeline = pipeline.negate();
                    break;
                case 'tint':
                    pipeline = pipeline.tint({ r: 255, g: 100, b: 100 });
                    break;
                case 'brightness':
                    pipeline = pipeline.modulate({ brightness: value || 1.3 });
                    break;
                case 'saturate':
                    pipeline = pipeline.modulate({ saturation: value || 1.5 });
                    break;
            }

            const result = await pipeline.toBuffer();

            await sock.sendMessage(chat, {
                image: result,
                caption: `🎨 *Effect: ${effectType}*`,
            }, { quoted: msg });

        } catch (error) {
            console.error('Effect error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed to apply effect*' }, { quoted: msg });
        }
    },
};

export const resize = {
    name: 'resize',
    alias: ['resizeimg', 'imgsize'],
    category: 'media',
    desc: 'Resize image',
    usage: '.resize <width> [height] (reply to image)',
    cooldown: 5000,
    react: '📐',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const buffer = await getImageBuffer(msg);

        if (!buffer || args.length === 0) {
            return sock.sendMessage(chat, {
                text: '📐 *Resize Image*\n\nUsage:\n`.resize 500` (width, auto height)\n`.resize 500 300` (width x height)\n`.resize 50%` (percentage)',
            }, { quoted: msg });
        }

        try {
            let width, height;

            if (args[0].includes('%')) {
                const percent = parseInt(args[0]) / 100;
                const metadata = await sharp(buffer).metadata();
                width = Math.round(metadata.width * percent);
                height = Math.round(metadata.height * percent);
            } else {
                width = parseInt(args[0]);
                height = args[1] ? parseInt(args[1]) : null;
            }

            const resized = await sharp(buffer)
                .resize(width, height, { fit: 'inside' })
                .toBuffer();

            const metadata = await sharp(resized).metadata();

            await sock.sendMessage(chat, {
                image: resized,
                caption: `📐 *Resized: ${metadata.width}x${metadata.height}*`,
            }, { quoted: msg });

        } catch (error) {
            console.error('Resize error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed to resize*' }, { quoted: msg });
        }
    },
};

export const crop = {
    name: 'crop',
    alias: ['cropimg'],
    category: 'media',
    desc: 'Crop image',
    usage: '.crop <type> (reply to image)',
    cooldown: 5000,
    react: '✂️',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const buffer = await getImageBuffer(msg);

        const cropTypes = ['square', 'circle', 'portrait', 'landscape', 'story', 'banner'];

        if (!buffer) {
            return sock.sendMessage(chat, {
                text: `✂️ *Crop Image*\n\nUsage: \`.crop <type>\`\n\nTypes: ${cropTypes.join(', ')}`,
            }, { quoted: msg });
        }

        const cropType = args[0]?.toLowerCase() || 'square';

        try {
            const metadata = await sharp(buffer).metadata();
            const { width, height } = metadata;

            let cropOptions;

            switch (cropType) {
                case 'square':
                    const size = Math.min(width, height);
                    cropOptions = { width: size, height: size, position: 'center' };
                    break;
                case 'circle':
                    const circleSize = Math.min(width, height);
                    const circleBuffer = await sharp(buffer)
                        .resize(circleSize, circleSize, { fit: 'cover' })
                        .toBuffer();

                    const circle = Buffer.from(
                        `<svg><circle cx="${circleSize / 2}" cy="${circleSize / 2}" r="${circleSize / 2}"/></svg>`
                    );

                    const cropped = await sharp(circleBuffer)
                        .composite([{ input: circle, blend: 'dest-in' }])
                        .png()
                        .toBuffer();

                    return sock.sendMessage(chat, { image: cropped, caption: '✂️ *Cropped: Circle*' }, { quoted: msg });

                case 'portrait':
                    cropOptions = { width: Math.round(height * 0.8), height, position: 'center' };
                    break;
                case 'landscape':
                    cropOptions = { width, height: Math.round(width * 0.5625), position: 'center' };
                    break;
                case 'story':
                    cropOptions = { width: Math.round(height * 0.5625), height, position: 'center' };
                    break;
                case 'banner':
                    cropOptions = { width, height: Math.round(width * 0.333), position: 'center' };
                    break;
                default:
                    return sock.sendMessage(chat, { text: `❌ Invalid type. Use: ${cropTypes.join(', ')}` }, { quoted: msg });
            }

            const result = await sharp(buffer)
                .resize(cropOptions.width, cropOptions.height, { fit: 'cover', position: cropOptions.position })
                .toBuffer();

            await sock.sendMessage(chat, {
                image: result,
                caption: `✂️ *Cropped: ${cropType}*`,
            }, { quoted: msg });

        } catch (error) {
            console.error('Crop error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed to crop*' }, { quoted: msg });
        }
    },
};

export const rotate = {
    name: 'rotate',
    alias: ['rotateimg', 'flip'],
    category: 'media',
    desc: 'Rotate/flip image',
    usage: '.rotate <90/180/270/h/v>',
    cooldown: 3000,
    react: '🔄',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const buffer = await getImageBuffer(msg);

        if (!buffer) {
            return sock.sendMessage(chat, {
                text: '🔄 *Rotate Image*\n\nUsage:\n`.rotate 90` - Rotate 90°\n`.rotate 180` - Rotate 180°\n`.rotate h` - Flip horizontal\n`.rotate v` - Flip vertical',
            }, { quoted: msg });
        }

        const action = args[0]?.toLowerCase() || '90';

        try {
            let result;

            switch (action) {
                case '90':
                    result = await sharp(buffer).rotate(90).toBuffer();
                    break;
                case '180':
                    result = await sharp(buffer).rotate(180).toBuffer();
                    break;
                case '270':
                case '-90':
                    result = await sharp(buffer).rotate(270).toBuffer();
                    break;
                case 'h':
                case 'horizontal':
                    result = await sharp(buffer).flop().toBuffer();
                    break;
                case 'v':
                case 'vertical':
                    result = await sharp(buffer).flip().toBuffer();
                    break;
                default:
                    const angle = parseInt(action);
                    if (!isNaN(angle)) {
                        result = await sharp(buffer).rotate(angle).toBuffer();
                    } else {
                        return sock.sendMessage(chat, { text: '❌ *Invalid rotation*' }, { quoted: msg });
                    }
            }

            await sock.sendMessage(chat, {
                image: result,
                caption: `🔄 *Rotated: ${action}*`,
            }, { quoted: msg });

        } catch (error) {
            console.error('Rotate error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed to rotate*' }, { quoted: msg });
        }
    },
};

export const mediaCommands = [
    enhance,
    removebg,
    blur,
    caption,
    ocr,
    effects,
    resize,
    crop,
    rotate,
];

export default mediaCommands;
