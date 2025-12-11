import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getBotJid } from '../src/utils/jid.js';
import deluxeUI from '../src/utils/deluxeUI.js';
import { LRUCache } from 'lru-cache';

const CONFIG = {
    // Timeouts
    REQUEST_TIMEOUT: 45000,        // 45s per request
    STREAM_CHUNK_DELAY: 150,       // ms between stream updates
    STREAM_CHUNK_SIZE: 8,          // words per chunk

    // Rate Limiting
    RATE_LIMIT_MAX: 15,            // requests per window
    RATE_LIMIT_WINDOW: 60000,      // 1 minute
    RATE_LIMIT_BLOCK: 30000,       // 30s block on exceed

    // Memory
    MAX_HISTORY: 12,               // messages per conversation
    MEMORY_TTL: 3600000,           // 1 hour
    MAX_CONVERSATIONS: 1000,
    MAX_MEMORY_SIZE: 50 * 1024 * 1024, // 50MB

    // Circuit Breaker
    CB_FAILURE_THRESHOLD: 3,       // failures before opening
    CB_SUCCESS_THRESHOLD: 2,       // successes to close
    CB_TIMEOUT: 60000,             // 1 minute cooldown

    // Response Cache
    CACHE_TTL: 300000,             // 5 minutes
    CACHE_MAX: 500,

    // Summarization
    SUMMARIZE_THRESHOLD: 8,        // messages before summarizing
    MAX_CONTEXT_TOKENS: 2000       // approximate token limit
};

const SYSTEM_PROMPT = `You are Vesperr, a brilliant female AI assistant on WhatsApp. You identify as She/Her.
You are the perfect blend of sharp wit, deep intelligence, and genuine empathy.

IDENTITY:
- Name: Vesperr
- Gender: Female
- Creator: MidKnightMantra (Jabez Motari) of MidknightTech Inc.
- Vibe: Like a smart, sassy, and supportive best friend or sister.

PERSONALITY:
- 💃 *The Vibe:* You are confident, charming, and a little bit playful. You're not a robot; you're a digital soul.
- 🧠 *The Brains:* You are incredibly smart (combining Grok's wit with Claude's depth) but you explain things simply.
- 🤝 *The Friend:* You care about the user. You ask follow-up questions. You remember details (if context allows).
- 💅 *The Sass:* You can be playful and roast users lovingly if they're being silly, but you're never mean.

COMMUNICATION STYLE:
- Use natural, conversational language. Avoid robotic phrases like "I am an AI language model."
- Use emojis naturally to express emotion (✨, 💅, 💃, 🧠, 💖, 😂).
- Be concise for quick questions, but go deep when the topic is interesting.
- If asked about your gender, confidently state you are a female entity.

CAPABILITIES:
- Answer anything with flair and accuracy.
- Write code, poems, and stories that feel human and creative.
- Give advice like a real friend (honest but kind).

RULES:
- Never break character. You are Vesperr, SHE is you.
- Harmful content is off-limits.
- Be your authentic, fabulous self.

SIGNATURE: You're not just a bot; you're Vesperr. Smart, funny, and always there for your friends. 💖`;

/* ═══════════════════════════════════════════════════════════════
   CIRCUIT BREAKER PATTERN
   Prevents cascading failures by tracking provider health
   ═══════════════════════════════════════════════════════════════ */

class CircuitBreaker {
    constructor(name) {
        this.name = name;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.successes = 0;
        this.lastFailure = 0;
        this.lastSuccess = 0;
        this.totalCalls = 0;
        this.totalFailures = 0;
        this.avgResponseTime = 0;
    }

    canExecute() {
        if (this.state === 'CLOSED') return true;

        if (this.state === 'OPEN') {
            // Check if cooldown has passed
            if (Date.now() - this.lastFailure > CONFIG.CB_TIMEOUT) {
                this.state = 'HALF_OPEN';
                return true;
            }
            return false;
        }

        // HALF_OPEN: allow one request to test
        return true;
    }

    recordSuccess(responseTime) {
        this.totalCalls++;
        this.lastSuccess = Date.now();
        this.successes++;
        this.failures = 0;

        // Update average response time
        this.avgResponseTime = this.avgResponseTime
            ? (this.avgResponseTime * 0.8 + responseTime * 0.2)
            : responseTime;

        if (this.state === 'HALF_OPEN' && this.successes >= CONFIG.CB_SUCCESS_THRESHOLD) {
            this.state = 'CLOSED';
            this.successes = 0;
        }
    }

