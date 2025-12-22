import fetch from 'node-fetch';
import ytdl from 'ytdl-core';
import ytSearch from 'yt-search';

const CONFIG = {
    MAX_VIDEO_SIZE: 100 * 1024 * 1024,
    MAX_AUDIO_SIZE: 50 * 1024 * 1024,
    MAX_DURATION: 600,
    TIMEOUT: 60000,
};

const YT_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function extractVideoId(url) {
    const match = url.match(YT_REGEX);
    return match ? match[1] : null;
}

async function searchYouTube(query, limit = 5) {
    try {
        const results = await ytSearch(query);
        return results.videos.slice(0, limit).map(v => ({
            id: v.videoId,
            title: v.title,
            duration: v.duration.timestamp,
            durationSec: v.duration.seconds,
            views: v.views,
            author: v.author.name,
            url: v.url,
            thumbnail: v.thumbnail,
        }));
    } catch (error) {
        console.error('YT Search error:', error);
        return [];
    }
}

async function getVideoInfo(videoId) {

    try {
        const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);

        return {
            id: videoId,
            title: info.videoDetails.title,
            description: info.videoDetails.shortDescription,
            duration: parseInt(info.videoDetails.lengthSeconds),
            views: info.videoDetails.viewCount,
            author: info.videoDetails.author.name,
            thumbnail: info.videoDetails.thumbnails.pop()?.url,
            formats: info.formats,
        };
    } catch (error) {
        console.log('ytdl getInfo failed, trying fallback:', error.message);
    }

    try {
        const results = await ytSearch({ videoId });
        if (results) {
            return {
                id: videoId,
                title: results.title || 'Unknown Title',
                description: results.description || '',
                duration: results.duration?.seconds || 0,
                views: results.views || 0,
                author: results.author?.name || 'Unknown',
                thumbnail: results.thumbnail || null,
                formats: [],
            };
        }
    } catch (e) {
        console.log('yt-search fallback failed:', e.message);
    }

    return {
        id: videoId,
        title: 'YouTube Video',
        description: '',
        duration: 0,
        views: 0,
        author: 'Unknown',
        thumbnail: null,
        formats: [],
    };
}

async function downloadFromAPI(videoId, type = 'video') {
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const apis = [

        async () => {
            const res = await fetch('https://api.cobalt.tools/api/json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    url: ytUrl,
                    aFormat: 'mp3',
                    isAudioOnly: type === 'audio',
                    vQuality: '720'
                }),
                timeout: 15000,
            });
            const data = await res.json();
            return data.url || null;
        },

        async () => {
            const endpoint = type === 'audio' ? 'ytmp3' : 'ytmp4';
            const res = await fetch(`https://api.giftedtech.co.ke/api/download/${endpoint}?url=${encodeURIComponent(ytUrl)}&apikey=gifted`, { timeout: 15000 });
            const data = await res.json();
            return data.result?.download_url || data.result?.url || null;
        },

        async () => {
            if (type !== 'audio') return null;

            const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
            const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

            const res = await fetch(`https://api-dark-shan-yt.koyeb.app/download/ytmp3?url=${encodeURIComponent(ytUrl)}&apikey=${_0xkey}`, { timeout: 15000 });
            const data = await res.json();
            return data.result?.download_url || data.download_url || data.url || null;
        },

        async () => {
            const res = await fetch(`https://api.vevioz.com/@api/json/${type === 'audio' ? 'mp3' : 'mp4'}/${videoId}`, { timeout: 15000 });
            const data = await res.json();
            return data.link || null;
        },

        async () => {
            const res = await fetch('https://d-backend-sigma.vercel.app/api/yt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: ytUrl }),
                timeout: 15000
            });
            const data = await res.json();
            if (type === 'audio') return data.mp3;
            return data.mp4;
        },

        async () => {

            return null;
        }
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result) {

                return result;
            }
        } catch (e) {
            continue;
        }
    }

    return null;
}

function formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatViews(views) {
    const num = parseInt(views);
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

const youtubePlugin = {
    name: 'youtube',
    alias: ['yt', 'ytdl', 'ytvideo', 'ytv'],
    category: 'download',
    desc: 'Download YouTube videos',
    usage: '.youtube <url or search query>',
    cooldown: 10000,
    react: '📺',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `─── ✧ *YOUTUBE* ✧ ───

*Download Video:*
⊹ \`.yt <url>\`
⊹ \`.yt <search query>\`

*Download Audio:*
⊹ \`.ytmp3 <url>\`
⊹ \`.play <song name>\`

*Examples:*
\`.yt never gonna give you up\`
\`.yt https://youtu.be/dQw4w9WgXcQ\`

───────────────────
_*Vesperr* ⋆ YouTube_`,
            }, { quoted: msg });
        }

        const query = args.join(' ');
        let videoId = extractVideoId(query);

        const statusMsg = await sock.sendMessage(chat, {
            text: videoId ? '⏳ *Fetching video...*' : '🔍 *Searching...*',
        }, { quoted: msg });

        try {

            if (!videoId) {
                const results = await searchYouTube(query, 1);

                if (results.length === 0) {
                    return sock.sendMessage(chat, {
                        text: '❌ *No results found!*',
                        edit: statusMsg.key,
                    });
                }

                videoId = results[0].id;
            }

            const info = await getVideoInfo(videoId);

            if (!info) {
                return sock.sendMessage(chat, {
                    text: '❌ *Failed to get video info*',
                    edit: statusMsg.key,
                });
            }

            if (info.duration > CONFIG.MAX_DURATION) {
                return sock.sendMessage(chat, {
                    text: `❌ *Video too long!*\n\nMax duration: ${CONFIG.MAX_DURATION / 60} minutes\nVideo duration: ${formatDuration(info.duration)}`,
                    edit: statusMsg.key,
                });
            }

            await sock.sendMessage(chat, {
                text: `📺 *Downloading...*\n\n*${info.title}*\n⏱️ ${formatDuration(info.duration)} | 👁️ ${formatViews(info.views)}`,
                edit: statusMsg.key,
            });

            let videoBuffer;

            try {

                const downloadUrl = await downloadFromAPI(videoId, 'video');

                if (downloadUrl) {
                    const response = await fetch(downloadUrl, { timeout: CONFIG.TIMEOUT });
                    videoBuffer = Buffer.from(await response.arrayBuffer());
                }
            } catch (e) {
                console.error('Download error:', e);
            }

            if (!videoBuffer || videoBuffer.length < 1000) {
                return sock.sendMessage(chat, {
                    text: '❌ *Download failed*\n\nVideo may be restricted or unavailable.',
                    edit: statusMsg.key,
                });
            }

            await sock.sendMessage(chat, {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption: `🎬 *${info.title}*\n\n👤 ${info.author}\n⏱️ ${formatDuration(info.duration)}\n👁️ ${formatViews(info.views)} views\n\n_*Vesperr* ⋆ YouTube_`,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('YouTube error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to download*\n\nTry a different video or check the URL.',
                edit: statusMsg.key,
            });
        }
    },
};

