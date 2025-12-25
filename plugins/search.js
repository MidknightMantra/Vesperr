import fetch from 'node-fetch';

const CONFIG = {
    TIMEOUT: 15000,
    TMDB_API_KEY: process.env.TMDB_API_KEY || '2f7e9a03e2176cd79b4771a512ecc955',
};

export const google = {
    name: 'google',
    alias: ['g', 'search'],
    category: 'search',
    desc: 'Search Google',
    usage: '.google <query>',
    cooldown: 5000,
    react: '🔍',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'google',
                    description: 'Search Google for information',
                    usage: '.google <query>',
                    examples: ['.google how to tie a tie']
                }, { prefix })
            }, { quoted: msg });
        }

        const query = args.join(' ');

        try {
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
            const response = await fetch(url);
            const data = await response.json();

            let header = templates.header('SEARCH', query.toUpperCase());
            let body = '';

            if (data.AbstractText) {
                body += `📝 ${data.AbstractText.slice(0, 500)}\n\n`;
                if (data.AbstractURL) body += `🔗 _Reference: ${data.AbstractURL}_`;
            }

            if (data.RelatedTopics?.length > 0) {
                const topics = data.RelatedTopics
                    .filter(t => t.Text)
                    .slice(0, 3)
                    .map(t => t.Text.slice(0, 100));

                if (topics.length > 0) {
                    body += '\n\n' + templates.list('Related Topics', topics, { bullet: '•', border: 'none' });
                }
            }

            if (!body) {
                body = `No direct summary found. You can search manually here:\n🔗 https://www.google.com/search?q=${encodeURIComponent(query)}`;
            }

            await sock.sendMessage(chat, {
                text: `${header}\n\n${body}\n\n${templates.footer()}`
            }, { quoted: msg });

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.notification('Search Redirect', `Direct search failed. View results here:\n🔗 https://www.google.com/search?q=${encodeURIComponent(query)}`, 'info'),
            }, { quoted: msg });
        }
    },
};

export const wiki = {
    name: 'wiki',
    alias: ['wikipedia', 'wp'],
    category: 'search',
    desc: 'Search Wikipedia',
    usage: '.wiki <topic>',
    cooldown: 5000,
    react: '📚',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'wiki',
                    description: 'Search Wikipedia for detailed articles',
                    usage: '.wiki <topic>',
                    examples: ['.wiki Quantum Physics']
                }, { prefix })
            }, { quoted: msg });
        }

        const query = args.join(' ');

        try {
            const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
            let response = await fetch(searchUrl);

            if (!response.ok) {
                const searchApi = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json`;
                const searchRes = await fetch(searchApi);
                const searchData = await searchRes.json();

                if (searchData[1]?.[0]) {
                    response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchData[1][0])}`);
                }
            }

            if (!response.ok) {
                return sock.sendMessage(chat, {
                    text: templates.error('Not Found', `Wikipedia has no article for "${query}".`)
                }, { quoted: msg });
            }

            const data = await response.json();
            const header = templates.header('WIKIPEDIA', data.title.toUpperCase());
            const text = `${header}\n\n${data.extract?.slice(0, 1000) || 'No description.'}\n\n🔗 _Read more: ${data.content_urls?.desktop?.page || ''}_\n\n${templates.footer()}`;

            if (data.thumbnail?.source) {
                const imgRes = await fetch(data.thumbnail.source);
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                await sock.sendMessage(chat, { image: imgBuf, caption: text }, { quoted: msg });
            } else {
                await sock.sendMessage(chat, { text }, { quoted: msg });
            }

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.error('Wiki Error', 'Wikipedia search failed unexpectedly.')
            }, { quoted: msg });
        }
    },
};

export const lyrics = {
    name: 'lyrics',
    alias: ['lyric', 'letra'],
    category: 'search',
    desc: 'Search song lyrics',
    usage: '.lyrics <song>',
    cooldown: 5000,
    react: '🎵',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'lyrics',
                    description: 'Find song lyrics instantly',
                    usage: '.lyrics <song name>',
                    examples: ['.lyrics Bohemian Rhapsody']
                }, { prefix })
            }, { quoted: msg });
        }

        const query = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('SEARCHING', `Looking for lyrics: *${query}*`, 'info')
        }, { quoted: msg });

        try {
            const apis = [
                async () => {
                    const suggestRes = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`);
                    if (!suggestRes.ok) return null;
                    const suggestData = await suggestRes.json();
                    if (suggestData.data?.[0]) {
                        const { artist, title } = suggestData.data[0];
                        const lyricsRes = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist.name)}/${encodeURIComponent(title)}`);
                        const lyricsData = await lyricsRes.json();
                        if (lyricsData.lyrics) return { title, artist: artist.name, lyrics: lyricsData.lyrics };
                    }
                    return null;
                },
                async () => {
                    const res = await fetch(`https://some-random-api.com/lyrics?title=${encodeURIComponent(query)}`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.lyrics) {
                        return { title: data.title, artist: data.author, lyrics: data.lyrics };
                    }
                    return null;
                },
                async () => {
                    const res = await fetch(`https://api.giftedtech.co.ke/api/search/lyrics?apikey=gifted&query=${encodeURIComponent(query)}`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.status && data.result) {
                        return { title: data.result.title || query, artist: data.result.artist || 'Unknown', lyrics: data.result.lyrics };
                    }
                    return null;
                },
                async () => {
                    const res = await fetch(`https://lyrist.vercel.app/api/${encodeURIComponent(query)}`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.lyrics) {
                        return { title: data.title || query, artist: data.artist || 'Unknown', lyrics: data.lyrics };
                    }
                    return null;
                },
            ];

            for (const api of apis) {
                try {
                    const result = await api();
                    if (result?.lyrics) {
                        let lyrics = result.lyrics;
                        if (lyrics.length > 4000) lyrics = lyrics.slice(0, 4000) + '\n\n_...truncated_';

                        const header = templates.header('LYRICS', result.title.toUpperCase());
                        await sock.sendMessage(chat, {
                            text: `${header}\n👤 *Artist:* ${result.artist}\n\n${lyrics}\n\n${templates.footer()}`,
                            edit: statusMsg.key,
                        });
                        return;
                    }
                } catch (e) { continue; }
            }

            await sock.sendMessage(chat, {
                text: templates.error('Not Found', `Could not find lyrics for "${query}".`),
                edit: statusMsg.key
            });

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.error('Error', 'Lyrics search failed.'),
                edit: statusMsg.key
            });
        }
    },
};

