import fetch from 'node-fetch';

const CONFIG = {
    MAX_SIZE: 50 * 1024 * 1024,
    TIMEOUT: 30000,
};

const TIKTOK_REGEX = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/@?[\w.-]+\/video\/(\d+)|(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/[\w]+/i;

function isTikTokUrl(url) {
    return TIKTOK_REGEX.test(url);
}

async function downloadTikTok(url) {
    const apis = [

        async () => {
            const response = await fetch('https://api.cobalt.tools/api/json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ url, isNoTTWatermark: true }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.url) {
                return {
                    videoUrl: data.url,
                    audioUrl: data.audio,
                };
            }
            return null;
        },

        async () => {
            const response = await fetch('https://www.tikwm.com/api/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `url=${encodeURIComponent(url)}`,
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.code === 0 && data.data) {
                return {
                    videoUrl: data.data.play,
                    videoWM: data.data.wmplay,
                    audioUrl: data.data.music,
                    title: data.data.title,
                    author: data.data.author?.nickname || data.data.author?.unique_id,
                    authorId: data.data.author?.unique_id,
                    likes: data.data.digg_count,
                    comments: data.data.comment_count,
                    shares: data.data.share_count,
                    plays: data.data.play_count,
                    thumbnail: data.data.cover,
                    duration: data.data.duration,
                };
            }
            return null;
        },

        async () => {
            const response = await fetch(`https://api.tikdown.org/api/download?url=${encodeURIComponent(url)}`, {
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.status && data.video) {
                return {
                    videoUrl: data.video.noWatermark,
                    videoWM: data.video.watermark,
                    audioUrl: data.audio,
                    title: data.description,
                    author: data.author?.name,
                    authorId: data.author?.username,
                    thumbnail: data.thumbnail,
                };
            }
            return null;
        },

        async () => {
            const response = await fetch(`https://api.giftedtech.co.ke/api/download/tiktok?url=${encodeURIComponent(url)}`, {
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.status && data.result) {
                return {
                    videoUrl: data.result.nowm || data.result.video,
                    videoWM: data.result.wm,
                    audioUrl: data.result.audio,
                    title: data.result.title,
                    author: data.result.author,
                    thumbnail: data.result.thumbnail,
                };
            }
            return null;
        },

        async () => {
            const response = await fetch('https://ssstik.io/abc?url=dl', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://ssstik.io',
                },
                body: `id=${encodeURIComponent(url)}&locale=en&tt=cGJUZDFj`,
                timeout: CONFIG.TIMEOUT,
            });
            const html = await response.text();

            const noWatermarkMatch = html.match(/href="([^"]+)"[^>]*>Without watermark/);
            const withWatermarkMatch = html.match(/href="([^"]+)"[^>]*>With watermark/);
            const audioMatch = html.match(/href="([^"]+)"[^>]*>Music/);

            if (noWatermarkMatch) {
                return {
                    videoUrl: noWatermarkMatch[1],
                    videoWM: withWatermarkMatch?.[1],
                    audioUrl: audioMatch?.[1],
                };
            }
            return null;
        },

        async () => {
            const response = await fetch('https://snaptik.app/api/ajaxSearch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `q=${encodeURIComponent(url)}`,
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.data) {
                const videoMatch = data.data.match(/href="([^"]+\.mp4[^"]*)"/);
                if (videoMatch) {
                    return { videoUrl: videoMatch[1] };
                }
            }
            return null;
        },

        async () => {
            const response = await fetch(`https://tikdown.org/api/download?url=${encodeURIComponent(url)}`, {
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.video) {
                return {
                    videoUrl: data.video.noWatermark || data.video.url,
                    videoWM: data.video.watermark,
                    audioUrl: data.audio,
                };
            }
            return null;
        },

        async () => {
            const response = await fetch('https://tikmate.app/api/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.success && data.token) {
                return {
                    videoUrl: `https://tikmate.app/download/${data.token}.mp4`,
                    author: data.author,
                };
            }
            return null;
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result?.videoUrl) {
                console.log('TikTok API succeeded');
                return result;
            }
        } catch (e) {
            console.log('TikTok API failed:', e.message);
            continue;
        }
    }

    console.log('All 8 TikTok APIs failed');
    return null;
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

