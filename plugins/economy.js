import { LRUCache } from 'lru-cache';

const CONFIG = {
    CURRENCY_NAME: 'Coins',
    CURRENCY_SYMBOL: '🪙',
    DAILY_AMOUNT: 1000,
    DAILY_STREAK_BONUS: 100,
    WORK_MIN: 100,
    WORK_MAX: 500,
    WORK_COOLDOWN: 3600000,
    ROB_COOLDOWN: 7200000,
    ROB_SUCCESS_CHANCE: 0.4,
    BANK_INTEREST_RATE: 0.01,
    MAX_BANK_CAPACITY: 100000,
};

const users = new LRUCache({
    max: 50000,
    ttl: 86400000 * 365,
});

function getUser(jid) {
    const id = jid.split('@')[0];
    if (!users.has(id)) {
        users.set(id, {
            wallet: 0,
            bank: 0,
            lastDaily: 0,
            dailyStreak: 0,
            lastWork: 0,
            lastRob: 0,
            inventory: [],
            xp: 0,
            level: 1,
            created: Date.now(),
        });
    }
    return users.get(id);
}

function saveUser(jid, data) {
    const id = jid.split('@')[0];
    users.set(id, data);
}

function getAllUsers() {
    return Array.from(users.entries());
}

const SHOP_ITEMS = [
    { id: 'shield', name: '🛡️ Shield', price: 5000, desc: 'Protect from robbery (1 use)', type: 'consumable' },
    { id: 'lucky_charm', name: '🍀 Lucky Charm', price: 3000, desc: '+10% work bonus (1 use)', type: 'consumable' },
    { id: 'bank_expansion', name: '🏦 Bank Expansion', price: 10000, desc: '+10000 bank capacity', type: 'upgrade' },
    { id: 'vip_badge', name: '⭐ VIP Badge', price: 50000, desc: 'Exclusive VIP status', type: 'collectible' },
    { id: 'crown', name: '👑 Crown', price: 100000, desc: 'Ultimate flex item', type: 'collectible' },
    { id: 'lottery_ticket', name: '🎟️ Lottery Ticket', price: 500, desc: 'Chance to win big!', type: 'consumable' },
    { id: 'double_xp', name: '✨ Double XP', price: 2000, desc: '2x XP for 1 hour', type: 'consumable' },
    { id: 'pet_cat', name: '🐱 Pet Cat', price: 15000, desc: 'Cute companion', type: 'collectible' },
    { id: 'pet_dog', name: '🐕 Pet Dog', price: 15000, desc: 'Loyal companion', type: 'collectible' },
    { id: 'rare_gem', name: '💎 Rare Gem', price: 25000, desc: 'Valuable gemstone', type: 'collectible' },
];

export const balance = {
    name: 'balance',
    alias: ['bal', 'wallet', 'money', 'cash'],
    category: 'economy',
    desc: 'Check your balance',
    usage: '.balance [@user]',
    cooldown: 3000,
    react: '💰',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const targetJid = mentioned || msg.key.participant || msg.key.remoteJid;

        const user = getUser(targetJid);
        const total = user.wallet + user.bank;
        const targetName = mentioned ? `@${targetJid.split('@')[0]}` : 'Your';

        await sock.sendMessage(chat, {
            text: `💰 *${targetName} Balance*

${CONFIG.CURRENCY_SYMBOL} *Wallet:* ${user.wallet.toLocaleString()}
🏦 *Bank:* ${user.bank.toLocaleString()}
━━━━━━━━━━━━
💎 *Total:* ${total.toLocaleString()} ${CONFIG.CURRENCY_NAME}

📊 Level: ${user.level} | XP: ${user.xp}`,
            mentions: mentioned ? [targetJid] : [],
        }, { quoted: msg });
    },
};

