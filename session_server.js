'use strict';

/**
 * ⚡ EulerX0 MD - Full Web Control Center & Session Server
 * Developer: Ayoubvvch
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, exec } = require('child_process');
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
  status: 'idle', // 'idle' | 'generating' | 'qr' | 'pairing' | 'connected' | 'error'
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

    if (mode === 'pairing' && phoneNumber) {
      setTimeout(async () => {
        try {
          const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
          if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(cleanPhone);
            activeSessionState = {
              status: 'pairing',
              pairingCode: code,
              qrCodeUrl: null,
              message: `رمز الاقتران: ${code}`,
              sessionId: safeId,
              updatedAt: new Date().toISOString()
            };
          }
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
      }, 2000);
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
          message: 'تم الربط بنجاح! جارِ تشغيل البوت...',
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
  await startBaileysSocket(sessionId, 'qr');
  res.json({ success: true, sessionState: activeSessionState });
});

app.post('/api/start-pairing', async (req, res) => {
  const { sessionId = 'AcMods', phoneNumber } = req.body || {};
  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب' });
  }
  await startBaileysSocket(sessionId, 'pairing', phoneNumber);
  
  // Wait up to 5 seconds for pairingCode to generate
  let attempts = 0;
  while (attempts < 10 && !activeSessionState.pairingCode && activeSessionState.status !== 'error') {
    await delay(500);
    attempts++;
  }

  if (activeSessionState.pairingCode) {
    res.json({ success: true, pairingCode: activeSessionState.pairingCode, sessionState: activeSessionState });
  } else if (activeSessionState.status === 'error') {
    res.status(500).json({ success: false, error: activeSessionState.message });
  } else {
    res.json({ success: true, message: 'جارِ توليد الرمز...', sessionState: activeSessionState });
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

app.listen(PORT, () => {
  console.log(`- 🚀 Dashboard & Session Control Center listening on http://localhost:${PORT}`);
});
