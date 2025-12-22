import fetch from 'node-fetch';

const CONFIG = {
    TIMEOUT: 30000,
    MAX_SIZE: 100 * 1024 * 1024,
};

const SPOTIFY_REGEX = /(?:https?:\/\/)?(?:open\.)?spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;

async function downloadSpotify(url) {
    const apis = [

        async () => {
            const res = await fetch(`https://api.fabdl.com/spotify/get?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.result) {
                const dlRes = await fetch(`https://api.fabdl.com/spotify/mp3-convert-task/${data.result.gid}/${data.result.id}`, { timeout: CONFIG.TIMEOUT });
                const dlData = await dlRes.json();
                if (dlData.result?.download_url) {
                    return { title: data.result.name, artist: data.result.artists, thumbnail: data.result.image, downloadUrl: dlData.result.download_url };
                }
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://api.giftedtech.co.ke/api/download/spotify?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.status && data.result) {
                return { title: data.result.title, artist: data.result.artist, thumbnail: data.result.thumbnail, downloadUrl: data.result.url || data.result.download };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://spotifyapi.caliphdev.com/api/dl/spotify?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.success && data.result) {
                return { title: data.result.title, artist: data.result.artist, thumbnail: data.result.thumbnail, downloadUrl: data.result.download };
            }
            return null;
        },

        async () => {
            const res = await fetch('https://spotifydown.com/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.link) {
                return { title: data.title, artist: data.artist, downloadUrl: data.link };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://api.spotiflyer.ml/download?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.url) {
                return { title: data.title, artist: data.artist, thumbnail: data.cover, downloadUrl: data.url };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://spotdl.com/api/dl?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.download) {
                return { title: data.name, artist: data.artist, downloadUrl: data.download };
            }
            return null;
        },

        async () => {
            const res = await fetch('https://spotifymate.com/api/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.success && data.download_link) {
                return { title: data.title, artist: data.artist, thumbnail: data.cover, downloadUrl: data.download_link };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://spotysave.com/api/download?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.url) {
                return { title: data.title, artist: data.artist, downloadUrl: data.url };
            }
            return null;
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result?.downloadUrl) {
                console.log('Spotify API succeeded');
                return result;
            }
        } catch (e) {
            console.log('Spotify API failed:', e.message);
            continue;
        }
    }
    console.log('All 8 Spotify APIs failed');
    return null;
}