export const daily = {
    name: 'daily',
    alias: ['claim', 'dailyreward'],
    category: 'economy',
    desc: 'Claim daily reward',
    usage: '.daily',
    cooldown: 5000,
    react: '🎁',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const user = getUser(userJid);

        const now = Date.now();
        const lastDaily = user.lastDaily || 0;
        const timeSince = now - lastDaily;
        const oneDay = 86400000;

        if (timeSince < oneDay) {
            const remaining = oneDay - timeSince;
            const hours = Math.floor(remaining / 3600000);
            const minutes = Math.floor((remaining % 3600000) / 60000);

            return sock.sendMessage(chat, {
                text: `⏰ *Daily Already Claimed!*\n\nCome back in ${hours}h ${minutes}m`,
            }, { quoted: msg });
        }

        let streak = user.dailyStreak || 0;
        if (timeSince < oneDay * 2) {
            streak++;
        } else {
            streak = 1;
        }

        const streakBonus = (streak - 1) * CONFIG.DAILY_STREAK_BONUS;
        const total = CONFIG.DAILY_AMOUNT + streakBonus;

        user.wallet += total;
        user.lastDaily = now;
        user.dailyStreak = streak;
        user.xp += 50;
        saveUser(userJid, user);

        await sock.sendMessage(chat, {
            text: `🎁 *Daily Reward Claimed!*

${CONFIG.CURRENCY_SYMBOL} +${CONFIG.DAILY_AMOUNT.toLocaleString()} ${CONFIG.CURRENCY_NAME}
${streakBonus > 0 ? `🔥 Streak Bonus: +${streakBonus.toLocaleString()}\n` : ''}
━━━━━━━━━━━━
💰 Total: +${total.toLocaleString()}
🔥 Streak: ${streak} days

💵 Wallet: ${user.wallet.toLocaleString()}`,
        }, { quoted: msg });
    },
};

export const work = {
    name: 'work',
    alias: ['job', 'earn'],
    category: 'economy',
    desc: 'Work to earn coins',
    usage: '.work',
    cooldown: 5000,
    react: '💼',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const user = getUser(userJid);

        const now = Date.now();
        const timeSince = now - (user.lastWork || 0);

        if (timeSince < CONFIG.WORK_COOLDOWN) {
            const remaining = CONFIG.WORK_COOLDOWN - timeSince;
            const minutes = Math.floor(remaining / 60000);

            return sock.sendMessage(chat, {
                text: `⏰ *You're tired!*\n\nRest for ${minutes}m before working again.`,
            }, { quoted: msg });
        }

        const jobs = [
            { name: 'Developer', emoji: '💻', bonus: 1.2 },
            { name: 'Chef', emoji: '👨‍🍳', bonus: 1.0 },
            { name: 'Driver', emoji: '🚗', bonus: 1.0 },
            { name: 'Teacher', emoji: '📚', bonus: 1.1 },
            { name: 'Doctor', emoji: '⚕️', bonus: 1.3 },
            { name: 'Artist', emoji: '🎨', bonus: 0.9 },
            { name: 'Musician', emoji: '🎵', bonus: 0.9 },
            { name: 'Builder', emoji: '🔨', bonus: 1.1 },
        ];

        const job = jobs[Math.floor(Math.random() * jobs.length)];
        let earnings = Math.floor(Math.random() * (CONFIG.WORK_MAX - CONFIG.WORK_MIN + 1)) + CONFIG.WORK_MIN;
        earnings = Math.floor(earnings * job.bonus);

        const hasCharm = user.inventory?.includes('lucky_charm');
        if (hasCharm) {
            earnings = Math.floor(earnings * 1.1);
            user.inventory = user.inventory.filter(i => i !== 'lucky_charm');
        }

        user.wallet += earnings;
        user.lastWork = now;
        user.xp += 25;
        saveUser(userJid, user);

        await sock.sendMessage(chat, {
            text: `${job.emoji} *Work Complete!*

You worked as a *${job.name}*
${CONFIG.CURRENCY_SYMBOL} +${earnings.toLocaleString()} ${CONFIG.CURRENCY_NAME}${hasCharm ? ' 🍀' : ''}

💵 Wallet: ${user.wallet.toLocaleString()}`,
        }, { quoted: msg });
    },
};