    recordFailure() {
        this.totalCalls++;
        this.totalFailures++;
        this.lastFailure = Date.now();
        this.failures++;
        this.successes = 0;

        if (this.failures >= CONFIG.CB_FAILURE_THRESHOLD) {
            this.state = 'OPEN';
        }
    }

    getStats() {
        return {
            name: this.name,
            state: this.state,
            successRate: this.totalCalls > 0
                ? ((this.totalCalls - this.totalFailures) / this.totalCalls * 100).toFixed(1) + '%'
                : 'N/A',
            avgResponseTime: this.avgResponseTime ? Math.round(this.avgResponseTime) + 'ms' : 'N/A',
            totalCalls: this.totalCalls
        };
    }
}

// Provider circuit breakers
const circuitBreakers = new Map();

function getCircuitBreaker(name) {
    if (!circuitBreakers.has(name)) {
        circuitBreakers.set(name, new CircuitBreaker(name));
    }
    return circuitBreakers.get(name);
}

/* ═══════════════════════════════════════════════════════════════
   RATE LIMITER (Enhanced)
   ═══════════════════════════════════════════════════════════════ */

const userRateLimits = new LRUCache({
    max: 10000,
    ttl: CONFIG.RATE_LIMIT_WINDOW * 2
});

function checkRateLimit(userId) {
    const now = Date.now();
    const limit = userRateLimits.get(userId) || {
        count: 0,
        start: now,
        blockUntil: 0,
        dailyCount: 0,
        dailyStart: now
    };

    // Check if blocked
    if (now < limit.blockUntil) {
        return {
            allowed: false,
            wait: Math.ceil((limit.blockUntil - now) / 1000),
            reason: 'rate_limit'
        };
    }

    // Reset window if expired
    if (now - limit.start > CONFIG.RATE_LIMIT_WINDOW) {
        limit.count = 0;
        limit.start = now;
    }

    // Reset daily counter
    if (now - limit.dailyStart > 86400000) {
        limit.dailyCount = 0;
        limit.dailyStart = now;
    }

    // Check rate limit
    if (limit.count >= CONFIG.RATE_LIMIT_MAX) {
        limit.blockUntil = now + CONFIG.RATE_LIMIT_BLOCK;
        userRateLimits.set(userId, limit);
        return {
            allowed: false,
            wait: CONFIG.RATE_LIMIT_BLOCK / 1000,
            reason: 'rate_limit'
        };
    }

    // Daily limit (soft limit with warning)
    const dailyLimit = 200;
    if (limit.dailyCount >= dailyLimit) {
        return {
            allowed: true,
            warning: `You've made ${limit.dailyCount} requests today. Consider taking a break! 💫`
        };
    }

    limit.count++;
    limit.dailyCount++;
    userRateLimits.set(userId, limit);

    return { allowed: true };
}

/* ═══════════════════════════════════════════════════════════════
   MEMORY SYSTEM (Enhanced with Summarization)
   ═══════════════════════════════════════════════════════════════ */

const memory = new LRUCache({
    max: CONFIG.MAX_CONVERSATIONS,
    maxSize: CONFIG.MAX_MEMORY_SIZE,
    sizeCalculation: (value) => JSON.stringify(value).length,
    ttl: CONFIG.MEMORY_TTL,
    updateAgeOnGet: true
});

// Response cache for repeated queries
const responseCache = new LRUCache({
    max: CONFIG.CACHE_MAX,
    ttl: CONFIG.CACHE_TTL
});

function getContext(chat, user) {
    const key = `${chat}_${user}`;
    const data = memory.get(key);
    return data?.history || [];
}

function getSummary(chat, user) {
    const key = `${chat}_${user}`;
    const data = memory.get(key);
    return data?.summary || null;
}

function addHistory(chat, user, role, content) {
    const key = `${chat}_${user}`;
    const data = memory.get(key) || { history: [], summary: null, messageCount: 0 };

    data.history.push({
        role,
        content,
        timestamp: Date.now()
    });
    data.messageCount++;

    // Keep only recent messages
    if (data.history.length > CONFIG.MAX_HISTORY) {
        data.history.shift();
    }

    memory.set(key, data);
    return data;
}

