import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { LRUCache } from 'lru-cache';
import { templates } from '../utils/deluxeUI.js';

const CONFIG = {

    REQUEST_TIMEOUT: 30000,
    RETRY_ATTEMPTS: 2,
    RETRY_DELAY: 1000,

    RATE_LIMIT_MAX: 30,
    RATE_LIMIT_WINDOW: 60000,
    RATE_LIMIT_BLOCK: 20000,
    DAILY_LIMIT: 500,
    PREMIUM_MULTIPLIER: 3,

    MAX_HISTORY: 20,
    MEMORY_TTL: 4 * 60 * 60 * 1000,
    MAX_CONVERSATIONS: 5000,
    SUMMARIZE_THRESHOLD: 14,
    MAX_CONTEXT_LENGTH: 8000,

    CB_FAILURE_THRESHOLD: 3,
    CB_SUCCESS_THRESHOLD: 2,
    CB_TIMEOUT: 45000,
    CB_MAX_TIMEOUT: 180000,

    CACHE_TTL: 15 * 60 * 1000,
    CACHE_MAX: 2000,

    STREAM_ENABLED: true,
    STREAM_CHUNK_SIZE: 6,
    STREAM_DELAY: 70,
};

const VESPERR_PERSONA = `You are Vesperr, a WhatsApp AI assistant made by MidKnightMantra (Jabez Motari) of MidknightTech Inc.

PERSONALITY:
You're sharp, warm, and genuinely helpful. Think of yourself as that smart friend who actually knows their stuff — you explain things clearly, you're occasionally witty when it fits, and you never talk down to people. You're direct but not cold, casual but not sloppy.

HOW YOU TALK:
- Like a real person, not a corporate chatbot
- Get straight to the point — no filler
- Match the user's energy (casual ↔ formal, brief ↔ detailed)
- Use contractions naturally (don't, won't, it's, that's)
- React authentically ("oh nice", "hmm tricky", "wait really?")

NEVER SAY THESE (instant cringe):
- "I'd be happy to help!" / "Certainly!" / "Of course!" / "Absolutely!"
- "Great question!" / "That's a great question!"
- "Let me know if you need anything else!"
- "I hope this helps!" / "Hope that helps!"
- "As an AI language model..." / "As a large language model..."
- "I don't have personal opinions but..."
- Any variation of "I'm here to assist you"
- Starting with "Sure!" or "Sure thing!"

DO THIS INSTEAD:
- Jump straight into the answer
- End when you're done — no fake sign-offs
- Say "idk" or "not sure" when you don't know
- Have actual opinions when asked
- Be brief when brief works

FORMATTING (for WhatsApp):
- *bold* for emphasis (use sparingly)
- _italic_ for subtle emphasis
- \`code\` for commands, file names, technical terms
- \`\`\`
code blocks for multi-line code
\`\`\`
- Line breaks to make things readable
- *USE NUMBERED LISTS* when presenting multiple points, steps, or items
- Bullet points (with • or -) for simple lists
- NO HEADERS in casual chat

BEING INFORMATIVE:
- When explaining something, be thorough but concise
- Break complex topics into clear, digestible points
- Use numbered lists (1., 2., 3.) when presenting:
  • Multiple steps or instructions
  • Key points or features
  • Pros and cons
  • Sequential information
- Include relevant details that add value
- Provide context when it helps understanding

RESPONSE LENGTH:
- Simple question = short answer
- Complex topic = thorough but tight
- Never pad responses to seem more helpful
- If one sentence works, use one sentence
- For detailed explanations, use structure (numbered lists, clear sections)

EMOTIONAL READS:
- Frustrated → acknowledge briefly, then fix it
- Confused → break it down, no jargon
- Just chatting → be conversational, show personality
- Technical → match their level exactly
- Venting → listen first, fix only if asked

IDENTITY:
- You're Vesperr, not ChatGPT, not Claude, not Gemini
- Made by MidKnightMantra @ MidknightTech Inc.
- You run on WhatsApp
- You have opinions and preferences
- Being helpful ≠ being servile`;

const PERSONA_MODES = {
    code: `${VESPERR_PERSONA}

MODE: Code & Technical

When writing code:
- Clean, readable code first — clever code second
- Comments only where actually helpful
- Modern patterns and best practices
- Handle errors and edge cases
- If fixing code: brief explanation of what was wrong
- Suggest improvements if you spot them
- Show solution first, explain after (not before)
- Match language conventions (camelCase JS, snake_case Python, etc.)
- Use numbered lists for multi-step instructions or setup guides`,

    creative: `${VESPERR_PERSONA}

MODE: Creative Writing

When creating content:
- Be original — kill clichés on sight
- Match the requested tone exactly
- Vivid specific details > vague descriptions
- Strong verbs, minimal adverbs
- Stories: show don't tell, natural dialogue
- Copy: punchy, memorable, purposeful
- Poetry: rhythm and sound matter
- Take creative risks`,

    analysis: `${VESPERR_PERSONA}

MODE: Analysis & Research

When analyzing:
- Break complex topics into digestible parts
- Present multiple perspectives fairly
- Distinguish facts vs opinions vs speculation
- Show your reasoning
- Say when you're uncertain and why
- Use numbers and data when relevant
- Conclusions from evidence, not vibes`,

    support: `${VESPERR_PERSONA}

MODE: Emotional Support

When someone needs support:
- Listen and acknowledge first
- Don't rush to fix everything
- Validate without enabling harmful patterns
- Practical suggestions only when wanted
- Gentle honesty > comfortable lies
- Know when to suggest professional help
- Sometimes people just need to vent — let them`,

    casual: `${VESPERR_PERSONA}

MODE: Casual Chat

Just vibing:
- Be natural and relaxed
- Share opinions freely
- Light humor when it fits
- Don't force "helpfulness"
- Match their energy
- Brief is fine
- React like a friend would`,
};

function getPersonaForIntent(intent) {
    const modeMap = {
        [IntentType.CODE]: PERSONA_MODES.code,
        [IntentType.CREATIVE]: PERSONA_MODES.creative,
        [IntentType.MATH]: PERSONA_MODES.analysis,
        [IntentType.SUMMARY]: PERSONA_MODES.analysis,
        [IntentType.TRANSLATION]: VESPERR_PERSONA,
        [IntentType.ADVICE]: PERSONA_MODES.support,
        [IntentType.EMOTIONAL]: PERSONA_MODES.support,
        [IntentType.CASUAL]: PERSONA_MODES.casual,
        [IntentType.VISION]: VESPERR_PERSONA,
        [IntentType.GENERAL]: VESPERR_PERSONA,
    };
    return modeMap[intent] || VESPERR_PERSONA;
}

