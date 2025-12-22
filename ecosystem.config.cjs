const path = require('path');
const os = require('os');

const APP_NAME = 'vesperr';
const SCRIPT_PATH = 'index.js';
const CWD = __dirname;

const TOTAL_MEMORY_MB = Math.floor(os.totalmem() / 1024 / 1024);
const MAX_MEMORY = Math.min(512, Math.floor(TOTAL_MEMORY_MB * 0.4)) + 'M';

const sharedConfig = {

    cwd: CWD,

    interpreter: 'node',
    node_args: [
        '--experimental-specifier-resolution=node',
        '--no-warnings',
    ].join(' '),

    instances: 1,
    exec_mode: 'fork',

    autorestart: true,
    watch: false,
    max_restarts: 15,
    min_uptime: '30s',
    restart_delay: 5000,
    exp_backoff_restart_delay: 1000,
    max_memory_restart: MAX_MEMORY,

    kill_timeout: 15000,
    wait_ready: true,
    listen_timeout: 30000,
    shutdown_with_message: true,

    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS Z',
    merge_logs: true,
    combine_logs: true,

    source_map_support: true,
    vizion: true,
};

const environments = {

    development: {
        NODE_ENV: 'development',
        DEBUG: 'true',
        LOG_LEVEL: 'debug',
        HOT_RELOAD: 'true',
        AUTO_READ: 'false',
        PRINT_QR: 'true',
    },

    staging: {
        NODE_ENV: 'staging',
        DEBUG: 'true',
        LOG_LEVEL: 'debug',
        HOT_RELOAD: 'false',
        AUTO_READ: 'false',
        PRINT_QR: 'true',
    },

    production: {
        NODE_ENV: 'production',
        DEBUG: 'false',
        LOG_LEVEL: 'info',
        HOT_RELOAD: 'false',
        AUTO_READ: 'false',
        PRINT_QR: 'true',
        NODE_OPTIONS: `--max-old-space-size=${parseInt(MAX_MEMORY)}`,
    },
};

module.exports = {
    apps: [

        {
            name: APP_NAME,
            script: SCRIPT_PATH,
            ...sharedConfig,

            error_file: path.join(CWD, 'logs', 'error.log'),
            out_file: path.join(CWD, 'logs', 'output.log'),
            log_file: path.join(CWD, 'logs', 'combined.log'),

            env: environments.development,
            env_development: environments.development,
            env_staging: environments.staging,
            env_production: environments.production,

            watch: process.env.PM2_WATCH === 'true' ? [
                'index.js',
                'config.js',
                'handlers.js',
                'pluginManager.js',
                'database.js',
                'session.js',
                'utils',
            ] : false,
            ignore_watch: [
                'node_modules',
                'session',
                'data',
                'logs',
                'temp',
                '.git',
                '*.log',
                '*.json',
            ],
            watch_delay: 3000,

            post_update: [
                'npm install --production',
            ],

            args: process.env.BOT_ARGS || '',

            append_env_to_name: false,

            automation: true,
            treekill: true,
        },

    ],

    deploy: {

        production: {

            user: process.env.DEPLOY_USER || 'deploy',
            host: (process.env.DEPLOY_HOST || 'your-server.com').split(','),
            port: process.env.DEPLOY_PORT || '22',
            key: process.env.DEPLOY_KEY || '~/.ssh/id_rsa',
            ssh_options: [
                'StrictHostKeyChecking=no',
                'PasswordAuthentication=no',
            ],

            ref: 'origin/main',
            repo: process.env.DEPLOY_REPO || 'git@github.com:username/vesperr.git',
            path: process.env.DEPLOY_PATH || '/var/www/vesperr',

            'pre-setup': [
                'echo "Installing system dependencies..."',
                'apt-get update -qq',
                'apt-get install -y git curl ffmpeg',
            ].join(' && '),

            'post-setup': [
                'echo "Setup complete!"',
            ].join(' && '),

            'pre-deploy': [
                'echo "Preparing deployment..."',
            ].join(' && '),

            'post-deploy': [
                'echo "Installing dependencies..."',
                'npm ci --production --legacy-peer-deps',
                'echo "Creating directories..."',
                'mkdir -p logs data temp session',
                'echo "Restarting application..."',
                'pm2 reload ecosystem.config.cjs --env production',
                'echo "Saving PM2 process list..."',
                'pm2 save',
                'echo "Deployment complete!"',
            ].join(' && '),

            'pre-deploy-local': [
                'echo "Running local pre-deploy checks..."',
                'npm run lint || true',
            ].join(' && '),

            env: {
                NODE_ENV: 'production',
            },
        },

        staging: {
            user: process.env.STAGING_USER || 'deploy',
            host: (process.env.STAGING_HOST || 'staging.your-server.com').split(','),
            port: process.env.STAGING_PORT || '22',
            key: process.env.STAGING_KEY || '~/.ssh/id_rsa',

            ref: 'origin/develop',
            repo: process.env.DEPLOY_REPO || 'git@github.com:username/vesperr.git',
            path: process.env.STAGING_PATH || '/var/www/vesperr-staging',

            'post-deploy': [
                'npm ci --legacy-peer-deps',
                'mkdir -p logs data temp session',
                'pm2 reload ecosystem.config.cjs --env staging',
                'pm2 save',
            ].join(' && '),

            env: {
                NODE_ENV: 'staging',
            },
        },
    },
};