export const movie = {
    name: 'movie',
    alias: ['film', 'imdb'],
    category: 'search',
    desc: 'Search movies',
    usage: '.movie <title>',
    cooldown: 5000,
    react: '🎬',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'movie',
                    description: 'Search for movie details and ratings',
                    usage: '.movie <title>',
                    examples: ['.movie Inception']
                }, { prefix })
            }, { quoted: msg });
        }

        const query = args.join(' ');

        try {
            const searchRes = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
            const searchData = await searchRes.json();

            if (!searchData.results?.[0]) {
                return sock.sendMessage(chat, {
                    text: templates.error('Not Found', `Could not find any movie matching "${query}".`)
                }, { quoted: msg });
            }

            const movieId = searchData.results[0].id;
            const detailRes = await fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${CONFIG.TMDB_API_KEY}&append_to_response=credits`);
            const m = await detailRes.json();

            const runtime = m.runtime ? `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m` : 'N/A';
            const cast = m.credits?.cast?.slice(0, 5).map(c => c.name).join(', ') || 'N/A';
            const director = m.credits?.crew?.find(c => c.job === 'Director')?.name || 'N/A';

            const header = templates.header('MOVIE', m.title.toUpperCase());
            const info = [
                `⭐ Rating: *${m.vote_average?.toFixed(1)}/10*`,
                `📅 Release: ${m.release_date || 'N/A'}`,
                `⏱️ Runtime: ${runtime}`,
                `🎭 Genres: ${m.genres?.map(g => g.name).join(', ') || 'N/A'}`,
                `🎬 Director: ${director}`,
                `👥 Cast: ${cast}`
            ];

            const text = `${header}\n\n${templates.list('Information', info, { bullet: '│', border: 'none' })}\n\n📝 *Plot:*\n${m.overview?.slice(0, 500) || 'No overview available.'}\n\n${templates.footer()}`;

            if (m.poster_path) {
                const posterRes = await fetch(`https://image.tmdb.org/t/p/w500${m.poster_path}`);
                const posterBuf = Buffer.from(await posterRes.arrayBuffer());
                await sock.sendMessage(chat, { image: posterBuf, caption: text }, { quoted: msg });
            } else {
                await sock.sendMessage(chat, { text }, { quoted: msg });
            }

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.error('API Error', 'Movie search failed.')
            }, { quoted: msg });
        }
    },
};

export const anime = {
    name: 'anime',
    alias: ['mal', 'anilist'],
    category: 'search',
    desc: 'Search anime',
    usage: '.anime <title>',
    cooldown: 5000,
    react: '🎌',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'anime',
                    description: 'Get details about any anime from MyAnimeList',
                    usage: '.anime <title>',
                    examples: ['.anime One Piece']
                }, { prefix })
            }, { quoted: msg });
        }

        const query = args.join(' ');

        try {
            const searchRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`);
            const searchData = await searchRes.json();

            if (!searchData.data?.[0]) {
                return sock.sendMessage(chat, {
                    text: templates.error('Not Found', `Could not find anime matching "${query}".`)
                }, { quoted: msg });
            }

            const a = searchData.data[0];
            const genres = a.genres?.map(g => g.name).join(', ') || 'N/A';

            const header = templates.header('ANIME', a.title.toUpperCase());
            const info = [
                `⭐ Score: *${a.score || 'N/A'}/10*`,
                `📊 Rank: #${a.rank || 'N/A'}`,
                `📺 Type: ${a.type}`,
                `🎬 Eps: ${a.episodes || '?'}`,
                `📡 Status: ${a.status}`,
                `🎭 Genres: ${genres}`
            ];

            const text = `${header}\n\n${templates.list('Information', info, { bullet: '│', border: 'none' })}\n\n📝 *Synopsis:*\n${a.synopsis?.slice(0, 500) || 'No synopsis.'}\n\n🔗 _More info: ${a.url}_\n\n${templates.footer()}`;

            if (a.images?.jpg?.large_image_url) {
                const imgRes = await fetch(a.images.jpg.large_image_url);
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                await sock.sendMessage(chat, { image: imgBuf, caption: text }, { quoted: msg });
            } else {
                await sock.sendMessage(chat, { text }, { quoted: msg });
            }

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.error('API Error', 'Anime search failed.')
            }, { quoted: msg });
        }
    },
};

