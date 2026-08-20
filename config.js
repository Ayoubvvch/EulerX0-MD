'use strict';

const fs = require('fs');
const path = require('path');
const pino = require('pino');

// Load environment variables from config.env if present
const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: true });
}

function toBool(val, defaultVal = false) {
  if (val === undefined || val === null) return defaultVal;
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}

function parseSessionId() {
  const raw = process.env.SESSION || process.env.SESSION_ID || 'AcMods';
  const clean = String(raw).includes('~') ? raw.split('~')[1].trim() : String(raw).trim();
  return clean || 'AcMods';
}

const pkg = require('./package.json');
const VERSION = pkg.version || '7.0.0';

const logger = pino({
  level: process.env.LOG_LEVEL || 'silent'
});

const dynamicOverrides = new Map();

const baseConfig = {
  VERSION,
  BOT_NAME: process.env.BOT_NAME || 'EulerX0 Bot',
  MODE: (process.env.MODE || 'public').toLowerCase(), // 'public' or 'private'
  HANDLERS: process.env.HANDLERS || 'false',
  MULTI_HANDLERS: toBool(process.env.MULTI_HANDLERS, true),
  SUDO: process.env.SUDO || '212614389153',
  TZ: process.env.TZ || 'Africa/Casablanca',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DASHBOARD_PORT: parseInt(process.env.DASHBOARD_PORT || '5000', 10),
  
  // Feature flags
  AUTO_READ_STATUS: toBool(process.env.AUTO_READ_STATUS, false),
  READ_MESSAGES: toBool(process.env.READ_MESSAGES, false),
  READ_COMMAND: toBool(process.env.READ_COMMAND, true),
  ALWAYS_ONLINE: toBool(process.env.ALWAYS_ONLINE, false),
  DISABLE_START_MESSAGE: toBool(process.env.DISABLE_START_MESSAGE, false),
  ANTI_DELETE: toBool(process.env.ANTI_DELETE, false),
  REJECT_CALLS: toBool(process.env.REJECT_CALLS, false),
  CHATBOT: process.env.CHATBOT || 'off',
  STICKER_DATA: process.env.STICKER_DATA || 'EulerX0',
  WARN_LIMIT: parseInt(process.env.WARN || '4', 10),
  
  // Keys & API Endpoints
  ACR_A: process.env.ACR_A || 'ff489a0160188cf5f0750eaf486eee74',
  ACR_S: process.env.ACR_S || 'ytu3AdkCu7fkRVuENhXxs9jsOW4YJtDXimAWMpJp',
  
  SESSION: parseSessionId(),
  logger,
  TEMP_DIR: path.join(__dirname, 'temp'),
  SESSIONS_DIR: path.join(__dirname, 'sessions'),
  DB_PATH: path.join(__dirname, 'bot.db')
};

// Proxied config object for seamless runtime variable updates
const config = new Proxy(baseConfig, {
  get(target, prop) {
    if (prop === 'SESSION') {
      return parseSessionId();
    }
    if (dynamicOverrides.has(prop)) {
      return dynamicOverrides.get(prop);
    }
    if (typeof prop === 'string' && process.env[prop] !== undefined) {
      return process.env[prop];
    }
    return target[prop];
  },
  set(target, prop, val) {
    dynamicOverrides.set(prop, val);
    return true;
  }
});

config.setVar = (key, val) => {
  dynamicOverrides.set(key, val);
};

config.getSudoList = () => {
  const raw = String(config.SUDO || '');
  return raw
    .split(',')
    .map((s) => s.trim().replace(/[^0-9]/g, ''))
    .filter(Boolean);
};

config.isOwner = (jid, sockUser = null) => {
  if (!jid) return false;
  const cleanNumber = String(jid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  const sudoList = config.getSudoList();
  
  if (sudoList.includes(cleanNumber)) return true;
  
  if (sockUser) {
    const botNum = sockUser.id ? sockUser.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
    const botLid = sockUser.lid ? sockUser.lid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
    if (botNum && cleanNumber === botNum) return true;
    if (botLid && cleanNumber === botLid) return true;
  }
  return false;
};

module.exports = config;
