import fetch from 'node-fetch';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const CONFIG = {
    TIMEOUT: 120000,
    OPENAI_KEY: process.env.OPENAI_API_KEY || '',
    STABILITY_KEY: process.env.STABILITY_API_KEY || '',
};

async function generateImage(prompt, style = 'default') {
    const stylePrompts = {
        default: '',
        realistic: ', photorealistic, 8k, detailed, professional photography',
        anime: ', anime style, manga, japanese animation, vibrant colors',
        art: ', digital art, artstation, concept art, highly detailed',
        fantasy: ', fantasy art, magical, ethereal, mystical atmosphere',
        cyberpunk: ', cyberpunk, neon lights, futuristic city, sci-fi',
        watercolor: ', watercolor painting, soft colors, artistic',
        oil: ', oil painting, classical art style, detailed brushwork',
        '3d': ', 3D render, octane render, unreal engine, highly detailed',
        pixel: ', pixel art, 16-bit, retro game style',
        logo: ', logo design, minimal, vector, professional',
        cartoon: ', cartoon style, colorful, fun, animated',
    };

    const enhancedPrompt = prompt + (stylePrompts[style] || stylePrompts.default);

    const apis = [

        async () => {
            const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024&nologo=true`;
            const res = await fetch(url, { timeout: CONFIG.TIMEOUT });
            if (res.ok) {
                return Buffer.from(await res.arrayBuffer());
            }
            return null;
        },

        async () => {

            const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
            const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

            const res = await fetch(`https://api-dark-shan-yt.koyeb.app/ai/magicstudio?prompt=${encodeURIComponent(enhancedPrompt)}&apikey=${_0xkey}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();

            if (data.result) {
                const imgRes = await fetch(data.result);
                return Buffer.from(await imgRes.arrayBuffer());
            } else if (data.image) {
                const imgRes = await fetch(data.image);
                return Buffer.from(await imgRes.arrayBuffer());
            }
            return null;
        },

        async () => {

            const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
            const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

            const safeStyle = style === 'default' ? 'Anime' : style.charAt(0).toUpperCase() + style.slice(1);

            const res = await fetch(`https://api-dark-shan-yt.koyeb.app/ai/deepimg?q=${encodeURIComponent(prompt)}&style=${encodeURIComponent(safeStyle)}&apikey=${_0xkey}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();

            if (data.result) {
                const imgRes = await fetch(data.result);
                return Buffer.from(await imgRes.arrayBuffer());
            }
            return null;
        },

        async () => {
            const res = await fetch('https://api.prodia.com/v1/sd/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Prodia-Key': 'demo',
                },
                body: JSON.stringify({
                    model: 'sdv1_4.safetensors [7460a6fa]',
                    prompt: enhancedPrompt,
                    negative_prompt: 'blurry, bad quality, distorted',
                    steps: 25,
                    cfg_scale: 7,
                    sampler: 'DPM++ 2M Karras',
                    width: 512,
                    height: 512,
                }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();

            if (data.job) {

                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 2000));
                    const statusRes = await fetch(`https://api.prodia.com/v1/job/${data.job}`);
                    const status = await statusRes.json();

                    if (status.status === 'succeeded' && status.imageUrl) {
                        const imgRes = await fetch(status.imageUrl);
                        return Buffer.from(await imgRes.arrayBuffer());
                    }
                }
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://api.giftedtech.co.ke/api/ai/text2img?apikey=gifted&prompt=${encodeURIComponent(enhancedPrompt)}`, {
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.result) {
                if (data.result.startsWith('http')) {
                    const imgRes = await fetch(data.result);
                    return Buffer.from(await imgRes.arrayBuffer());
                }
                return Buffer.from(data.result, 'base64');
            }
            return null;
        },

        async () => {
            const formData = new URLSearchParams();
            formData.append('text', enhancedPrompt);

            const res = await fetch('https://api.deepai.org/api/text2img', {
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
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result && result.length > 1000) return result;
        } catch (e) { continue; }
    }
    return null;
}