export const github = {
    name: 'github',
    alias: ['gh', 'repo'],
    category: 'search',
    desc: 'Search GitHub',
    usage: '.github <query>',
    cooldown: 5000,
    react: '🐙',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'github',
                    description: 'Search GitHub for users or repositories',
                    usage: '.github <repo> | .github user:<name>',
                    examples: ['.github Baileys', '.github user:MidknightMantra']
                }, { prefix })
            }, { quoted: msg });
        }

        const query = args.join(' ');

        try {
            if (query.startsWith('user:')) {
                const username = query.replace('user:', '').trim();
                const res = await fetch(`https://api.github.com/users/${username}`);

                if (!res.ok) return sock.sendMessage(chat, {
                    text: templates.error('Not Found', `GitHub user "${username}" not found.`)
                }, { quoted: msg });

                const u = await res.json();
                const header = templates.header('GITHUB USER', u.login.toUpperCase());
                const info = [
                    `📊 Public Repos: ${u.public_repos}`,
                    `👥 Followers: ${u.followers}`,
                    `👤 Gists: ${u.public_gists}`,
                    `🔗 [Profile](${u.html_url})`
                ];

                const text = `${header}\n*${u.name || u.login}*\n\n📝 ${u.bio || 'No bio available.'}\n\n${templates.list('Statistics', info, { bullet: '•', border: 'none' })}\n\n${templates.footer()}`;

                if (u.avatar_url) {
                    const avatarRes = await fetch(u.avatar_url);
                    const avatarBuf = Buffer.from(await avatarRes.arrayBuffer());
                    await sock.sendMessage(chat, { image: avatarBuf, caption: text }, { quoted: msg });
                } else {
                    await sock.sendMessage(chat, { text }, { quoted: msg });
                }
            } else {
                const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=5`);
                const data = await res.json();

                if (!data.items?.length) return sock.sendMessage(chat, {
                    text: templates.error('Not Found', `No repositories found for "${query}".`)
                }, { quoted: msg });

                const header = templates.header('GITHUB SEARCH', query.toUpperCase());
                const repos = data.items.map(r => `*${r.full_name}*\n⭐ ${r.stargazers_count} | 🍴 ${r.forks_count}\n${r.description?.slice(0, 100) || 'No description'}`);

                await sock.sendMessage(chat, {
                    text: `${header}\n\n${templates.list('Top Results', repos, { bullet: '📦', border: 'none' })}\n\n${templates.footer()}`
                }, { quoted: msg });
            }

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.error('API Error', 'GitHub search failed.')
            }, { quoted: msg });
        }
    },
};

export const wallpaper = {
    name: 'wallpaper',
    alias: ['wall', 'wp', 'imgsearch'],
    category: 'search',
    desc: 'Search for wallpapers',
    usage: '.wallpaper <query>',
    cooldown: 8000,
    react: '🖼️',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'wallpaper',
                    description: 'Search for high-quality wallpapers',
                    usage: '.wallpaper <query>',
                    examples: ['.wallpaper Cyberpunk Citiscape']
                }, { prefix })
            }, { quoted: msg });
        }

        const query = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('SEARCHING', `Finding wallpapers for *${query}*`, 'info')
        }, { quoted: msg });

        try {
            const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
            const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

            const res = await fetch(`https://api-dark-shan-yt.koyeb.app/search/wallpaper?q=${encodeURIComponent(query)}&apikey=${_0xkey}`);
            const data = await res.json();

            let imageUrl = null;
            if (data.result) {
                if (Array.isArray(data.result) && data.result.length > 0) {
                    imageUrl = data.result[Math.floor(Math.random() * data.result.length)];
                } else if (typeof data.result === 'string') {
                    imageUrl = data.result;
                }
            } else if (data.data) {
                imageUrl = Array.isArray(data.data) ? data.data[0] : data.data;
            }

            if (imageUrl && imageUrl.startsWith('http')) {
                const imgRes = await fetch(imageUrl);
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());

                const header = templates.header('WALLPAPER', query.toUpperCase());
                await sock.sendMessage(chat, {
                    image: imgBuf,
                    caption: `${header}\n\n${templates.footer()}`
                }, { quoted: msg });

                await sock.sendMessage(chat, { delete: statusMsg.key });
            } else {
                await sock.sendMessage(chat, {
                    text: templates.error('Not Found', `No wallpapers found for "${query}".`),
                    edit: statusMsg.key
                });
            }

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.error('Error', 'Wallpaper search failed.'),
                edit: statusMsg.key
            });
        }
    },
};

export const stickersearch = {
    name: 'stickersearch',
    alias: ['stickers', 'findsticker', 'ssearch'],
    category: 'search',
    desc: 'Search for stickers',
    usage: '.stickersearch <query>',
    cooldown: 8000,
    react: '🎨',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'stickersearch',
                    description: 'Find cool stickers to use in chats',
                    usage: '.stickersearch <query>',
                    examples: ['.stickersearch anime']
                }, { prefix })
            }, { quoted: msg });
        }

        const query = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('SEARCHING', `Finding stickers for *${query}*`, 'info')
        }, { quoted: msg });

        try {
            const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
            const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

            const res = await fetch(`https://api-dark-shan-yt.koyeb.app/search/sticker?q=${encodeURIComponent(query)}&apikey=${_0xkey}`);
            const data = await res.json();

            let stickerUrl = null;
            if (data.result) {
                if (Array.isArray(data.result) && data.result.length > 0) {
                    stickerUrl = data.result[Math.floor(Math.random() * data.result.length)];
                } else if (typeof data.result === 'string') {
                    stickerUrl = data.result;
                }
            } else if (data.data) {
                stickerUrl = Array.isArray(data.data) ? data.data[0] : data.data;
            }

            if (stickerUrl) {
                await sock.sendMessage(chat, { sticker: { url: stickerUrl } }, { quoted: msg });
                await sock.sendMessage(chat, { delete: statusMsg.key });
            } else {
                await sock.sendMessage(chat, {
                    text: templates.error('Not Found', `No stickers found for "${query}".`),
                    edit: statusMsg.key
                });
            }

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.error('Error', 'Sticker search failed.'),
                edit: statusMsg.key
            });
        }
    },
};

