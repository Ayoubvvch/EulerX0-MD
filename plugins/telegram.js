'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Module } = require('../main');
const config = require('../config');
const { getTempPath } = require('../core/helpers');

const TG_API_ID = 26301311;
const TG_API_HASH = '1ea7538cb823013e6e2c92923c025b7c';
const TG_SESSION = '1BAAOMTQ5LjE1NC4xNjcuOTEAUDsR0X0VbmFYSX1jKSk1jBl74JeoLBLCmFZSsI4thpq9g3B0kRmWNui6CryG1GlYGpUFqG2dKpg+txGeMx8MXTJvATAu/N9inD28vI0/zBPrLyAUixNqOf7JB5InkTwJj+cjY7iMYiccfEjetugy+wdoNe9fcrokkcRa5wHYDCBhAHTS9OPVegpgGkjewP+Nx9hjRae4BnNzInL6IL5rskkTlBHDgrvtRIeGr9t+g0+P66KnRiJ/wO1U3LvNLXgHclL4DKF5eavfdUyyjd3fde/AloDZrqoUt+QNrN50tqawo+0Hj8sabkoLIjND43cKKiH9/vqybkVGiYSZsCiyHBo=';

const DB_FILE = path.join(__dirname, '../tg_channels.json');

class TelegramManager {
  constructor() {
    this.tgClient = null;
    this.waSock = null;
    this.isRunning = false;
    this.channels = new Map(); // id -> { id, rawId, title, target: [jids] }
    this.lastMsgIds = new Map();
    this.pollInterval = null;
  }

  loadData() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        if (Array.isArray(raw.channels)) {
          this.channels = new Map(raw.channels);
        }
      }
    } catch (e) {
      console.error('[TG] Load data error:', e.message);
    }
  }

  saveData() {
    try {
      const data = { channels: Array.from(this.channels.entries()) };
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[TG] Save data error:', e.message);
    }
  }

  async connect() {
    if (this.tgClient) return true;
    try {
      this.tgClient = new TelegramClient(
        new StringSession(process.env.TELEGRAM_SESSION || TG_SESSION),
        parseInt(process.env.TELEGRAM_API_ID) || TG_API_ID,
        process.env.TELEGRAM_API_HASH || TG_API_HASH,
        { connectionRetries: 5 }
      );
      await this.tgClient.connect();
      console.log('✈️ [TG] Telegram client connected successfully.');
      return true;
    } catch (e) {
      console.error('✈️ [TG] Connection failed:', e.message);
      this.tgClient = null;
      return false;
    }
  }

  async startMonitoring(waSock) {
    this.waSock = waSock;
    this.loadData();

    if (this.channels.size === 0) {
      console.log('✈️ [TG] No monitored channels configured in tg_channels.json.');
      return;
    }

    const ok = await this.connect();
    if (!ok) return;

    if (this.pollInterval) clearInterval(this.pollInterval);
    this.isRunning = true;

    // Check channels every 25 seconds
    this.pollInterval = setInterval(() => this.checkNewMessages(), 25000);
    console.log(`✈️ [TG] Started monitor for ${this.channels.size} Telegram channel(s).`);
  }

  async checkNewMessages() {
    if (!this.tgClient || !this.waSock) return;

    for (const [chanId, chanData] of this.channels.entries()) {
      try {
        const peer = chanData.rawId || chanId;
        const messages = await this.tgClient.getMessages(peer, { limit: 2 });
        if (!messages || messages.length === 0) continue;

        const latest = messages[0];
        const lastSeen = this.lastMsgIds.get(chanId);

        if (!lastSeen) {
          this.lastMsgIds.set(chanId, latest.id);
          continue;
        }

        if (latest.id > lastSeen) {
          this.lastMsgIds.set(chanId, latest.id);
          await this.forwardMessage(latest, chanData);
        }
      } catch (err) {
        // quiet fail on single channel check
      }
    }
  }

  async forwardMessage(tgMsg, chanData) {
    const targets = Array.isArray(chanData.target) ? chanData.target : [chanData.target].filter(Boolean);
    if (targets.length === 0) return;

    const caption = tgMsg.message || '';

    try {
      // If message has media
      if (tgMsg.media) {
        const tmpPath = getTempPath(`tg_${tgMsg.id}.bin`);
        const downloaded = await this.tgClient.downloadMedia(tgMsg, { outputFile: tmpPath });

        if (downloaded && fs.existsSync(tmpPath)) {
          const buf = fs.readFileSync(tmpPath);
          const isPhoto = Boolean(tgMsg.photo);
          const isVideo = Boolean(tgMsg.video || tgMsg.document?.mimeType?.startsWith('video/'));
          const isAudio = Boolean(tgMsg.audio || tgMsg.document?.mimeType?.startsWith('audio/'));

          for (const target of targets) {
            try {
              if (isPhoto) {
                await this.waSock.sendMessage(target, { image: buf, caption });
              } else if (isVideo) {
                await this.waSock.sendMessage(target, { video: buf, caption });
              } else if (isAudio) {
                await this.waSock.sendMessage(target, { audio: buf, mimetype: 'audio/mp4', ptt: false });
              } else {
                await this.waSock.sendMessage(target, {
                  document: buf,
                  fileName: tgMsg.file?.name || 'document',
                  mimetype: tgMsg.document?.mimeType || 'application/octet-stream',
                  caption
                });
              }
            } catch (e) {
              console.error(`[TG Forward Error to ${target}]:`, e.message);
            }
          }
          try { fs.unlinkSync(tmpPath); } catch (_) {}
          return;
        }
      }

      // If text only
      if (caption) {
        for (const target of targets) {
          try {
            await this.waSock.sendMessage(target, { text: caption });
          } catch (_) {}
        }
      }
    } catch (err) {
      console.error('[TG Forwarding Failed]:', err.message);
    }
  }
}