export const spotify = {
    name: 'spotify',
    alias: ['sp', 'spotifydl', 'spdl'],
    category: 'download',
    desc: 'Download Spotify tracks',
    usage: '.spotify <url or search>',
    cooldown: 10000,
    react: '🎵',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `─── ♫ *SPOTIFY* ♫ ───

⬇ *Download Spotify tracks*

◉ *Usage:*
  \`.spotify <track url>\`
  \`.spotify <song name>\`

◎ *Example:*
  \`.spotify Shape of You\`

───────────────────
_*Vesperr* ⋆ Downloads_`,
            }, { quoted: msg });
        }

        const input = args.join(' ');
        const isUrl = SPOTIFY_REGEX.test(input);

        const statusMsg = await sock.sendMessage(chat, {
            text: isUrl ? '◈ *Fetching track...*' : '◈ *Searching Spotify...*',
        }, { quoted: msg });

        try {
            let url = input;

            if (!isUrl) {
                const searchRes = await fetch(`https://api.fabdl.com/spotify/search?query=${encodeURIComponent(input)}`, { timeout: CONFIG.TIMEOUT });
                const searchData = await searchRes.json();

                if (!searchData.result?.[0]) {
                    return sock.sendMessage(chat, { text: '❌ *No results found*', edit: statusMsg.key });
                }

                url = `https://open.spotify.com/track/${searchData.result[0].id}`;
            }

            const data = await downloadSpotify(url);

            if (!data?.downloadUrl) {
                return sock.sendMessage(chat, { text: '❌ *Download failed*', edit: statusMsg.key });
            }

            await sock.sendMessage(chat, { text: '📥 *Downloading...*', edit: statusMsg.key });

            const audioRes = await fetch(data.downloadUrl, { timeout: CONFIG.TIMEOUT });
            const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

            await sock.sendMessage(chat, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${data.title} - ${data.artist}.mp3`,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('Spotify error:', error);
            await sock.sendMessage(chat, { text: '❌ *Download failed*', edit: statusMsg.key });
        }
    },
};

const FB_REGEX = /(?:https?:\/\/)?(?:www\.|m\.|web\.|mbasic\.)?(?:facebook\.com|fb\.watch|fb\.com)\/(?:watch\/?\?v=|[\w.-]+\/(?:videos|posts)\/|reel\/|share\/v\/)?(\d+|[\w.-]+)/i;

async function downloadFacebook(url) {
    const apis = [

        async () => {
            const res = await fetch(`https://api.giftedtech.co.ke/api/download/facebook?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.status && data.result) {
                return { title: data.result.title || 'Facebook Video', hdUrl: data.result.hd || data.result.HD, sdUrl: data.result.sd || data.result.url, thumbnail: data.result.thumbnail };
            }
            return null;
        },

        async () => {
            const res = await fetch('https://getmyfb.com/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `id=${encodeURIComponent(url)}`,
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.media) {
                return { title: data.title || 'Facebook Video', hdUrl: data.media.find(m => m.quality === 'hd')?.url, sdUrl: data.media.find(m => m.quality === 'sd')?.url };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://fb-video-reels.vercel.app/api/download?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.success) {
                return { title: data.title, hdUrl: data.hd, sdUrl: data.sd, thumbnail: data.thumbnail };
            }
            return null;
        },

        async () => {
            const res = await fetch('https://api.cobalt.tools/api/json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.url) {
                return { title: 'Facebook Video', sdUrl: data.url };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://fbdown.net/api/info?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.links) {
                return { title: data.title, hdUrl: data.links.hd, sdUrl: data.links.sd };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://api.savefrom.cc/api/fb?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.url) {
                return { title: 'Facebook Video', sdUrl: data.url };
            }
            return null;
        },

        async () => {
            const res = await fetch('https://fbdownloader.net/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.download) {
                return { title: data.title, hdUrl: data.download.hd, sdUrl: data.download.sd };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://fbsave.cc/api/download?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.video) {
                return { title: data.title, sdUrl: data.video };
            }
            return null;
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result && (result.hdUrl || result.sdUrl)) {
                console.log('Facebook API succeeded');
                return result;
            }
        } catch (e) {
            console.log('Facebook API failed:', e.message);
            continue;
        }
    }
    console.log('All 8 Facebook APIs failed');
    return null;
}

export const facebook = {
    name: 'facebook',
    alias: ['fb', 'fbdl', 'facebookdl'],
    category: 'download',
    desc: 'Download Facebook videos',
    usage: '.facebook <url>',
    cooldown: 10000,
    react: '📘',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0 || !FB_REGEX.test(args[0])) {
            return sock.sendMessage(chat, {
                text: '📘 *Facebook Downloader*\n\nUsage: `.fb <video url>`\n\nSupports: Videos, Reels, Watch',
            }, { quoted: msg });
        }

        const url = args[0];
        const statusMsg = await sock.sendMessage(chat, { text: '📘 *Fetching video...*' }, { quoted: msg });

        try {
            const data = await downloadFacebook(url);

            if (!data) {
                return sock.sendMessage(chat, { text: '❌ *Failed to fetch video*', edit: statusMsg.key });
            }

            const downloadUrl = data.hdUrl || data.sdUrl;
            const quality = data.hdUrl ? 'HD' : 'SD';

            await sock.sendMessage(chat, { text: `📥 *Downloading ${quality}...*`, edit: statusMsg.key });

            const videoRes = await fetch(downloadUrl, { timeout: CONFIG.TIMEOUT });
            const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

            await sock.sendMessage(chat, {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption: `📘 *${data.title || 'Facebook Video'}*\n\n_Quality: ${quality}_`,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('Facebook error:', error);
            await sock.sendMessage(chat, { text: '❌ *Download failed*', edit: statusMsg.key });
        }
    },
};

const TWITTER_REGEX = /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/i;