export const bible = {
    name: 'bible',
    alias: ['verse', 'bibleverse', 'scripture'],
    category: 'search',
    desc: 'Get Bible verse',
    usage: '.bible <verse> (e.g. .bible John 3:16)',
    cooldown: 3000,
    react: '📖',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'bible',
                    description: 'Look up any Bible verse or passage',
                    usage: '.bible <book> <chapter:verse>',
                    examples: ['.bible John 3:16', '.bible Psalm 23']
                }, { prefix })
            }, { quoted: msg });
        }

        const reference = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('SEARCHING', `Looking up *${reference}*...`, 'info')
        }, { quoted: msg });

        try {
            const apis = [
                async () => {
                    const res = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.text) return { reference: data.reference, text: data.text, translation: data.translation_name || 'WEB' };
                    return null;
                },
                async () => {
                    const res = await fetch(`https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&type=json`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        const verses = data.map(v => v.text).join(' ');
                        const ref = `${data[0].bookname} ${data[0].chapter}:${data[0].verse}`;
                        return { reference: ref, text: verses, translation: 'NET' };
                    }
                    return null;
                },
                async () => {
                    const res = await fetch(`https://bolls.life/get-verse/WEB/${encodeURIComponent(reference)}/`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.text) return { reference: reference, text: data.text, translation: 'WEB' };
                    return null;
                },
                async () => {
                    const res = await fetch(`https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/en-asv.json`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    const parts = reference.match(/(\d?\s*\w+)\s+(\d+):(\d+)/i);
                    if (parts && data.books) {
                        const bookName = parts[1].trim();
                        const chapter = parts[2];
                        const verse = parts[3];
                        for (const book of data.books) {
                            if (book.name.toLowerCase().includes(bookName.toLowerCase())) {
                                const chapterData = book.chapters[parseInt(chapter) - 1];
                                if (chapterData && chapterData.verses[parseInt(verse) - 1]) {
                                    return {
                                        reference: `${book.name} ${chapter}:${verse}`,
                                        text: chapterData.verses[parseInt(verse) - 1],
                                        translation: 'ASV'
                                    };
                                }
                            }
                        }
                    }
                    return null;
                },
                async () => {
                    const res = await fetch(`https://api.giftedtech.co.ke/api/search/bible?apikey=gifted&query=${encodeURIComponent(reference)}`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.status && data.result) return { reference: data.result.reference || reference, text: data.result.text || data.result.verse, translation: data.result.translation || 'NIV' };
                    return null;
                },
            ];

            let result = null;
            for (const api of apis) {
                try {
                    result = await api();
                    if (result?.text) break;
                } catch (e) {
                    console.error('Bible API error:', e);
                    continue;
                }
            }

            if (result?.text) {
                let text = result.text.trim();
                if (text.length > 3500) text = text.slice(0, 3500) + '...';

                const header = templates.header('BIBLE', result.reference.toUpperCase());
                await sock.sendMessage(chat, {
                    text: `${header}\n_Translation: ${result.translation}_\n\n${text}\n\n${templates.footer()}`,
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, {
                    text: templates.error('Not Found', `Verse "${reference}" not found.`),
                    edit: statusMsg.key,
                });
            }

        } catch (error) {
            console.error('Bible command error:', error);
            await sock.sendMessage(chat, {
                text: templates.error('Error', 'Failed to fetch Bible verse.'),
                edit: statusMsg.key
            });
        }
    },
};