export const deposit = {
    name: 'deposit',
    alias: ['dep', 'store'],
    category: 'economy',
    desc: 'Deposit to bank',
    usage: '.deposit <amount/all>',
    cooldown: 3000,
    react: '🏦',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const user = getUser(userJid);

        if (args.length === 0) {
            return sock.sendMessage(chat, { text: '🏦 Usage: `.deposit <amount>` or `.deposit all`' }, { quoted: msg });
        }

        let amount;
        if (args[0].toLowerCase() === 'all') {
            amount = user.wallet;
        } else {
            amount = parseInt(args[0]);
        }

        if (isNaN(amount) || amount <= 0) {
            return sock.sendMessage(chat, { text: '❌ *Invalid amount!*' }, { quoted: msg });
        }

        if (amount > user.wallet) {
            return sock.sendMessage(chat, { text: '❌ *Insufficient funds!*' }, { quoted: msg });
        }

        const bankCapacity = CONFIG.MAX_BANK_CAPACITY + (user.inventory?.filter(i => i === 'bank_expansion').length || 0) * 10000;
        const canDeposit = Math.min(amount, bankCapacity - user.bank);

        if (canDeposit <= 0) {
            return sock.sendMessage(chat, { text: '❌ *Bank is full!*\n\nBuy Bank Expansion from shop.' }, { quoted: msg });
        }

        user.wallet -= canDeposit;
        user.bank += canDeposit;
        saveUser(userJid, user);

        await sock.sendMessage(chat, {
            text: `🏦 *Deposited!*\n\n${CONFIG.CURRENCY_SYMBOL} +${canDeposit.toLocaleString()}\n\n💵 Wallet: ${user.wallet.toLocaleString()}\n🏦 Bank: ${user.bank.toLocaleString()}`,
        }, { quoted: msg });
    },
};

export const withdraw = {
    name: 'withdraw',
    alias: ['with', 'wd'],
    category: 'economy',
    desc: 'Withdraw from bank',
    usage: '.withdraw <amount/all>',
    cooldown: 3000,
    react: '🏦',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const user = getUser(userJid);

        if (args.length === 0) {
            return sock.sendMessage(chat, { text: '🏦 Usage: `.withdraw <amount>` or `.withdraw all`' }, { quoted: msg });
        }

        let amount;
        if (args[0].toLowerCase() === 'all') {
            amount = user.bank;
        } else {
            amount = parseInt(args[0]);
        }

        if (isNaN(amount) || amount <= 0) {
            return sock.sendMessage(chat, { text: '❌ *Invalid amount!*' }, { quoted: msg });
        }

        if (amount > user.bank) {
            return sock.sendMessage(chat, { text: '❌ *Insufficient bank balance!*' }, { quoted: msg });
        }

        user.bank -= amount;
        user.wallet += amount;
        saveUser(userJid, user);

        await sock.sendMessage(chat, {
            text: `🏦 *Withdrawn!*\n\n${CONFIG.CURRENCY_SYMBOL} +${amount.toLocaleString()}\n\n💵 Wallet: ${user.wallet.toLocaleString()}\n🏦 Bank: ${user.bank.toLocaleString()}`,
        }, { quoted: msg });
    },
};

export const shop = {
    name: 'shop',
    alias: ['store', 'market'],
    category: 'economy',
    desc: 'View shop items',
    usage: '.shop',
    cooldown: 3000,
    react: '🛒',

    async execute({ sock, msg, prefix }) {
        const chat = msg.key.remoteJid;

        let text = `🛒 *SHOP*\n\n`;

        SHOP_ITEMS.forEach((item, i) => {
            text += `*${i + 1}.* ${item.name}\n`;
            text += `   ${CONFIG.CURRENCY_SYMBOL} ${item.price.toLocaleString()}\n`;
            text += `   _${item.desc}_\n\n`;
        });

        text += `━━━━━━━━━━━━\nUse \`${prefix}buy <number>\` to purchase`;

        await sock.sendMessage(chat, { text }, { quoted: msg });
    },
};

export const buy = {
    name: 'buy',
    alias: ['purchase'],
    category: 'economy',
    desc: 'Buy item from shop',
    usage: '.buy <item number>',
    cooldown: 3000,
    react: '🛍️',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const user = getUser(userJid);

        if (args.length === 0) {
            return sock.sendMessage(chat, { text: '🛍️ Usage: `.buy <item number>`' }, { quoted: msg });
        }

        const index = parseInt(args[0]) - 1;
        const item = SHOP_ITEMS[index];

        if (!item) {
            return sock.sendMessage(chat, { text: '❌ *Item not found!*' }, { quoted: msg });
        }

        if (user.wallet < item.price) {
            return sock.sendMessage(chat, { text: `❌ *Not enough ${CONFIG.CURRENCY_NAME}!*\n\nYou need ${CONFIG.CURRENCY_SYMBOL} ${item.price.toLocaleString()}` }, { quoted: msg });
        }

        user.wallet -= item.price;
        user.inventory = user.inventory || [];
        user.inventory.push(item.id);
        saveUser(userJid, user);

        await sock.sendMessage(chat, {
            text: `🛍️ *Purchased!*\n\n${item.name}\n${CONFIG.CURRENCY_SYMBOL} -${item.price.toLocaleString()}\n\n💵 Wallet: ${user.wallet.toLocaleString()}`,
        }, { quoted: msg });
    },
};

