module.exports = {
  apps: [{
    name: 'f7goods',
    script: 'server.js',
    exec_mode: 'fork',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      JWT_SECRET: 'CHANGE_ME_TO_A_RANDOM_SECRET',
      ADMIN_PASSWORD: 'CHANGE_ME_TO_A_STRONG_PASSWORD',
      ALLOWED_ORIGIN: ''
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
