export default {
    name: 'ping',
    alias: ['p', 'speed', 'latency', 'status'],
    category: 'core',
    desc: 'Check bot response time and system status',
    react: '🏓',

    command: {
        pattern: 'ping',
        run: async ({ sock, msg }) => {
            const jid = msg.key.remoteJid;
            const startTime = Date.now();
            const botState = global.VESPERR;

            // Send initial message
            const sentMsg = await sock.sendMessage(jid, {
                text: '🏓 *Pinging...*'
            }, { quoted: msg });

            const responseTime = Date.now() - startTime;

            // Get system stats
            const stats = botState?.getStats?.() || {};
            const memUsage = process.memoryUsage();
            const uptime = stats.uptime || process.uptime() * 1000;

            // Format uptime
            const formatUptime = (ms) => {
                const seconds = Math.floor(ms / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);

                const parts = [];
                if (days > 0) parts.push(`${days}d`);
                if (hours % 24 > 0) parts.push(`${hours % 24}h`);
                if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
                if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);

                return parts.join(' ');
            };

            // Speed indicator
            const getSpeedIndicator = (ms) => {
                if (ms < 100) return { emoji: '🟢', status: 'Excellent' };
                if (ms < 300) return { emoji: '🟡', status: 'Good' };
                if (ms < 500) return { emoji: '🟠', status: 'Moderate' };
                return { emoji: '🔴', status: 'Slow' };
            };

            const speed = getSpeedIndicator(responseTime);

            // Memory formatting
            const formatBytes = (bytes) => {
                if (bytes < 1024) return `${bytes} B`;
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
            };

            // Connection status
            const connectionState = stats.connectionState || 'unknown';
            const connectionEmoji = connectionState === 'open' ? '✅' : '❌';

            // Build response
            const pingResponse = `
╭─── ◎ *PONG!* ◎ ───╮
╰────────────────────╯

⌘ *Response*
│ Latency: ${responseTime}ms
└ Status: ${speed.emoji} ${speed.status}

◇ *System*
│ Uptime: ${formatUptime(uptime)}
│ Messages: ${stats.messageCount || 0}
└ Plugins: ${stats.pluginCount || 0}

◈ *Memory*
│ Heap: ${formatBytes(memUsage.heapUsed)}
└ RSS: ${formatBytes(memUsage.rss)}

♢ *Status:* ${connectionEmoji} ${connectionState}

─────────────────────
_Vesperr ⋅ Node ${process.version}_
`.trim();

            // Edit the sent message with results
            try {
                await sock.sendMessage(jid, {
                    text: pingResponse,
                    edit: sentMsg.key
                });
            } catch (err) {
                await sock.sendMessage(jid, {
                    text: pingResponse
                }, { quoted: msg });
            }
        }
    }
};