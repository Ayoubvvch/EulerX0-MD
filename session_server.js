'use strict';

/**
 * EulerX0 - Ultra-Lightweight Control Center & Session Server
 * Developer: Ayoubvvch
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const QRCode = require('qrcode');
const pino = require('pino');
const baileys = require('baileys');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  delay
} = baileys;

const app = express();
const PORT = process.env.DASHBOARD_PORT || 5000;
const BOT_DIR = __dirname;
const SESSIONS_DIR = path.join(BOT_DIR, 'sessions');
const CONFIG_FILE = path.join(BOT_DIR, 'config.env');
const DB_PATH = path.join(BOT_DIR, 'bot.db');
const BOT_PROCESS = 'eulerx0-bot';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(BOT_DIR));

let activeSocket = null;
let activeSessionState = {
  status: 'idle',
  pairingCode: null,
  qrCodeUrl: null,
  message: '',
  sessionId: 'AcMods',
  updatedAt: new Date().toISOString()
};

function execPm2(args) {
  return new Promise((resolve, reject) => {
    execFile('pm2', args, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || stdout || error.message));
      resolve(stdout.trim());
    });
  });
}

function cleanupSocket() {
  if (activeSocket) {
    try {
      activeSocket.ev.removeAllListeners();
      activeSocket.end(undefined);
    } catch (_) {}
    activeSocket = null;
  }
}

function getSessionPath(sessionId = 'AcMods') {
  const safeId = (sessionId || 'AcMods').replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(SESSIONS_DIR, safeId);
}

function hasValidCreds(sessionId = 'AcMods') {
  const credsPath = path.join(getSessionPath(sessionId), 'creds.json');
  return fs.existsSync(credsPath);
}

function parseEnvConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  const content = fs.readFileSync(CONFIG_FILE, 'utf8');
  const env = {};
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      env[key] = val;
    }
  });
  return env;
}

function writeEnvConfig(updates) {
  const current = parseEnvConfig();
  const merged = { ...current, ...updates };
  const lines = Object.entries(merged).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(CONFIG_FILE, lines.join('\n') + '\n', 'utf8');
}

async function startBaileysSocket(sessionId = 'AcMods', mode = 'qr', phoneNumber = null) {
  cleanupSocket();
  const safeId = (sessionId || 'AcMods').replace(/[^a-zA-Z0-9_-]/g, '');
  const sessionDir = getSessionPath(safeId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  activeSessionState = {
    status: 'generating',
    pairingCode: null,
    qrCodeUrl: null,
    message: mode === 'pairing' ? 'جارِ طلب رمز الاقتران...' : 'جارِ توليد رمز QR...',
    sessionId: safeId,
    updatedAt: new Date().toISOString()
  };

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));
    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000
    });

    activeSocket = sock;
    sock.ev.on('creds.update', saveCreds);

    if (mode === 'pairing' && phoneNumber && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
          const code = await sock.requestPairingCode(cleanPhone);
          activeSessionState = {
            status: 'pairing',
            pairingCode: code,
            qrCodeUrl: null,
            message: `رمز الاقتران: ${code}`,
            sessionId: safeId,
            updatedAt: new Date().toISOString()
          };
        } catch (err) {
          activeSessionState = {
            status: 'error',
            pairingCode: null,
            qrCodeUrl: null,
            message: `فشل طلب رمز الاقتران: ${err.message}`,
            sessionId: safeId,
            updatedAt: new Date().toISOString()
          };
        }
      }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr && mode === 'qr') {
        try {
          const qrUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
          activeSessionState = {
            status: 'qr',
            pairingCode: null,
            qrCodeUrl: qrUrl,
            message: 'امسح رمز QR للمتابعة',
            sessionId: safeId,
            updatedAt: new Date().toISOString()
          };
        } catch (_) {}
      }

      if (connection === 'open') {
        activeSessionState = {
          status: 'connected',
          pairingCode: null,
          qrCodeUrl: null,
          message: 'تم الربط بنجاح! جارِ إعادة تشغيل البوت...',
          sessionId: safeId,
          updatedAt: new Date().toISOString()
        };

        await delay(2000);
        cleanupSocket();

        // Restart bot PM2 process
        try {
          await execPm2(['restart', BOT_PROCESS]);
        } catch (_) {}
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          activeSessionState.status = 'idle';
          cleanupSocket();
        }
      }
    });
  } catch (err) {
    activeSessionState = {
      status: 'error',
      pairingCode: null,
      qrCodeUrl: null,
      message: err.message,
      sessionId: safeId,
      updatedAt: new Date().toISOString()
    };
  }
}

// ── Dashboard Routes & API ──────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(BOT_DIR, 'dashboard.html'));
});

app.get('/api/status', async (req, res) => {
  let pm2Info = null;
  try {
    const out = await execPm2(['jlist']);
    const list = JSON.parse(out);
    const b = list.find((p) => p.name === BOT_PROCESS);
    if (b) {
      pm2Info = {
        name: b.name,
        status: b.pm2_env?.status || 'stopped',
        uptime: b.pm2_env?.pm_uptime || null,
        restarts: b.pm2_env?.restart_time || 0,
        memory: b.monit?.memory || 0,
        cpu: b.monit?.cpu || 0
      };
    }
  } catch (_) {}

  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  res.json({
    bot: pm2Info,
    system: {
      platform: `${os.type()} ${os.arch()}`,
      uptime: os.uptime(),
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        percent: Math.round(((totalMem - freeMem) / totalMem) * 100)
      }
    },
    session: {
      hasCreds: hasValidCreds(),
      state: activeSessionState
    }
  });
});

app.post('/api/session/start', async (req, res) => {
  const { sessionId = 'AcMods', mode = 'qr', phoneNumber = null } = req.body;
  await startBaileysSocket(sessionId, mode, phoneNumber);
  res.json({ status: 'ok', state: activeSessionState });
});

app.get('/api/session/state', (req, res) => {
  res.json(activeSessionState);
});

app.post('/api/bot/restart', async (req, res) => {
  try {
    await execPm2(['restart', BOT_PROCESS]);
    res.json({ status: 'ok', message: 'Bot restarted' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json(parseEnvConfig());
});

app.post('/api/config', (req, res) => {
  writeEnvConfig(req.body || {});
  res.json({ status: 'ok', config: parseEnvConfig() });
});

app.listen(PORT, () => {
  console.log(`- 🚀 Dashboard & Session Control Center listening on http://localhost:${PORT}`);
});
