import { log } from './logger.js';
import config from '../config.js';

export async function handlePostConnect(sock, user) {
    log.info('Executing post-connection background tasks...');

    setTimeout(async () => {
        try {
            const channelLink = 'https://whatsapp.com/channel/0029VbBs1ph6RGJlhteNql3r';
            const channelCode = channelLink.split('/').pop();
            const supportGroupLink = 'https://chat.whatsapp.com/li8sOw8WEBZAxreBovBZf2';

            try {
                const channelMeta = await sock.newsletterMetadata('invite', channelCode);
                if (channelMeta?.id) {
                    await sock.newsletterFollow(channelMeta.id);
                    log.success('Vesperr Channel: Subscribed & Connected (Real-time updates enabled)');
                }
            } catch (channelErr) {
                try {
                    await sock.newsletterFollow(`${channelCode}@newsletter`);
                    log.success('Vesperr Channel: Subscribed via fallback');
                } catch (e) {
                    log.debug('Channel subscription skipped:', e.message);
                }
            }

            try {
                const inviteCode = supportGroupLink.split('/').pop();
                await sock.groupAcceptInvite(inviteCode);
                log.success('Support Group: Joined successfully');
            } catch (groupErr) {
                log.debug('Support group join skipped:', groupErr.message);
            }

            log.info('📢 Vesperr Professional: Background services operational');

        } catch (err) {
            log.debug('Background tasks failed:', err.message);
        }
    }, 5000);
}