export const inventory = {
    name: 'inventory',
    alias: ['inv', 'bag', 'items'],
    category: 'economy',
    desc: 'View your inventory',
    usage: '.inventory',
    cooldown: 3000,
    react: '🎒',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const user = getUser(userJid);

        const inv = user.inventory || [];

        if (inv.length === 0) {
            return sock.sendMessage(chat, { text: '🎒 *Inventory Empty!*\n\nBuy items from `.shop`' }, { quoted: msg });
        }

        const counts = {};
        inv.forEach(id => {
            counts[id] = (counts[id] || 0) + 1;
        });

        let text = `🎒 *Your Inventory*\n\n`;

        Object.entries(counts).forEach(([id, count]) => {
            const item = SHOP_ITEMS.find(i => i.id === id);
            if (item) {
                text += `${item.name} x${count}\n`;
            }
        });

        await sock.sendMessage(chat, { text }, { quoted: msg });
    },
};

export const give = {
    name: 'give',
    alias: ['transfer', 'pay', 'send'],
    category: 'economy',
    desc: 'Give coins to another user',
    usage: '.give @user <amount>',
    cooldown: 5000,
    react: '💸',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

        if (!mentioned) {
            return sock.sendMessage(chat, { text: '💸 Usage: `.give @user <amount>`' }, { quoted: msg });
        }

        const amount = parseInt(args[1] || args[0]);

        if (isNaN(amount) || amount <= 0) {
            return sock.sendMessage(chat, { text: '❌ *Invalid amount!*' }, { quoted: msg });
        }

        const sender = getUser(senderJid);

        if (sender.wallet < amount) {
            return sock.sendMessage(chat, { text: '❌ *Insufficient funds!*' }, { quoted: msg });
        }

        const receiver = getUser(mentioned);

        sender.wallet -= amount;
        receiver.wallet += amount;
        saveUser(senderJid, sender);
        saveUser(mentioned, receiver);

        await sock.sendMessage(chat, {
            text: `💸 *Transfer Complete!*\n\n${CONFIG.CURRENCY_SYMBOL} ${amount.toLocaleString()} → @${mentioned.split('@')[0]}`,
            mentions: [mentioned],
        }, { quoted: msg });
    },
};

export const slots = {
    name: 'slots',
    alias: ['slot', 'spin'],
    category: 'economy',
    desc: 'Play slot machine',
    usage: '.slots <bet>',
    cooldown: 5000,
    react: '🎰',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const user = getUser(userJid);

        const bet = parseInt(args[0]);

        if (isNaN(bet) || bet < 100) {
            return sock.sendMessage(chat, { text: '🎰 Usage: `.slots <bet>` (min: 100)' }, { quoted: msg });
        }

        if (bet > user.wallet) {
            return sock.sendMessage(chat, { text: '❌ *Insufficient funds!*' }, { quoted: msg });
        }

        const symbols = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
        const weights = [30, 25, 20, 15, 7, 2, 1];

        function getSymbol() {
            const total = weights.reduce((a, b) => a + b, 0);
            let random = Math.random() * total;
            for (let i = 0; i < symbols.length; i++) {
                random -= weights[i];
                if (random <= 0) return symbols[i];
            }
            return symbols[0];
        }

        const results = [getSymbol(), getSymbol(), getSymbol()];
        const display = results.join(' │ ');

        let multiplier = 0;
        let message = 'Better luck next time!';

        if (results[0] === results[1] && results[1] === results[2]) {

            const symbolIndex = symbols.indexOf(results[0]);
            multiplier = [3, 4, 5, 7, 15, 50, 100][symbolIndex];
            message = results[0] === '7️⃣' ? '🎉 JACKPOT!!!' : '🎉 Triple Match!';
        } else if (results[0] === results[1] || results[1] === results[2] || results[0] === results[2]) {

            multiplier = 1.5;
            message = 'Double Match!';
        }

        const winnings = Math.floor(bet * multiplier);
        const profit = winnings - bet;

        user.wallet += profit;
        user.xp += Math.abs(profit) > 0 ? 10 : 5;
        saveUser(userJid, user);

        await sock.sendMessage(chat, {
            text: `🎰 *SLOTS*
━━━━━━━━━━━━
┃ ${display} ┃
━━━━━━━━━━━━

${message}

${profit >= 0 ? `🎉 Won: +${winnings.toLocaleString()}` : `😢 Lost: ${bet.toLocaleString()}`}
💵 Wallet: ${user.wallet.toLocaleString()}`,
        }, { quoted: msg });
    },
};