export const quran = {
    name: 'quran',
    alias: ['ayah', 'surah', 'ayat', 'alquran'],
    category: 'search',
    desc: 'Get Quran verse with translation',
    usage: '.quran <surah>:<ayah> or .quran <surah name>',
    cooldown: 3000,
    react: '📿',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'quran',
                    description: 'Get Quran ayahs with translations',
                    usage: '.quran <surah:ayah> | .quran <surah name>',
                    examples: ['.quran 2:255', '.quran Al-Fatiha']
                }, { prefix })
            }, { quoted: msg });
        }

        const query = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('SEARCHING', `Looking up *${query}*...`, 'info')
        }, { quoted: msg });

        try {
            const apis = [
                async () => {
                    let url;
                    if (query.includes(':')) {
                        const [surah, ayah] = query.split(':');
                        url = `https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/editions/quran-uthmani,en.sahih`;
                    } else if (/^\d+$/.test(query)) {
                        url = `https://api.alquran.cloud/v1/surah/${query}/editions/quran-uthmani,en.sahih`;
                    } else {
                        const searchRes = await fetch(`https://api.alquran.cloud/v1/search/${encodeURIComponent(query)}/all/en`);
                        const searchData = await searchRes.json();
                        if (searchData.data?.matches?.[0]) {
                            const match = searchData.data.matches[0];
                            return { surah: match.surah.englishName, ayah: match.numberInSurah, arabic: match.text, translation: match.text, surahNumber: match.surah.number };
                        }
                        return null;
                    }
                    const res = await fetch(url);
                    const data = await res.json();
                    if (data.data) {
                        const editions = Array.isArray(data.data) ? data.data : [data.data];
                        const arabic = editions[0];
                        const english = editions[1] || editions[0];
                        if (arabic.ayahs) {
                            const ayahs = arabic.ayahs.slice(0, 10);
                            const engAyahs = english.ayahs?.slice(0, 10) || ayahs;
                            return {
                                surah: arabic.englishName,
                                surahArabic: arabic.name,
                                surahNumber: arabic.number,
                                ayahs: ayahs.map((a, i) => ({ number: a.numberInSurah, arabic: a.text, translation: engAyahs[i]?.text || '' })),
                            };
                        } else {
                            return { surah: arabic.surah.englishName, surahArabic: arabic.surah.name, ayah: arabic.numberInSurah, arabic: arabic.text, translation: english.text, surahNumber: arabic.surah.number };
                        }
                    }
                    return null;
                },
                async () => {
                    if (!query.includes(':')) return null;
                    const [surah, ayah] = query.split(':');
                    const res = await fetch(`https://api.quran.com/api/v4/verses/by_key/${surah}:${ayah}?translations=131`);
                    const data = await res.json();
                    if (data.verse) return { surah: `Surah ${surah}`, ayah, arabic: data.verse.text_uthmani, translation: data.verse.translations?.[0]?.text || '' };
                    return null;
                },
            ];

            let result = null;
            for (const api of apis) {
                try {
                    result = await api();
                    if (result) break;
                } catch (e) { continue; }
            }

            if (result) {
                const headerText = result.ayahs ? result.surah : `${result.surah} - AYAH ${result.ayah}`;
                const header = templates.header('QURAN', headerText.toUpperCase());
                let text = '';

                if (result.ayahs) {
                    const ayahTexts = result.ayahs.slice(0, 7).map(a =>
                        `*${a.number}.* ${a.arabic}\n_${a.translation}_`
                    ).join('\n\n');
                    text = `${header}\n_Surah ${result.surahNumber}_\n\n${ayahTexts}${result.ayahs.length > 7 ? '\n\n_...more ayahs available_' : ''}`;
                } else {
                    text = `${header}\n\n${result.arabic}\n\n_${result.translation}_`;
                }

                await sock.sendMessage(chat, {
                    text: `${text}\n\n${templates.footer()}`,
                    edit: statusMsg.key
                });
            } else {
                await sock.sendMessage(chat, {
                    text: templates.error('Not Found', `Ayah/Surah "${query}" not found.`),
                    edit: statusMsg.key
                });
            }

        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.error('Error', 'Quran search failed.'),
                edit: statusMsg.key
            });
        }
    },
};

export const define = {
    name: 'define',
    alias: ['dict', 'dictionary', 'meaning'],
    category: 'search',
    desc: 'Get word definition',
    usage: '.define <word>',
    cooldown: 3000,
    react: '📖',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'define',
                    description: 'Get word definitions and phonetics',
                    usage: '.define <word>',
                    examples: ['.define persistent']
                }, { prefix })
            }, { quoted: msg });
        }

        const word = args[0].toLowerCase();
        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('SEARCHING', `Defining *${word}*...`, 'info')
        }, { quoted: msg });

        try {
            const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
            const data = await res.json();

            if (data[0]?.meanings) {
                const entry = data[0];
                const header = templates.header('DICTIONARY', entry.word.toUpperCase());
                const phonetic = entry.phonetic || entry.phonetics?.[0]?.text || '';

                const meanings = entry.meanings.slice(0, 2).map(m => {
                    const def = m.definitions[0];
                    return `*${m.partOfSpeech}:* ${def.definition}${def.example ? `\n   _"${def.example}"_` : ''}`;
                });

                await sock.sendMessage(chat, {
                    text: `${header}\n${phonetic ? `🗣️ ${phonetic}\n` : ''}\n${templates.list('Meanings', meanings, { bullet: '📖', border: 'none' })}\n\n${templates.footer()}`,
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, {
                    text: templates.error('Not Found', `No definition found for "${word}".`),
                    edit: statusMsg.key
                });
            }
        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.error('Error', 'Dictionary search failed.'),
                edit: statusMsg.key
            });
        }
    },
};