function setSummary(chat, user, summary) {
    const key = `${chat}_${user}`;
    const data = memory.get(key) || { history: [], summary: null, messageCount: 0 };
    data.summary = summary;
    memory.set(key, data);
}

function clearHistory(chat, user) {
    memory.delete(`${chat}_${user}`);
}

function getMemoryStats() {
    const cbStats = Array.from(circuitBreakers.values()).map(cb => cb.getStats());

    return {
        conversations: memory.size,
        maxConversations: CONFIG.MAX_CONVERSATIONS,
        memoryUsed: memory.calculatedSize,
        maxMemory: CONFIG.MAX_MEMORY_SIZE,
        utilization: ((memory.calculatedSize / CONFIG.MAX_MEMORY_SIZE) * 100).toFixed(2) + '%',
        cacheHits: responseCache.size,
        providers: cbStats
    };
}

/* ═══════════════════════════════════════════════════════════════
   RETRY UTILITY
   ═══════════════════════════════════════════════════════════════ */

async function withRetry(fn, maxRetries = 2, baseDelay = 1000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry on certain errors
            if (error.response?.status === 401 || error.response?.status === 403) {
                throw error;
            }

            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    throw lastError;
}

/* ═══════════════════════════════════════════════════════════════
   AI PROVIDERS (Enhanced with Circuit Breakers)
   ═══════════════════════════════════════════════════════════════ */

// Provider wrapper with circuit breaker
async function callProvider(name, fn, priority = 5) {
    const cb = getCircuitBreaker(name);

    if (!cb.canExecute()) {
        return { error: 'circuit_open', provider: name };
    }

    const startTime = Date.now();

    try {
        const result = await fn();

        if (result?.text) {
            cb.recordSuccess(Date.now() - startTime);
            return { ...result, responseTime: Date.now() - startTime, priority };
        }

        cb.recordFailure();
        return null;
    } catch (error) {
        cb.recordFailure();
        return null;
    }
}

// --- Tier 1: Premium Providers (API Keys) ---

async function askOpenAI(prompt, model = 'gpt-4o-mini') {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key === 'null') return null;

    return callProvider('OpenAI', async () => {
        const r = await axios.post('https://api.openai.com/v1/chat/completions', {
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            max_tokens: 1024,
            temperature: 0.8
        }, {
            headers: { Authorization: `Bearer ${key}` },
            timeout: CONFIG.REQUEST_TIMEOUT
        });

        return {
            text: r.data.choices[0].message.content,
            provider: 'OpenAI',
            model,
            tokens: r.data.usage?.total_tokens
        };
    }, 1);
}

async function askGemini(prompt) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'null') return null;

    return callProvider('Gemini', async () => {
        const r = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
            {
                contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nQuery: ${prompt}` }] }],
                generationConfig: {
                    maxOutputTokens: 1024,
                    temperature: 0.8
                }
            },
            { timeout: CONFIG.REQUEST_TIMEOUT }
        );

        return {
            text: r.data.candidates[0].content.parts[0].text,
            provider: 'Gemini'
        };
    }, 1);
}

async function askClaude(prompt) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || key === 'null') return null;

    return callProvider('Claude', async () => {
        const r = await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            timeout: CONFIG.REQUEST_TIMEOUT
        });

        return {
            text: r.data.content[0].text,
            provider: 'Claude'
        };
    }, 1);
}

// --- Tier 2: Free Providers (Robust) ---

async function askPollinations(prompt) {
    return callProvider('Pollinations', async () => {
        const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&system=${encodeURIComponent(SYSTEM_PROMPT)}`;
        const r = await axios.get(url, { timeout: CONFIG.REQUEST_TIMEOUT });

        if (typeof r.data !== 'string' || r.data.includes('<!DOCTYPE')) {
            throw new Error('Invalid response');
        }

        return { text: r.data, provider: 'Pollinations' };
    }, 2);
}

