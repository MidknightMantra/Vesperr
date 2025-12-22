import { templates } from '../utils/deluxeUI.js';

const tttGames = new Map();
const hangmanGames = new Map();
const mathGames = new Map();
const wordleGames = new Map();

async function handleTTT(ctx) {
    const { sock, msg } = ctx;
    const chat = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
    const game = tttGames.get(chat);

    if (!game || isNaN(text)) return { handled: false };

    const move = parseInt(text) - 1;
    if (move < 0 || move > 8) return { handled: false };

    if (game.turn !== sender) return { handled: false };

    if (game.board[move] !== 0) return { handled: false };

    const playerValue = game.turn === game.playerX ? 1 : 2;
    game.board[move] = playerValue;

    const winner = checkWin(game.board);
    if (winner) {
        tttGames.delete(chat);
        const winSymbol = winner === 1 ? '❌' : '⭕';
        const winPlayer = winner === 1 ? game.playerX : game.playerO;
        await sock.sendMessage(chat, {
            text: `${renderBoard(game.board)}\n\n🎉 *${winSymbol} WINS!* @${winPlayer.split('@')[0]}`,
            mentions: [winPlayer]
        }, { quoted: msg });
        return { handled: true };
    }

    if (!game.board.includes(0)) {
        tttGames.delete(chat);
        await sock.sendMessage(chat, {
            text: `${renderBoard(game.board)}\n\n🤝 *It's a DRAW!*`
        }, { quoted: msg });
        return { handled: true };
    }

    game.turn = game.turn === game.playerX ? game.playerO : game.playerX;
    const turnSymbol = game.turn === game.playerX ? '❌' : '⭕';

    await sock.sendMessage(chat, {
        text: `${renderBoard(game.board)}\n\n${turnSymbol} Turn: @${game.turn.split('@')[0]}`,
        mentions: [game.turn]
    });

    return { handled: true };
}

function checkWin(board) {
    const wins = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    for (let c of wins) {
        if (board[c[0]] && board[c[0]] === board[c[1]] && board[c[0]] === board[c[2]]) return board[c[0]];
    }
    return null;
}

function renderBoard(board) {
    const symbols = { 0: '⬛', 1: '❌', 2: '⭕' };
    let txt = '';
    for (let i = 0; i < 9; i++) {
        txt += symbols[board[i]];
        if (i % 3 === 2) txt += '\n';
    }
    return txt.trim();
}

export const ttt = {
    name: 'tictactoe',
    alias: ['ttt', 'xo'],
    category: 'games',
    desc: 'Play Tic-Tac-Toe',
    usage: '.ttt @opponent | .ttt surrender',
    cooldown: 5000,
    react: '❌',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const game = tttGames.get(chat);

        if (args[0] === 'surrender' || args[0] === 'end') {
            if (!game) return sock.sendMessage(chat, { text: '❌ No active game.' }, { quoted: msg });
            if (game.playerX !== sender && game.playerO !== sender) return;
            tttGames.delete(chat);
            return sock.sendMessage(chat, { text: '🏳️ Game ended.' }, { quoted: msg });
        }

        if (game) {
            return sock.sendMessage(chat, { text: '❌ A game is already in progress in this chat!' }, { quoted: msg });
        }

        const opponent = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!opponent) {
            return sock.sendMessage(chat, { text: '❌ Tag an opponent to play!' }, { quoted: msg });
        }

        tttGames.set(chat, {
            playerX: sender,
            playerO: opponent,
            board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
            turn: sender,
        });

        const txt = `❌ *TIC-TAC-TOE* ⭕\n\n` +
            `👤 X: @${sender.split('@')[0]}\n` +
            `👤 O: @${opponent.split('@')[0]}\n\n` +
            `Your turn: @${sender.split('@')[0]}\n\n` +
            `_Reply with 1-9 to move_`;

        await sock.sendMessage(chat, { text: txt, mentions: [sender, opponent] }, { quoted: msg });
    },
};

async function handleMath(ctx) {
    const { sock, msg } = ctx;
    const chat = msg.key.remoteJid;
    const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
    const game = mathGames.get(chat);

    if (!game) return { handled: false };

    if (!/^-?\d+$/.test(text)) return { handled: false };

    if (parseInt(text) === game.answer) {
        mathGames.delete(chat);
        const user = msg.key.participant || msg.key.remoteJid;
        await sock.sendMessage(chat, {
            text: `✅ *Correct!* @${user.split('@')[0]} wins!`,
            mentions: [user]
        }, { quoted: msg });
        return { handled: true };
    }

    return { handled: false };
}