export const urban = {
    name: 'urban',
    alias: ['ud', 'urbandictionary', 'slang'],
    category: 'search',
    desc: 'Urban Dictionary lookup',
    usage: '.urban <term>',
    cooldown: 3000,
    react: '🏙️',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'urban',
                    description: 'Search Urban Dictionary for slang and trends',
                    usage: '.urban <term>',
                    examples: ['.urban capping']
                }, { prefix })
            }, { quoted: msg });
        }

        const term = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('SEARCHING', `Querying Urban Dictionary for *${term}*`, 'info')
        }, { quoted: msg });

        try {
            const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
            const data = await res.json();

            if (data.list?.[0]) {
                const entry = data.list[0];
                const header = templates.header('URBAN DICT', entry.word.toUpperCase());
                const definition = entry.definition.replace(/\[|\]/g, '').slice(0, 500);
                const example = entry.example?.replace(/\[|\]/g, '').slice(0, 200) || '';

                const text = `${header}\n\n📝 *Definition:*\n${definition}${definition.length >= 500 ? '...' : ''}\n\n${example ? `💬 *Example:*\n_"${example}"_\n\n` : ''}👍 ${entry.thumbs_up} | 👎 ${entry.thumbs_down}\n\n${templates.footer()}`;

                await sock.sendMessage(chat, { text, edit: statusMsg.key });
            } else {
                await sock.sendMessage(chat, {
                    text: templates.error('Not Found', `No results found for "${term}".`),
                    edit: statusMsg.key
                });
            }
        } catch (error) {
            await sock.sendMessage(chat, {
                text: templates.error('Error', 'Urban Dictionary search failed.'),
                edit: statusMsg.key
            });
        }
    },
};

export const imdb = {
    name: 'imdb',
    alias: ['movie2', 'film'],
    category: 'search',
    desc: 'Search movies on IMDB',
    usage: '.imdb <movie name>',
    cooldown: 5000,
    react: '🎬',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (args.length === 0) {
            return sock.sendMessage(chat, { text: '❌ Usage: `.imdb <movie name>`' }, { quoted: msg });
        }

        const query = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, { text: `🎬 *Searching IMDB...*` }, { quoted: msg });

        try {
            const res = await fetch(`https://www.omdbapi.com/?t=${encodeURIComponent(query)}&apikey=742b2ea6`);
            const data = await res.json();

            if (data.Response === 'True') {
                await sock.sendMessage(chat, {
                    text: `🎬 *${data.Title}* (${data.Year})

⭐ *IMDB Rating:* ${data.imdbRating}/10
📅 *Released:* ${data.Released}
⏱️ *Runtime:* ${data.Runtime}
🎭 *Genre:* ${data.Genre}
🎬 *Director:* ${data.Director}
✍️ *Writer:* ${data.Writer}
🎭 *Actors:* ${data.Actors}

📝 *Plot:*
${data.Plot}

🏆 *Awards:* ${data.Awards}
🌍 *Country:* ${data.Country}
🗣️ *Language:* ${data.Language}

───────────────────
_*Vesperr* ⋆ IMDB_`,
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, { text: `❌ *Movie not found*`, edit: statusMsg.key });
            }
        } catch (error) {
            await sock.sendMessage(chat, { text: '❌ *Failed to search IMDB*', edit: statusMsg.key });
        }
    },
};

export const crypto = {
    name: 'crypto',
    alias: ['btc', 'eth', 'coin', 'price'],
    category: 'search',
    desc: 'Get cryptocurrency prices',
    usage: '.crypto <coin>',
    cooldown: 5000,
    react: '₿',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const coin = args[0]?.toLowerCase() || 'bitcoin';
        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('FETCHING', `Getting market data for *${coin}*`, 'info')
        }, { quoted: msg });

        try {
            const apis = [
                async () => {
                    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coin}`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.id && data.market_data) {
                        const m = data.market_data;
                        return {
                            name: data.name,
                            symbol: data.symbol.toUpperCase(),
                            price: m.current_price.usd,
                            change24h: m.price_change_percentage_24h,
                            change7d: m.price_change_percentage_7d,
                            high24h: m.high_24h.usd,
                            low24h: m.low_24h.usd,
                            marketCap: m.market_cap.usd,
                            rank: data.market_cap_rank
                        };
                    }
                    return null;
                },
                async () => {
                    const res = await fetch(`https://api.coincap.io/v2/assets/${coin}`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.data) {
                        const d = data.data;
                        return {
                            name: d.name,
                            symbol: d.symbol,
                            price: parseFloat(d.priceUsd),
                            change24h: parseFloat(d.changePercent24Hr || 0),
                            change7d: 0,
                            high24h: 0,
                            low24h: 0,
                            marketCap: parseFloat(d.marketCapUsd || 0),
                            rank: d.rank
                        };
                    }
                    return null;
                },
                async () => {
                    const res = await fetch(`https://api.coinbase.com/v2/prices/${coin}-USD/spot`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.data?.amount) {
                        return {
                            name: coin.charAt(0).toUpperCase() + coin.slice(1),
                            symbol: coin.toUpperCase(),
                            price: parseFloat(data.data.amount),
                            change24h: 0,
                            change7d: 0,
                            high24h: 0,
                            low24h: 0,
                            marketCap: 0,
                            rank: 'N/A'
                        };
                    }
                    return null;
                }
            ];

            let result = null;
            for (const api of apis) {
                try {
                    result = await api();
                    if (result) break;
                } catch (e) {
                    console.error('Crypto API error:', e);
                    continue;
                }
            }

            if (result) {
                const header = templates.header('CRYPTO', result.name.toUpperCase());
                const changeEmoji = result.change24h >= 0 ? '📈' : '📉';

                const info = [
                    `💵 Price: *$${result.price.toLocaleString()}*`,
                    result.change24h !== 0 ? `${changeEmoji} 24h: ${result.change24h?.toFixed(2)}%` : null,
                    result.change7d !== 0 ? `📊 7d: ${result.change7d?.toFixed(2)}%` : null,
                    result.high24h !== 0 ? `📈 24h High: $${result.high24h.toLocaleString()}` : null,
                    result.low24h !== 0 ? `📉 24h Low: $${result.low24h.toLocaleString()}` : null,
                    result.marketCap !== 0 ? `💰 Market Cap: $${(result.marketCap / 1e9).toFixed(2)}B` : null,
                    result.rank !== 'N/A' ? `🏆 Global Rank: #${result.rank}` : null
                ].filter(Boolean);

                await sock.sendMessage(chat, {
                    text: `${header}\n(${result.symbol})\n\n${templates.list('Market Stats', info, { bullet: '₿', border: 'none' })}\n\n${templates.footer()}`,
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, {
                    text: templates.error('Not Found', `Coin "${coin}" not found.`),
                    edit: statusMsg.key
                });
            }
        } catch (error) {
            console.error('Crypto command error:', error);
            await sock.sendMessage(chat, {
                text: templates.error('Error', 'Price lookup failed.'),
                edit: statusMsg.key
            });
        }
    },
};

