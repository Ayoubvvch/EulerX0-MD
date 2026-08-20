'use strict';

/**
 * ⚡ EulerX0 MD - Full Web Control Center & Session Server
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
const PLUGINS_DIR = path.join(BOT_DIR, 'plugins');
const CONFIG_FILE = path.join(BOT_DIR, 'config.env');
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

function getConnectedUserData(sessionId = 'AcMods') {
  try {
    const credsPath = path.join(getSessionPath(sessionId), 'creds.json');
    if (!fs.existsSync(credsPath)) return null;
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return creds.me || null;
  } catch (_) {
    return null;
  }
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

async function startQrSession(sessionId = 'AcMods') {
  cleanupSocket();
  const safeId = (sessionId || 'AcMods').replace(/[^a-zA-Z0-9_-]/g, '');
  const sessionDir = getSessionPath(safeId);

  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  activeSessionState = {
    status: 'generating',
    pairingCode: null,
    qrCodeUrl: null,
    message: 'جارِ توليد رمز QR...',
    sessionId: safeId,
    updatedAt: new Date().toISOString()
  };

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000
  });

  activeSocket = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
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
        message: 'تم الربط بنجاح! جارِ تشغيل البوت...',
        sessionId: safeId,
        updatedAt: new Date().toISOString()
      };

      await delay(2000);
      cleanupSocket();

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
}

async function startPairingSession(sessionId = 'AcMods', phoneNumber) {
  cleanupSocket();
  const safeId = (sessionId || 'AcMods').replace(/[^a-zA-Z0-9_-]/g, '');
  const sessionDir = getSessionPath(safeId);

  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000
  });

  activeSocket = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      activeSessionState = {
        status: 'connected',
        pairingCode: null,
        qrCodeUrl: null,
        message: 'تم الربط بنجاح! جارِ تشغيل البوت...',
        sessionId: safeId,
        updatedAt: new Date().toISOString()
      };

      await delay(2000);
      cleanupSocket();

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

  await delay(1500);
  const code = await sock.requestPairingCode(phoneNumber);

  activeSessionState = {
    status: 'pairing',
    pairingCode: code,
    qrCodeUrl: null,
    message: `رمز الاقتران: ${code}`,
    sessionId: safeId,
    updatedAt: new Date().toISOString()
  };

  return code;
}

// ── API Routes ──────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(BOT_DIR, 'dashboard.html'));
});

app.get('/api/status', async (req, res) => {
  let pm2Bot = null;
  try {
    const out = await execPm2(['jlist']);
    const list = JSON.parse(out);
    const b = list.find((p) => p.name === BOT_PROCESS);
    if (b) {
      pm2Bot = {
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
  const hasCreds = hasValidCreds();
  const connectedUser = getConnectedUserData();

  res.json({
    sessionState: activeSessionState,
    hasCreds,
    connectedUser,
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
    config: parseEnvConfig(),
    pm2Bot
  });
});

app.post('/api/start-qr', async (req, res) => {
  const { sessionId = 'AcMods' } = req.body || {};
  try {
    await startQrSession(sessionId);
    res.json({ success: true, sessionState: activeSessionState });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/start-pairing', async (req, res) => {
  try {
    const { sessionId = 'AcMods', phoneNumber } = req.body || {};
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب' });
    }
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const code = await startPairingSession(sessionId, cleanPhone);
    res.json({ success: true, pairingCode: code, sessionState: activeSessionState });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bot/control', async (req, res) => {
  const { action } = req.body || {};
  try {
    if (action === 'restart') {
      await execPm2(['restart', BOT_PROCESS]);
    } else if (action === 'stop') {
      await execPm2(['stop', BOT_PROCESS]);
    } else if (action === 'start') {
      await execPm2(['start', BOT_PROCESS]);
    }
    res.json({ success: true, action });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/session/delete', async (req, res) => {
  const { sessionId = 'AcMods' } = req.body || {};
  try {
    cleanupSocket();
    await execPm2(['stop', BOT_PROCESS]).catch(() => {});
    const sessionDir = getSessionPath(sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    activeSessionState = {
      status: 'idle',
      pairingCode: null,
      qrCodeUrl: null,
      message: 'تم تسجيل الخروج وفصل الجلسة',
      sessionId,
      updatedAt: new Date().toISOString()
    };
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/plugins', (req, res) => {
  try {
    if (!fs.existsSync(PLUGINS_DIR)) return res.json([]);
    const files = fs.readdirSync(PLUGINS_DIR);
    const plugins = [];
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.disabled')) {
        const isEnabled = file.endsWith('.js');
        const name = file.replace('.disabled', '').replace('.js', '');
        plugins.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          fileName: file,
          enabled: isEnabled
        });
      }
    }
    res.json(plugins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plugins/toggle', (req, res) => {
  const { fileName, enable } = req.body || {};
  if (!fileName) return res.status(400).json({ error: 'Filename is required' });

  try {
    const baseName = fileName.replace('.disabled', '').replace('.js', '');
    const currentPath = path.join(PLUGINS_DIR, fileName);
    const newPath = path.join(PLUGINS_DIR, enable ? `${baseName}.js` : `${baseName}.disabled`);

    if (fs.existsSync(currentPath)) {
      fs.renameSync(currentPath, newPath);
      execPm2(['restart', BOT_PROCESS]).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json(parseEnvConfig());
});

app.post('/api/config', (req, res) => {
  writeEnvConfig(req.body || {});
  execPm2(['restart', BOT_PROCESS]).catch(() => {});
  res.json({ success: true, config: parseEnvConfig() });
});

app.get('/api/logs', async (req, res) => {
  const lines = parseInt(req.query.lines || '60', 10);
  try {
    execFile('pm2', ['logs', BOT_PROCESS, '--lines', String(lines), '--nostream'], (err, stdout, stderr) => {
      res.json({ outLogs: stdout || stderr || 'لا توجد سجلات بعد.' });
    });
  } catch (_) {
    res.json({ outLogs: 'تعذر قراءة السجلات' });
  }
});

app.post('/api/logs/clear', async (req, res) => {
  try {
    await execPm2(['flush']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global fallback error handler to always return JSON
app.use((err, req, res, next) => {
  console.error('Unhandled Dashboard Error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`- 🚀 Dashboard & Session Control Center listening on http://localhost:${PORT}`);
});
