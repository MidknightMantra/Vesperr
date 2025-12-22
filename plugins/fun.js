import fetch from 'node-fetch';
import { LRUCache } from 'lru-cache';

const EIGHT_BALL_RESPONSES = [

    '🎱 It is certain.',
    '🎱 It is decidedly so.',
    '🎱 Without a doubt.',
    '🎱 Yes, definitely.',
    '🎱 You may rely on it.',
    '🎱 As I see it, yes.',
    '🎱 Most likely.',
    '🎱 Outlook good.',
    '🎱 Yes.',
    '🎱 Signs point to yes.',

    '🎱 Reply hazy, try again.',
    '🎱 Ask again later.',
    '🎱 Better not tell you now.',
    '🎱 Cannot predict now.',
    '🎱 Concentrate and ask again.',

    "🎱 Don't count on it.",
    '🎱 My reply is no.',
    '🎱 My sources say no.',
    '🎱 Outlook not so good.',
    '🎱 Very doubtful.',
];

const TRUTHS = [
    "What's your biggest fear?",
    "What's the most embarrassing thing you've done?",
    "Have you ever lied to your best friend?",
    "What's your biggest secret?",
    "What's the worst thing you've ever done?",
    "Who was your first crush?",
    "What's the most childish thing you still do?",
    "What's your most embarrassing nickname?",
    "Have you ever cheated on a test?",
    "What's the last lie you told?",
    "What's your guilty pleasure?",
    "Have you ever had a crush on a friend's partner?",
    "What's the strangest dream you've had?",
    "What's your biggest regret?",
    "Have you ever stolen anything?",
    "What's the worst date you've been on?",
    "What's your most irrational fear?",
    "Have you ever pretended to like a gift?",
    "What's the most embarrassing thing in your phone?",
    "What's your biggest insecurity?",
    "Have you ever blamed someone else for something you did?",
    "What's something you've never told anyone?",
    "What's the meanest thing you've said about someone?",
    "Have you ever had a crush on a teacher?",
    "What's the most trouble you've been in?",
];

const DARES = [
    "Send your last selfie to the group.",
    "Text your crush right now.",
    "Post an embarrassing photo on your status.",
    "Send a voice note singing your favorite song.",
    "Call your mom and say 'I love you'.",
    "Change your profile picture to something funny for 1 hour.",
    "Send your most recent screenshot.",
    "Do 10 pushups and send a video.",
    "Text your ex and say hi.",
    "Send the last photo in your gallery.",
    "Write a poem about the person who dared you.",
    "Send a voice note doing your best animal impression.",
    "Share your screen time report.",
    "Send your most used emoji 50 times.",
    "Change your name to something embarrassing for 1 hour.",
    "Send a voice note speaking in a different accent.",
    "Share your most played song.",
    "Send a selfie right now, no filters.",
    "Text your best friend 'I have something to tell you' and wait.",
    "Send a video of you dancing.",
    "Share your last 5 Google searches.",
    "Send the 5th photo in your gallery.",
    "Record yourself saying 'I am a beautiful butterfly'.",
    "Send a message to your parents saying you got arrested.",
    "Post 'I love pineapple pizza' on your status.",
];

const WOULD_YOU_RATHER = [
    ["Have unlimited money", "Have unlimited time"],
    ["Be able to fly", "Be invisible"],
    ["Live without music", "Live without movies"],
    ["Be famous", "Be rich"],
    ["Have no phone", "Have no friends"],
    ["Be 10 years older", "Be 5 years younger"],
    ["Live in the past", "Live in the future"],
    ["Be a genius", "Be extremely attractive"],
    ["Have super strength", "Have super speed"],
    ["Never eat pizza again", "Never eat ice cream again"],
    ["Be too hot", "Be too cold"],
    ["Have bad breath", "Have bad body odor"],
    ["Be able to read minds", "Be able to see the future"],
    ["Have no internet", "Have no air conditioning"],
    ["Be stuck on an island alone", "Be stuck with someone you hate"],
];

const activeQuizzes = new LRUCache({
    max: 1000,
    ttl: 60000,
});

export const eightball = {
    name: '8ball',
    alias: ['8b', 'magic8ball', 'ball', 'ask'],
    category: 'fun',
    desc: 'Ask the magic 8 ball a question',
    usage: '.8ball <question>',
    cooldown: 3000,
    react: '🎱',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: '🎱 *Magic 8 Ball*\n\nAsk me a yes/no question!\n\nUsage: `.8ball <question>`',
            }, { quoted: msg });
        }

        const question = args.join(' ');
        const answer = EIGHT_BALL_RESPONSES[Math.floor(Math.random() * EIGHT_BALL_RESPONSES.length)];

        await sock.sendMessage(chat, {
            text: `🎱 *Magic 8 Ball*\n\n❓ *Question:*\n${question}\n\n✨ *Answer:*\n${answer}`,
        }, { quoted: msg });
    },
};