export const imagine = {
    name: 'imagine',
    alias: ['img', 'generate', 'dalle', 'ai-image', 'draw', 'create'],
    category: 'ai',
    desc: 'Generate AI images from text',
    usage: '.imagine <prompt> [--style]',
    cooldown: 30000,
    react: '🎨',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `─── ✦ *AI IMAGINE* ✦ ───

✵ *Create stunning AI art!*

⬢ *Usage:*
  \`${prefix}imagine <prompt>\`
  \`${prefix}imagine <prompt> --style\`

🎨 *Styles:*
  realistic, anime, art, fantasy
  cyberpunk, watercolor, 3d, pixel

✧ *Example:*
  \`${prefix}imagine a cat in space --anime\`

───────────────────
_*Vesperr* ⋆ Image_`,
            }, { quoted: msg });
        }

        let style = 'default';
        let prompt = args.join(' ');

        const styleMatch = prompt.match(/--(\w+)$/);
        if (styleMatch) {
            style = styleMatch[1].toLowerCase();
            prompt = prompt.replace(/--\w+$/, '').trim();
        }

        const statusMsg = await sock.sendMessage(chat, {
            text: `◈ *Creating your masterpiece...*\n\n✵ ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}\n⬢ Style: ${style}`,
        }, { quoted: msg });

        try {
            const imageBuffer = await generateImage(prompt, style);

            if (!imageBuffer) {
                return sock.sendMessage(chat, {
                    text: '❌ *Image generation failed*\n\nTry a different prompt or style.',
                    edit: statusMsg.key,
                });
            }

            await sock.sendMessage(chat, {
                image: imageBuffer,
                caption: `─── ✦ *VESPERR* ✦ ───\n\n✵ *Prompt:* ${prompt.slice(0, 150)}\n⬢ *Style:* ${style}\n\n───────────────────\n_*Vesperr* ⋆ Image_`,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('Imagine error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Generation failed*',
                edit: statusMsg.key,
            });
        }
    },
};

async function askGPT(prompt, system = '') {
    const apis = [

        async () => {
            if (!CONFIG.OPENAI_KEY) return null;

            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.OPENAI_KEY}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: system || 'You are Vesperr, a highly capable AI assistant. Provide clear, accurate, and helpful responses. Be professional yet approachable. Format your responses well and be concise while being thorough.' },
                        { role: 'user', content: prompt },
                    ],
                    max_tokens: 2000,
                }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            return data.choices?.[0]?.message?.content;
        },

        async () => {
            const res = await fetch('https://api.giftedtech.co.ke/api/ai/gpt4?apikey=gifted&q=' + encodeURIComponent(prompt), {
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            return data.result || data.response;
        },
        async () => {
            const res = await fetch(`https://api.freegpt4.ddns.net/?text=${encodeURIComponent(prompt)}`, {
                timeout: CONFIG.TIMEOUT,
            });
            return await res.text();
        },
        async () => {
            const res = await fetch('https://chatgpt.apinepdev.workers.dev/?question=' + encodeURIComponent(prompt), {
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            return data.answer || data.reply;
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result && result.length > 10) return result;
        } catch (e) { continue; }
    }
    return null;
}

export const gpt = {
    name: 'gpt',
    alias: ['gpt4', 'chatgpt', 'openai'],
    category: 'ai',
    desc: 'Chat with GPT-4',
    usage: '.gpt <prompt>',
    cooldown: 5000,
    react: '🤖',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `─── ✦ *VESPERR* ✦ ───\n\n🧠 *Chat with advanced AI*\n\n⬢ *Usage:* \`.gpt <question>\`\n\n✧ *Example:*\n  \`.gpt explain quantum physics\`\n\n───────────────────\n_*Vesperr* ⋆ Chat_`,
            }, { quoted: msg });
        }

        const prompt = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, { text: '🤖 *Thinking...*' }, { quoted: msg });

        try {
            const response = await askGPT(prompt);

            if (!response) {
                return sock.sendMessage(chat, { text: '❌ *Failed to get response*', edit: statusMsg.key });
            }

            await sock.sendMessage(chat, {
                text: `🤖 *GPT-4*\n\n${response.slice(0, 4000)}`,
                edit: statusMsg.key,
            });

        } catch (error) {
            console.error('GPT error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed*', edit: statusMsg.key });
        }
    },
};

export const code = {
    name: 'code',
    alias: ['coder', 'programming', 'dev'],
    category: 'ai',
    desc: 'AI coding assistant',
    usage: '.code <request>',
    cooldown: 10000,
    react: '💻',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: '💻 *Code Assistant*\n\nUsage: `.code <request>`\n\nExamples:\n`.code python script to sort a list`\n`.code fix this js: function broken() {`\n`.code explain this code: ...`',
            }, { quoted: msg });
        }

        const prompt = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, { text: '💻 *Coding...*' }, { quoted: msg });

        try {
            const systemPrompt = `You are a senior software engineer with 15+ years of experience. Provide clean, production-ready code with proper error handling and comments. Use markdown code blocks with language tags. Explain your approach briefly. Follow best practices and modern coding standards. Be concise but thorough.`;
            const response = await askGPT(prompt, systemPrompt);

            if (!response) {
                return sock.sendMessage(chat, { text: '❌ *Failed*', edit: statusMsg.key });
            }

            await sock.sendMessage(chat, {
                text: `💻 *Code Assistant*\n\n${response.slice(0, 4000)}`,
                edit: statusMsg.key,
            });

        } catch (error) {
            console.error('Code error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed*', edit: statusMsg.key });
        }
    },
};