export const math = {
    name: 'math',
    alias: ['maths', 'calcgame'],
    category: 'games',
    desc: 'Solve the math problem',
    usage: '.math [hard/medium/easy]',
    cooldown: 5000,
    react: '🧮',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        if (mathGames.get(chat)) return sock.sendMessage(chat, { text: '❌ Game in progress!' }, { quoted: msg });

        const modes = {
            hard: { range: 1000, ops: ['+', '-', '*', '/'] },
            medium: { range: 100, ops: ['+', '-', '*'] },
            easy: { range: 20, ops: ['+', '-'] }
        };
        const mode = modes[args[0]?.toLowerCase()] || modes.medium;

        const n1 = Math.floor(Math.random() * mode.range) + 1;
        const n2 = Math.floor(Math.random() * mode.range) + 1;
        const op = mode.ops[Math.floor(Math.random() * mode.ops.length)];

        let expr = `${n1} ${op} ${n2}`;
        let ans;
        if (op === '/') {
            const product = n1 * n2;
            expr = `${product} / ${n1}`;
            ans = n2;
        } else {

            ans = eval(expr);
        }

        mathGames.set(chat, { answer: ans, timestamp: Date.now() });

        await sock.sendMessage(chat, {
            text: `🧮 *MATH QUIZ*\n\nCalculate:\n*${expr}* = ?\n\n_Reply with the answer!_`
        }, { quoted: msg });

        setTimeout(() => {
            if (mathGames.has(chat)) {
                const g = mathGames.get(chat);
                if (Date.now() - g.timestamp > 29000) {
                    mathGames.delete(chat);
                    sock.sendMessage(chat, { text: `⏰ Time's up! Answer was: ${g.answer}` });
                }
            }
        }, 30000);
    },
};

const WORDS = ['APPLE', 'BEACH', 'BRAIN', 'BREAD', 'BRUSH', 'CHAIR', 'CHEST', 'CHORD', 'CLICK', 'CLOCK', 'CLOUD', 'DANCE', 'DIARY', 'DRINK', 'DRIVE'];

async function handleWordle(ctx) {
    const { sock, msg } = ctx;
    const sender = msg.key.participant || msg.key.remoteJid;
    const chat = msg.key.remoteJid;
    const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim().toUpperCase();
    const game = wordleGames.get(sender);

    if (!game) return { handled: false };
    if (text.length !== 5) return { handled: false };

    game.tries++;
    game.guesses.push(text);

    let grid = '';
    const target = game.word;

    let won = (text === target);

    for (let guess of game.guesses) {
        let line = '';
        for (let i = 0; i < 5; i++) {
            if (guess[i] === target[i]) line += '🟩';
            else if (target.includes(guess[i])) line += '🟨';
            else line += '⬛';
        }
        grid += `${line} ${guess}\n`;
    }

    if (won) {
        wordleGames.delete(sender);
        await sock.sendMessage(chat, { text: `🟦 *WORDLE*\n\n${grid}\n🎉 *You won!* The word was ${target}.` }, { quoted: msg });
        return { handled: true };
    }

    if (game.tries >= game.maxTries) {
        wordleGames.delete(sender);
        await sock.sendMessage(chat, { text: `🟦 *WORDLE*\n\n${grid}\n❌ *Game Over!* The word was ${target}.` }, { quoted: msg });
        return { handled: true };
    }

    await sock.sendMessage(chat, { text: `🟦 *WORDLE* (${game.tries}/${game.maxTries})\n\n${grid}` }, { quoted: msg });
    return { handled: true };
}

export const wordle = {
    name: 'wordle',
    alias: ['word', 'wrdl'],
    category: 'games',
    desc: 'Guess the 5-letter word',
    usage: '.wordle',
    cooldown: 10000,
    react: '🟦',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;

        if (wordleGames.get(sender)) return sock.sendMessage(chat, { text: '❌ You already have a game running!' }, { quoted: msg });

        const word = WORDS[Math.floor(Math.random() * WORDS.length)];
        wordleGames.set(sender, { word, tries: 0, maxTries: 6, guesses: [] });

        await sock.sendMessage(chat, {
            text: `🟦 *WORDLE*\n\nGuess the 5-letter word!\n\n⬜⬜⬜⬜⬜\n\n_Reply with your guess (e.g. "APPLE")_`
        }, { quoted: msg });
    },
};