export const truth = {
    name: 'truth',
    alias: ['t'],
    category: 'fun',
    desc: 'Get a random truth question',
    usage: '.truth',
    cooldown: 3000,
    react: '🤔',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const question = TRUTHS[Math.floor(Math.random() * TRUTHS.length)];

        await sock.sendMessage(chat, {
            text: `🤔 *TRUTH*\n\n${question}`,
        }, { quoted: msg });
    },
};

export const dare = {
    name: 'dare',
    alias: ['d'],
    category: 'fun',
    desc: 'Get a random dare',
    usage: '.dare',
    cooldown: 3000,
    react: '😈',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const challenge = DARES[Math.floor(Math.random() * DARES.length)];

        await sock.sendMessage(chat, {
            text: `😈 *DARE*\n\n${challenge}`,
        }, { quoted: msg });
    },
};

export const truthordare = {
    name: 'truthordare',
    alias: ['tod', 'tord'],
    category: 'fun',
    desc: 'Random truth or dare',
    usage: '.truthordare',
    cooldown: 3000,
    react: '🎲',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const isTruth = Math.random() > 0.5;

        if (isTruth) {
            const question = TRUTHS[Math.floor(Math.random() * TRUTHS.length)];
            await sock.sendMessage(chat, {
                text: `🤔 *TRUTH*\n\n${question}`,
            }, { quoted: msg });
        } else {
            const challenge = DARES[Math.floor(Math.random() * DARES.length)];
            await sock.sendMessage(chat, {
                text: `😈 *DARE*\n\n${challenge}`,
            }, { quoted: msg });
        }
    },
};

export const wyr = {
    name: 'wyr',
    alias: ['wouldyourather', 'rather'],
    category: 'fun',
    desc: 'Would you rather question',
    usage: '.wyr',
    cooldown: 3000,
    react: '🤷',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const [optionA, optionB] = WOULD_YOU_RATHER[Math.floor(Math.random() * WOULD_YOU_RATHER.length)];

        await sock.sendMessage(chat, {
            text: `🤷 *WOULD YOU RATHER*\n\n🅰️ ${optionA}\n\n*OR*\n\n🅱️ ${optionB}`,
        }, { quoted: msg });
    },
};

export const quote = {
    name: 'quote',
    alias: ['quotes', 'inspire', 'motivation'],
    category: 'fun',
    desc: 'Get an inspirational quote',
    usage: '.quote',
    cooldown: 3000,
    react: '💭',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;

        try {

            let quoteData = null;

            try {
                const response = await fetch('https://api.quotable.io/random', { timeout: 10000 });
                const data = await response.json();
                if (data.content) {
                    quoteData = { text: data.content, author: data.author };
                }
            } catch { }

            if (!quoteData) {
                try {
                    const response = await fetch('https://zenquotes.io/api/random', { timeout: 10000 });
                    const data = await response.json();
                    if (data[0]?.q) {
                        quoteData = { text: data[0].q, author: data[0].a };
                    }
                } catch { }
            }

            if (!quoteData) {
                try {
                    const response = await fetch('https://api.forismatic.com/api/1.0/?method=getQuote&format=json&lang=en', { timeout: 10000 });
                    const data = await response.json();
                    if (data.quoteText) {
                        quoteData = { text: data.quoteText, author: data.quoteAuthor || 'Unknown' };
                    }
                } catch { }
            }

            if (!quoteData) {

                const fallbackQuotes = [
                    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
                    { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
                    { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
                    { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
                    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
                ];
                quoteData = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
            }

            await sock.sendMessage(chat, {
                text: `💭 *Quote of the Moment*\n\n_"${quoteData.text}"_\n\n— *${quoteData.author}*`,
            }, { quoted: msg });

        } catch (error) {
            console.error('Quote error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to get quote*',
            }, { quoted: msg });
        }
    },
};

export const meme = {
    name: 'meme',
    alias: ['memes', 'randommeme'],
    category: 'fun',
    desc: 'Get a random meme',
    usage: '.meme',
    cooldown: 5000,
    react: '😂',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;

        try {

            const subreddits = ['memes', 'dankmemes', 'me_irl', 'wholesomememes'];
            const subreddit = subreddits[Math.floor(Math.random() * subreddits.length)];

            const response = await fetch(`https://meme-api.com/gimme/${subreddit}`, { timeout: 15000 });
            const data = await response.json();

            if (!data.url) {
                throw new Error('No meme found');
            }

            const imageResponse = await fetch(data.url);
            const buffer = Buffer.from(await imageResponse.arrayBuffer());

            await sock.sendMessage(chat, {
                image: buffer,
                caption: `😂 *${data.title}*\n\n👍 ${data.ups || 0} | 💬 r/${data.subreddit}\n\n_*Vesperr* ⋆ Memes_`,
            }, { quoted: msg });

        } catch (error) {
            console.error('Meme error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to get meme*\n\nTry again later.',
            }, { quoted: msg });
        }
    },
};