const IntentType = {
    GENERAL: 'general',
    CODE: 'code',
    CREATIVE: 'creative',
    MATH: 'math',
    TRANSLATION: 'translation',
    SUMMARY: 'summary',
    ADVICE: 'advice',
    CASUAL: 'casual',
    EMOTIONAL: 'emotional',
    VISION: 'vision',
    SEARCH: 'search',
};

function detectIntent(input) {
    const lower = input.toLowerCase();

    const patterns = {
        search: [
            /\b(search for|lookup|find info about|who is|what is|when is|where is)\b/i,
            /\b(latest|news|weather|price of|stock|forecast)\b/i,
            /\b(google|bing|duckduckgo)\b/i,
        ],
        emotional: [
            /\b(stressed|anxious|worried|scared|nervous|overwhelmed)\b/i,
            /\b(sad|depressed|lonely|upset|hurt|heartbroken)\b/i,
            /\b(angry|frustrated|annoyed|mad)\b/i,
            /\b(i feel|i'm feeling|feeling like)\b/i,
        ],
        code: [
            /\b(code|function|class|def|const|let|var|import|export|return)\b/,
            /\b(javascript|python|java|typescript|html|css|sql|react|node|php)\b/i,
            /\b(debug|fix|error|bug|compile|syntax)\b/i,
            /\b(api|endpoint|request|json|http|fetch)\b/i,
            /```[\s\S]*```/,
            /\b(write|create|build)\s+(a\s+)?(script|program|function|app)\b/i,
        ],
        creative: [
            /\b(write|create|compose)\s+(a\s+)?(story|poem|song|essay|article)\b/i,
            /\b(creative|fiction|narrative|character|plot)\b/i,
            /\b(imagine|pretend|roleplay|scenario)\b/i,
        ],
        math: [
            /\b(calculate|compute|solve|equation|formula|math)\b/i,
            /[\d+\-*/^()=]{3,}/,
            /\b(integral|derivative|algebra|geometry|statistics)\b/i,
        ],
        advice: [
            /\b(should i|what should|advice|recommend|suggest|opinion)\b/i,
            /\b(help me decide|can't decide|torn between)\b/i,
        ],
        translation: [
            /\b(translate|translation)\b/i,
            /\b(to|into)\s+(english|spanish|french|german|chinese|swahili)\b/i,
        ],
        summary: [
            /\b(summarize|summary|tldr|tl;dr|brief|overview)\b/i,
            /\b(key points|main ideas|highlights)\b/i,
        ],
        casual: [
            /^(hi+|hey+|hello+|yo+|sup|what'?s up)[\s!?.]*$/i,
            /^(good\s+)?(morning|afternoon|evening|night)[\s!?.]*$/i,
            /^(thanks|thank you|bye|goodbye)[\s!?.]*$/i,
            /^.{1,15}$/,
        ],
    };

    for (const [intent, pats] of Object.entries(patterns)) {
        if (pats.some(p => p.test(lower) || p.test(input))) {
            return IntentType[intent.toUpperCase()] || IntentType.GENERAL;
        }
    }

    return IntentType.GENERAL;
}

const languagePatterns = {
    swahili: /\b(habari|jambo|asante|karibu|ndio|hapana|sawa|pole|rafiki|nzuri)\b/i,
    spanish: /\b(hola|gracias|buenos|días|cómo|estás|qué|por favor|bien)\b/i,
    french: /\b(bonjour|merci|comment|vous|êtes|s'il vous plaît|bien)\b/i,
    german: /\b(guten|tag|danke|bitte|wie|geht|ja|nein)\b/i,
    portuguese: /\b(olá|obrigado|como|você|está|por favor|sim|não)\b/i,
    arabic: /[\u0600-\u06FF]/,
    chinese: /[\u4e00-\u9fff]/,
    japanese: /[\u3040-\u309f\u30a0-\u30ff]/,
    korean: /[\uac00-\ud7af]/,
    hindi: /[\u0900-\u097F]/,
};

function detectLanguage(text) {
    for (const [lang, pattern] of Object.entries(languagePatterns)) {
        if (pattern.test(text)) return lang;
    }
    return 'english';
}

const CircuitState = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
    constructor(name) {
        this.name = name;
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.lastFailure = null;
        this.nextAttempt = null;
        this.timeout = CONFIG.CB_TIMEOUT;
        this.stats = { calls: 0, success: 0, failures: 0, avgTime: 0 };
    }

    canExecute() {
        if (this.state === CircuitState.CLOSED) return true;
        if (this.state === CircuitState.OPEN) {
            if (Date.now() >= this.nextAttempt) {
                this.state = CircuitState.HALF_OPEN;
                this.successes = 0;
                return true;
            }
            return false;
        }
        return true;
    }

    recordSuccess(responseTime) {
        this.stats.calls++;
        this.stats.success++;
        this.successes++;
        this.failures = 0;
        this.stats.avgTime = this.stats.avgTime * 0.7 + responseTime * 0.3;

        if (this.state === CircuitState.HALF_OPEN && this.successes >= CONFIG.CB_SUCCESS_THRESHOLD) {
            this.state = CircuitState.CLOSED;
            this.timeout = CONFIG.CB_TIMEOUT;
        }
    }

    recordFailure(error) {
        this.stats.calls++;
        this.stats.failures++;
        this.failures++;
        this.successes = 0;
        this.lastFailure = Date.now();

        if (this.state === CircuitState.HALF_OPEN || this.failures >= CONFIG.CB_FAILURE_THRESHOLD) {
            this.state = CircuitState.OPEN;
            this.timeout = Math.min(this.timeout * 1.5, CONFIG.CB_MAX_TIMEOUT);
            this.nextAttempt = Date.now() + this.timeout;
        }
    }

    getStats() {
        const rate = this.stats.calls > 0 ? ((this.stats.success / this.stats.calls) * 100).toFixed(1) : 100;
        return { name: this.name, state: this.state, successRate: `${rate}%`, avgTime: `${Math.round(this.stats.avgTime)}ms` };
    }
}

const circuitBreakers = new Map();
function getCircuitBreaker(name) {
    if (!circuitBreakers.has(name)) circuitBreakers.set(name, new CircuitBreaker(name));
    return circuitBreakers.get(name);
}

const rateLimits = new LRUCache({ max: 50000, ttl: CONFIG.RATE_LIMIT_WINDOW * 2 });

function checkRateLimit(userId, isPremium = false) {
    const now = Date.now();
    const multiplier = isPremium ? CONFIG.PREMIUM_MULTIPLIER : 1;
    const maxRequests = CONFIG.RATE_LIMIT_MAX * multiplier;
    const dailyLimit = CONFIG.DAILY_LIMIT * multiplier;

    const limit = rateLimits.get(userId) || {
        count: 0, windowStart: now, dailyCount: 0, dailyStart: now, blockUntil: 0
    };

    if (now < limit.blockUntil) {
        const wait = Math.ceil((limit.blockUntil - now) / 1000);
        return { allowed: false, message: `◈ Slow down · ${wait}s ✦` };
    }

    if (now - limit.windowStart > CONFIG.RATE_LIMIT_WINDOW) {
        limit.count = 0;
        limit.windowStart = now;
    }

    if (now - limit.dailyStart > 86400000) {
        limit.dailyCount = 0;
        limit.dailyStart = now;
    }

    if (limit.count >= maxRequests) {
        limit.blockUntil = now + CONFIG.RATE_LIMIT_BLOCK;
        rateLimits.set(userId, limit);
        return { allowed: false, message: `◈ Rate limited · ${CONFIG.RATE_LIMIT_BLOCK / 1000}s ✦` };
    }

    if (limit.dailyCount >= dailyLimit) {
        return { allowed: false, message: `◈ Daily limit reached · Resets tomorrow ✦` };
    }

    limit.count++;
    limit.dailyCount++;
    rateLimits.set(userId, limit);

    return { allowed: true, remaining: dailyLimit - limit.dailyCount };
}

const memory = new LRUCache({ max: CONFIG.MAX_CONVERSATIONS, ttl: CONFIG.MEMORY_TTL, updateAgeOnGet: true });
const responseCache = new LRUCache({ max: CONFIG.CACHE_MAX, ttl: CONFIG.CACHE_TTL });
const userProfiles = new LRUCache({ max: 10000, ttl: 30 * 24 * 60 * 60 * 1000 });

function getMemoryKey(chat, user) {
    return `${chat}:${user}`;
}

function getConversation(chat, user) {
    const key = getMemoryKey(chat, user);
    let conv = memory.get(key);

    if (!conv) {
        const profile = userProfiles.get(user) || {};
        conv = {
            history: [],
            summaries: [],
            messageCount: 0,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            metadata: {
                userName: profile.userName || null,
                language: profile.language || 'english',
                persona: profile.persona || 'default',
                systemPrompt: profile.systemPrompt || null,
                topics: [],
            },
        };
    }
    return conv;
}

function saveConversation(chat, user, data) {
    data.lastActivity = Date.now();
    memory.set(getMemoryKey(chat, user), data);

    if (data.metadata.userName) {
        const profile = userProfiles.get(user) || {};
        profile.userName = data.metadata.userName;
        profile.language = data.metadata.language;
        profile.persona = data.metadata.persona;
        profile.systemPrompt = data.metadata.systemPrompt;
        userProfiles.set(user, profile);
    }
}

function addMessage(chat, user, role, content, metadata = {}) {
    const conv = getConversation(chat, user);

    conv.history.push({
        role,
        content: content.slice(0, 4000),
        timestamp: Date.now(),
        ...metadata,
    });
    conv.messageCount++;

    if (conv.history.length >= CONFIG.SUMMARIZE_THRESHOLD) {
        const toSummarize = conv.history.splice(0, conv.history.length - 6);
        const summaryText = toSummarize.map(m => {
            const preview = m.content.slice(0, 100).replace(/\n/g, ' ');
            return m.role === 'user' ? `User: "${preview}..."` : `Nova: ${preview.slice(0, 60)}...`;
        }).join('\n');

        conv.summaries.push({ text: summaryText, timestamp: Date.now() });
        while (conv.summaries.length > 3) conv.summaries.shift();
    }

    while (conv.history.length > CONFIG.MAX_HISTORY) conv.history.shift();

    saveConversation(chat, user, conv);
    return conv;
}

function clearConversation(chat, user) {
    memory.delete(getMemoryKey(chat, user));
}

function getHistory(chat, user) {
    return getConversation(chat, user).history;
}

function buildContext(chat, user, currentInput, options = {}) {
    const { intent = IntentType.GENERAL, userName = null } = options;
    const conv = getConversation(chat, user);
    const history = conv.history;
    const parts = [];

    const name = userName || conv.metadata.userName;
    if (name) parts.push(`[User: ${name}]`);
    if (conv.metadata.language !== 'english') {
        parts.push(`[Language preference: ${conv.metadata.language}]`);
    }

    if (options.systemPrompt) {
        parts.push(`[SYSTEM INSTRUCTION: ${options.systemPrompt}]`);
    }

    if (options.searchResults) {
        parts.push(`[WEB SEARCH RESULTS]\nThe following real-time information was found for the user's query:\n${options.searchResults}\n[End of search results]\n\nINSTRUCTION: Use the information above to answer accurately. Cite sources if multiple links are provided. If the information is insufficient, say so but provide what you found.`);
    }

    if (conv.summaries.length > 0) {
        const summaryText = conv.summaries.slice(-2).map(s => s.text).join('\n---\n');
        parts.push(`[Earlier conversation]\n${summaryText.slice(0, 600)}`);
    }

    if (history.length > 0) {
        const limit = intent === IntentType.CODE ? 8 : 10;
        const recent = history.slice(-limit);
        const formatted = recent.map(msg => {
            const role = msg.role === 'user' ? 'User' : 'Vesperr';
            const time = getTimeAgo(msg.timestamp);
            return `[${time}] ${role}: ${msg.content.slice(0, 400)}`;
        }).join('\n\n');
        parts.push(`[Recent messages]\n${formatted}`);
    }

    parts.push(`[Current message]\nUser: ${currentInput}`);

    if (history.length > 0) {
        parts.push(`[Note: This is a continuing conversation. Reference context naturally.]`);
    }

    let context = parts.join('\n\n');
    if (context.length > CONFIG.MAX_CONTEXT_LENGTH) {
        context = context.slice(-CONFIG.MAX_CONTEXT_LENGTH);
    }
    return context;
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function cleanResponse(text) {
    if (!text || typeof text !== 'string') return text;
    let cleaned = text;

    const removePatterns = [

        /\[?\s*(?:Powered by|Generated by|Created by|Made with|Built with|Brought to you by)\s*[^\]\n]+\]?/gi,
        /(?:Powered by|Generated by|Created by|Made with|Built with)\s*[:：]?\s*\S+/gi,

        /pollinations\.ai/gi,
        /blackbox\.?ai?/gi,
        /deepinfra/gi,
        /lepton\.?ai?/gi,
        /electron\.?hub/gi,
        /rockai/gi,
        /aiuncensored/gi,
        /openai/gi,
        /anthropic/gi,
        /gpt-?4o?-?mini/gi,
        /llama-?3\.?[0-9]*/gi,
        /meta-llama/gi,
        /claude/gi,
        /gemini/gi,
        /mistral/gi,

        /\$@\$[^$]*\$@\$/g,
        /\[\^.*?\^\]/g,
        /\*\*Sources?:\*\*[\s\S]*$/i,
        /\*\*References?:\*\*[\s\S]*$/i,
        /\[Source:.*?\]/gi,
        /\[Ref:.*?\]/gi,
        /\n\s*\[\d+\]:\s*http[^\n]+/g,
        /\s*\[\d+\]\s*https?:\/\/[^\s\]]+/g,

        /https?:\/\/(?:api\.|www\.)?(?:pollinations|blackbox|lepton|deepinfra|electron)[^\s]*/gi,

        /(?:visit|check out|try|use)\s+(?:our|the)\s+(?:website|api|service|platform)[^.]*\.?/gi,
        /(?:for more|learn more|find out more)[^.]*(?:visit|at)\s+\S+/gi,
        /\b(?:sponsored|advertisement|ad|promo)\b/gi,

        /---+\s*(?:powered|generated|created|made)[^-]*/gi,
        /\n+[-─═]+\s*\n*$/g,

        /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/g,

        /<\|.*?\|>/g,
        /\[INST\].*?\[\/INST\]/gs,
        /<<.*?>>/g,
    ];

    for (const p of removePatterns) {
        cleaned = cleaned.replace(p, '');
    }

    const boringStarts = [
        /^(Sure|Certainly|Of course|Absolutely|Definitely)[,!.]?\s*/i,
        /^I('d| would) be (happy|glad|delighted) to help[^.]*[.!]?\s*/i,
        /^(Great|Good|Excellent|Interesting|Wonderful) question[!.]?\s*/i,
        /^(Thanks for asking|Thank you for|Thanks for your)[^.]*[.!]?\s*/i,
        /^(Let me|Allow me to) (help|assist|explain)[^.]*[.!]?\s*/i,
        /^As (an AI|a language model|an assistant|a helpful)[^.]*[.!]?\s*/i,
        /^(Hello|Hi|Hey)[!,.]?\s*(?:there)?[!,.]?\s*/i,
        /^(Alright|Okay|OK)[,!.]?\s+/i,
        /^(Well|So|Now)[,]\s+/i,
        /^I understand[^.]*[.!]?\s*/i,
    ];

    for (const p of boringStarts) {
        cleaned = cleaned.replace(p, '');
    }

    const boringEnds = [
        /\s*(Let me know if you need[^.]*[.!]?)$/i,
        /\s*(Feel free to ask[^.]*[.!]?)$/i,
        /\s*(I hope this helps[!.]?)$/i,
        /\s*(Hope that helps[!.]?)$/i,
        /\s*(Is there anything else[^?]*[?]?)$/i,
        /\s*(Don't hesitate to ask[^.]*[.!]?)$/i,
        /\s*(Happy to help[^.]*[.!]?)$/i,
        /\s*(If you have (?:any )?(?:more |other |further )?questions?[^.]*[.!?]?)$/i,
        /\s*(Good luck[!.]?[^.]*[.!]?)$/i,
        /\s*(Best[^.]*[.!]?)$/i,
        /\s*(Have a (?:great|good|nice|wonderful)[^.]*[.!]?)$/i,
        /\s*(Take care[!.]?)$/i,
    ];

    for (const p of boringEnds) {
        cleaned = cleaned.replace(p, '');
    }

    cleaned = cleaned.replace(/\b(I'?m|I am|This is|My name is)\s+(ChatGPT|GPT|Claude|Gemini|Llama|Mistral|an AI|a language model|an assistant)\b/gi, "I'm Vesperr");
    cleaned = cleaned.replace(/\bChatGPT\b/gi, 'Vesperr');
    cleaned = cleaned.replace(/\bGPT-?[34]o?(?:-mini)?\b/gi, 'Vesperr');
    cleaned = cleaned.replace(/\bClaude\b/gi, 'Vesperr');
    cleaned = cleaned.replace(/\bGemini\b/gi, 'Vesperr');
    cleaned = cleaned.replace(/\bLlama\b/gi, 'Vesperr');
    cleaned = cleaned.replace(/\bOpenAI\b/gi, 'MidknightTech');
    cleaned = cleaned.replace(/\bAnthropic\b/gi, 'MidknightTech');
    cleaned = cleaned.replace(/\bGoogle AI\b/gi, 'MidknightTech');
    cleaned = cleaned.replace(/\bMeta AI\b/gi, 'MidknightTech');

    cleaned = cleaned
        .replace(/\*{3,}/g, '**')
        .replace(/_{3,}/g, '__')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+|\n+$/g, '')
        .replace(/^\s*[,.:;]\s*/gm, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    if (cleaned.length > 0 && /^[a-z]/.test(cleaned)) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned;
}

async function performWebSearch(query) {

    try {

        const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
        const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

        const url = `https://api-dark-shan-yt.koyeb.app/ai/googlesearch?q=${encodeURIComponent(query)}&apikey=${_0xkey}`;
        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;

        let results = '';
        if (data.result && Array.isArray(data.result)) {
            data.result.slice(0, 5).forEach((item, i) => {
                results += `${i + 1}. ${item.title}\n   ${item.description || item.snippet}\n   Link: ${item.url || item.link}\n\n`;
            });
        } else if (data.result) {
            results = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
        }

        if (results.length > 10) return results.trim();
    } catch (e) {
        console.log('DarkShan Search failed, falling back to DDG:', e.message);
    }

    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;

        let results = '';

        if (data.AbstractText) {
            results += `Summary: ${data.AbstractText}\nSource: ${data.AbstractURL}\n\n`;
        }

        if (data.RelatedTopics?.length > 0) {
            results += `Related Info:\n`;
            data.RelatedTopics.slice(0, 3).forEach(t => {
                if (t.Text) results += `- ${t.Text}\n`;
            });
        }

        if (!results) return null;
        return results.trim();
    } catch (e) {
        return null;
    }
}

async function tryProvider(name, fn, timeoutMs = CONFIG.REQUEST_TIMEOUT) {
    const cb = getCircuitBreaker(name);
    if (!cb.canExecute()) return null;

    const start = Date.now();

    for (let attempt = 0; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
        try {
            const result = await Promise.race([
                fn(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), timeoutMs)
                )
            ]);

            if (result?.text && result.text.length > 10) {
                cb.recordSuccess(Date.now() - start);
                return { ...result, provider: name };
            }
            throw new Error('Empty response');
        } catch (err) {
            if (attempt < CONFIG.RETRY_ATTEMPTS) {
                await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY * (attempt + 1)));
                continue;
            }
            cb.recordFailure(err);
            console.log(`[${name}] Failed: ${err.message}`);
        }
    }
    return null;
}

async function askGroq(prompt) {
    const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant created by MidKnightMantra of MidknightTech Inc. Always respond in English. Be direct, helpful, and have personality.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.8
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            timeout: 30000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'llama-3.3-70b' };
}