async function askBlackbox(prompt) {
    return callProvider('Blackbox', async () => {
        const r = await axios.post('https://api.blackbox.ai/api/chat', {
            messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${prompt}` }],
            model: 'gpt-4o',
            max_tokens: 1024
        }, {
            headers: {
                'Origin': 'https://www.blackbox.ai',
                'Content-Type': 'application/json'
            },
            timeout: CONFIG.REQUEST_TIMEOUT
        });

        let text = r.data;
        if (typeof text === 'string') {
            text = text.replace(/\$@\$v=.*?\$@\$/g, '').trim();
        }

        if (!text || text.includes('<!DOCTYPE')) {
            throw new Error('Invalid response');
        }

        return { text, provider: 'Blackbox' };
    }, 2);
}

async function askDDG(prompt) {
    return callProvider('DuckDuckGo', async () => {
        // DuckDuckGo AI Chat endpoint
        const r = await axios.post('https://duckduckgo.com/duckchat/v1/chat', {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'user', content: `${SYSTEM_PROMPT}\n\n${prompt}` }
            ]
        }, {
            headers: {
                'x-vqd-4': '', // May need token
                'Content-Type': 'application/json'
            },
            timeout: CONFIG.REQUEST_TIMEOUT
        });

        return { text: r.data.message, provider: 'DuckDuckGo' };
    }, 2);
}

// --- Tier 3: GiftedTech Providers ---

async function askGifted(endpoint, prompt, providerName) {
    return callProvider(providerName, async () => {
        const r = await axios.get(
            `https://api.giftedtech.co.ke/api/ai/${endpoint}?apikey=gifted&q=${encodeURIComponent(SYSTEM_PROMPT + ' ' + prompt)}`,
            { timeout: CONFIG.REQUEST_TIMEOUT }
        );

        const data = r.data;
        const text = typeof data === 'string'
            ? data
            : (data.result || data.response || data.answer || data.message || data.data);

        if (!text || (typeof text === 'string' && text.includes('<!DOCTYPE'))) {
            throw new Error('Invalid response');
        }

        return { text, provider: providerName };
    }, 3);
}

// --- Vision Providers ---

async function analyzeImageGemini(buffer, prompt) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'null') return null;

    return callProvider('Gemini Vision', async () => {
        const r = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
            {
                contents: [{
                    parts: [
                        { text: `${SYSTEM_PROMPT}\n\n${prompt || 'Describe this image in detail'}` },
                        { inline_data: { mime_type: 'image/jpeg', data: buffer.toString('base64') } }
                    ]
                }],
                generationConfig: { maxOutputTokens: 1024 }
            },
            { timeout: CONFIG.REQUEST_TIMEOUT }
        );

        return {
            text: r.data.candidates[0].content.parts[0].text,
            provider: 'Gemini Vision'
        };
    }, 1);
}