export const summarize = {
    name: 'summarize',
    alias: ['summary', 'tldr', 'sum'],
    category: 'ai',
    desc: 'Summarize text',
    usage: '.summarize <text> or reply',
    cooldown: 10000,
    react: '📝',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;

        const text = quotedText || args.join(' ');

        if (!text || text.length < 50) {
            return sock.sendMessage(chat, {
                text: '📝 *Summarizer*\n\nUsage:\n`.summarize <long text>`\nOr reply to a message with `.summarize`\n\n_Minimum 50 characters_',
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, { text: '📝 *Summarizing...*' }, { quoted: msg });

        try {
            const prompt = `Provide a professional, well-structured summary of the following content. Highlight key points, main arguments, and important conclusions. Keep it clear and digestible:\n\n${text.slice(0, 8000)}`;
            const response = await askGPT(prompt, 'You are a professional summarizer. Create clear, concise summaries that capture the essential information.');

            if (!response) {
                return sock.sendMessage(chat, { text: '❌ *Failed*', edit: statusMsg.key });
            }

            await sock.sendMessage(chat, {
                text: `📝 *Summary*\n\n${response}`,
                edit: statusMsg.key,
            });

        } catch (error) {
            console.error('Summarize error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed*', edit: statusMsg.key });
        }
    },
};

async function generateVoice(text, voice = 'brian') {
    const apis = [

        async () => {
            const voices = {
                'brian': 'Brian',
                'amy': 'Amy',
                'emma': 'Emma',
                'geraint': 'Geraint',
                'russell': 'Russell',
                'nicole': 'Nicole',
                'joey': 'Joey',
                'justin': 'Justin',
                'matthew': 'Matthew',
                'joanna': 'Joanna',
                'kendra': 'Kendra',
                'kimberly': 'Kimberly',
                'salli': 'Salli',
                'ivy': 'Ivy',
            };
            const selectedVoice = voices[voice.toLowerCase()] || 'Brian';
            const url = `https://api.streamelements.com/kappa/v2/speech?voice=${selectedVoice}&text=${encodeURIComponent(text.slice(0, 300))}`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 15000,
            });
            if (res.ok) {
                const buffer = Buffer.from(await res.arrayBuffer());
                if (buffer.length > 1000) return buffer;
            }
            return null;
        },

        async () => {
            const langMap = {
                'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it',
                'pt': 'pt', 'ru': 'ru', 'ja': 'ja', 'ko': 'ko', 'zh': 'zh-CN',
                'brian': 'en-GB', 'amy': 'en-GB', 'joey': 'en-US', 'justin': 'en-US',
            };
            const lang = langMap[voice.toLowerCase()] || 'en';
            const encodedText = encodeURIComponent(text.slice(0, 200));
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://translate.google.com/',
                },
                timeout: 10000,
            });
            if (res.ok) {
                const buffer = Buffer.from(await res.arrayBuffer());
                if (buffer.length > 500) return buffer;
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://api.giftedtech.co.ke/api/ai/tts?text=${encodeURIComponent(text.slice(0, 200))}`, {
                timeout: 15000,
            });
            if (res.ok) {
                const data = await res.json();
                if (data.result?.audio_url) {
                    const audioRes = await fetch(data.result.audio_url);
                    if (audioRes.ok) {
                        return Buffer.from(await audioRes.arrayBuffer());
                    }
                }
            }
            return null;
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result && result.length > 100) {
                console.log('Voice generated successfully');
                return result;
            }
        } catch (e) {
            console.log('TTS API failed:', e.message);
            continue;
        }
    }
    console.log('All TTS APIs failed');
    return null;
}