const tgManager = new TelegramManager();

// 🚀 Startup Hook: Automatically start Telegram monitor when bot connects
Module({ on: 'start' }, async (sock) => {
  await tgManager.startMonitoring(sock);
});

// ── Telegram Bot Commands ───────────────────────────────────────────────────

Module(
  {
    pattern: 'tgstart',
    fromMe: true,
    desc: 'Start / Restart Telegram Channel Monitor',
    use: 'telegram'
  },
  async (msg) => {
    await tgManager.startMonitoring(msg.sock);
    await msg.sendReply(`✅ *تم تشغيل مراقب التيليجرام بنجاح!* (${tgManager.channels.size} قناة مراقبة)`);
  }
);

Module(
  {
    pattern: 'tglist',
    fromMe: true,
    desc: 'List all monitored Telegram channels and their WhatsApp targets',
    use: 'telegram'
  },
  async (msg) => {
    tgManager.loadData();
    if (tgManager.channels.size === 0) {
      return await msg.sendReply('ℹ️ *لا توجد أي قنوات تيليجرام مسجلة حالياً.*');
    }

    let text = `✈️ *قنوات التيليجرام المراقبة (${tgManager.channels.size}):*\n━━━━━━━━━━━━━━━━━━━\n`;
    for (const [id, c] of tgManager.channels.entries()) {
      text += `📢 *القناة:* \`${c.title || id}\`\n`;
      text += `🆔 *ID:* \`${c.rawId || id}\`\n`;
      text += `🎯 *الأهداف (WhatsApp):*\n`;
      const targets = Array.isArray(c.target) ? c.target : [c.target];
      targets.forEach((t) => (text += `  • \`${t}\`\n`));
      text += `\n`;
    }

    await msg.sendReply(text);
  }
);

Module(
  {
    pattern: 'tgadd ?(.*)',
    fromMe: true,
    desc: 'Add a Telegram channel to monitor',
    use: 'telegram'
  },
  async (msg, match) => {
    const input = match[1];
    if (!input) {
      return await msg.sendReply('⚠️ *يرجى كتابة معرّف أو رابط القناة.*\n_مثال: .tgadd https://t.me/example_channel_');
    }

    const wait = await msg.sendReply('⏳ *جارِ فحص القناة في تيليجرام...*');
    const ok = await tgManager.connect();
    if (!ok) return await msg.edit('❌ *فشل الاتصال بحساب تيليجرام.*', wait.key);

    try {
      const entity = await tgManager.tgClient.getEntity(input);
      const chanId = entity.id.toString();
      const rawId = `-100${chanId.replace(/^-100/, '').replace(/^-/, '')}`;
      const title = entity.title || entity.username || chanId;

      tgManager.channels.set(chanId, {
        id: chanId,
        rawId: rawId,
        title: title,
        target: [msg.jid]
      });
      tgManager.saveData();

      await msg.edit(`✅ *تمت إضافة القناة بنجاح!*
📢 *الاسم:* ${title}
🆔 *المعرّف:* \`${rawId}\`
🎯 *الهدف التلقائي:* \`${msg.jid}\``, wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'tgremove ?(.*)',
    fromMe: true,
    desc: 'Remove a monitored channel',
    use: 'telegram'
  },
  async (msg, match) => {
    const id = match[1]?.trim();
    if (!id) return await msg.sendReply('⚠️ *يرجى كتابة ID القناة لحذفها.*');

    const clean = id.replace(/^-100/, '').replace(/^-/, '');
    if (tgManager.channels.has(clean)) {
      tgManager.channels.delete(clean);
      tgManager.saveData();
      await msg.sendReply(`✅ *تم حذف القناة ${id} من قائمة المراقبة.*`);
    } else {
      await msg.sendReply('❌ *القناة غير موجودة في القائمة.*');
    }
  }
);

Module(
  {
    pattern: 'tgclear',
    fromMe: true,
    desc: 'Clear all monitored Telegram channels',
    use: 'telegram'
  },
  async (msg) => {
    tgManager.channels.clear();
    tgManager.saveData();
    await msg.sendReply('🧹 *تم مسح جميع قنوات التيليجرام المراقبة.*');
  }
);