async function downloadTwitter(url) {
    const apis = [

        async () => {
            const res = await fetch(`https://api.giftedtech.co.ke/api/download/twitter?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.status && data.result) {
                return { text: data.result.text, author: data.result.author, url: data.result.url || data.result.video, videos: data.result.media?.filter(m => m.type === 'video') || [], images: data.result.media?.filter(m => m.type === 'photo') || [] };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://twitsave.com/info?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const html = await res.text();
            const videoMatch = html.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/);
            if (videoMatch) {
                return { url: videoMatch[1] };
            }
            return null;
        },

        async () => {
            const res = await fetch('https://api.cobalt.tools/api/json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.url) {
                return { url: data.url };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://twittervid.com/api/get?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.videos?.[0]) {
                return { url: data.videos[0].url };
            }
            return null;
        },

        async () => {
            const res = await fetch('https://savetweetvid.com/api/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.media?.[0]) {
                return { url: data.media[0].url };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://twtdl.cc/api/download?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.download) {
                return { url: data.download };
            }
            return null;
        },

        async () => {
            const res = await fetch('https://xdown.app/api/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.video) {
                return { url: data.video };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://twdown.net/api/download?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.url) {
                return { url: data.url };
            }
            return null;
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result?.url || result?.videos?.length || result?.images?.length) {
                console.log('Twitter API succeeded');
                return result;
            }
        } catch (e) {
            console.log('Twitter API failed:', e.message);
            continue;
        }
    }
    console.log('All 8 Twitter APIs failed');
    return null;
}

export const twitter = {
    name: 'twitter',
    alias: ['tw', 'tweet', 'x', 'xdl'],
    category: 'download',
    desc: 'Download Twitter/X videos',
    usage: '.twitter <url>',
    cooldown: 10000,
    react: '🐦',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0 || !TWITTER_REGEX.test(args[0])) {
            return sock.sendMessage(chat, {
                text: '🐦 *Twitter/X Downloader*\n\nUsage: `.twitter <tweet url>`\n\nExample:\n.twitter https://twitter.com/user/status/123...',
            }, { quoted: msg });
        }

        const url = args[0];
        const statusMsg = await sock.sendMessage(chat, { text: '🐦 *Fetching tweet...*' }, { quoted: msg });

        try {
            const data = await downloadTwitter(url);

            if (!data) {
                return sock.sendMessage(chat, { text: '❌ *Failed to fetch tweet*', edit: statusMsg.key });
            }

            if (data.url) {
                await sock.sendMessage(chat, { text: '📥 *Downloading...*', edit: statusMsg.key });

                const videoRes = await fetch(data.url, { timeout: CONFIG.TIMEOUT });
                const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

                const caption = `🐦 *Twitter Video*${data.author ? `\n👤 ${data.author}` : ''}${data.text ? `\n\n${data.text.slice(0, 300)}` : ''}`;

                await sock.sendMessage(chat, {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    caption,
                }, { quoted: msg });

                await sock.sendMessage(chat, { delete: statusMsg.key });
            }

            else if (data.videos?.length) {
                for (const video of data.videos.slice(0, 4)) {
                    const videoRes = await fetch(video.url, { timeout: CONFIG.TIMEOUT });
                    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
                    await sock.sendMessage(chat, { video: videoBuffer, mimetype: 'video/mp4' }, { quoted: msg });
                }
                await sock.sendMessage(chat, { delete: statusMsg.key });
            }

            else if (data.images?.length) {
                for (const img of data.images.slice(0, 4)) {
                    const imgRes = await fetch(img.url, { timeout: CONFIG.TIMEOUT });
                    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
                    await sock.sendMessage(chat, { image: imgBuffer }, { quoted: msg });
                }
                await sock.sendMessage(chat, { delete: statusMsg.key });
            } else {
                await sock.sendMessage(chat, { text: '❌ *No media found in tweet*', edit: statusMsg.key });
            }

        } catch (error) {
            console.error('Twitter error:', error);
            await sock.sendMessage(chat, { text: '❌ *Download failed*', edit: statusMsg.key });
        }
    },
};

const PINTEREST_REGEX = /(?:https?:\/\/)?(?:www\.|pin\.)?pinterest\.(?:com|it|fr|de|es|co\.uk|jp|kr)\/pin\/(\d+)/i;

async function downloadPinterest(url) {
    const apis = [

        async () => {
            const res = await fetch(`https://api.giftedtech.co.ke/api/download/pinterest?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.status && data.result) {
                return { title: data.result.title, imageUrl: data.result.image, videoUrl: data.result.video, type: data.result.video ? 'video' : 'image' };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://pinterestdownloader.io/api/v1/download?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.success) {
                return { title: data.title, imageUrl: data.image, videoUrl: data.video, type: data.video ? 'video' : 'image' };
            }
            return null;
        },

        async () => {
            const res = await fetch('https://api.cobalt.tools/api/json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.url) {
                return { imageUrl: data.url, type: 'image' };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://pindownload.com/api/download?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.media) {
                return { imageUrl: data.media.image, videoUrl: data.media.video, type: data.media.video ? 'video' : 'image' };
            }
            return null;
        },

        async () => {
            const res = await fetch('https://savepin.app/api/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                timeout: CONFIG.TIMEOUT,
            });
            const data = await res.json();
            if (data.download) {
                return { imageUrl: data.download.image, videoUrl: data.download.video, type: data.download.video ? 'video' : 'image' };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://pinterestvideo.com/api/info?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.url) {
                return { imageUrl: data.url, videoUrl: data.video, type: data.video ? 'video' : 'image' };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://www.expertsphp.com/pinterest-video-downloader.php?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const html = await res.text();
            const imgMatch = html.match(/https:\/\/i\.pinimg\.com\/originals\/[^"'\s]+/);
            if (imgMatch) {
                return { imageUrl: imgMatch[0], type: 'image' };
            }
            return null;
        },

        async () => {
            const res = await fetch(`https://pinsave.app/api/download?url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.success && data.download) {
                return { imageUrl: data.download, type: 'image' };
            }
            return null;
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result && (result.imageUrl || result.videoUrl)) {
                console.log('Pinterest API succeeded');
                return result;
            }
        } catch (e) {
            console.log('Pinterest API failed:', e.message);
            continue;
        }
    }
    console.log('All 8 Pinterest APIs failed');
    return null;
}

export const pinterest = {
    name: 'pinterest',
    alias: ['pin', 'pindl', 'pinterestdl'],
    category: 'download',
    desc: 'Download Pinterest images/videos',
    usage: '.pinterest <url>',
    cooldown: 5000,
    react: '📌',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: '📌 *Pinterest Downloader*\n\nUsage: `.pin <pin url>`\n\nExample:\n.pin https://pinterest.com/pin/123...',
            }, { quoted: msg });
        }

        const url = args[0];
        const statusMsg = await sock.sendMessage(chat, { text: '📌 *Fetching pin...*' }, { quoted: msg });

        try {
            const data = await downloadPinterest(url);

            if (!data) {
                return sock.sendMessage(chat, { text: '❌ *Failed to fetch pin*', edit: statusMsg.key });
            }

            const downloadUrl = data.videoUrl || data.imageUrl;
            const mediaRes = await fetch(downloadUrl, { timeout: CONFIG.TIMEOUT });
            const mediaBuffer = Buffer.from(await mediaRes.arrayBuffer());

            if (data.type === 'video') {
                await sock.sendMessage(chat, {
                    video: mediaBuffer,
                    mimetype: 'video/mp4',
                    caption: `📌 *Pinterest*${data.title ? `\n\n${data.title}` : ''}`,
                }, { quoted: msg });
            } else {
                await sock.sendMessage(chat, {
                    image: mediaBuffer,
                    caption: `📌 *Pinterest*${data.title ? `\n\n${data.title}` : ''}`,
                }, { quoted: msg });
            }

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('Pinterest error:', error);
            await sock.sendMessage(chat, { text: '❌ *Download failed*', edit: statusMsg.key });
        }
    },
};

const MEDIAFIRE_REGEX = /(?:https?:\/\/)?(?:www\.)?mediafire\.com\/(?:file|download)\/([a-zA-Z0-9]+)/i;

async function downloadMediafire(url) {
    const apis = [
        async () => {
            const res = await fetch(`https://api.giftedtech.co.ke/api/download/mediafire?apikey=gifted&url=${encodeURIComponent(url)}`, { timeout: CONFIG.TIMEOUT });
            const data = await res.json();
            if (data.status === 200 && data.result) {
                return {
                    filename: data.result.filename || data.result.name,
                    size: data.result.size,
                    downloadUrl: data.result.url || data.result.download,
                };
            }
            return null;
        },
        async () => {

            const pageRes = await fetch(url, { timeout: CONFIG.TIMEOUT });
            const html = await pageRes.text();

            const downloadMatch = html.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/);
            const filenameMatch = html.match(/class="filename">([^<]+)</);
            const sizeMatch = html.match(/class="filesize">([^<]+)</);

            if (downloadMatch) {
                return {
                    filename: filenameMatch?.[1] || 'file',
                    size: sizeMatch?.[1],
                    downloadUrl: downloadMatch[1],
                };
            }
            return null;
        },
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result?.downloadUrl) return result;
        } catch (e) { continue; }
    }
    return null;
}

