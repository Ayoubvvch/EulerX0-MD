'use strict';

// 🛡️ Safety Watchdogs to prevent crash loops
process.on('uncaughtException', (err) => {
  console.error('🛡️ [Safety Watchdog] Uncaught Exception:', err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('🛡️ [Safety Watchdog] Unhandled Rejection:', reason?.message || reason);
});

require('dns').setDefaultResultOrder('ipv4first');

const path = require('path');
const fs = require('fs');
const http = require('http');
const config = require('./config');
const { initializeDatabase } = require('./core/database');
const { ensureTempDir, cleanupTempFiles } = require('./core/helpers');
const { WhatsAppBotClient } = require('./core/client');

// Load all plugins dynamically from ./plugins/
function loadPlugins() {
  const pluginsDir = path.join(__dirname, 'plugins');
  if (!fs.existsSync(pluginsDir)) return 0;
  const files = fs.readdirSync(pluginsDir);
  let count = 0;
  for (const file of files) {
    if (file.endsWith('.js') && !file.endsWith('.disabled') && !file.endsWith('.orig')) {
      try {
        require(path.join(pluginsDir, file));
        count++;
      } catch (err) {
        console.error(`⚠️ Failed to load plugin ${file}:`, err.message);
      }
    }
  }
  return count;
}

async function main() {
  console.log(`\n========================================`);
  console.log(`⚡ EulerX0 Remake Bot Engine v${config.VERSION}`);
  console.log(`========================================`);

  ensureTempDir();
  setInterval(() => cleanupTempFiles(15 * 60 * 1000), 30 * 60 * 1000);

  // Initialize SQLite Database
  try {
    await initializeDatabase();
    console.log(`- ✅ Database initialized & synced.`);
  } catch (err) {
    console.error(`🚫 Database initialization failed:`, err.message);
    process.exit(1);
  }

  // Load Plugins
  const loadedCount = loadPlugins();
  console.log(`- 📦 Loaded ${loadedCount} plugins.`);

  // Initialize WhatsApp Socket Client
  const bot = new WhatsAppBotClient(config.SESSION);
  await bot.initialize();

  // Graceful Shutdown
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    await bot.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Health check server
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', bot: bot.isConnected ? 'online' : 'connecting', memory: process.memoryUsage() }));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('EulerX0 Bot is running!');
    }
  });

  server.listen(config.PORT, () => {
    console.log(`- 🌐 Health server listening on port ${config.PORT}`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error during bot startup:', err);
    process.exit(1);
  });
}
