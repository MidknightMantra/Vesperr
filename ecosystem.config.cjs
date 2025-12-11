module.exports = {
    apps: [{
        name: 'vesperr',
        script: 'index.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production'
        },
        error_file: './logs/error.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true,
        restart_delay: 5000,
        kill_timeout: 10000
    }]
};