export const mediafire = {
    name: 'mediafire',
    alias: ['mf', 'mfdl'],
    category: 'download',
    desc: 'Download MediaFire files',
    usage: '.mediafire <url>',
    cooldown: 10000,
    react: '📁',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0 || !MEDIAFIRE_REGEX.test(args[0])) {
            return sock.sendMessage(chat, {
                text: '📁 *MediaFire Downloader*\n\nUsage: `.mediafire <url>`\n\nExample:\n.mf https://mediafire.com/file/abc123',
            }, { quoted: msg });
        }

        const url = args[0];
        const statusMsg = await sock.sendMessage(chat, { text: '📁 *Fetching file info...*' }, { quoted: msg });

        try {
            const data = await downloadMediafire(url);

            if (!data?.downloadUrl) {
                return sock.sendMessage(chat, { text: '❌ *Failed to fetch file*', edit: statusMsg.key });
            }

            await sock.sendMessage(chat, {
                text: `📥 *Downloading...*\n\n📄 ${data.filename}\n💾 ${data.size || 'Unknown size'}`,
                edit: statusMsg.key
            });

            const fileRes = await fetch(data.downloadUrl, { timeout: 120000 });
            const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

            if (fileBuffer.length > CONFIG.MAX_SIZE) {
                return sock.sendMessage(chat, {
                    text: `❌ *File too large!*\n\nMax: 100MB\nFile: ${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB\n\n🔗 Direct link:\n${data.downloadUrl}`,
                    edit: statusMsg.key,
                });
            }

            await sock.sendMessage(chat, {
                document: fileBuffer,
                mimetype: 'application/octet-stream',
                fileName: data.filename,
                caption: `📁 *MediaFire*\n\n📄 ${data.filename}\n💾 ${data.size || 'Unknown'}`,
            }, { quoted: msg });

            await sock.sendMessage(chat, { delete: statusMsg.key });

        } catch (error) {
            console.error('MediaFire error:', error);
            await sock.sendMessage(chat, { text: '❌ *Download failed*', edit: statusMsg.key });
        }
    },
};

