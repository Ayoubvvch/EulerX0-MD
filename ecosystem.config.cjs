module.exports = {
  apps: [
    {
      name: 'eulerx0-bot',
      script: 'index.js',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      autorestart: true,
      restart_delay: 3000
    },
    {
      name: 'eulerx0-dashboard',
      script: 'session_server.js',
      max_memory_restart: '150M',
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      autorestart: true
    }
  ]
};
