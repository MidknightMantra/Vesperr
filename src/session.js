import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import config from './config.js';
import { log } from './utils/logger.js';

const PASTEBIN_RAW_URL = 'https://pastebin.com/raw/';

export async function initSession() {
    const sessionDir = config.sessionDir;
    const credsPath = join(sessionDir, 'creds.json');

    if (!existsSync(sessionDir)) {
        mkdirSync(sessionDir, { recursive: true });
    }

    if (existsSync(credsPath)) {
        log.info('Found existing session');
        return true;
    }

    if (config.pastebinCode) {
        log.info('Restoring session from Pastebin...');
        try {
            const response = await axios.get(`${PASTEBIN_RAW_URL}${config.pastebinCode}`, { timeout: 30000 });
            let sessionData = response.data;

            if (typeof sessionData === 'string') {
                try { sessionData = JSON.parse(sessionData); } catch {
                    sessionData = JSON.parse(Buffer.from(sessionData, 'base64').toString('utf-8'));
                }
            }

            if (sessionData.creds) {
                writeFileSync(credsPath, JSON.stringify(sessionData.creds, null, 2));
            } else {
                writeFileSync(credsPath, JSON.stringify(sessionData, null, 2));
            }

            log.success('Session restored');
            return true;
        } catch (err) {
            log.warn('Failed to restore session:', err.message);
        }
    }

    log.info('No session found. QR code will be displayed.');
    return false;
}

export default { initSession };