export const apk = {
    name: 'apk',
    alias: ['apkdl', 'app'],
    category: 'download',
    desc: 'Download APK files',
    usage: '.apk <app name>',
    cooldown: 15000,
    react: '📱',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: '📱 *APK Downloader*\n\nUsage: `.apk <app name>`\n\nExample: `.apk whatsapp`',
            }, { quoted: msg });
        }

        const query = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, { text: '🔍 *Searching app...*' }, { quoted: msg });

        try {

            const searchRes = await fetch(`https://api.giftedtech.co.ke/api/search/apk?apikey=gifted&query=${encodeURIComponent(query)}`, { timeout: CONFIG.TIMEOUT });
            const searchData = await searchRes.json();

            if (!searchData.result?.[0]) {
                return sock.sendMessage(chat, { text: '❌ *App not found*', edit: statusMsg.key });
            }

            const app = searchData.result[0];

            await sock.sendMessage(chat, {
                text: `📱 *${app.name}*\n\n📦 Package: ${app.package || 'N/A'}\n📊 Version: ${app.version || 'N/A'}\n💾 Size: ${app.size || 'N/A'}\n⭐ Rating: ${app.rating || 'N/A'}\n\n📥 Downloading...`,
                edit: statusMsg.key,
            });

            if (app.downloadUrl || app.download) {
                const apkRes = await fetch(app.downloadUrl || app.download, { timeout: 120000 });
                const apkBuffer = Buffer.from(await apkRes.arrayBuffer());

                if (apkBuffer.length > CONFIG.MAX_SIZE) {
                    return sock.sendMessage(chat, {
                        text: `❌ *APK too large!*\n\n🔗 Download manually:\n${app.downloadUrl || app.download}`,
                        edit: statusMsg.key,
                    });
                }

                await sock.sendMessage(chat, {
                    document: apkBuffer,
                    mimetype: 'application/vnd.android.package-archive',
                    fileName: `${app.name}.apk`,
                }, { quoted: msg });

                await sock.sendMessage(chat, { delete: statusMsg.key });
            } else {
                await sock.sendMessage(chat, { text: '❌ *Download link not available*', edit: statusMsg.key });
            }

        } catch (error) {
            console.error('APK error:', error);
            await sock.sendMessage(chat, { text: '❌ *Download failed*', edit: statusMsg.key });
        }
    },
};

export const downloadCommands = [
    spotify,
    facebook,
    twitter,
    pinterest,
    mediafire,
    apk,
];

export default downloadCommands;