export const quiz = {
    name: 'quiz',
    alias: ['trivia', 'question'],
    category: 'fun',
    desc: 'Play a trivia quiz',
    usage: '.quiz [category]',
    cooldown: 5000,
    react: '🧠',

    async execute({ sock, msg, args, prefix }) {
        const chat = msg.key.remoteJid;
        const user = msg.key.participant || msg.key.remoteJid;

        const existingQuiz = activeQuizzes.get(chat);
        if (existingQuiz) {
            return sock.sendMessage(chat, {
                text: `❌ *Quiz already active!*\n\nAnswer: A, B, C, or D\n\nOr wait for timeout.`,
            }, { quoted: msg });
        }

        const categories = {
            general: 9,
            science: 17,
            computers: 18,
            math: 19,
            sports: 21,
            geography: 22,
            history: 23,
            music: 12,
            film: 11,
            games: 15,
            anime: 31,
        };

        const category = args[0]?.toLowerCase();
        let categoryId = categories.general;

        if (category && categories[category]) {
            categoryId = categories[category];
        } else if (category === 'list') {
            return sock.sendMessage(chat, {
                text: `🧠 *Quiz Categories*\n\n${Object.keys(categories).map(c => `• ${c}`).join('\n')}\n\nUsage: \`${prefix}quiz <category>\``,
            }, { quoted: msg });
        }

        try {
            const response = await fetch(`https://opentdb.com/api.php?amount=1&category=${categoryId}&type=multiple`, {
                timeout: 10000,
            });
            const data = await response.json();

            if (!data.results || data.results.length === 0) {
                throw new Error('No questions found');
            }

            const q = data.results[0];
            const answers = [...q.incorrect_answers, q.correct_answer]
                .map(a => decodeHTML(a))
                .sort(() => Math.random() - 0.5);

            const correctIndex = answers.indexOf(decodeHTML(q.correct_answer));
            const letters = ['A', 'B', 'C', 'D'];

            activeQuizzes.set(chat, {
                correctAnswer: letters[correctIndex],
                correctText: decodeHTML(q.correct_answer),
                startedBy: user,
                timestamp: Date.now(),
            });

            const quizText = `🧠 *TRIVIA QUIZ*

📚 *Category:* ${decodeHTML(q.category)}
⭐ *Difficulty:* ${q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}

❓ *Question:*
${decodeHTML(q.question)}

🅰️ ${answers[0]}
🅱️ ${answers[1]}
©️ ${answers[2]}
🅳️ ${answers[3]}

_Reply with A, B, C, or D_
_⏱️ 60 seconds to answer_`;

            await sock.sendMessage(chat, { text: quizText }, { quoted: msg });

            setTimeout(async () => {
                const quiz = activeQuizzes.get(chat);
                if (quiz && quiz.timestamp === activeQuizzes.get(chat)?.timestamp) {
                    activeQuizzes.delete(chat);
                    await sock.sendMessage(chat, {
                        text: `⏱️ *Time's up!*\n\nThe correct answer was: *${quiz.correctAnswer}. ${quiz.correctText}*`,
                    });
                }
            }, 60000);

        } catch (error) {
            console.error('Quiz error:', error);
            await sock.sendMessage(chat, {
                text: '❌ *Failed to get quiz question*',
            }, { quoted: msg });
        }
    },
};

export async function handleQuizAnswer(sock, msg) {
    const chat = msg.key.remoteJid;
    const user = msg.key.participant || msg.key.remoteJid;
    const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim().toUpperCase();

    if (!['A', 'B', 'C', 'D'].includes(text)) return false;

    const quiz = activeQuizzes.get(chat);
    if (!quiz) return false;

    activeQuizzes.delete(chat);

    if (text === quiz.correctAnswer) {
        await sock.sendMessage(chat, {
            text: `✅ *Correct!* 🎉\n\n@${user.split('@')[0]} got it right!\n\nAnswer: *${quiz.correctAnswer}. ${quiz.correctText}*`,
            mentions: [user],
        }, { quoted: msg });
    } else {
        await sock.sendMessage(chat, {
            text: `❌ *Wrong!*\n\nThe correct answer was: *${quiz.correctAnswer}. ${quiz.correctText}*`,
        }, { quoted: msg });
    }

    return true;
}