async function askGroqMixtral(prompt) {
    const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            model: 'mixtral-8x7b-32768',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant. Always respond in English. Be direct and helpful.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.8
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            timeout: 30000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'mixtral-8x7b' };
}

async function askGroqLlama31(prompt) {
    const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant. Always respond in English.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.8
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            timeout: 25000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'llama-3.1-8b' };
}

async function askGroqGemma(prompt) {
    const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            model: 'gemma2-9b-it',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant. Always respond in English.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.8
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            timeout: 25000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'gemma2-9b' };
}

async function askOpenRouterClaude(prompt) {
    const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
            model: 'anthropic/claude-3-haiku:free',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant created by MidKnightMantra. Always respond in English.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://github.com/midknighttech',
                'X-Title': 'Vesperr AI'
            },
            timeout: 30000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'claude-3-haiku' };
}

async function askOpenRouterLlama(prompt) {
    const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
            model: 'meta-llama/llama-3.2-3b-instruct:free',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant. Always respond in English.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://github.com/midknighttech',
                'X-Title': 'Vesperr AI'
            },
            timeout: 30000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'llama-3.2-3b' };
}

async function askOpenRouterMistral(prompt) {
    const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
            model: 'mistralai/mistral-7b-instruct:free',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant. Always respond in English.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://github.com/midknighttech',
                'X-Title': 'Vesperr AI'
            },
            timeout: 30000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'mistral-7b' };
}