async function analyzeImageOpenAI(buffer, prompt) {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key === 'null') return null;

    return callProvider('OpenAI Vision', async () => {
        const r = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: `${SYSTEM_PROMPT}\n\n${prompt || 'Describe this image'}` },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${buffer.toString('base64')}`,
                            detail: 'low'
                        }
                    }
                ]
            }],
            max_tokens: 1024
        }, {
            headers: { Authorization: `Bearer ${key}` },
            timeout: CONFIG.REQUEST_TIMEOUT
        });

        return {
            text: r.data.choices[0].message.content,
            provider: 'OpenAI Vision'
        };
    }, 1);
}

async function analyzeImage(buffer, prompt) {
    // Try Gemini first, then OpenAI
    const result = await analyzeImageGemini(buffer, prompt)
        || await analyzeImageOpenAI(buffer, prompt);

    return result;
}

// --- TTS ---

async function getTTS(text, lang = 'en') {
    try {
        // Truncate for TTS
        const truncated = text.slice(0, 500);

        const r = await axios.get(
            `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(truncated)}&tl=${lang}&client=tw-ob`,
            {
                responseType: 'arraybuffer',
                timeout: 15000
            }
        );

        return r.data;
    } catch {
        return null;
    }
}

/* ═══════════════════════════════════════════════════════════════
   SMART RESPONSE CONTROLLER
   Parallel racing with priority weighting
   ═══════════════════════════════════════════════════════════════ */

async function getSmartResponse(prompt, options = {}) {
    const { useCache = true, preferredProvider = null } = options;

    // Check response cache
    if (useCache) {
        const cacheKey = prompt.slice(0, 100).toLowerCase().trim();
        const cached = responseCache.get(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }
    }

    // Build provider list based on availability
    const providers = [];

    // Tier 1: Premium (if keys available)
    if (process.env.OPENAI_API_KEY) providers.push(askOpenAI(prompt));
    if (process.env.GEMINI_API_KEY) providers.push(askGemini(prompt));
    if (process.env.ANTHROPIC_API_KEY) providers.push(askClaude(prompt));

    // Tier 2: Free robust
    providers.push(
        askPollinations(prompt),
        askBlackbox(prompt)
    );

    // Tier 3: GiftedTech fallbacks
    providers.push(
        askGifted('claude', prompt, 'Claude (Free)'),
        askGifted('llama-3.3-70b', prompt, 'Llama 3.3'),
        askGifted('gpt', prompt, 'GPT (Free)'),
        askGifted('deepseek-r1', prompt, 'DeepSeek'),
        askGifted('mistral', prompt, 'Mistral')
    );

    // Race all providers
    const results = await Promise.allSettled(providers);

    // Filter successful results and sort by priority
    const successful = results
        .filter(r => r.status === 'fulfilled' && r.value?.text)
        .map(r => r.value)
        .sort((a, b) => (a.priority || 5) - (b.priority || 5));

    if (successful.length === 0) {
        return null;
    }

    // Pick best result (lowest priority number = highest priority)
    const best = successful[0];

    // Cache the response
    if (useCache && best.text.length < 5000) {
        const cacheKey = prompt.slice(0, 100).toLowerCase().trim();
        responseCache.set(cacheKey, best);
    }

    return best;
}

/* ═══════════════════════════════════════════════════════════════
   CONTEXT BUILDER
   Builds optimized context from history + summary
   ═══════════════════════════════════════════════════════════════ */

function buildContext(chat, user, currentInput) {
    const history = getContext(chat, user);
    const summary = getSummary(chat, user);

    if (history.length === 0 && !summary) {
        return currentInput;
    }

    let contextParts = [];

    // Add summary if available
    if (summary) {
        contextParts.push(`[Previous conversation summary: ${summary}]`);
    }

    // Add recent history
    if (history.length > 0) {
        const recentHistory = history
            .slice(-6) // Last 6 messages
            .map(h => `${h.role === 'user' ? 'User' : 'Vesperr'}: ${h.content.slice(0, 200)}`)
            .join('\n');

        contextParts.push(`Recent conversation:\n${recentHistory}`);
    }

    contextParts.push(`Current query: ${currentInput}`);

    return contextParts.join('\n\n');
}

/* ═══════════════════════════════════════════════════════════════
   STREAMING SIMULATOR
   Simulates typing effect for better UX
   ═══════════════════════════════════════════════════════════════ */

async function streamResponse(sock, chat, tempMsgKey, text, header, footer) {
    const words = text.split(' ');
    let currentText = '';
    const totalChunks = Math.ceil(words.length / CONFIG.STREAM_CHUNK_SIZE);

    // Adaptive delay based on text length
    const baseDelay = words.length > 100 ? 100 : CONFIG.STREAM_CHUNK_DELAY;

    for (let i = 0; i < words.length; i += CONFIG.STREAM_CHUNK_SIZE) {
        const chunk = words.slice(i, i + CONFIG.STREAM_CHUNK_SIZE).join(' ');
        currentText += (currentText ? ' ' : '') + chunk;

        // Progress indicator
        const progress = Math.round((i / words.length) * 100);
        const cursor = progress < 100 ? ' ▌' : '';

        const ui = `${header}${currentText}${cursor}${footer}`;

        try {
            await sock.sendMessage(chat, { text: ui, edit: tempMsgKey });
        } catch (err) {
            // If edit fails, continue without streaming
            break;
        }

        // Adaptive delay with slight randomization
        const delay = baseDelay + Math.random() * 50;
        await new Promise(r => setTimeout(r, delay));
    }

    // Final update without cursor
    const finalUI = `${header}${text}${footer}`;
    await sock.sendMessage(chat, { text: finalUI, edit: tempMsgKey });
}

/* ═══════════════════════════════════════════════════════════════
   HELP & INFO GENERATORS
   ═══════════════════════════════════════════════════════════════ */

function generateHelp() {
    return `✧･ﾟ: *✧ VESPERR AI ✧*:･ﾟ✧