function decodeHTML(html) {
    return html
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&ntilde;/g, 'ñ')
        .replace(/&eacute;/g, 'é');
}

export const roll = {
    name: 'roll',
    alias: ['dice', 'random'],
    category: 'fun',
    desc: 'Roll a dice',
    usage: '.roll [sides] [count]',
    cooldown: 2000,
    react: '🎲',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        const sides = parseInt(args[0]) || 6;
        const count = Math.min(parseInt(args[1]) || 1, 10);

        if (sides < 2 || sides > 1000) {
            return sock.sendMessage(chat, {
                text: '❌ *Sides must be between 2 and 1000*',
            }, { quoted: msg });
        }

        const results = [];
        for (let i = 0; i < count; i++) {
            results.push(Math.floor(Math.random() * sides) + 1);
        }

        const total = results.reduce((a, b) => a + b, 0);
        const emoji = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

        let text = `🎲 *Dice Roll*\n\n`;
        text += `Rolling ${count}d${sides}...\n\n`;

        if (sides === 6 && count === 1) {
            text += emoji[results[0] - 1] + '\n';
        }

        text += `*Results:* ${results.join(', ')}`;

        if (count > 1) {
            text += `\n*Total:* ${total}`;
        }

        await sock.sendMessage(chat, { text }, { quoted: msg });
    },
};

export const flip = {
    name: 'flip',
    alias: ['coin', 'coinflip', 'toss'],
    category: 'fun',
    desc: 'Flip a coin',
    usage: '.flip',
    cooldown: 2000,
    react: '🪙',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;

        const result = Math.random() > 0.5 ? 'Heads' : 'Tails';
        const emoji = result === 'Heads' ? '👑' : '🦅';

        await sock.sendMessage(chat, {
            text: `🪙 *Coin Flip*\n\n${emoji} *${result}!*`,
        }, { quoted: msg });
    },
};

export const ship = {
    name: 'ship',
    alias: ['love', 'compatibility', 'match'],
    category: 'fun',
    desc: 'Check love compatibility',
    usage: '.ship @user1 @user2',
    cooldown: 5000,
    react: '💕',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

        if (mentioned.length < 2 && args.length < 2) {
            return sock.sendMessage(chat, {
                text: '💕 *Ship Calculator*\n\nMention two users!\n\nUsage: `.ship @user1 @user2`',
            }, { quoted: msg });
        }

        let user1, user2;

        if (mentioned.length >= 2) {
            user1 = mentioned[0].split('@')[0];
            user2 = mentioned[1].split('@')[0];
        } else {
            user1 = args[0].replace('@', '');
            user2 = args[1].replace('@', '');
        }

        const combined = [user1, user2].sort().join('');
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            hash = ((hash << 5) - hash) + combined.charCodeAt(i);
            hash = hash & hash;
        }
        const percentage = Math.abs(hash) % 101;

        const fullHearts = Math.floor(percentage / 10);
        const heartBar = '❤️'.repeat(fullHearts) + '🖤'.repeat(10 - fullHearts);

        let message;
        if (percentage >= 90) message = "Perfect match! 💍 Wedding bells are ringing!";
        else if (percentage >= 70) message = "Great compatibility! 💕 Love is in the air!";
        else if (percentage >= 50) message = "Good potential! 💗 Give it a shot!";
        else if (percentage >= 30) message = "It could work... 💔 With some effort!";
        else message = "Not meant to be... 😢 Better luck elsewhere!";

        await sock.sendMessage(chat, {
            text: `💕 *LOVE CALCULATOR*\n\n👤 ${user1}\n💗\n👤 ${user2}\n\n${heartBar}\n\n*Compatibility: ${percentage}%*\n\n${message}`,
            mentions: mentioned,
        }, { quoted: msg });
    },
};

export const slot = {
    name: 'slot',
    alias: ['slots', 'jackpot', 'casino'],
    category: 'fun',
    desc: 'Play the slot machine',
    usage: '.slot',
    cooldown: 3000,
    react: '🎰',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const symbols = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣', '💎'];

        const spin = () => symbols[Math.floor(Math.random() * symbols.length)];
        const s1 = spin(), s2 = spin(), s3 = spin();

        let result = '';
        let winText = '';

        if (s1 === s2 && s2 === s3) {
            if (s1 === '💎') winText = '💎💎💎 *MEGA JACKPOT!* 💎💎💎';
            else if (s1 === '7️⃣') winText = '🎉 *JACKPOT! TRIPLE 7s!* 🎉';
            else winText = `✨ *WINNER!* Triple ${s1}! ✨`;
        } else if (s1 === s2 || s2 === s3 || s1 === s3) {
            winText = '🎯 *Double match!* Small win!';
        } else {
            winText = '😔 *No match.* Try again!';
        }

        result = `🎰 *SLOT MACHINE* 🎰

┌─────────────┐
│  ${s1}  │  ${s2}  │  ${s3}  │
└─────────────┘

${winText}

───────────────────
_*Vesperr* ⋆ Casino_`;

        await sock.sendMessage(chat, { text: result }, { quoted: msg });
    },
};