const HANGMAN_WORDS = ['JAVASCRIPT', 'DEVELOPER', 'VESPERR', 'WHATSAPP', 'PLUGIN', 'DATABASE', 'SERVER', 'COMPUTER', 'KEYBOARD', 'MONITOR'];
const HANGMAN_PICS = [
    `
  +---+
  |   |
      |
      |
      |
      |
========`,
    `
  +---+
  |   |
  O   |
      |
      |
      |
========`,
    `
  +---+
  |   |
  O   |
  |   |
      |
      |
========`,
    `
  +---+
  |   |
  O   |
 /|   |
      |
      |
========`,
    `
  +---+
  |   |
  O   |
 /|\\  |
      |
      |
========`,
    `
  +---+
  |   |
  O   |
 /|\\  |
 /    |
      |
========`,
    `
  +---+
  |   |
  O   |
 /|\\  |
 / \\  |
      |
========`
];

async function handleHangman(ctx) {
    const { sock, msg } = ctx;
    const chat = msg.key.remoteJid;
    const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim().toUpperCase();
    const game = hangmanGames.get(chat);

    if (!game) return { handled: false };
    if (text.length !== 1 || !/[A-Z]/.test(text)) return { handled: false };

    if (game.guesses.includes(text)) {
        await sock.sendMessage(chat, { text: '⚠️ Already guessed!' }, { quoted: msg });
        return { handled: true };
    }

    game.guesses.push(text);

    if (game.word.includes(text)) {
        let newMask = '';
        let won = true;
        for (let char of game.word) {
            if (game.guesses.includes(char)) {
                newMask += char + ' ';
            } else {
                newMask += '_ ';
                won = false;
            }
        }
        game.masked = newMask;

        if (won) {
            hangmanGames.delete(chat);
            await sock.sendMessage(chat, { text: `🎉 *You won!* Word: ${game.word}` }, { quoted: msg });
            return { handled: true };
        }
    } else {
        game.wrong++;
    }

    const pic = HANGMAN_PICS[game.wrong];
    const status = `😵 *HANGMAN*\n${pic}\n\nWord: ${game.masked}\nGuessed: ${game.guesses.join(', ')}`;

    if (game.wrong >= game.maxWrong) {
        hangmanGames.delete(chat);
        await sock.sendMessage(chat, { text: `${status}\n\n💀 *Game Over!* Word was: ${game.word}` }, { quoted: msg });
        return { handled: true };
    }

    await sock.sendMessage(chat, { text: status }, { quoted: msg });
    return { handled: true };
}

export const hangman = {
    name: 'hangman',
    alias: ['hang'],
    category: 'games',
    desc: 'Guess the word',
    usage: '.hangman',
    cooldown: 5000,
    react: '😵',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        if (hangmanGames.get(chat)) return sock.sendMessage(chat, { text: '❌ Game already running!' }, { quoted: msg });

        const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
        hangmanGames.set(chat, {
            word,
            guesses: [],
            wrong: 0,
            maxWrong: 6,
            masked: '_'.repeat(word.length).split('').join(' ')
        });

        await sock.sendMessage(chat, {
            text: `😵 *HANGMAN*\n${HANGMAN_PICS[0]}\n\nWord: ${'_ '.repeat(word.length)}\n\n_Reply with a letter to guess!_`
        }, { quoted: msg });
    },
};

const tttHandler = {
    onMessage: handleTTT,
    priority: 90,
    id: 'ttt_handler'
};
const mathHandler = {
    onMessage: handleMath,
    priority: 90,
    id: 'math_handler'
};
const wordleHandler = {
    onMessage: handleWordle,
    priority: 90,
    id: 'wordle_handler'
};
const hangmanHandler = {
    onMessage: handleHangman,
    priority: 90,
    id: 'hangman_handler'
};

export default [
    ttt, math, wordle, hangman,
    tttHandler, mathHandler, wordleHandler, hangmanHandler
];
