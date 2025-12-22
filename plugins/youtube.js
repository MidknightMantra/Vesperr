import fetch from 'node-fetch';
import ytdl from 'ytdl-core';
import ytSearch from 'yt-search';
import { templates } from '../utils/deluxeUI.js';

async function getAudioFromAPIs(videoId, query = null) {
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Ordered by reliability/speed
    const sources = [
        // Source 1: Izumi (User choice - query based if available)
        async () => {
            if (!query) return null;
            const res = await fetch(`https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`, { timeout: 15000 });
            const data = await res.json();
            return data.result?.download || data.result?.url || null;
        },
        // Source 2: Okatsu (User choice)
        async () => {
            const res = await fetch(`https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(ytUrl)}`, { timeout: 15000 });
            const data = await res.json();
            return data.dl || data.result?.download || null;
        },
        // Source 3: Cobalt (Reliable backup)
        async () => {
            const res = await fetch('https://api.cobalt.tools/api/json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ url: ytUrl, aFormat: 'mp3', isAudioOnly: true }),
                timeout: 15000
            });
            const data = await res.json();
            return data.url || null;
        },
        // Source 4: Gifted (Reliable backup)
        async () => {
            const res = await fetch(`https://api.giftedtech.co.ke/api/download/ytmp3?url=${encodeURIComponent(ytUrl)}&apikey=gifted`, { timeout: 15000 });
            const data = await res.json();
            return data.result?.download_url || data.result?.url || null;
        }
    ];

    for (const source of sources) {
        try {
            const url = await source();
            if (url) return url;
        } catch (e) {
            continue;
        }
    }
    return null;
}

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
                text: templates.card('Vesperr Media', {
                    'Fetch & Download': `${prefix}yt <url>`,
                    'Search & Fetch': `${prefix}yt <query>`,
                    'Note': 'Supports Shorts and Videos'
                }, { icon: '🎬', footer: 'Vesperr Media Engine' })
            }, { quoted: msg });
        }

        const query = args.join(' ');
        let videoId = extractVideoId(query);

        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('Status', videoId ? 'Fetching video...' : 'Searching...', 'info'),
        }, { quoted: msg });

        try {

            if (!videoId) {
                const results = await searchYouTube(query, 1);

                if (results.length === 0) {
                    return sock.sendMessage(chat, {
                        text: templates.notification('Vesperr Search', 'No results found!', 'error'),
                        edit: statusMsg.key,
                    });
                }

                videoId = results[0].id;
            }

            const info = await getVideoInfo(videoId);

            if (!info) {
                return sock.sendMessage(chat, {
                    text: templates.notification('Vesperr Error', 'Failed to get video info', 'error'),
                    edit: statusMsg.key,
                });
            }

            if (info.duration > CONFIG.MAX_DURATION) {
                return sock.sendMessage(chat, {
                    text: templates.notification('Vesperr Restriction', `Video too long! Max: ${CONFIG.MAX_DURATION / 60}m`, 'warning'),
                    edit: statusMsg.key,
                });
            }

            await sock.sendMessage(chat, {
                text: templates.notification('Status', `Downloading: ${info.title.slice(0, 30)}...`, 'update'),
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
                caption: templates.card('DOWNLOAD COMPLETE', {
                    'Title': info.title,
                    'Author': info.author,
                    'Duration': formatDuration(info.duration),
                    'Views': formatViews(info.views)
                }, { icon: '🎬', footer: 'Vesperr Media Engine' }),
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('YouTube error:', error);
            await sock.sendMessage(chat, {
                text: templates.notification('Vesperr Error', 'Download failed', 'error'),
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

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.card('Vesperr Music', {
                    'Search & Download': `${prefix}play <song>`,
                    'Fetch & Download': `${prefix}song <url>`,
                    'Pro Tip': 'Artist name improves results'
                }, { icon: '🎵', footer: 'Vesperr Power Engine' }),
            }, { quoted: msg });
        }

        const query = args.join(' ').trim();
        const isUrl = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)/.test(query);

        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('Status', 'Searching for matching song...', 'info'),
        }, { quoted: msg });

        try {
            let video;
            if (isUrl) {
                await sock.sendMessage(chat, {
                    text: templates.notification('Status', 'Extracting link data...', 'update'),
                    edit: statusMsg.key
                });
                video = { url: query, title: 'YouTube Audio' };
            } else {
                const search = await ytSearch(query);
                if (!search || !search.videos.length) {
                    return sock.sendMessage(chat, {
                        text: templates.notification('Search', 'No results found!', 'error'),
                        edit: statusMsg.key
                    });
                }
                video = search.videos[0];
            }

            await sock.sendMessage(chat, {
                text: templates.notification('Status', `Found: ${video.title.slice(0, 30)}...`, 'success'),
                edit: statusMsg.key
            });

            await sock.sendMessage(chat, {
                text: templates.notification('Status', 'Downloading audio data...', 'update'),
                edit: statusMsg.key
            });

            const downloadUrl = await getAudioFromAPIs(video.videoId || video.id, video.title);

            if (!downloadUrl) {
                throw new Error('All download sources failed. Try again with a different song name.');
            }

            await sock.sendMessage(chat, {
                text: templates.notification('Status', 'Finalizing MP3 encoding...', 'update'),
                edit: statusMsg.key
            });

            const finalTitle = video.title || 'Vesperr Audio';
            const caption = templates.card('Vesperr Music', {
                'Title': finalTitle.slice(0, 40),
                'Artist': video.author?.name || 'YouTube',
                'Format': 'MP3 High Quality',
                'Status': 'Success'
            }, { icon: '🎶', footer: 'Vesperr Power Engine' });

            await sock.sendMessage(chat, {
                audio: { url: downloadUrl },
                mimetype: 'audio/mpeg',
                fileName: `${finalTitle}.mp3`,
                ptt: false,
                caption: caption
            }, { quoted: msg });

            await sock.sendMessage(chat, {
                text: templates.notification('Vesperr', 'Song sent successfully!', 'success'),
                edit: statusMsg.key
            });

        } catch (error) {
            console.error('Vesperr Song Error:', error);
            await sock.sendMessage(chat, {
                text: templates.notification('Vesperr Error', error.message || 'Processing failed', 'error'),
                edit: statusMsg.key
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
                text: templates.notification('Usage', `\`${prefix}ytsearch <query>\``, 'info'),
            }, { quoted: msg });
        }

        const query = args.join(' ');

        try {
            const results = await searchYouTube(query, 5);

            if (results.length === 0) {
                return sock.sendMessage(chat, {
                    text: templates.notification('Vesperr Search', 'No results found!', 'error'),
                }, { quoted: msg });
            }

            const searchItems = {};
            results.forEach((v, i) => {
                searchItems[`${i + 1}. ${v.title.slice(0, 30)}...`] = `${v.duration} | ${v.author}`;
            });

            const text = templates.card('Vesperr Search', searchItems, {
                icon: '🔍',
                footer: `Use ${prefix}yt <url> to download`
            });

            await sock.sendMessage(chat, { text }, { quoted: msg });

        } catch (error) {
            console.error('YT Search error:', error);
            await sock.sendMessage(chat, {
                text: templates.notification('Vesperr Error', 'Search failed', 'error'),
            }, { quoted: msg });
        }
    },
};

export default [youtubePlugin, ytmp3, ytsearch];