const TRIVIA_QUESTIONS = [
    { q: "What is the capital of France?", a: "Paris" },
    { q: "How many continents are there?", a: "7" },
    { q: "What planet is known as the Red Planet?", a: "Mars" },
    { q: "What is the largest ocean?", a: "Pacific" },
    { q: "Who painted the Mona Lisa?", a: "Leonardo da Vinci" },
    { q: "What is the chemical symbol for gold?", a: "Au" },
    { q: "How many bones are in the human body?", a: "206" },
    { q: "What year did World War II end?", a: "1945" },
    { q: "What is the smallest country in the world?", a: "Vatican City" },
    { q: "What is the hardest natural substance?", a: "Diamond" },
    { q: "Who wrote Romeo and Juliet?", a: "Shakespeare" },
    { q: "What is the speed of light in km/s?", a: "300000" },
    { q: "What is the largest mammal?", a: "Blue whale" },
    { q: "How many teeth does an adult human have?", a: "32" },
    { q: "What is the currency of Japan?", a: "Yen" },
];

export const trivia = {
    name: 'trivia',
    alias: ['quiz2', 'question'],
    category: 'fun',
    desc: 'Random trivia question',
    usage: '.trivia',
    cooldown: 5000,
    react: '🧠',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];

        await sock.sendMessage(chat, {
            text: `🧠 *TRIVIA TIME!*

❓ ${q.q}

_Reply with your answer!_
_Answer will be revealed in 30 seconds..._

───────────────────
_*Vesperr* ⋆ Trivia_`,
        }, { quoted: msg });

        setTimeout(async () => {
            await sock.sendMessage(chat, {
                text: `✅ *Answer:* ${q.a}`,
            });
        }, 30000);
    },
};

const RIDDLES = [
    { r: "I have hands but can't clap. What am I?", a: "A clock" },
    { r: "What has keys but no locks?", a: "A piano" },
    { r: "What can travel around the world while staying in a corner?", a: "A stamp" },
    { r: "What has a head and a tail but no body?", a: "A coin" },
    { r: "What gets wetter the more it dries?", a: "A towel" },
    { r: "I'm tall when I'm young and short when I'm old. What am I?", a: "A candle" },
    { r: "What can you catch but not throw?", a: "A cold" },
    { r: "What has many keys but can't open any door?", a: "A keyboard" },
    { r: "What runs but never walks?", a: "Water" },
    { r: "What has an eye but cannot see?", a: "A needle" },
];

export const riddle = {
    name: 'riddle',
    alias: ['riddles', 'puzzle'],
    category: 'fun',
    desc: 'Random riddle',
    usage: '.riddle',
    cooldown: 5000,
    react: '🤔',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const r = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];

        await sock.sendMessage(chat, {
            text: `🤔 *RIDDLE*

${r.r}

_Think carefully..._
_Answer reveals in 45 seconds!_

───────────────────
_*Vesperr* ⋆ Riddles_`,
        }, { quoted: msg });

        setTimeout(async () => {
            await sock.sendMessage(chat, {
                text: `💡 *Answer:* ${r.a}`,
            });
        }, 45000);
    },
};

export const rps = {
    name: 'rps',
    alias: ['rockpaperscissors', 'janken'],
    category: 'fun',
    desc: 'Play Rock Paper Scissors',
    usage: '.rps <rock/paper/scissors>',
    cooldown: 3000,
    react: '✊',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;

        if (args.length === 0) {
            return sock.sendMessage(chat, {
                text: `✊✋✌️ *Rock Paper Scissors*

*Usage:* \`.rps <choice>\`

*Choices:*
• rock (✊)
• paper (✋)
• scissors (✌️)

*Example:* \`.rps rock\``,
            }, { quoted: msg });
        }

        const choices = { rock: '✊', paper: '✋', scissors: '✌️' };
        const userChoice = args[0].toLowerCase();

        if (!choices[userChoice]) {
            return sock.sendMessage(chat, { text: '❌ Choose: rock, paper, or scissors' }, { quoted: msg });
        }

        const botChoices = Object.keys(choices);
        const botChoice = botChoices[Math.floor(Math.random() * 3)];

        let result;
        if (userChoice === botChoice) {
            result = "🤝 *It's a TIE!*";
        } else if (
            (userChoice === 'rock' && botChoice === 'scissors') ||
            (userChoice === 'paper' && botChoice === 'rock') ||
            (userChoice === 'scissors' && botChoice === 'paper')
        ) {
            result = "🎉 *You WIN!*";
        } else {
            result = "😔 *You LOSE!*";
        }

        await sock.sendMessage(chat, {
            text: `✊✋✌️ *Rock Paper Scissors*

You: ${choices[userChoice]} ${userChoice}
Bot: ${choices[botChoice]} ${botChoice}

${result}

───────────────────
_*Vesperr* ⋆ Games_`,
        }, { quoted: msg });
    },
};