export const news = {
    name: 'news',
    alias: ['headlines', 'latestnews'],
    category: 'search',
    desc: 'Get latest news headlines',
    usage: '.news [topic]',
    cooldown: 5000,
    react: '📰',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const topic = args.join(' ') || 'world';
        const statusMsg = await sock.sendMessage(chat, {
            text: templates.notification('FETCHING', `Loading latest news on: *${topic}*`, 'info')
        }, { quoted: msg });

        try {
            const apis = [
                async () => {
                    const res = await fetch(`https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&lang=en&max=5&token=demo`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.articles?.length) {
                        return data.articles.slice(0, 5).map(a => ({
                            title: a.title,
                            source: a.source.name,
                            url: a.url
                        }));
                    }
                    return null;
                },
                async () => {
                    const res = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&language=en&pageSize=5&apiKey=demo`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.articles?.length) {
                        return data.articles.slice(0, 5).map(a => ({
                            title: a.title,
                            source: a.source.name,
                            url: a.url
                        }));
                    }
                    return null;
                },
                async () => {
                    const res = await fetch(`https://api.giftedtech.co.ke/api/search/news?apikey=gifted&query=${encodeURIComponent(topic)}`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.status && data.result?.articles) {
                        return data.result.articles.slice(0, 5).map(a => ({
                            title: a.title || a.headline,
                            source: a.source || 'News Source',
                            url: a.url || a.link || '#'
                        }));
                    }
                    return null;
                }
            ];

            let articles = null;
            for (const api of apis) {
                try {
                    articles = await api();
                    if (articles && articles.length > 0) break;
                } catch (e) {
                    console.error('News API error:', e);
                    continue;
                }
            }

            if (articles && articles.length > 0) {
                const header = templates.header('NEWS', topic.toUpperCase());
                const headlines = articles.map(a =>
                    `*${a.title}*\n_${a.source} • [Read](${a.url})_`
                );

                await sock.sendMessage(chat, {
                    text: `${header}\n\n${templates.list('Top Headlines', headlines, { bullet: '📰', border: 'none' })}\n\n${templates.footer()}`,
                    edit: statusMsg.key,
                });
            } else {
                await sock.sendMessage(chat, {
                    text: templates.error('No News', `No current articles found for "${topic}".`),
                    edit: statusMsg.key
                });
            }
        } catch (error) {
            console.error('News command error:', error);
            await sock.sendMessage(chat, {
                text: templates.error('Error', 'News service unavailable.'),
                edit: statusMsg.key
            });
        }
    },
};

export const npm = {
    name: 'npm',
    alias: ['npmjs', 'package'],
    category: 'search',
    desc: 'Search NPM packages',
    usage: '.npm <package>',
    cooldown: 5000,
    react: '📦',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ Provide a package name!' }, { quoted: msg });
        const statusMsg = await sock.sendMessage(chat, { text: templates.notification('SEARCHING', `Searching NPM for *${args[0]}*...`, 'info') }, { quoted: msg });
        try {
            const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(args[0])}&size=5`);
            const data = await res.json();
            if (data.objects?.length) {
                const header = templates.header('NPM PACKAGES', args[0].toUpperCase());
                const packages = data.objects.slice(0, 5).map(p =>
                    `*${p.package.name}* v${p.package.version}\n_${p.package.description?.substring(0, 80) || 'No description'}_\n📥 \`npm i ${p.package.name}\``
                );
                await sock.sendMessage(chat, { text: `${header}\n\n${packages.join('\n\n')}\n\n${templates.footer()}`, edit: statusMsg.key });
            } else {
                await sock.sendMessage(chat, { text: templates.error('Not Found', 'No packages found.'), edit: statusMsg.key });
            }
        } catch { await sock.sendMessage(chat, { text: templates.error('Error', 'NPM search failed.'), edit: statusMsg.key }); }
    },
};

export const stackoverflow = {
    name: 'stackoverflow',
    alias: ['so', 'stacko'],
    category: 'search',
    desc: 'Search Stack Overflow',
    usage: '.stackoverflow <query>',
    cooldown: 5000,
    react: '📚',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ What do you need help with?' }, { quoted: msg });
        const query = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, { text: templates.notification('SEARCHING', `Searching Stack Overflow...`, 'info') }, { quoted: msg });
        try {
            const res = await fetch(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow`);
            const data = await res.json();
            if (data.items?.length) {
                const header = templates.header('STACK OVERFLOW', 'RESULTS');
                const questions = data.items.slice(0, 5).map(q => {
                    const answered = q.is_answered ? '✅' : '❓';
                    return `${answered} *${q.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'")}*\n   👍 ${q.score} | 👁️ ${q.view_count} | [Link](${q.link})`;
                });
                await sock.sendMessage(chat, { text: `${header}\n\n${questions.join('\n\n')}\n\n${templates.footer()}`, edit: statusMsg.key });
            } else {
                await sock.sendMessage(chat, { text: templates.error('Not Found', 'No questions found.'), edit: statusMsg.key });
            }
        } catch { await sock.sendMessage(chat, { text: templates.error('Error', 'Stack Overflow search failed.'), edit: statusMsg.key }); }
    },
};