export const ytmp3 = {
    name: 'ytmp3',
    alias: ['yta', 'ytaudio', 'play', 'song'],
    category: 'download',
    desc: 'Download YouTube audio (MP3)',
    usage: '.ytmp3 <url or search query>',
    cooldown: 10000,
    react: '🎵',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `─── ✧ *YOUTUBE MP3* ✧ ───

*Usage:*
⊹ \`.ytmp3 <url>\`
⊹ \`.play <song name>\`

*Examples:*
\`.play shape of you\`
\`.ytmp3 https://youtu.be/...\`

───────────────────
_*Vesperr* ⋆ YouTube_`,
            }, { quoted: msg });
        }

        const query = args.join(' ');
        let videoId = extractVideoId(query);

        const statusMsg = await sock.sendMessage(chat, {
            text: videoId ? '⏳ *Fetching audio...*' : '🔍 *Searching...*',
        }, { quoted: msg });

        try {
            if (!videoId) {
                const results = await searchYouTube(query, 1);

                if (results.length === 0) {
                    return sock.sendMessage(chat, {
                        text: '❌ *No results found!*',
                        edit: statusMsg.key,
                    });
                }

                videoId = results[0].id;
            }

            const info = await getVideoInfo(videoId);

            if (!info) {
                return sock.sendMessage(chat, {
                    text: '❌ *Failed to get video info*',
                    edit: statusMsg.key,
                });
            }

            if (info.duration > CONFIG.MAX_DURATION) {
                return sock.sendMessage(chat, {
                    text: `❌ *Audio too long!*\n\nMax: ${CONFIG.MAX_DURATION / 60} min`,
                    edit: statusMsg.key,
                });
            }

            await sock.sendMessage(chat, {
                text: `🎵 *Downloading...*\n\n*${info.title}*`,
                edit: statusMsg.key,
            });

            let audioBuffer;

            try {

                const downloadUrl = await downloadFromAPI(videoId, 'audio');

                if (downloadUrl) {
                    const response = await fetch(downloadUrl, { timeout: CONFIG.TIMEOUT });
                    audioBuffer = Buffer.from(await response.arrayBuffer());
                }
            } catch (e) {
                console.error('Audio download error:', e);
            }

            if (!audioBuffer || audioBuffer.length < 1000) {
                return sock.sendMessage(chat, {
                    text: '❌ *Download failed*',
                    edit: statusMsg.key,
                });
            }

            await sock.sendMessage(chat, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${info.title}.mp3`,
                ptt: false,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('YTMP3 error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to download audio*',
                edit: statusMsg.key,
            });
        }
    },
};

export const ytsearch = {
    name: 'ytsearch',
    alias: ['yts', 'youtubesearch'],
    category: 'search',
    desc: 'Search YouTube videos',
    usage: '.ytsearch <query>',
    cooldown: 5000,
    react: '🔍',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `❓ *Usage:* \`${prefix}ytsearch <query>\``,
            }, { quoted: msg });
        }

        const query = args.join(' ');

        try {
            const results = await searchYouTube(query, 5);

            if (results.length === 0) {
                return sock.sendMessage(chat, {
                    text: '❌ *No results found!*',
                }, { quoted: msg });
            }

            let text = `─── ✧ *YOUTUBE SEARCH* ✧ ───\n\n🔍 *"${query}"*\n\n`;

            results.forEach((v, i) => {
                text += `*${i + 1}.* ${v.title}\n`;
                text += `   ⏱️ ${v.duration} | 👁️ ${formatViews(v.views)}\n`;
                text += `   👤 ${v.author}\n`;
                text += `   🔗 ${v.url}\n\n`;
            });

            text += `───────────────────\n_Use \`${prefix}yt <url>\` to download_`;

            await sock.sendMessage(chat, { text }, { quoted: msg });

        } catch (error) {
            console.error('YT Search error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Search failed*',
            }, { quoted: msg });
        }
    },
};

export default [youtubePlugin, ytmp3, ytsearch];