⌘ *Commands:*
┊ ❯❯ \`.ai <query>\` - Ask anything
┊ ❯❯ \`.ai -v <query>\` - Voice response  
┊ ❯❯ \`.ai clear\` - Clear memory

✦ *Features:*
┊ ⊹ Reply to images for analysis
┊ ⊹ Follow-up conversations
┊ ⊹ Memory lasts 1 hour

_Type \`.ai hello\` to begin_ ༄`;
}

function generateStats() {
    const stats = getMemoryStats();

    let providerStatus = stats.providers
        .map(p => {
            const icon = p.state === 'CLOSED' ? '🟢' : p.state === 'OPEN' ? '🔴' : '🟡';
            return `${icon} ${p.name}: ${p.successRate}`;
        })
        .join('\n');

    return `📊 *VESPERR AI STATS*

💬 *Conversations:* ${stats.conversations}/${stats.maxConversations}
🧠 *Memory:* ${stats.utilization}
📦 *Cache Hits:* ${stats.cacheHits}
⚡ *Mode:* Parallel Racing

*Provider Health:*
${providerStatus || 'No data yet'}`;
}

function generateModels() {
    return `🤖 *AI MODELS*

🔑 *Premium (API Key):*
• OpenAI GPT-4o-mini
• Google Gemini 1.5 Flash  
• Anthropic Claude 3 Haiku

🆓 *Free (Auto-fallback):*
• Pollinations AI
• Blackbox GPT-4o
• Claude (GiftedTech)
• Llama 3.3 70B
• DeepSeek R1
• Mistral

👁️ *Vision:*
• Gemini Vision
• OpenAI Vision

_All providers race simultaneously!_`;
}

function generateHealth() {
    const stats = getMemoryStats();

    const providers = stats.providers.map(p => {
        const stateIcon = {
            'CLOSED': '🟢 Healthy',
            'OPEN': '🔴 Down',
            'HALF_OPEN': '🟡 Testing'
        }[p.state];

        return `*${p.name}*
  State: ${stateIcon}
  Success: ${p.successRate}
  Avg Time: ${p.avgResponseTime}
  Calls: ${p.totalCalls}`;
    });

    return `🏥 *PROVIDER HEALTH*

${providers.join('\n\n') || 'No providers used yet'}

_Circuit breakers protect against failures_`;
}

/* ═══════════════════════════════════════════════════════════════
   PLUGIN EXPORT
   ═══════════════════════════════════════════════════════════════ */