const tiktokPlugin = {
    name: 'tiktok',
    alias: ['tt', 'ttdl', 'tiktokdl', 'ttdownload'],
    category: 'download',
    desc: 'Download TikTok videos without watermark',
    usage: '.tiktok <url>',
    cooldown: 10000,
    react: '🎵',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `─── ✧ *TIKTOK* ✧ ───

*Download Video:*
⊹ \`.tiktok <url>\`

*Download Audio:*
⊹ \`.ttaudio <url>\`

*Example:*
\`.tiktok https://vt.tiktok.com/...\`

───────────────────
_*Vesperr* ⋆ TikTok_`,
            }, { quoted: msg });
        }

        const url = args[0];

        if (!isTikTokUrl(url)) {
            return sock.sendMessage(chat, {
                text: '❌ *Invalid TikTok URL!*\n\nPlease provide a valid TikTok link.',
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, {
            text: '⏳ *Fetching TikTok video...*',
        }, { quoted: msg });

        try {
            const data = await downloadTikTok(url);

            if (!data || !data.videoUrl) {
                return sock.sendMessage(chat, {
                    text: '❌ *Failed to fetch video*\n\nThe video may be private or unavailable.',
                    edit: statusMsg.key,
                });
            }

            await sock.sendMessage(chat, {
                text: '📥 *Downloading...*',
                edit: statusMsg.key,
            });

            const response = await fetch(data.videoUrl, { timeout: CONFIG.TIMEOUT });
            const videoBuffer = Buffer.from(await response.arrayBuffer());

            if (videoBuffer.length > CONFIG.MAX_SIZE) {
                return sock.sendMessage(chat, {
                    text: '❌ *Video too large!*\n\nMax size: 50MB',
                    edit: statusMsg.key,
                });
            }

            let caption = '🎵 *TikTok Video*\n\n';
            if (data.title) caption += `📝 ${data.title}\n`;
            if (data.author) caption += `👤 @${data.authorId || data.author}\n`;
            if (data.likes || data.plays) {
                caption += `\n❤️ ${formatNumber(data.likes)} | ▶️ ${formatNumber(data.plays)}`;
                if (data.comments) caption += ` | 💬 ${formatNumber(data.comments)}`;
                caption += '\n';
            }
            caption += `\n_*Vesperr* ⋆ TikTok_`;

            await sock.sendMessage(chat, {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('TikTok error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Download failed*\n\nTry again or use a different link.',
                edit: statusMsg.key,
            });
        }
    },
};

export const ttaudio = {
    name: 'ttaudio',
    alias: ['tta', 'tiktokaudio', 'ttmusic', 'ttsound'],
    category: 'download',
    desc: 'Download TikTok audio/music',
    usage: '.ttaudio <url>',
    cooldown: 10000,
    react: '🎶',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: '❓ *Usage:* `.ttaudio <tiktok url>`',
            }, { quoted: msg });
        }

        const url = args[0];

        if (!isTikTokUrl(url)) {
            return sock.sendMessage(chat, {
                text: '❌ *Invalid TikTok URL!*',
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, {
            text: '⏳ *Fetching audio...*',
        }, { quoted: msg });

        try {
            const data = await downloadTikTok(url);

            if (!data || !data.audioUrl) {
                return sock.sendMessage(chat, {
                    text: '❌ *Audio not available*\n\nTry downloading the video instead.',
                    edit: statusMsg.key,
                });
            }

            const response = await fetch(data.audioUrl, { timeout: CONFIG.TIMEOUT });
            const audioBuffer = Buffer.from(await response.arrayBuffer());

            await sock.sendMessage(chat, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: false,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('TT Audio error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to download audio*',
                edit: statusMsg.key,
            });
        }
    },
};

export const ttwm = {
    name: 'ttwm',
    alias: ['tiktoknowm', 'ttwatermark'],
    category: 'download',
    desc: 'Download TikTok with watermark',
    usage: '.ttwm <url>',
    cooldown: 10000,
    react: '🎵',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: '❓ *Usage:* `.ttwm <tiktok url>`',
            }, { quoted: msg });
        }

        const url = args[0];

        if (!isTikTokUrl(url)) {
            return sock.sendMessage(chat, {
                text: '❌ *Invalid TikTok URL!*',
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, {
            text: '⏳ *Downloading with watermark...*',
        }, { quoted: msg });

        try {
            const data = await downloadTikTok(url);
            const videoUrl = data?.videoWM || data?.videoUrl;

            if (!videoUrl) {
                return sock.sendMessage(chat, {
                    text: '❌ *Failed to fetch video*',
                    edit: statusMsg.key,
                });
            }

            const response = await fetch(videoUrl, { timeout: CONFIG.TIMEOUT });
            const videoBuffer = Buffer.from(await response.arrayBuffer());

            await sock.sendMessage(chat, {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption: '🎵 *TikTok (with watermark)*\n\n_*Vesperr* ⋆ TikTok_',
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('TT WM error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Download failed*',
                edit: statusMsg.key,
            });
        }
    },
};

export default [tiktokPlugin, ttaudio, ttwm];
