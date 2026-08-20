'use strict';

const axios = require('axios');
const moment = require('moment-timezone');
const { Module } = require('../main');
const config = require('../config');

const FIREBASE_PROJECT = 'acbots-b105b';
const FIREBASE_API_KEY = 'AIzaSyCDuLXmOGf6exkExtveKUyyZRb9pBrOxVQ';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

let remindersMap = new Map();
let reminderTarget = null;
let rmInterval = null;

const fromFs = (val) => {
  if (!val) return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFs);
  if ('mapValue' in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) obj[k] = fromFs(v);
    return obj;
  }
  return null;
};

const toFs = (val) => {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return { integerValue: String(val) };
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFs) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) fields[k] = toFs(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
};

async function loadRemindersData() {
  try {
    const res = await axios.get(`${FS_BASE}/rm_config/reminders?key=${FIREBASE_API_KEY}`, { timeout: 8000 });
    const fields = res.data.fields || {};
    const obj = {};
    for (const [k, v] of Object.entries(fields)) obj[k] = fromFs(v);
    if (obj.data) {
      remindersMap = new Map(Object.entries(obj.data));
    }
  } catch (_) {}

  try {
    const setRes = await axios.get(`${FS_BASE}/rm_config/settings?key=${FIREBASE_API_KEY}`, { timeout: 8000 });
    const setFields = setRes.data.fields || {};
    const setObj = {};
    for (const [k, v] of Object.entries(setFields)) setObj[k] = fromFs(v);
    if (setObj.target) reminderTarget = setObj.target;
  } catch (_) {}
}

async function saveRemindersData() {
  try {
    const dataObj = Object.fromEntries(remindersMap);
    await axios.patch(`${FS_BASE}/rm_config/reminders?key=${FIREBASE_API_KEY}`, {
      fields: { data: toFs(dataObj) }
    });
  } catch (e) {
    console.error('[RM] Save failed:', e.message);
  }
}

function startReminderScheduler(sock) {
  if (rmInterval) clearInterval(rmInterval);
  loadRemindersData();

  rmInterval = setInterval(async () => {
    if (!reminderTarget || remindersMap.size === 0) return;
    const now = moment().tz(config.TZ || 'Africa/Casablanca');
    const curTime = now.format('HH:mm');

    for (const [id, rm] of remindersMap.entries()) {
      if (rm.time === curTime && !rm.firedToday) {
        rm.firedToday = true;
        const alert = `⏰ *تذكير مبرمج!*
━━━━━━━━━━━━━━━━━━━
📝 *العنوان:* ${rm.title || rm.text}
⏱️ *الوقت:* \`${rm.time}\`
${rm.desc ? `📄 *التفاصيل:* ${rm.desc}\n` : ''}
_EulerX0 Reminders_ ⚡`;

        try {
          await sock.sendMessage(reminderTarget, { text: alert });
        } catch (_) {}
      }

      // Reset daily trigger at midnight
      if (curTime === '00:00') {
        rm.firedToday = false;
      }
    }
  }, 30000);
}

// 🚀 Startup Hook
Module({ on: 'start' }, async (sock) => {
  startReminderScheduler(sock);
});

// ── Commands ────────────────────────────────────────────────────────────────

Module(
  {
    pattern: 'rmlist|reminders',
    fromMe: true,
    desc: 'List all scheduled reminders',
    use: 'reminders'
  },
  async (msg) => {
    await loadRemindersData();
    if (remindersMap.size === 0) {
      return await msg.sendReply('ℹ️ *لا توجد تذكيرات مسجلة.*');
    }

    let text = `⏰ *قائمة التذكيرات المسجلة (${remindersMap.size}):*\n━━━━━━━━━━━━━━━━━━━\n`;
    for (const [id, rm] of remindersMap.entries()) {
      text += `• \`${id}\` | ⏱️ \`${rm.time}\` | 📝 *${rm.title || rm.text}*\n`;
    }
    text += `\n🎯 *الهدف:* \`${reminderTarget || 'غير محدد'}\``;
    await msg.sendReply(text);
  }
);

Module(
  {
    pattern: 'rmadd ?(.*)',
    fromMe: true,
    desc: 'Add a scheduled reminder: .rmadd HH:mm | title',
    use: 'reminders'
  },
  async (msg, match) => {
    const raw = match[1];
    if (!raw || !raw.includes('|')) {
      return await msg.sendReply('⚠️ *الصيغة:* \`.rmadd 14:30 | موعد الدواء\`');
    }

    const [time, title] = raw.split('|').map((s) => s.trim());
    const id = `rm_${Date.now()}`;
    remindersMap.set(id, { id, time, title, firedToday: false });
    await saveRemindersData();

    await msg.sendReply(`✅ *تمت إضافة التذكير بنجاح!* (الوقت: \`${time}\` - \`${title}\`)`);
  }
);

Module(
  {
    pattern: 'rmdel ?(.*)',
    fromMe: true,
    desc: 'Delete a reminder by ID',
    use: 'reminders'
  },
  async (msg, match) => {
    const id = match[1]?.trim();
    if (!id || !remindersMap.has(id)) {
      return await msg.sendReply('⚠️ *يرجى كتابة معرّف التذكير (ID) لحذفه.*');
    }

    remindersMap.delete(id);
    await saveRemindersData();
    await msg.sendReply(`🗑️ *تم حذف التذكير \`${id}\` بنجاح.*`);
  }
);

Module(
  {
    pattern: 'rmtarget ?(.*)',
    fromMe: true,
    desc: 'Set current chat as reminders target',
    use: 'reminders'
  },
  async (msg, match) => {
    const target = match[1]?.trim() || msg.jid;
    reminderTarget = target;
    try {
      await axios.patch(`${FS_BASE}/rm_config/settings?key=${FIREBASE_API_KEY}`, {
        fields: { target: toFs(target) }
      });
      await msg.sendReply(`🎯 *تم تعيين الهدف لاستقبال التذكيرات:* \`${target}\``);
    } catch (e) {
      await msg.sendReply(`❌ *خطأ:* ${e.message}`);
    }
  }
);