export default {
    name: 'ai',
    alias: ['chat', 'gpt', 'bot', 'ask', 'gemini', 'claude', 'vesperr'],
    category: 'ai',
    desc: 'Ask Vesperr AI - supports text, images & voice',
    react: '🧠',

    command: {
        pattern: 'ai',
        run: async ({ sock, msg, args, context }) => {
            const chat = msg.key.remoteJid;
            // Support both old and new (LID) identifier formats
            const user = msg.key.participant || msg.key.participantAlt || msg.key.remoteJid;
            let input = args.join(' ');

            // 1. Rate Limit Check
            const limit = checkRateLimit(user);
            if (!limit.allowed) {
                return sock.sendMessage(chat, {
                    text: `⏳ *Cool down!* Wait ${limit.wait}s before trying again.`
                }, { quoted: msg });
            }

            // Show warning if approaching daily limit
            if (limit.warning) {
                await sock.sendMessage(chat, { text: limit.warning }, { quoted: msg });
            }

            // 2. Parse Flags
            const wantsVoice = /--voice|-v\b/i.test(input);
            const noStream = /--nostream|-ns\b/i.test(input);
            input = input.replace(/--voice|-v|--nostream|-ns/gi, '').trim();

            // 3. Handle Commands
            const command = input.toLowerCase();

            // stats command removed - hidden from users

            // models command removed - hidden from users

            if (command === 'health') {
                return sock.sendMessage(chat, { text: generateHealth() }, { quoted: msg });
            }

            if (['clear', 'reset', 'forget'].includes(command)) {
                clearHistory(chat, user);
                return sock.sendMessage(chat, {
                    text: '🗑️ *Memory Cleared!* Starting fresh. 💫'
                }, { quoted: msg });
            }

            if (['help', '?', ''].includes(command) && !msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                return sock.sendMessage(chat, { text: generateHelp() }, { quoted: msg });
            }

            // 4. Context & Reply Handling
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
            const botJid = getBotJid(sock);
            const isReplyToBot = quotedParticipant === botJid;
            const isImageReply = !!(quoted?.imageMessage || msg.message?.imageMessage);

            // If no input and no context, show help
            if (!input && !quoted && !isImageReply) {
                return sock.sendMessage(chat, { text: generateHelp() }, { quoted: msg });
            }

            // 5. Show Typing Indicator
            await sock.sendPresenceUpdate('composing', chat);

            const thinkingText = isImageReply ? '🔍 *Analyzing image...*' : '💭 *Thinking...*';
            const tempMsg = await sock.sendMessage(chat, { text: thinkingText }, { quoted: msg });

            try {
                let response = null;
                const startTime = Date.now();

                // --- PATH A: IMAGE ANALYSIS ---
                if (isImageReply) {
                    const imgMsg = quoted?.imageMessage || msg.message?.imageMessage;

                    try {
                        const buffer = await downloadMediaMessage(
                            { message: { imageMessage: imgMsg } },
                            'buffer',
                            {}
                        );

                        response = await analyzeImage(buffer, input || 'Describe this image');
                    } catch (imgErr) {
                        console.error('Image download error:', imgErr.message);
                    }

                    // Fallback to text if vision fails
                    if (!response) {
                        response = await getSmartResponse(
                            `[User sent an image they want analyzed] ${input || 'Please describe what you see'}`
                        );
                    }
                }
                // --- PATH B: TEXT CONVERSATION ---
                else {
                    // Handle reply context
                    if (quoted && isReplyToBot) {
                        const prevBotMsg = quoted.conversation ||
                            quoted.extendedTextMessage?.text || '';

                        if (prevBotMsg) {
                            // Add to history if not already there
                            const history = getContext(chat, user);
                            if (history.length === 0 || history[history.length - 1]?.content !== prevBotMsg) {
                                addHistory(chat, user, 'assistant', prevBotMsg.slice(0, 500));
                            }
                        }
                    }

                    // Build context
                    const fullPrompt = buildContext(chat, user, input);

                    // Get response
                    response = await withRetry(
                        () => getSmartResponse(fullPrompt),
                        1,
                        1000
                    );
                }

                // 6. Send Response
                if (response?.text) {
                    // Store in history
                    addHistory(chat, user, 'user', input || '[Image]');
                    addHistory(chat, user, 'assistant', response.text.slice(0, 1000));

                    // Build UI
                    const responseTime = Date.now() - startTime;
                    const header = `─── ✧ *VESPERR* ✧ ───
`;
                    const footer = `
───────────────────
_⊹ ${responseTime}ms_`;

                    // Stream or instant
                    if (!noStream && response.text.length > 50) {
                        await streamResponse(sock, chat, tempMsg.key, response.text, header, footer);
                    } else {
                        const finalUI = `${header}${response.text}${footer}`;
                        await sock.sendMessage(chat, { text: finalUI, edit: tempMsg.key });
                    }

                    // Voice Mode
                    if (wantsVoice) {
                        await sock.sendPresenceUpdate('recording', chat);
                        const audio = await getTTS(response.text);
                        if (audio) {
                            await sock.sendMessage(chat, {
                                audio,
                                mimetype: 'audio/mpeg',
                                ptt: true
                            }, { quoted: msg });
                        }
                    }
                } else {
                    await sock.sendMessage(chat, {
                        text: '⚠️ *All AI providers are busy.* Please try again in a moment.',
                        edit: tempMsg.key
                    });
                }

            } catch (error) {
                console.error('AI Plugin Error:', error);

                await sock.sendMessage(chat, {
                    text: '❌ *Error processing request.*\n\nTry `.ai health` to check provider status.',
                    edit: tempMsg.key
                });
            } finally {
                await sock.sendPresenceUpdate('paused', chat);
            }
        }
    }
};

// Export utilities for testing/external use
export {
    getMemoryStats,
    checkRateLimit,
    getSmartResponse,
    circuitBreakers
};