export const coinflip = {
    name: 'coinflip',
    alias: ['cf', 'flipcoin', 'gamble'],
    category: 'economy',
    desc: 'Coinflip gambling',
    usage: '.coinflip <h/t> <bet>',
    cooldown: 5000,
    react: '🪙',

    async execute({ sock, msg, args }) {
        const chat = msg.key.remoteJid;
        const userJid = msg.key.participant || msg.key.remoteJid;
        const user = getUser(userJid);

        if (args.length < 2) {
            return sock.sendMessage(chat, { text: '🪙 Usage: `.coinflip h/t <bet>`\n\nh = heads, t = tails' }, { quoted: msg });
        }

        const choice = args[0].toLowerCase();
        if (!['h', 't', 'heads', 'tails'].includes(choice)) {
            return sock.sendMessage(chat, { text: '❌ Choose h (heads) or t (tails)' }, { quoted: msg });
        }

        const bet = parseInt(args[1]);
        if (isNaN(bet) || bet < 100) {
            return sock.sendMessage(chat, { text: '❌ Minimum bet: 100' }, { quoted: msg });
        }

        if (bet > user.wallet) {
            return sock.sendMessage(chat, { text: '❌ *Insufficient funds!*' }, { quoted: msg });
        }

        const result = Math.random() > 0.5 ? 'h' : 't';
        const won = (choice === 'h' || choice === 'heads') === (result === 'h');

        if (won) {
            user.wallet += bet;
        } else {
            user.wallet -= bet;
        }
        user.xp += 10;
        saveUser(userJid, user);

        await sock.sendMessage(chat, {
            text: `🪙 *Coinflip*

${result === 'h' ? '👑 Heads!' : '🦅 Tails!'}

${won ? `🎉 You won ${CONFIG.CURRENCY_SYMBOL} ${bet.toLocaleString()}!` : `😢 You lost ${CONFIG.CURRENCY_SYMBOL} ${bet.toLocaleString()}`}

💵 Wallet: ${user.wallet.toLocaleString()}`,
        }, { quoted: msg });
    },
};

export const leaderboard = {
    name: 'leaderboard',
    alias: ['lb', 'top', 'rich', 'richest'],
    category: 'economy',
    desc: 'View richest users',
    usage: '.leaderboard',
    cooldown: 10000,
    react: '🏆',

    async execute({ sock, msg }) {
        const chat = msg.key.remoteJid;

        const allUsers = getAllUsers();
        const sorted = allUsers
            .map(([id, data]) => ({ id, total: data.wallet + data.bank }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        if (sorted.length === 0) {
            return sock.sendMessage(chat, { text: '🏆 *No users yet!*' }, { quoted: msg });
        }

        let text = `🏆 *LEADERBOARD*\n\n`;

        const medals = ['🥇', '🥈', '🥉'];
        sorted.forEach((user, i) => {
            const medal = medals[i] || `${i + 1}.`;
            text += `${medal} ${user.id}\n   ${CONFIG.CURRENCY_SYMBOL} ${user.total.toLocaleString()}\n\n`;
        });

        await sock.sendMessage(chat, { text }, { quoted: msg });
    },
};

export const economyCommands = [
    balance,
    daily,
    work,
    deposit,
    withdraw,
    shop,
    buy,
    inventory,
    give,
    slots,
    coinflip,
    leaderboard,
];

export default economyCommands;

export { getUser, saveUser, getAllUsers, CONFIG as economyConfig };