export const reddit = {
    name: 'reddit',
    alias: ['subreddit', 'rdt'],
    category: 'search',
    desc: 'Search Reddit posts',
    usage: '.reddit <query>',
    cooldown: 5000,
    react: '🤖',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ What do you want to search?' }, { quoted: msg });
        const query = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, { text: templates.notification('SEARCHING', `Searching Reddit...`, 'info') }, { quoted: msg });
        try {
            const res = await fetch(`https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=5&sort=relevance`);
            const data = await res.json();
            if (data.data?.children?.length) {
                const header = templates.header('REDDIT', 'SEARCH RESULTS');
                const posts = data.data.children.slice(0, 5).map(p => {
                    const d = p.data;
                    return `*${d.title.substring(0, 60)}${d.title.length > 60 ? '...' : ''}*\n   r/${d.subreddit} • ⬆️ ${d.ups} • 💬 ${d.num_comments}`;
                });
                await sock.sendMessage(chat, { text: `${header}\n\n${posts.join('\n\n')}\n\n${templates.footer()}`, edit: statusMsg.key });
            } else {
                await sock.sendMessage(chat, { text: templates.error('Not Found', 'No posts found.'), edit: statusMsg.key });
            }
        } catch { await sock.sendMessage(chat, { text: templates.error('Error', 'Reddit search failed.'), edit: statusMsg.key }); }
    },
};

export const book = {
    name: 'book',
    alias: ['books', 'openlibrary'],
    category: 'search',
    desc: 'Search for books',
    usage: '.book <title>',
    cooldown: 5000,
    react: '📚',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ Provide a book title!' }, { quoted: msg });
        const query = args.join(' ');
        const statusMsg = await sock.sendMessage(chat, { text: templates.notification('SEARCHING', `Searching books...`, 'info') }, { quoted: msg });
        try {
            const res = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=5`);
            const data = await res.json();
            if (data.docs?.length) {
                const header = templates.header('BOOKS', query.toUpperCase());
                const books = data.docs.slice(0, 5).map(b => {
                    const author = b.author_name?.[0] || 'Unknown';
                    const year = b.first_publish_year || 'N/A';
                    return `📖 *${b.title}*\n   ✍️ ${author} • 📅 ${year}`;
                });
                await sock.sendMessage(chat, { text: `${header}\n\n${books.join('\n\n')}\n\n${templates.footer()}`, edit: statusMsg.key });
            } else {
                await sock.sendMessage(chat, { text: templates.error('Not Found', 'No books found.'), edit: statusMsg.key });
            }
        } catch { await sock.sendMessage(chat, { text: templates.error('Error', 'Book search failed.'), edit: statusMsg.key }); }
    },
};

export const googleimg = {
    name: 'googleimg',
    alias: ['gimg', 'image'],
    category: 'search',
    desc: 'Search for images on Google',
    usage: '.googleimg <query>',
    cooldown: 5000,
    react: '🖼️',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ What image are you looking for?' }, { quoted: msg });
        const query = args.join(' ');
        await sock.sendMessage(chat, {
            text: `🖼️ *Google Image Search*\n\n🔍 *Query:* ${query}\n\n_Search Google for images of "${query}"!_\n\n🔗 https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`
        }, { quoted: msg });
    },
};

export const playstore = {
    name: 'playstore',
    alias: ['app', 'ps'],
    category: 'search',
    desc: 'Search for apps on Play Store',
    usage: '.playstore <app name>',
    cooldown: 5000,
    react: '📲',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ Provide an app name!' }, { quoted: msg });
        const query = args.join(' ');
        await sock.sendMessage(chat, {
            text: `📲 *Play Store Search*\n\n🔍 *Query:* ${query}\n\n_Find the best apps on Google Play!_\n\n🔗 https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps`
        }, { quoted: msg });
    },
};

export const ttsearch = {
    name: 'ttsearch',
    alias: ['tiktoksearch'],
    category: 'search',
    desc: 'Search for TikTok videos',
    usage: '.ttsearch <query>',
    cooldown: 5000,
    react: '🎵',
    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (!args[0]) return sock.sendMessage(chat, { text: '❌ What do you want to find on TikTok?' }, { quoted: msg });
        const query = args.join(' ');
        await sock.sendMessage(chat, {
            text: `🎵 *TikTok Search*\n\n🔍 *Query:* ${query}\n\n_Discover the latest trends on TikTok!_\n\n🔗 https://www.tiktok.com/search?q=${encodeURIComponent(query)}`
        }, { quoted: msg });
    },
};

export const searchCommands = [google, wiki, lyrics, movie, anime, github, bible, quran, define, urban, imdb, crypto, news, wallpaper, stickersearch, npm, stackoverflow, reddit, book, googleimg, playstore, ttsearch];

export default searchCommands;