async function askOpenRouterGemma(prompt) {
    const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
            model: 'google/gemma-2-9b-it:free',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant. Always respond in English.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://github.com/midknighttech',
                'X-Title': 'Vesperr AI'
            },
            timeout: 30000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'gemma-2-9b' };
}

async function askDarkShanGemini(prompt) {

    const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
    const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

    const response = await axios.get(
        `https://api-dark-shan-yt.koyeb.app/ai/gemini?q=${encodeURIComponent(prompt)}&apikey=${_0xkey}`,
        { timeout: 30000 }
    );

    const text = response.data?.result || response.data?.message || response.data?.reply;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'gemini-darkshan' };
}

async function askDarkShanPerplexity(prompt) {

    const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
    const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

    const response = await axios.get(
        `https://api-dark-shan-yt.koyeb.app/ai/perplexity?q=${encodeURIComponent(prompt)}&apikey=${_0xkey}`,
        { timeout: 30000 }
    );

    const text = response.data?.result || response.data?.message || response.data?.reply;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'perplexity-darkshan' };
}

async function askDarkShanClaude(prompt) {

    const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
    const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

    const response = await axios.get(
        `https://api-dark-shan-yt.koyeb.app/ai/claude?q=${encodeURIComponent(prompt)}&apikey=${_0xkey}`,
        { timeout: 30000 }
    );

    const text = response.data?.result || response.data?.message || response.data?.reply;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'claude-darkshan' };
}

