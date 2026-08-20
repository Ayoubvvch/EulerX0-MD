'use strict';

const path = require('path');
const fs = require('fs');
const baileys = require('baileys');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  delay,
  jidNormalizedUser
} = baileys;

const config = require('../config');
const { handleMessageUpsert, handleGroupParticipantsUpdate, triggerStartHooks } = require('./dispatcher');

class WhatsAppBotClient {
  constructor(sessionId = config.SESSION) {
    this.sessionId = sessionId || 'AcMods';
    this.sock = null;
    this.isConnected = false;
    this.isInitializing = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.heartbeatTimer = null;
    this.sessionDir = path.join(config.SESSIONS_DIR, this.sessionId);
  }

  async initialize() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      console.log(`- [${this.sessionId}] Initializing EulerX0 Core Socket...`);
      
      if (!fs.existsSync(this.sessionDir)) {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: config.logger,
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: config.ALWAYS_ONLINE,
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 2000
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        try {
          await this.handleConnectionUpdate(update);
        } catch (err) {
          console.error(`- [${this.sessionId}] Error handling connection update:`, err.message);
        }
      });

      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify' && m.messages && m.messages.length > 0) {
          for (const rawMsg of m.messages) {
            try {
              await handleMessageUpsert(this.sock, { ...m, messages: [rawMsg] });
            } catch (err) {
              console.error('Message upsert handling error:', err.message);
            }
          }
        }
      });

      this.sock.ev.on('group-participants.update', async (update) => {
        try {
          await handleGroupParticipantsUpdate(this.sock, update);
        } catch (err) {
          console.error('Group participants update error:', err.message);
        }
      });

      console.log(`- [${this.sessionId}] EulerX0 Socket configured successfully.`);
    } catch (err) {
      console.error(`- [${this.sessionId}] Error initializing socket:`, err.message);
    } finally {
      this.isInitializing = false;
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      if (!this.sock || !this.isConnected) return;
      try {
        if (config.ALWAYS_ONLINE) {
          await this.sock.sendPresenceUpdate('available');
        }
      } catch (err) {
        console.warn(`⚠️ [${this.sessionId}] Heartbeat failed: ${err.message}. Triggering reconnect...`);
        this.reconnect();
      }
    }, 60000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async reconnect() {
    if (this.isInitializing) return;
    this.stopHeartbeat();
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);
      } catch (_) {}
      this.sock = null;
    }
    this.isConnected = false;
    await delay(3000);
    await this.initialize();
  }

  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      this.isConnected = false;
      this.stopHeartbeat();
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

      console.log(`- [${this.sessionId}] Connection closed (Status Code: ${statusCode || 'unknown'}).`);

      if (!isLoggedOut && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const backoffDelay = Math.min(this.reconnectAttempts * 2000, 15000);
        console.log(`- [${this.sessionId}] Reconnecting attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${backoffDelay / 1000}s...`);
        await delay(backoffDelay);
        await this.initialize();
      } else if (isLoggedOut) {
        console.log(`- [${this.sessionId}] Session Logged Out. Awaiting re-pairing.`);
      } else {
        console.log(`- [${this.sessionId}] Max reconnect attempts reached. Exiting for PM2 supervisor.`);
        process.exit(1);
      }
    } else if (connection === 'open') {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      const userJid = this.sock.user?.id ? jidNormalizedUser(this.sock.user.id) : 'Unknown';
      console.log(`- ✅ [${this.sessionId}] Connected & Active for ${userJid}`);

      this.startHeartbeat();
      
      // Trigger background plugin startup hooks (e.g. weather alerts, telegram monitor, reminders)
      triggerStartHooks(this.sock).catch((e) => console.error('Error triggering start hooks:', e.message));

      if (!config.DISABLE_START_MESSAGE) {
        setTimeout(() => {
          this.sendStartupBanner().catch((e) => console.warn('Startup banner warning:', e.message));
        }, 4000);
      }
    }
  }

  async sendStartupBanner() {
    try {
      if (!this.sock || !this.sock.user || !this.isConnected) return;

      const myPhone = jidNormalizedUser(this.sock.user.id).split('@')[0];
      const banner = `⚡ *_EulerX0 Bot is Online & Ready!_* ⚡

🤖 *Bot:* ${config.BOT_NAME}
👑 *Developer:* Ayoubvvch
🌐 *Mode:* ${config.MODE}
🛠️ *Prefix:* ${config.HANDLERS === 'false' ? 'All (.,!,#,/, or None)' : config.HANDLERS}
📱 *Active Number:* +${myPhone}

💡 *Quick Commands:*
• \`.ping\` - Test response speed
• \`.alive\` - System health & status
• \`.menu\` - Full list of all features

_Powered by EulerX0 Remake Engine_ 🚀`;

      const targets = [];
      const sudoList = config.getSudoList();

      for (const num of sudoList) {
        const jid = `${num}@s.whatsapp.net`;
        if (!targets.includes(jid)) targets.push(jid);
      }

      if (targets.length === 0) {
        targets.push(jidNormalizedUser(this.sock.user.id));
      }

      for (const target of targets) {
        try {
          await this.sock.sendMessage(target, { text: banner });
        } catch (_) {}
      }
    } catch (_) {}
  }

  async shutdown() {
    console.log(`- [${this.sessionId}] Shutting down socket...`);
    this.stopHeartbeat();
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);
      } catch (_) {}
      this.sock = null;
    }
    this.isConnected = false;
  }
}

module.exports = { WhatsAppBotClient };
