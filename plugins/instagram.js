import fetch from 'node-fetch';

const CONFIG = {
    MAX_SIZE: 100 * 1024 * 1024,
    TIMEOUT: 30000,
};

const IG_PATTERNS = {
    post: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/p\/([a-zA-Z0-9_-]+)/,
    reel: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels)\/([a-zA-Z0-9_-]+)/,
    story: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\/([^\/]+)\/(\d+)/,
    profile: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)\/?$/,
};

function parseInstagramUrl(url) {
    for (const [type, pattern] of Object.entries(IG_PATTERNS)) {
        const match = url.match(pattern);
        if (match) {
            return {
                type,
                id: match[1],
                extra: match[2],
            };
        }
    }
    return null;
}

async function downloadInstagram(url) {
    const apis = [

        async () => {
            const response = await fetch('https://api.cobalt.tools/api/json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.url) {
                return {
                    type: data.url.includes('.mp4') ? 'video' : 'image',
                    url: data.url,
                };
            }
            if (data.picker) {

                const first = data.picker[0];
                return {
                    type: first.type || 'image',
                    url: first.url,
                    urls: data.picker.map(p => p.url),
                };
            }
            return null;
        },

        async () => {
            const response = await fetch('https://snapinsta.io/api/ajaxSearch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                body: `q=${encodeURIComponent(url)}`,
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.data) {

                const videoMatch = data.data.match(/href="([^"]*\.mp4[^"]*)"/);
                const imageMatch = data.data.match(/href="([^"]*\.(?:jpg|jpeg|png)[^"]*)"/i);

                if (videoMatch || imageMatch) {
                    return {
                        type: videoMatch ? 'video' : 'image',
                        url: videoMatch?.[1] || imageMatch?.[1],
                    };
                }
            }
            return null;
        },

        async () => {
            const response = await fetch(`https://api.giftedtech.co.ke/api/download/igdl?url=${encodeURIComponent(url)}`, {
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.status && data.result) {
                const result = data.result;
                if (Array.isArray(result) && result.length > 0) {
                    return {
                        type: result[0].type || 'video',
                        url: result[0].url,
                        urls: result.map(r => r.url),
                    };
                }
                return {
                    type: result.type || 'video',
                    url: result.url || result.video || result.image,
                };
            }
            return null;
        },

        async () => {
            const response = await fetch('https://instafinsta.com/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.media && data.media.length > 0) {
                const media = data.media[0];
                return {
                    type: media.type === 'video' ? 'video' : 'image',
                    url: media.url,
                    urls: data.media.map(m => m.url),
                };
            }
            return null;
        },

        async () => {
            const response = await fetch(`https://fastdl.app/api/media?url=${encodeURIComponent(url)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.result && data.result.length > 0) {
                const first = data.result[0];
                return { type: first.type || 'video', url: first.url, urls: data.result.map(r => r.url) };
            }
            return null;
        },

        async () => {
            const response = await fetch('https://saveig.app/api/ajaxSearch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `q=${encodeURIComponent(url)}&t=media&lang=en`,
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.status === 'ok' && data.data) {
                const videoMatch = data.data.match(/href="([^"]+\.mp4[^"]*)"/);
                const imageMatch = data.data.match(/href="([^"]+\.jpg[^"]*)"/);
                if (videoMatch || imageMatch) {
                    return { type: videoMatch ? 'video' : 'image', url: videoMatch?.[1] || imageMatch?.[1] };
                }
            }
            return null;
        },

        async () => {
            const response = await fetch('https://igram.world/api/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.result && data.result.length > 0) {
                const first = data.result[0];
                return { type: first.type || 'video', url: first.url };
            }
            return null;
        },

        async () => {
            const response = await fetch(`https://rapidsave.com/api/get?url=${encodeURIComponent(url)}`, {
                timeout: CONFIG.TIMEOUT,
            });
            const data = await response.json();

            if (data.media) {
                const media = data.media[0];
                return { type: media.type || 'video', url: media.url };
            }
            return null;
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result?.url) {
                console.log('Instagram API succeeded');
                return result;
            }
        } catch (e) {
            console.log('Instagram API failed:', e.message);
            continue;
        }
    }

    console.log('All 8 Instagram APIs failed');
    return null;
}