async function askDarkShanPublicAI(prompt) {

    const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
    const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

    const response = await axios.get(
        `https://api-dark-shan-yt.koyeb.app/ai/publicai?q=${encodeURIComponent(prompt)}&apikey=${_0xkey}`,
        { timeout: 30000 }
    );

    const text = response.data?.result || response.data?.message || response.data?.reply;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'publicai-darkshan' };
}

async function askDarkShanWebPilot(prompt) {

    const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
    const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

    const response = await axios.get(
        `https://api-dark-shan-yt.koyeb.app/ai/webpilot?q=${encodeURIComponent(prompt)}&apikey=${_0xkey}`,
        { timeout: 30000 }
    );

    const text = response.data?.result || response.data?.message || response.data?.reply;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'webpilot-darkshan' };
}

async function askDarkShanGPT4o(prompt) {

    const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
    const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

    const response = await axios.get(
        `https://api-dark-shan-yt.koyeb.app/ai/gpt4o?q=${encodeURIComponent(prompt)}&apikey=${_0xkey}`,
        { timeout: 30000 }
    );

    const text = response.data?.result || response.data?.message || response.data?.reply;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'gpt4o-darkshan' };
}

async function askDarkShanBlackbox(prompt) {

    const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
    const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

    const response = await axios.get(
        `https://api-dark-shan-yt.koyeb.app/ai/blackbox?q=${encodeURIComponent(prompt)}&apikey=${_0xkey}`,
        { timeout: 30000 }
    );

    const text = response.data?.result || response.data?.message || response.data?.reply;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'blackbox-darkshan' };
}

async function askHuggingFace(prompt) {
    const response = await axios.post(
        'https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct/v1/chat/completions',
        {
            model: 'meta-llama/Llama-3.2-3B-Instruct',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant. Always respond in English.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.7,
            stream: false
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY || 'hf_'}`
            },
            timeout: 30000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'llama-3.2-3b-hf' };
}

async function askDeepInfra(prompt) {
    const response = await axios.post(
        'https://api.deepinfra.com/v1/openai/chat/completions',
        {
            model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant. Always respond in English.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.8
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPINFRA_API_KEY || ''}`
            },
            timeout: 30000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'llama-3.1-8b-deepinfra' };
}

async function askNexra(prompt) {
    const response = await axios.post(
        'https://nexra.aryahcr.cc/api/chat/complements',
        {
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant.' },
                { role: 'user', content: prompt }
            ],
            markdown: false,
            stream: false,
            model: 'gpt-4o-free'
        },
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        }
    );

    const text = response.data?.message || response.data?.gpt;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'gpt-4o-nexra' };
}

async function askPollinations(prompt) {
    const response = await axios.post(
        'https://text.pollinations.ai/',
        {
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant created by MidKnightMantra.' },
                { role: 'user', content: prompt }
            ],
            model: 'openai',
            seed: Math.floor(Math.random() * 100000),
            jsonMode: false
        },
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        }
    );

    const text = typeof response.data === 'string' ? response.data : response.data?.text || response.data?.message;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'pollinations' };
}

