'use strict';

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('../config');

let db = null;

function getDatabase() {
  if (db) return db;
  
  const dbFile = config.DB_PATH;
  db = new sqlite3.Database(dbFile);
  
  // Apply performance & resilience pragmas
  db.serialize(() => {
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");
    db.run("PRAGMA busy_timeout = 10000;");
    db.run("PRAGMA temp_store = MEMORY;");
    db.run("PRAGMA cache_size = -16000;"); // 16MB cache
  });
  
  return db;
}

function run(sql, params = []) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function initializeDatabase() {
  getDatabase();
  
  // Initialize standard tables
  await run(`
    CREATE TABLE IF NOT EXISTS bot_variables (
      key TEXT PRIMARY KEY,
      value TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS _warns (
      id TEXT PRIMARY KEY,
      jid TEXT,
      count INTEGER DEFAULT 0,
      reason TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS filters (
      id TEXT PRIMARY KEY,
      chat TEXT,
      pattern TEXT,
      text TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS welcomes (
      chat TEXT PRIMARY KEY,
      message TEXT,
      status TEXT DEFAULT 'on'
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS goodbyes (
      chat TEXT PRIMARY KEY,
      message TEXT,
      status TEXT DEFAULT 'on'
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS antilinks (
      chat TEXT PRIMARY KEY,
      action TEXT DEFAULT 'warn',
      status TEXT DEFAULT 'on'
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS antibots (
      chat TEXT PRIMARY KEY,
      action TEXT DEFAULT 'kick',
      status TEXT DEFAULT 'on'
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS antiwords (
      id TEXT PRIMARY KEY,
      chat TEXT,
      word TEXT
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS afk_users (
      user TEXT PRIMARY KEY,
      reason TEXT,
      timestamp INTEGER
    );
  `);

  // Load bot variables into config at startup
  try {
    const vars = await all('SELECT key, value FROM bot_variables');
    for (const v of vars) {
      if (v.key && v.value !== null) {
        config.setVar(v.key, v.value);
      }
    }
  } catch (e) {
    console.error('Failed to preload bot variables from DB:', e.message);
  }
}

// Database helper operations
const dbOps = {
  // Variables
  async getVar(key, defaultVal = null) {
    const row = await get('SELECT value FROM bot_variables WHERE key = ?', [key]);
    return row ? row.value : defaultVal;
  },
  async setVar(key, value) {
    await run(
      'INSERT INTO bot_variables (key, value, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = CURRENT_TIMESTAMP',
      [key, String(value)]
    );
    config.setVar(key, value);
  },

  // Warns
  async getWarn(jid, user) {
    const id = `${jid}_${user}`;
    const row = await get('SELECT count, reason FROM _warns WHERE id = ?', [id]);
    return row ? { count: row.count, reason: row.reason } : { count: 0, reason: '' };
  },
  async setWarn(jid, user, reason = '') {
    const id = `${jid}_${user}`;
    const current = await this.getWarn(jid, user);
    const newCount = (current.count || 0) + 1;
    await run(
      'INSERT INTO _warns (id, jid, count, reason, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET count = excluded.count, reason = excluded.reason, updatedAt = CURRENT_TIMESTAMP',
      [id, jid, newCount, reason]
    );
    return newCount;
  },
  async resetWarn(jid, user) {
    const id = `${jid}_${user}`;
    await run('DELETE FROM _warns WHERE id = ?', [id]);
  },
  async getAllWarns(jid) {
    return await all('SELECT * FROM _warns WHERE jid = ?', [jid]);
  },

  // Filters
  async getFilters(chat) {
    return await all('SELECT pattern, text FROM filters WHERE chat = ?', [chat]);
  },
  async setFilter(chat, pattern, text) {
    const id = `${chat}_${pattern.toLowerCase()}`;
    await run(
      'INSERT INTO filters (id, chat, pattern, text, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET text = excluded.text, updatedAt = CURRENT_TIMESTAMP',
      [id, chat, pattern.toLowerCase(), text]
    );
  },
  async deleteFilter(chat, pattern) {
    const id = `${chat}_${pattern.toLowerCase()}`;
    await run('DELETE FROM filters WHERE id = ?', [id]);
  },

  // Welcome & Goodbye
  async getWelcome(chat) {
    return await get('SELECT message, status FROM welcomes WHERE chat = ?', [chat]);
  },
  async setWelcome(chat, message, status = 'on') {
    await run(
      'INSERT INTO welcomes (chat, message, status) VALUES (?, ?, ?) ON CONFLICT(chat) DO UPDATE SET message = excluded.message, status = excluded.status',
      [chat, message, status]
    );
  },
  async getGoodbye(chat) {
    return await get('SELECT message, status FROM goodbyes WHERE chat = ?', [chat]);
  },
  async setGoodbye(chat, message, status = 'on') {
    await run(
      'INSERT INTO goodbyes (chat, message, status) VALUES (?, ?, ?) ON CONFLICT(chat) DO UPDATE SET message = excluded.message, status = excluded.status',
      [chat, message, status]
    );
  },

  // Antilink
  async getAntilink(chat) {
    return await get('SELECT action, status FROM antilinks WHERE chat = ?', [chat]);
  },
  async setAntilink(chat, action = 'warn', status = 'on') {
    await run(
      'INSERT INTO antilinks (chat, action, status) VALUES (?, ?, ?) ON CONFLICT(chat) DO UPDATE SET action = excluded.action, status = excluded.status',
      [chat, action, status]
    );
  },

  // Antibot
  async getAntibot(chat) {
    return await get('SELECT action, status FROM antibots WHERE chat = ?', [chat]);
  },
  async setAntibot(chat, action = 'kick', status = 'on') {
    await run(
      'INSERT INTO antibots (chat, action, status) VALUES (?, ?, ?) ON CONFLICT(chat) DO UPDATE SET action = excluded.action, status = excluded.status',
      [chat, action, status]
    );
  },

  // Antiword
  async getAntiwords(chat) {
    const rows = await all('SELECT word FROM antiwords WHERE chat = ?', [chat]);
    return rows.map((r) => r.word);
  },
  async addAntiword(chat, word) {
    const id = `${chat}_${word.toLowerCase()}`;
    await run('INSERT OR IGNORE INTO antiwords (id, chat, word) VALUES (?, ?, ?)', [id, chat, word.toLowerCase()]);
  },
  async removeAntiword(chat, word) {
    const id = `${chat}_${word.toLowerCase()}`;
    await run('DELETE FROM antiwords WHERE id = ?', [id]);
  },

  // AFK
  async getAfk(user) {
    return await get('SELECT reason, timestamp FROM afk_users WHERE user = ?', [user]);
  },
  async setAfk(user, reason) {
    await run(
      'INSERT INTO afk_users (user, reason, timestamp) VALUES (?, ?, ?) ON CONFLICT(user) DO UPDATE SET reason = excluded.reason, timestamp = excluded.timestamp',
      [user, reason, Date.now()]
    );
  },
  async removeAfk(user) {
    await run('DELETE FROM afk_users WHERE user = ?', [user]);
  }
};

module.exports = {
  getDatabase,
  run,
  get,
  all,
  initializeDatabase,
  dbOps
};