export const voice = {
    name: 'voice',
    alias: ['speak', 'tts2', 'aivoice'],
    category: 'ai',
    desc: 'AI text to speech',
    usage: '.voice [voice] <text>',
    cooldown: 10000,
    react: '🎙️',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;

        const voices = ['brian', 'amy', 'emma', 'joey', 'justin', 'en', 'es', 'fr', 'de', 'ja', 'ko'];

        if (args.length === 0 && !quotedText) {
            return sock.sendMessage(chat, {
                text: `🎙️ *AI Voice*\n\nUsage:\n\`${prefix}voice <text>\`\n\`${prefix}voice brian <text>\`\n\nVoices: ${voices.join(', ')}`,
            }, { quoted: msg });
        }

        let voiceType = 'brian';
        let text;

        if (quotedText) {
            text = quotedText;
            if (args[0] && voices.includes(args[0].toLowerCase())) {
                voiceType = args[0].toLowerCase();
            }
        } else {
            if (voices.includes(args[0].toLowerCase())) {
                voiceType = args[0].toLowerCase();
                text = args.slice(1).join(' ');
            } else {
                text = args.join(' ');
            }
        }

        if (!text) {
            return sock.sendMessage(chat, { text: '❌ *No text provided*' }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, { text: '🎙️ *Generating voice...*' }, { quoted: msg });

        try {
            const audioBuffer = await generateVoice(text.slice(0, 500), voiceType);

            if (!audioBuffer) {
                return sock.sendMessage(chat, { text: '❌ *Voice generation failed*', edit: statusMsg.key });
            }

            await sock.sendMessage(chat, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: true,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('Voice error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed*', edit: statusMsg.key });
        }
    },
};

export const write = {
    name: 'write',
    alias: ['writer', 'compose', 'essay'],
    category: 'ai',
    desc: 'AI writing assistant',
    usage: '.write <type> <topic>',
    cooldown: 15000,
    react: '✍️',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        const types = ['essay', 'email', 'story', 'poem', 'article', 'letter', 'speech', 'review'];

        if (args.length < 2) {
            return sock.sendMessage(chat, {
                text: `✍️ *AI Writer*\n\nUsage: \`${prefix}write <type> <topic>\`\n\nTypes: ${types.join(', ')}\n\nExamples:\n\`${prefix}write essay climate change\`\n\`${prefix}write email job application\`\n\`${prefix}write poem love\``,
            }, { quoted: msg });
        }

        const type = args[0].toLowerCase();
        const topic = args.slice(1).join(' ');

        if (!types.includes(type)) {
            return sock.sendMessage(chat, {
                text: `❌ Invalid type.\n\nAvailable: ${types.join(', ')}`,
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, { text: `✍️ *Writing ${type}...*` }, { quoted: msg });

        try {
            const prompts = {
                essay: `Write a comprehensive, well-researched essay in English about: ${topic}. Include an introduction, main body with clear arguments, and a conclusion.`,
                email: `Write a polished professional email in English about: ${topic}. Include appropriate greeting, clear body, and professional closing.`,
                story: `Write an engaging short story in English about: ${topic}. Include vivid descriptions, compelling characters, and a satisfying narrative arc.`,
                poem: `Write an evocative poem in English about: ${topic}. Use literary devices effectively and create emotional resonance.`,
                article: `Write a well-researched informative article in English about: ${topic}. Include facts, analysis, and balanced perspective.`,
                letter: `Write a professionally formatted formal letter in English about: ${topic}. Include proper salutation, body paragraphs, and closing.`,
                speech: `Write a compelling, persuasive speech in English about: ${topic}. Include a strong opening, supporting points, and powerful conclusion.`,
                review: `Write a thorough, balanced review in English about: ${topic}. Include pros, cons, and objective assessment.`,
            };

            const response = await askGPT(prompts[type], `You are a professional writer and content creator with expertise in ${type} writing. Create compelling, well-structured, and polished content that engages readers. Maintain a professional tone appropriate for the context. Always write in English with proper grammar and formatting.`);

            if (!response) {
                return sock.sendMessage(chat, { text: '❌ *Failed*', edit: statusMsg.key });
            }

            await sock.sendMessage(chat, {
                text: `✍️ *${type.charAt(0).toUpperCase() + type.slice(1)}*\n\n${response.slice(0, 3800)}\n\n───────────────────\n_*Vesperr* ⋆ Writer_\n📢 Support: t.me/+pn5QxWDGcQY2NmRk`,
                edit: statusMsg.key,
            });

        } catch (error) {
            console.error('Write error:', error);
            await sock.sendMessage(chat, { text: '❌ *Failed*', edit: statusMsg.key });
        }
    },
};

export const aiToolsCommands = [
    imagine,
    gpt,
    code,
    summarize,
    voice,
    write,
];

export default aiToolsCommands;

export { generateImage, askGPT, generateVoice };