export const joke = {
    name: 'joke',
    alias: ['funny'],
    category: 'fun',
    desc: 'Get a random joke',
    usage: '.joke',
    cooldown: 5000,
    react: '😂',
    async execute({ sock, msg }) {
        try {
            const res = await fetch('https://official-joke-api.appspot.com/random_joke');
            const data = await res.json();
            await sock.sendMessage(msg.key.remoteJid, {
                text: `😂 ${data.setup}\n\n|| ${data.punchline} ||`
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch joke!' }, { quoted: msg });
        }
    }
};

export const pickup = {
    name: 'pickup',
    alias: ['pickupline'],
    category: 'fun',
    desc: 'Get a pickup line',
    usage: '.pickup',
    cooldown: 5000,
    react: '😏',
    async execute({ sock, msg }) {
        try {
            const res = await fetch('https://api.popcat.xyz/pickupline');
            const data = await res.json();
            await sock.sendMessage(msg.key.remoteJid, {
                text: `😏 ${data.pickupline}`
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch pickup line!' }, { quoted: msg });
        }
    }
};

export const insult = {
    name: 'insult',
    alias: ['roast'],
    category: 'fun',
    desc: 'Get an insult',
    usage: '.insult',
    cooldown: 5000,
    react: '🔥',
    async execute({ sock, msg }) {
        try {
            const res = await fetch('https://evilinsult.com/generate_insult.php?lang=en&type=json');
            const data = await res.json();
            await sock.sendMessage(msg.key.remoteJid, {
                text: `🔥 ${data.insult}`
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch insult!' }, { quoted: msg });
        }
    }
};

export const compliment = {
    name: 'compliment',
    alias: ['nice'],
    category: 'fun',
    desc: 'Get a compliment',
    usage: '.compliment',
    cooldown: 5000,
    react: '💖',
    async execute({ sock, msg }) {
        try {
            const res = await fetch('https://8ball.delegator.com/magic/JSON/compliment');

            const compliments = ["You're amazing!", "You look great today!", "You're a smart cookie.", "I bet you make babies smile.", "You have impeccable manners.", "I like your style.", "You have the best laugh.", "I appreciate you.", "You are the most perfect you there is.", "You are enough.", "You're strong.", "Your perspective is refreshing.", "You're a great listener.", "You light up the room."];
            const text = compliments[Math.floor(Math.random() * compliments.length)];
            await sock.sendMessage(msg.key.remoteJid, { text: `💖 ${text}` }, { quoted: msg });
        } catch {
            const compliments = ["You're amazing!", "You look great today!", "You're a smart cookie."];
            const text = compliments[Math.floor(Math.random() * compliments.length)];
            await sock.sendMessage(msg.key.remoteJid, { text: `💖 ${text}` }, { quoted: msg });
        }
    }
};

export const advice = {
    name: 'advice',
    alias: ['tips'],
    category: 'fun',
    desc: 'Get life advice',
    usage: '.advice',
    cooldown: 5000,
    react: '💡',
    async execute({ sock, msg }) {
        try {
            const res = await fetch('https://api.adviceslip.com/advice');
            const data = await res.json();
            await sock.sendMessage(msg.key.remoteJid, {
                text: `💡 ${data.slip.advice}`
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch advice!' }, { quoted: msg });
        }
    }
};

export const dog = {
    name: 'dog',
    alias: ['puppy'],
    category: 'fun',
    desc: 'Random dog image',
    usage: '.dog',
    cooldown: 5000,
    react: '🐶',
    async execute({ sock, msg }) {
        try {
            const res = await fetch('https://dog.ceo/api/breeds/image/random');
            const data = await res.json();
            await sock.sendMessage(msg.key.remoteJid, {
                image: { url: data.message },
                caption: '🐶 Woof!'
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch dog!' }, { quoted: msg });
        }
    }
};

export const cat = {
    name: 'cat',
    alias: ['kitten'],
    category: 'fun',
    desc: 'Random cat image',
    usage: '.cat',
    cooldown: 5000,
    react: '🐱',
    async execute({ sock, msg }) {
        try {
            const res = await fetch('https://api.thecatapi.com/v1/images/search');
            const data = await res.json();
            await sock.sendMessage(msg.key.remoteJid, {
                image: { url: data[0].url },
                caption: '🐱 Meow!'
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch cat!' }, { quoted: msg });
        }
    }
};

export const urbandefine = {
    name: 'urbandefine',
    alias: ['urban', 'ud'],
    category: 'fun',
    desc: 'Define a word (simple)',
    usage: '.urbandefine <word>',
    cooldown: 5000,
    react: '📖',
    async execute({ sock, msg, args }) {
        if (!args[0]) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Provide a word!' }, { quoted: msg });
        try {
            const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${args[0]}`);
            const data = await res.json();
            if (!data[0]) throw new Error('Not found');
            const def = data[0].meanings[0].definitions[0].definition;
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📖 *${data[0].word}*\n\n_${def}_`
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Word not found!' }, { quoted: msg });
        }
    }
};

const FORTUNES = [
    '🥠 A beautiful relationship is about to blossom.',
    '🥠 Success is in your future, keep pushing!',
    '🥠 An exciting opportunity awaits you.',
    '🥠 Your creativity will lead to great things.',
    '🥠 Good news is on its way to you.',
    '🥠 Trust your instincts, they will guide you.',
    '🥠 A surprise is waiting around the corner.',
    '🥠 Your hard work will pay off soon.',
    '🥠 Someone special is thinking of you.',
    '🥠 Adventure awaits, embrace the unknown.',
    '🥠 Today is the day to start something new.',
    '🥠 Patience will bring you great rewards.',
    '🥠 A new friend will enter your life soon.',
    '🥠 Your next challenge will become your greatest victory.',
    '🥠 The stars align in your favor today.',
];

const ROASTS = [
    "You're not stupid; you just have bad luck thinking.",
    "I'd agree with you, but then we'd both be wrong.",
    "You're like a cloud. When you disappear, it's a beautiful day.",
    "I'm not insulting you, I'm describing you.",
    "You're proof that evolution can go in reverse.",
    "If brains were dynamite, you wouldn't have enough to blow your nose.",
    "You're not the dumbest person on the planet, but you better hope they don't die.",
    "I'd explain it to you, but I left my crayons at home.",
    "You're like a software update. Whenever I see you, I think 'not now'.",
    "You're the reason the gene pool needs a lifeguard.",
    "If you were any less intelligent, we'd have to water you twice a week.",
    "I've seen salads more intimidating than you.",
    "You bring everyone so much joy... when you leave.",
    "Your secrets are safe with me. I wasn't listening anyway.",
    "You're like a Monday, nobody likes you.",
];

const FACTS = [
    "Honey never spoils. Archaeologists have found edible honey in ancient Egyptian tombs.",
    "A day on Venus is longer than a year on Venus.",
    "Bananas are berries, but strawberries aren't.",
    "Octopuses have three hearts and blue blood.",
    "The shortest war in history lasted only 38 minutes.",
    "A group of flamingos is called a 'flamboyance'.",
    "There are more trees on Earth than stars in the Milky Way.",
    "Wombat poop is cube-shaped.",
    "Sloths can hold their breath longer than dolphins can.",
    "The Eiffel Tower can be 15 cm taller during the summer.",
    "Humans share 50% of their DNA with bananas.",
    "The heart of a shrimp is located in its head.",
    "A snail can sleep for three years.",
    "Koalas have fingerprints almost identical to humans.",
    "An ostrich's eye is bigger than its brain.",
];

export const fortune = {
    name: 'fortune',
    alias: ['cookie', 'fortunecookie'],
    category: 'fun',
    desc: 'Get a fortune cookie message',
    usage: '.fortune',
    cooldown: 5000,
    react: '🥠',
    async execute({ sock, msg }) {
        const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
        await sock.sendMessage(msg.key.remoteJid, { text: fortune }, { quoted: msg });
    }
};

export const roast = {
    name: 'roast',
    alias: ['burn', 'insultme'],
    category: 'fun',
    desc: 'Get a funny roast',
    usage: '.roast [@user]',
    cooldown: 5000,
    react: '🔥',
    async execute({ sock, msg, args }) {
        const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const target = mention ? `@${mention.split('@')[0]}` : 'you';
        const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)];
        await sock.sendMessage(msg.key.remoteJid, {
            text: `🔥 *Roast for ${target}:*\n\n${roast}`,
            mentions: mention ? [mention] : []
        }, { quoted: msg });
    }
};

export const fact = {
    name: 'fact',
    alias: ['funfact', 'randomfact'],
    category: 'fun',
    desc: 'Get a random interesting fact',
    usage: '.fact',
    cooldown: 5000,
    react: '💡',
    async execute({ sock, msg }) {
        const fact = FACTS[Math.floor(Math.random() * FACTS.length)];
        await sock.sendMessage(msg.key.remoteJid, { text: `💡 *Did you know?*\n\n${fact}` }, { quoted: msg });
    }
};

export const ascii = {
    name: 'ascii',
    alias: ['asciiart', 'textart'],
    category: 'fun',
    desc: 'Convert text to ASCII art',
    usage: '.ascii <text>',
    cooldown: 5000,
    react: '🔤',
    async execute({ sock, msg, args }) {
        if (!args[0]) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Provide text!' }, { quoted: msg });
        const text = args.join(' ').substring(0, 10);
        try {
            const res = await fetch(`https://artii.herokuapp.com/make?text=${encodeURIComponent(text)}`);
            if (!res.ok) throw new Error('API failed');
            const art = await res.text();
            await sock.sendMessage(msg.key.remoteJid, { text: '```' + art + '```' }, { quoted: msg });
        } catch {
            const simple = text.split('').map(c => c.toUpperCase()).join(' ');
            await sock.sendMessage(msg.key.remoteJid, { text: '```\n' + simple + '\n```' }, { quoted: msg });
        }
    }
};

export const cowsay = {
    name: 'cowsay',
    alias: ['cow', 'moo'],
    category: 'fun',
    desc: 'Make a cow say something',
    usage: '.cowsay <text>',
    cooldown: 5000,
    react: '🐄',
    async execute({ sock, msg, args }) {
        if (!args[0]) return sock.sendMessage(msg.key.remoteJid, { text: '❌ What should the cow say?' }, { quoted: msg });
        const text = args.join(' ').substring(0, 40);
        const border = '_'.repeat(text.length + 2);
        const cow = `
 ${border}
< ${text} >
 ${'-'.repeat(text.length + 2)}
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`;
        await sock.sendMessage(msg.key.remoteJid, { text: '```' + cow + '```' }, { quoted: msg });
    }
};

export const reverse = {
    name: 'reverse',
    alias: ['rev', 'backwards'],
    category: 'fun',
    desc: 'Reverse text',
    usage: '.reverse <text>',
    cooldown: 3000,
    react: '🔄',
    async execute({ sock, msg, args }) {
        if (!args[0]) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Provide text to reverse!' }, { quoted: msg });
        const reversed = args.join(' ').split('').reverse().join('');
        await sock.sendMessage(msg.key.remoteJid, { text: `🔄 *Reversed:*\n${reversed}` }, { quoted: msg });
    }
};

export const mock = {
    name: 'mock',
    alias: ['spongebob', 'mocking'],
    category: 'fun',
    desc: 'MoCkInG sPoNgEbOb TeXt',
    usage: '.mock <text>',
    cooldown: 3000,
    react: '🧽',
    async execute({ sock, msg, args }) {
        if (!args[0]) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Provide text to mock!' }, { quoted: msg });
        const mocked = args.join(' ').split('').map((c, i) =>
            i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
        ).join('');
        await sock.sendMessage(msg.key.remoteJid, { text: `🧽 ${mocked}` }, { quoted: msg });
    }
};

export const uwu = {
    name: 'uwu',
    alias: ['owo', 'uwuify'],
    category: 'fun',
    desc: 'UwU-ify your text',
    usage: '.uwu <text>',
    cooldown: 3000,
    react: '✨',
    async execute({ sock, msg, args }) {
        if (!args[0]) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Pwovide some text uwu!' }, { quoted: msg });
        const uwuified = args.join(' ')
            .replace(/[rl]/g, 'w')
            .replace(/[RL]/g, 'W')
            .replace(/n([aeiou])/g, 'ny$1')
            .replace(/N([aeiou])/g, 'Ny$1')
            .replace(/N([AEIOU])/g, 'NY$1')
            .replace(/ove/g, 'uv')
            .replace(/\!/g, '! >w< ')
            .replace(/\?/g, '? owo ');
        const faces = ['(◕ᴗ◕✿)', 'ʕ•ᴥ•ʔ', '(◠‿◠)', 'UwU', 'OwO', '(✧ω✧)', '(◕‿◕)'];
        const face = faces[Math.floor(Math.random() * faces.length)];
        await sock.sendMessage(msg.key.remoteJid, { text: `${uwuified} ${face}` }, { quoted: msg });
    }
};

export const funCommands = [
    eightball,
    truth,
    dare,
    truthordare,
    wyr,
    quote,
    meme,
    quiz,
    roll,
    flip,
    ship,
    slot,
    trivia,
    riddle,
    rps,
    joke,
    pickup,
    insult,
    compliment,
    advice,
    dog,
    cat,
    urbandefine,
    fortune,
    roast,
    fact,
    ascii,
    cowsay,
    reverse,
    mock,
    uwu
];

export default funCommands;
