const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m' };
const LOG_LEVELS = { debug: 0, info: 1, success: 2, warn: 3, error: 4, silent: 5 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

function getTimestamp() { return new Date().toLocaleTimeString('en-US', { hour12: false }); }

export const log = {
    debug(msg, data) { if (currentLevel <= 0) console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.magenta}🔍 DEBUG${colors.reset} ${msg}`, data || ''); },
    info(msg, data) { if (currentLevel <= 1) console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.cyan}ℹ️ INFO${colors.reset} ${msg}`, data || ''); },
    success(msg, data) { if (currentLevel <= 2) console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.green}✅ SUCCESS${colors.reset} ${msg}`, data || ''); },
    warn(msg, data) { if (currentLevel <= 3) console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.yellow}⚠️ WARN${colors.reset} ${msg}`, data || ''); },
    error(msg, data) { if (currentLevel <= 4) console.error(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.red}❌ ERROR${colors.reset} ${msg}`, data || ''); },
    command(cmd, user) { if (currentLevel <= 1) console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.blue}⚡ CMD${colors.reset} ${cmd} from ${user}`); },
    divider() { console.log(colors.dim + '─'.repeat(50) + colors.reset); }
};

export default log;
