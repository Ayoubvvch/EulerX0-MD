'use strict';

const axios = require('axios');
const moment = require('moment-timezone');
const { Module } = require('../main');
const config = require('../config');

const LAT = 35.566240218891245;
const LON = -5.369891074339873;
const CITY = 'Tetouan';
const TZ = 'Africa/Casablanca';
const API_URL = 'https://api.open-meteo.com/v1/forecast';

const FIREBASE_PROJECT = 'acbots-b105b';
const FIREBASE_API_KEY = 'AIzaSyCDuLXmOGf6exkExtveKUyyZRb9pBrOxVQ';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

let weatherInterval = null;
let lastAlertHour = -1;

const fromFsValue = (val) => {
  if (!val) return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFsValue);
  if ('mapValue' in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) obj[k] = fromFsValue(v);
    return obj;
  }
  return null;
};

async function getFsSettings() {
  try {
    const res = await axios.get(`${FS_BASE}/weather_config/settings?key=${FIREBASE_API_KEY}`, { timeout: 8000 });
    const fields = res.data.fields || {};
    const obj = {};
    for (const [k, v] of Object.entries(fields)) obj[k] = fromFsValue(v);
    return obj;
  } catch (_) {
    return null;
  }
}

async function fetchWeather(lat = LAT, lon = LON) {
  const url = `${API_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=${TZ}`;
  const res = await axios.get(url, { timeout: 10000 });
  return res.data;
}

function getWeatherDescription(code) {
  const map = {
    0: '☀️ سماء صافية',
    1: '🌤️ صافٍ إلى غائم جزئياً',
    2: '⛅ غائم جزئياً',
    3: '☁️ غائم كلياً',
    45: '🌫️ ضباب',
    48: '🌫️ ضباب متجمد',
    51: '🌦️ رذاذ خفيف',
    61: '🌧️ أمطار خفيفة',
    63: '🌧️ أمطار متوسطة',
    65: '🌧️ أمطار غزيرة',
    80: '🌦️ زخات مطرية',
    95: '⛈️ عواصف رعدية'
  };
  return map[code] || '🌡️ معتدل';
}

async function startWeatherMonitor(sock) {
  if (weatherInterval) clearInterval(weatherInterval);

  weatherInterval = setInterval(async () => {
    try {
      const settings = await getFsSettings();
      const target = settings?.target;
      if (!target) return;

      const now = moment().tz(TZ);
      const currentHour = now.hour();
      const currentMin = now.minute();

      // Check daily morning report at 07:00
      if (currentHour === 7 && currentMin === 0 && lastAlertHour !== currentHour) {
        lastAlertHour = currentHour;
        const w = await fetchWeather();
        const cur = w.current;
        const daily = w.daily;

        const report = `🌅 *تقرير الطقس الصباحي لمدينة ${CITY}* 🌤️
━━━━━━━━━━━━━━━━━━━
🌡️ *الحرارة الحالية:* \`${cur.temperature_2m}°C\` (المحسوسة: \`${cur.apparent_temperature}°C\`)
📈 *الحرارة العظمى:* \`${daily.temperature_2m_max[0]}°C\` | 📉 *الصغرى:* \`${daily.temperature_2m_min[0]}°C\`
💧 *الرطوبة:* \`${cur.relative_humidity_2m}%\`
💨 *الرياح:* \`${cur.wind_speed_10m} km/h\`
☀️ *الشروق:* \`${moment(daily.sunrise[0]).format('HH:mm')}\` | 🌇 *الغروب:* \`${moment(daily.sunset[0]).format('HH:mm')}\`
📊 *الحالة:* ${getWeatherDescription(cur.weather_code)}

_يوم سعيد وموفق بإذن الله_ 🌟`;

        await sock.sendMessage(target, { text: report });
      }
    } catch (_) {}
  }, 60000);
}

// 🚀 Startup Hook
Module({ on: 'start' }, async (sock) => {
  await startWeatherMonitor(sock);
});

// ── Commands ────────────────────────────────────────────────────────────────

Module(
  {
    pattern: 'weather ?(.*)',
    desc: 'Get weather forecast for a city or default location (Tetouan)',
    use: 'reminders'
  },
  async (msg, match) => {
    const cityQuery = match[1]?.trim() || CITY;
    const wait = await msg.sendReply(`🔍 *جارِ جلب بيانات الطقس لـ ${cityQuery}...*`);

    try {
      let lat = LAT;
      let lon = LON;
      let cityName = CITY;

      if (cityQuery.toLowerCase() !== 'tetouan' && cityQuery !== 'تطوان') {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery)}&count=1&language=ar&format=json`;
        const geoRes = await axios.get(geoUrl, { timeout: 8000 });
        if (!geoRes.data?.results || geoRes.data.results.length === 0) {
          return await msg.edit(`❌ *لم يتم العثور على المدينة:* \`${cityQuery}\``, wait.key);
        }
        const g = geoRes.data.results[0];
        lat = g.latitude;
        lon = g.longitude;
        cityName = g.name;
      }

      const w = await fetchWeather(lat, lon);
      const cur = w.current;
      const daily = w.daily;

      const text = `🌤️ *طقس ${cityName}:*
━━━━━━━━━━━━━━━━━━━
🌡️ *درجة الحرارة:* \`${cur.temperature_2m}°C\` (المحسوسة: \`${cur.apparent_temperature}°C\`)
📈 *العظمى:* \`${daily.temperature_2m_max[0]}°C\` | 📉 *الصغرى:* \`${daily.temperature_2m_min[0]}°C\`
💧 *الرطوبة:* \`${cur.relative_humidity_2m}%\`
💨 *سرعة الرياح:* \`${cur.wind_speed_10m} km/h\`
☀️ *شروق الشمس:* \`${moment(daily.sunrise[0]).format('HH:mm')}\`
🌇 *غروب الشمس:* \`${moment(daily.sunset[0]).format('HH:mm')}\`
📊 *الحالة العامة:* ${getWeatherDescription(cur.weather_code)}`;

      await msg.edit(text, wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);