const instagramPlugin = {
    name: 'instagram',
    alias: ['ig', 'igdl', 'insta', 'instadl'],
    category: 'download',
    desc: 'Download Instagram posts, reels & stories',
    usage: '.instagram <url>',
    cooldown: 10000,
    react: '📸',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `─── ✧ *INSTAGRAM* ✧ ───

*Download Content:*
⊹ \`.ig <post url>\`
⊹ \`.ig <reel url>\`
⊹ \`.ig <story url>\`

*Specific Commands:*
⊹ \`.igreel <url>\` - Reels
⊹ \`.igstory <username>\` - Stories

*Examples:*
\`.ig https://instagram.com/p/...\`
\`.ig https://instagram.com/reel/...\`

───────────────────
_*Vesperr* ⋆ Instagram_`,
            }, { quoted: msg });
        }

        const url = args.join(' ');
        const parsed = parseInstagramUrl(url);

        if (!parsed) {
            return sock.sendMessage(chat, {
                text: '❌ *Invalid Instagram URL!*\n\nSupported:\n• Posts\n• Reels\n• Stories',
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, {
            text: `⏳ *Fetching ${parsed.type}...*`,
        }, { quoted: msg });

        try {
            const data = await downloadInstagram(url);

            if (!data || !data.url) {
                return sock.sendMessage(chat, {
                    text: '❌ *Failed to fetch content*\n\nThe post may be private or unavailable.',
                    edit: statusMsg.key,
                });
            }

            await sock.sendMessage(chat, {
                text: '📥 *Downloading...*',
                edit: statusMsg.key,
            });

            const response = await fetch(data.url, { timeout: CONFIG.TIMEOUT });
            const buffer = Buffer.from(await response.arrayBuffer());

            if (buffer.length > CONFIG.MAX_SIZE) {
                return sock.sendMessage(chat, {
                    text: '❌ *File too large!*',
                    edit: statusMsg.key,
                });
            }

            const caption = `📸 *Instagram ${parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1)}*${data.caption ? `\n\n${data.caption.slice(0, 500)}` : ''}\n\n_*Vesperr* ⋆ Instagram_`;

            if (data.type === 'video') {
                await sock.sendMessage(chat, {
                    video: buffer,
                    mimetype: 'video/mp4',
                    caption,
                }, { quoted: msg });
            } else {
                await sock.sendMessage(chat, {
                    image: buffer,
                    caption,
                }, { quoted: msg });
            }

            if (data.urls && data.urls.length > 1) {
                for (let i = 1; i < Math.min(data.urls.length, 10); i++) {
                    try {
                        const res = await fetch(data.urls[i], { timeout: CONFIG.TIMEOUT });
                        const buf = Buffer.from(await res.arrayBuffer());

                        const isVideo = data.urls[i].includes('.mp4');

                        await sock.sendMessage(chat, {
                            [isVideo ? 'video' : 'image']: buf,
                            caption: `📸 *${i + 1}/${data.urls.length}*`,
                        }, { quoted: msg });
                    } catch (e) {
                        continue;
                    }
                }
            }

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('Instagram error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Download failed*\n\nTry again or use a different link.',
                edit: statusMsg.key,
            });
        }
    },
};

export const igreel = {
    name: 'igreel',
    alias: ['reel', 'reels', 'instareel'],
    category: 'download',
    desc: 'Download Instagram reels',
    usage: '.igreel <url>',
    cooldown: 10000,
    react: '🎬',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: '❓ *Usage:* `.igreel <instagram reel url>`',
            }, { quoted: msg });
        }

        const url = args[0];
        const parsed = parseInstagramUrl(url);

        if (!parsed || (parsed.type !== 'reel' && parsed.type !== 'post')) {
            return sock.sendMessage(chat, {
                text: '❌ *Invalid Reel URL!*\n\nExample: `https://instagram.com/reel/...`',
            }, { quoted: msg });
        }

        const statusMsg = await sock.sendMessage(chat, {
            text: '⏳ *Fetching reel...*',
        }, { quoted: msg });

        try {
            const data = await downloadInstagram(url);

            if (!data?.url) {
                return sock.sendMessage(chat, {
                    text: '❌ *Failed to fetch reel*',
                    edit: statusMsg.key,
                });
            }

            const response = await fetch(data.url, { timeout: CONFIG.TIMEOUT });
            const buffer = Buffer.from(await response.arrayBuffer());

            await sock.sendMessage(chat, {
                video: buffer,
                mimetype: 'video/mp4',
                caption: `🎬 *Instagram Reel*${data.caption ? `\n\n${data.caption.slice(0, 300)}` : ''}\n\n_*Vesperr* ⋆ Instagram_`,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('IG Reel error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Download failed*',
                edit: statusMsg.key,
            });
        }
    },
};

export const igprofile = {
    name: 'igprofile',
    alias: ['igpp', 'igpfp', 'instapfp', 'igdp'],
    category: 'download',
    desc: 'Download Instagram profile picture',
    usage: '.igprofile <username>',
    cooldown: 5000,
    react: '👤',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: '❓ *Usage:* `.igprofile <username>`\n\nExample: `.igprofile instagram`',
            }, { quoted: msg });
        }

        let username = args[0].replace('@', '').replace('https://instagram.com/', '').replace('/', '');

        const statusMsg = await sock.sendMessage(chat, {
            text: `⏳ *Fetching @${username}'s profile...*`,
        }, { quoted: msg });

        try {

            let profilePicUrl = null;

            try {
                const response = await fetch(`https://igram.io/api/ig/userInfoByUsername/${username}`, {
                    timeout: CONFIG.TIMEOUT,
                });
                const data = await response.json();
                profilePicUrl = data?.user?.profile_pic_url_hd || data?.user?.profile_pic_url;
            } catch (e) { }

            if (!profilePicUrl) {
                try {
                    const response = await fetch(`https://api.giftedtech.co.ke/api/download/instadp?apikey=gifted&username=${username}`, {
                        timeout: CONFIG.TIMEOUT,
                    });
                    const data = await response.json();
                    profilePicUrl = data?.result?.hd || data?.result?.url;
                } catch (e) { }
            }

            if (!profilePicUrl) {
                return sock.sendMessage(chat, {
                    text: '❌ *Profile not found*\n\nCheck the username and try again.',
                    edit: statusMsg.key,
                });
            }

            const response = await fetch(profilePicUrl, { timeout: CONFIG.TIMEOUT });
            const buffer = Buffer.from(await response.arrayBuffer());

            await sock.sendMessage(chat, {
                image: buffer,
                caption: `👤 *@${username}*\n\n_*Vesperr* ⋆ Instagram_`,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('IG Profile error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to fetch profile picture*',
                edit: statusMsg.key,
            });
        }
    },
};

export default [instagramPlugin, igreel, igprofile];
