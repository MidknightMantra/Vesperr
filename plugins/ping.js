import { templates } from '../utils/deluxeUI.js';

export default {
    name: 'ping',
    aliases: ['p', 'speed', 'bot'],
    category: 'core',
    description: 'Check bot response time',
    react: '🎯',

    async execute({ sock, msg }) {
        const jid = msg.key.remoteJid;
        const startTime = Date.now();

        const sentMsg = await sock.sendMessage(jid, {
            text: templates.notification('Wait', 'Measuring bot speed...', 'info')
        }, { quoted: msg });

        const responseTime = Date.now() - startTime;

        const memUsage = process.memoryUsage();
        const uptime = process.uptime() * 1000;

        const formatUptime = (ms) => {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
            if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
            if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
            return `${seconds}s`;
        };

        const getSpeed = (ms) => {
            if (ms < 100) return '◉ Excellent';
            if (ms < 300) return '◎ Good';
            if (ms < 500) return '○ Moderate';
            return '◌ Slow';
        };

        const formatMB = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

        const response = templates.card(
            'Vesperr',
            {
                'Pong': '🏓',
                'Speed': `${responseTime}ms (${getSpeed(responseTime)})`,
                'Uptime': formatUptime(uptime),
                'Memory': formatMB(memUsage.heapUsed)
            }
        );

        try {
            await sock.sendMessage(jid, {
                text: response,
                edit: sentMsg.key
            });
        } catch (err) {
            await sock.sendMessage(jid, { text: response }, { quoted: msg });
        }
    }
};
