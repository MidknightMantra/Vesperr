import yts from 'yt-search';

async function getAudioDownloadUrl(videoId) {
    if (videoId.includes('youtube.com') || videoId.includes('youtu.be')) {
        const match = videoId.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
        if (match) videoId = match[1];
    }

    const apis = [
        // API 1: neoxr
        async () => {
            const r = await fetch(`https://api.neoxr.eu/api/youtube?url=https://youtube.com/watch?v=${videoId}&type=audio`);
            const j = await r.json();
            const url = j?.data?.url || j?.url;
            if (url?.startsWith('http')) return url;
            throw new Error('No URL');
        },
        // API 2: vreden
        async () => {
            const r = await fetch(`https://api.vreden.my.id/api/ytmp3?url=https://youtube.com/watch?v=${videoId}`);
            const j = await r.json();
            const url = j?.result?.download?.url || j?.result?.url;
            if (url?.startsWith('http')) return url;
            throw new Error('No URL');
        },
        // API 3: lolhuman
        async () => {
            const r = await fetch(`https://api.lolhuman.xyz/api/ytaudio?url=https://youtube.com/watch?v=${videoId}`);
            const j = await r.json();
            const url = j?.result?.link;
            if (url?.startsWith('http')) return url;
            throw new Error('No URL');
        },
        // API 4: Simple
        async () => {
            const r = await fetch(`https://yt-download.org/api/button/mp3?url=https://youtube.com/watch?v=${videoId}`);
            const text = await r.text();
            const match = text.match(/href="(https?:\/\/[^"]+)"/);
            if (match?.[1]) return match[1];
            throw new Error('No URL');
        }
    ];

    // Race all APIs simultaneously - first success wins
    try {
        const result = await Promise.any(
            apis.map(fn =>
                Promise.race([
                    fn(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000))
                ])
            )
        );
        console.log('✓ Audio download obtained');
        return result;
    } catch (err) {
        console.log('✗ All download APIs failed');
        return null;
    }
}

function formatViews(views) {
    if (!views) return 'Unknown';
    if (views >= 1000000000) return `${(views / 1000000000).toFixed(1)}B`;
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
    return views.toString();
}

export default {
    name: 'song',
    alias: ['play', 'music', 'ytmp3', 'audio', 'yta'],
    category: 'media',
    desc: 'Search and download songs from YouTube',
    react: '♪',

    command: {
        pattern: 'song',
        run: async ({ sock, msg, args }) => {
            const jid = msg.key.remoteJid;
            const prefix = '.';

            if (!args.length) {
                return sock.sendMessage(jid, {
                    text: `◈ *Song Download*\n\n⌘ *Usage:* ${prefix}song <name>\n\n◇ *Example:* ${prefix}song Shape of You`
                }, { quoted: msg });
            }

            const query = args.join(' ');
            const searchMsg = await sock.sendMessage(jid, {
                text: '⌕ *Searching...*'
            }, { quoted: msg });

            try {
                const searchResult = await yts(query);

                if (!searchResult.videos?.length) {
                    return sock.sendMessage(jid, {
                        text: '✗ *No results found*',
                        edit: searchMsg.key
                    });
                }

                const video = searchResult.videos[0];

                if (video.seconds > 600) {
                    return sock.sendMessage(jid, {
                        text: `⚠ *Too long* (max 10 min)`,
                        edit: searchMsg.key
                    });
                }

                await sock.sendMessage(jid, {
                    text: `♪ *${video.title}*\n⤓ Downloading...`,
                    edit: searchMsg.key
                });

                const downloadUrl = await getAudioDownloadUrl(video.videoId);

                if (!downloadUrl) {
                    // Fallback with video info + thumbnail
                    return sock.sendMessage(jid, {
                        image: { url: video.thumbnail },
                        caption: `♪ *${video.title}*\n\n◇ ${video.author?.name || 'Unknown'}\n◇ ${video.timestamp}\n◇ ${formatViews(video.views)} views\n\n⤓ ${video.url}\n\n_Direct download unavailable_`
                    }, { quoted: msg });
                }

                // Send audio with context
                await sock.sendMessage(jid, {
                    audio: { url: downloadUrl },
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    contextInfo: {
                        externalAdReply: {
                            title: video.title,
                            body: video.author?.name || 'YouTube',
                            thumbnailUrl: video.thumbnail,
                            sourceUrl: video.url,
                            mediaType: 2
                        }
                    }
                }, { quoted: msg });

                await sock.sendMessage(jid, { delete: searchMsg.key }).catch(() => { });

            } catch (error) {
                console.error('Song error:', error);
                await sock.sendMessage(jid, {
                    text: '✗ *Failed* - Try again',
                    edit: searchMsg.key
                }).catch(() => { });
            }
        }
    }
};