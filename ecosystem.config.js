module.exports = {
  apps: [{
    name: 'f7goods',
    script: 'server.js',
    exec_mode: 'fork',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      // Required — set these via server env / pm2 secret, never commit real values
      // JWT_SECRET: '<32+ random hex>',
      // ADMIN_PASSWORD: '<strong password>',
      // ALLOWED_ORIGIN: 'https://f7goods.com'
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    max_memory_restart: '256M',
    watch: false,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    merge_logs: true
  }]
};