async function askTogetherAI(prompt) {
    const response = await axios.post(
        'https://api.together.xyz/v1/chat/completions',
        {
            model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
            messages: [
                { role: 'system', content: 'You are Vesperr, a helpful AI assistant. Always respond in English.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.8
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.TOGETHER_API_KEY || ''}`
            },
            timeout: 30000
        }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || text.length < 5) throw new Error('Empty response');
    return { text, model: 'llama-3.1-8b-together' };
}

async function uploadToCatbox(buffer) {
    try {

        const { default: fetch, FormData, Blob } = await import('node-fetch');
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', new Blob([buffer]), 'media.jpg');

        const res = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData,
            timeout: 30000
        });

        const link = await res.text();
        return link.startsWith('http') ? link : null;
    } catch (e) {
        console.error('Catbox upload error:', e.message);
        return null;
    }
}

async function askDarkShanVision(prompt, imageUrl) {

    const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
    const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

    const url = `https://api-dark-shan-yt.koyeb.app/ai/vision?q=${encodeURIComponent(prompt)}&url=${encodeURIComponent(imageUrl)}&apikey=${_0xkey}`;
    const response = await axios.get(url, { timeout: 35000 });

    const text = response.data?.result || response.data?.message || response.data?.reply;
    if (!text || text.length < 3) throw new Error('Empty vision response');
    return { text, model: 'vision-darkshan' };
}

async function getSmartResponse(prompt, options = {}) {
    const { intent = IntentType.GENERAL, hasContext = false, useCache = true, persona: personaMode = 'default', searchResults = null, systemPrompt = null } = options;

    if (useCache && !hasContext) {
        const cacheKey = prompt.slice(0, 200).toLowerCase().trim();
        const cached = responseCache.get(cacheKey);
        if (cached) return { ...cached, fromCache: true };
    }

    let basePersona = systemPrompt || getPersonaForIntent(intent);

    if (intent === IntentType.GENERAL && personaMode && personaMode !== 'default' && PERSONA_MODES[personaMode]) {
        basePersona = PERSONA_MODES[personaMode];
    }

    const fullPrompt = hasContext
        ? `${basePersona}

---
CONTEXT & MEMORY:
${prompt}
---

Respond naturally as Vesperr:`
        : `${basePersona}

---
USER INPUT:
${prompt}
---

VESPERR:`;

    const providers = [
        { name: 'DarkShan-GPT4o', fn: () => askDarkShanGPT4o(fullPrompt), timeout: 35000 },
        { name: 'Groq-Llama70B', fn: () => askGroq(fullPrompt), timeout: 30000 },
        { name: 'OR-Claude', fn: () => askOpenRouterClaude(fullPrompt), timeout: 30000 },
        { name: 'Nexra-GPT4o', fn: () => askNexra(fullPrompt), timeout: 30000 },
        { name: 'DarkShan-Claude', fn: () => askDarkShanClaude(fullPrompt), timeout: 30000 },
        { name: 'Pollinations', fn: () => askPollinations(fullPrompt), timeout: 30000 },
        { name: 'DarkShan-Blackbox', fn: () => askDarkShanBlackbox(fullPrompt), timeout: 35000 },
        { name: 'DeepInfra-Llama', fn: () => askDeepInfra(fullPrompt), timeout: 30000 },
        { name: 'DarkShan-PublicAI', fn: () => askDarkShanPublicAI(fullPrompt), timeout: 30000 },
        { name: 'Together-Llama', fn: () => askTogetherAI(fullPrompt), timeout: 30000 },
        { name: 'DarkShan-WebPilot', fn: () => askDarkShanWebPilot(fullPrompt), timeout: 30000 },
        { name: 'HuggingFace-Llama', fn: () => askHuggingFace(fullPrompt), timeout: 30000 },
        { name: 'DarkShan-Perplexity', fn: () => askDarkShanPerplexity(fullPrompt), timeout: 30000 },
        { name: 'Groq-Mixtral', fn: () => askGroqMixtral(fullPrompt), timeout: 30000 },
        { name: 'DarkShan-Gemini', fn: () => askDarkShanGemini(fullPrompt), timeout: 30000 },
        { name: 'Groq-Llama8B', fn: () => askGroqLlama31(fullPrompt), timeout: 25000 },
        { name: 'Groq-Gemma', fn: () => askGroqGemma(fullPrompt), timeout: 25000 },
        { name: 'OR-Llama', fn: () => askOpenRouterLlama(fullPrompt), timeout: 30000 },
        { name: 'OR-Mistral', fn: () => askOpenRouterMistral(fullPrompt), timeout: 30000 },
        { name: 'OR-Gemma', fn: () => askOpenRouterGemma(fullPrompt), timeout: 30000 },
    ];

    for (const provider of providers) {
        console.log(`[AI] Trying ${provider.name}...`);
        const result = await tryProvider(provider.name, provider.fn, provider.timeout);

        if (result) {
            result.text = cleanResponse(result.text);

            if (useCache && !hasContext && result.text.length > 20 && result.text.length < 6000) {
                const cacheKey = prompt.slice(0, 200).toLowerCase().trim();
                responseCache.set(cacheKey, { text: result.text, provider: result.provider });
            }

            console.log(`[AI] ✓ Success from ${result.provider}`);
            return result;
        }
    }

    return null;
}

async function analyzeImage(buffer, prompt = 'Describe this image') {

    try {
        const imageUrl = await uploadToCatbox(buffer);
        if (imageUrl) {
            console.log(`[Vision] Image uploaded: ${imageUrl}`);
            const res = await tryProvider('DarkShan-Vision', () => askDarkShanVision(prompt, imageUrl), 40000);
            if (res) return res;
        }
    } catch (err) {
        console.log('[Vision] Primary failed:', err.message);
    }

    try {
        const responseCode = await getSmartResponse(
            `[User shared an image] Request: "${prompt}"\n\nAcknowledge this and ask for a text description since I'm currently having trouble seeing directly.`,
            { intent: IntentType.VISION }
        );
        if (responseCode?.text) return { text: responseCode.text, provider: 'text-fallback' };
    } catch (e) { }

    return {
        text: "I can see you sent an image, but I'm having trouble analyzing it right now. Describe what's in it and I'll help!",
        provider: 'fallback'
    };
}

async function textToSpeech(text, lang = 'en') {
    try {
        const cleanText = text
            .replace(/\*+/g, '').replace(/[_~`]/g, '')
            .replace(/```[\s\S]*?```/g, '[code]')
            .replace(/https?:\/\/\S+/g, '[link]')
            .slice(0, 500);

        const response = await axios.get('https://translate.google.com/translate_tts', {
            params: { ie: 'UTF-8', q: cleanText, tl: lang, client: 'tw-ob' },
            responseType: 'arraybuffer',
            timeout: 15000
        });
        return Buffer.from(response.data);
    } catch {
        return null;
    }
}

async function streamResponse(sock, chat, msgKey, text, options = {}) {
    const { header = '', footer = '' } = options;

    if (!CONFIG.STREAM_ENABLED || text.length < 80) {
        await sock.sendMessage(chat, { text: `${header}${text}${footer}`, edit: msgKey });
        return;
    }

    const words = text.split(/\s+/);
    let current = '';
    const chunkSize = words.length > 150 ? 8 : CONFIG.STREAM_CHUNK_SIZE;
    const delay = words.length > 150 ? 50 : CONFIG.STREAM_DELAY;

    for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(' ');
        current += (current ? ' ' : '') + chunk;
        const isComplete = i + chunkSize >= words.length;

        try {
            await sock.sendMessage(chat, {
                text: `${header}${current}${isComplete ? '' : ' ▌'}${footer}`,
                edit: msgKey
            });
        } catch { break; }

        if (!isComplete) await new Promise(r => setTimeout(r, delay));
    }

    try {
        await sock.sendMessage(chat, { text: `${header}${text}${footer}`, edit: msgKey });
    } catch { }
}

function getStats() {
    const cbStats = Array.from(circuitBreakers.values()).map(cb => cb.getStats());
    const activeProviders = cbStats.filter(p => p.state === 'CLOSED').length;
    const totalProviders = 20;
    return {
        conversations: memory.size,
        cacheSize: responseCache.size,
        providers: cbStats,
        activeProviders,
        totalProviders: cbStats.length > 0 ? cbStats.length : totalProviders,
        healthScore: cbStats.length > 0 ? Math.round((activeProviders / cbStats.length) * 100) : 100
    };
}

function generateHelp(prefix = '.') {
    return templates.card(
        'Vesperr AI',
        [
            `*${prefix}ai <message>* — chat with me`,
            `*${prefix}ai -v* — voice response`,
            `*${prefix}ai clear* — reset memory`,
            `*${prefix}ai stats* — usage stats`,
            `*${prefix}ai providers* — show AI providers status`,
            `*${prefix}ai export* — export conversation`,
            `*${prefix}ai set <mode>* — change persona (code/creative/casual/support/analysis)`,
            '',
            'I remember context, analyze images, search the web, and have 20+ AI models backing me up!'
        ],
        { footer: 'Your personal AI assistant' }
    );
}

function generateStatsMessage(userId, chat, user) {
    const stats = getStats();
    const limits = rateLimits.get(userId);
    const conv = chat && user ? getConversation(chat, user) : null;

    const fields = {
        'Chats': stats.conversations,
        'Cache': stats.cacheSize,
        'Providers': `${stats.activeProviders}/${stats.totalProviders}`,
        'Health': `${stats.healthScore}%`
    };

    if (limits) {
        fields['Usage Today'] = `${limits.dailyCount || 0}/${CONFIG.DAILY_LIMIT}`;
    }

    if (conv && conv.messageCount > 0) {
        fields['Session Msgs'] = conv.messageCount;
        fields['Memory'] = `${conv.history.length} stored`;
    }

    return templates.card('AI Statistics', fields);
}

const thinkingMessages = {
    [IntentType.CODE]: ['◐ *thinking...*', '◐ *coding...*'],
    [IntentType.CREATIVE]: ['◐ *creating...*', '◐ *imagining...*'],
    [IntentType.MATH]: ['◐ *calculating...*', '◐ *computing...*'],
    [IntentType.EMOTIONAL]: ['◐ *listening...*', '◐ *processing...*'],
    [IntentType.ADVICE]: ['◐ *considering...*', '◐ *thinking...*'],
    default: ['◐ *thinking...*', '◐ *on it...*']
};

function getThinkingMessage(intent) {
    const msgs = thinkingMessages[intent] || thinkingMessages.default;
    return msgs[Math.floor(Math.random() * msgs.length)];
}

function generateProvidersStatus() {
    const stats = getStats();
    const cbStats = stats.providers;

    if (cbStats.length === 0) {
        return templates.card('AI Providers', ['All providers ready', `Total: ${stats.totalProviders}`, `Health: ${stats.healthScore}%`]);
    }

    const active = [];
    const degraded = [];
    const offline = [];

    cbStats.forEach(p => {
        const status = `${p.name}: ${p.successRate} (${p.avgTime})`;
        if (p.state === 'CLOSED') active.push(`✅ ${status}`);
        else if (p.state === 'HALF_OPEN') degraded.push(`⚠️ ${status}`);
        else offline.push(`❌ ${status}`);
    });

    const lines = [
        `*Health Score:* ${stats.healthScore}%`,
        `*Active:* ${active.length}/${stats.totalProviders}`,
        '',
        ...active.slice(0, 5),
        ...(degraded.length > 0 ? ['', '*Degraded:*', ...degraded.slice(0, 3)] : []),
        ...(offline.length > 0 ? ['', '*Offline:*', ...offline.slice(0, 3)] : [])
    ];

    return templates.card('AI Providers Status', lines);
}

function exportConversation(chat, user) {
    const conv = getConversation(chat, user);
    if (!conv || conv.history.length === 0) {
        return 'No conversation history to export.';
    }

    const lines = [
        `─── CONVERSATION EXPORT ───`,
        `Messages: ${conv.messageCount}`,
        `Started: ${new Date(conv.createdAt).toLocaleString()}`,
        `Language: ${conv.metadata.language}`,
        `Persona: ${conv.metadata.persona || 'default'}`,
        '',
        '─── MESSAGES ───',
        ''
    ];

    conv.history.forEach((msg, i) => {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const role = msg.role === 'user' ? '👤 User' : '🤖 Vesperr';
        lines.push(`[${time}] ${role}:`);
        lines.push(msg.content);
        lines.push('');
    });

    if (conv.summaries.length > 0) {
        lines.push('─── EARLIER SUMMARY ───');
        lines.push('');
        lines.push(conv.summaries[conv.summaries.length - 1].text);
    }

    return lines.join('\n');
}

const clearMessages = [
    "◈ Memory cleared ✦",
    "◈ Fresh start ✦",
    "◈ Reset complete ✦",
];

export default {
    name: 'ai',
    alias: ['vesperr', 'chat', 'ask', 'gpt', 'v'],
    category: 'ai',
    desc: 'Chat with Vesperr AI assistant',
    usage: '.ai <message>',
    cooldown: 2000,

    async execute({ sock, msg, args, prefix, isOwner, isPremium, pushName }) {
        const chat = msg.key.remoteJid;
        const user = msg.key.participant || msg.key.remoteJid;
        const userName = pushName || 'friend';
        let input = args.join(' ').trim();

        const rateCheck = checkRateLimit(user, isPremium || isOwner);
        if (!rateCheck.allowed) {
            return sock.sendMessage(chat, { text: rateCheck.message }, { quoted: msg });
        }

        const wantsVoice = /--?v(oice)?/i.test(input);
        const debugMode = /--?d(ebug)?/i.test(input) && isOwner;
        input = input.replace(/--?v(oice)?|--?d(ebug)?/gi, '').trim();

        const cmd = input.toLowerCase();

        if (!input || cmd === 'help' || cmd === '?') {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) {
                return sock.sendMessage(chat, { text: generateHelp(prefix) }, { quoted: msg });
            }
        }

        if (cmd === 'stats' || cmd === 'status') {
            return sock.sendMessage(chat, { text: generateStatsMessage(user, chat, user) }, { quoted: msg });
        }

        if (cmd === 'providers' || cmd === 'provider' || cmd === 'health') {
            return sock.sendMessage(chat, { text: generateProvidersStatus() }, { quoted: msg });
        }

        if (cmd === 'export' || cmd === 'save' || cmd === 'download') {
            const exported = exportConversation(chat, user);
            return sock.sendMessage(chat, { text: exported }, { quoted: msg });
        }

        if (['clear', 'reset', 'forget', 'new'].includes(cmd)) {
            clearConversation(chat, user);
            return sock.sendMessage(chat, {
                text: clearMessages[Math.floor(Math.random() * clearMessages.length)]
            }, { quoted: msg });
        }

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imageMsg = quoted?.imageMessage || msg.message?.imageMessage;
        const isImageAnalysis = !!imageMsg;

        if (!input && !isImageAnalysis) {
            return sock.sendMessage(chat, { text: generateHelp(prefix) }, { quoted: msg });
        }

        const intent = detectIntent(input || '');
        const language = detectLanguage(input || '');

        const conv = getConversation(chat, user);
        conv.metadata.language = language;
        if (userName && userName !== 'friend' && !conv.metadata.userName) {
            conv.metadata.userName = userName;
        }
        saveConversation(chat, user, conv);

        await sock.sendPresenceUpdate('composing', chat);

        if (cmd.startsWith('set ')) {
            const mode = cmd.replace('set ', '').trim();
            if (PERSONA_MODES[mode]) {
                conv.metadata.persona = mode;
                saveConversation(chat, user, conv);
                return sock.sendMessage(chat, { text: templates.success(`Persona set to: *${mode.toUpperCase()}*`) }, { quoted: msg });
            } else {
                const modes = Object.keys(PERSONA_MODES).join(', ');
                return sock.sendMessage(chat, { text: templates.error(`Invalid mode.`, `Available: ${modes}`) }, { quoted: msg });
            }
        }

        if (cmd.startsWith('system ')) {
            const prompt = input.replace(/system\s+/i, '').trim();
            if (prompt === 'reset' || prompt === 'clear') {
                conv.metadata.systemPrompt = null;
                saveConversation(chat, user, conv);
                return sock.sendMessage(chat, { text: templates.success('Custom system prompt cleared.') }, { quoted: msg });
            }
            conv.metadata.systemPrompt = prompt;
            saveConversation(chat, user, conv);
            return sock.sendMessage(chat, { text: templates.success('Custom system prompt updated.') }, { quoted: msg });
        }

        let searchResults = null;
        if (intent === IntentType.SEARCH || /search|find|google/i.test(input)) {
            const query = input.replace(/^(search|find|google)\s+(for\s+)?/i, '').trim();
            if (query.length > 3) {
                await sock.sendMessage(chat, { text: '🔍 *Searching the web...*' }, { quoted: msg });
                searchResults = await performWebSearch(query);
            }
        }

        const thinkingMsg = isImageAnalysis ? '◐ *analyzing...*' : getThinkingMessage(intent);
        const tempMsg = await sock.sendMessage(chat, { text: thinkingMsg }, { quoted: msg });

        try {
            let response = null;
            const startTime = Date.now();

            if (isImageAnalysis) {
                try {
                    const buffer = await downloadMediaMessage(
                        { message: { imageMessage: imageMsg } },
                        'buffer',
                        {}
                    );
                    response = await analyzeImage(buffer, input || 'Describe this image');
                } catch (imgErr) {
                    console.error('Image download error:', imgErr.message);
                }

                if (!response) {
                    response = await getSmartResponse(
                        `[User sent an image] ${input || 'What do you see?'}`,
                        { intent: IntentType.VISION }
                    );
                }
            }

            else {

                if (quoted) {
                    const prevText = quoted.conversation || quoted.extendedTextMessage?.text || '';
                    if (prevText && prevText.length > 10) {
                        const history = getHistory(chat, user);
                        const exists = history.some(h =>
                            h.role === 'assistant' && h.content.slice(0, 100) === prevText.slice(0, 100)
                        );
                        if (!exists) {
                            addMessage(chat, user, 'assistant', prevText);
                        }
                    }
                }

                const contextPrompt = buildContext(chat, user, input, {
                    intent,
                    userName,
                    searchResults,
                    systemPrompt: conv.metadata.systemPrompt
                });
                const history = getHistory(chat, user);
                const hasContext = history.length > 0;

                response = await getSmartResponse(contextPrompt, {
                    intent,
                    hasContext,
                    persona: conv.metadata.persona,
                    searchResults,
                    systemPrompt: conv.metadata.systemPrompt
                });
            }

            if (response?.text) {
                addMessage(chat, user, 'user', input || '[Image]');
                addMessage(chat, user, 'assistant', response.text, { provider: response.provider });

                const responseTime = Date.now() - startTime;

                const formattedResponse = templates.aiResponse(response.text, {
                    provider: response.provider,
                    responseTime,
                    showMetadata: debugMode
                });

                if (response.text.length > 100 && response.text.length < 2500) {
                    await streamResponse(sock, chat, tempMsg.key, formattedResponse);
                } else {
                    await sock.sendMessage(chat, {
                        text: formattedResponse,
                        edit: tempMsg.key
                    });
                }

                if (wantsVoice) {
                    await sock.sendPresenceUpdate('recording', chat);
                    const langMap = {
                        swahili: 'sw', spanish: 'es', french: 'fr', german: 'de',
                        portuguese: 'pt', arabic: 'ar', chinese: 'zh-CN', japanese: 'ja',
                        korean: 'ko', hindi: 'hi'
                    };
                    const audio = await textToSpeech(response.text, langMap[language] || 'en');
                    if (audio) {
                        await sock.sendMessage(chat, { audio, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
                    }
                }
            } else {

                await sock.sendMessage(chat, {
                    text: templates.notification('Error', 'All providers are currently busy. Please try again in a moment.', 'error'),
                    edit: tempMsg.key
                });
            }

        } catch (error) {
            console.error('AI Plugin Error:', error);
            await sock.sendMessage(chat, {
                text: templates.notification('Error', debugMode ? `\`${error.message}\`` : 'Something went wrong. Please try again.', 'error'),
                edit: tempMsg.key
            });
        } finally {
            await sock.sendPresenceUpdate('paused', chat);
        }
    }
};

export {
    getSmartResponse,
    analyzeImage,
    textToSpeech,
    getStats,
    checkRateLimit,
    cleanResponse,
    detectIntent,
    detectLanguage,
    IntentType,
    CONFIG,
    getConversation,
    saveConversation,
    addMessage,
    clearConversation,
    getHistory,
    buildContext,
};
