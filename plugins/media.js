'use strict';

const axios = require('axios');
const qrcode = require('qrcode');
const { Module } = require('../main');
const config = require('../config');

Module(
  {
    pattern: 'img|image ?(.*)',
    desc: 'Search Google Images and download photos',
    use: 'media'
  },
  async (msg, match) => {
    const query = match[1];
    if (!query) return await msg.sendReply('⚠️ *يرجى كتابة كلمة البحث.*\n_مثال: .img خلفيات طبيعة_');

    const wait = await msg.sendReply(`🔍 *جارِ البحث عن صور لـ: ${query}...*`);
    try {
      const res = await axios.get(`https://api.siputzx.my.id/api/s/googleimage?query=${encodeURIComponent(query)}`, { timeout: 10000 });
      if (res.data?.status && res.data?.data && res.data.data.length > 0) {
        const images = res.data.data.slice(0, 3);
        for (const imgUrl of images) {
          await msg.sendMessage(imgUrl, 'image', { caption: `🖼️ *نتيجة البحث:* \`${query}\`` });
        }
        await msg.edit('✅ *تم إرسال الصور!*', wait.key);
      } else {
        await msg.edit('❌ *لم يتم العثور على صور.*', wait.key);
      }
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'lyrics ?(.*)',
    desc: 'Find lyrics for any song',
    use: 'media'
  },
  async (msg, match) => {
    const query = match[1] || msg.quoted?.text;
    if (!query) return await msg.sendReply('⚠️ *يرجى كتابة اسم الأغنية.*');

    const wait = await msg.sendReply(`🔍 *جارِ البحث عن كلمات: ${query}...*`);
    try {
      const res = await axios.get(`https://api.siputzx.my.id/api/s/lyrics?query=${encodeURIComponent(query)}`, { timeout: 10000 });
      if (res.data?.status && res.data?.data) {
        const d = res.data.data;
        const text = `🎵 *كلمات أغنية:* *${d.title || query}*\n🎤 *الفنان:* ${d.artist || 'غير معروف'}\n━━━━━━━━━━━━━━━━━━━\n\n${d.lyrics || d}`;
        await msg.edit(text, wait.key);
      } else {
        await msg.edit('❌ *لم يتم العثور على الكلمات.*', wait.key);
      }
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'qr ?(.*)',
    desc: 'Generate QR code image from text or link',
    use: 'media'
  },
  async (msg, match) => {
    const text = match[1] || msg.quoted?.text;
    if (!text) return await msg.sendReply('⚠️ *يرجى كتابة النص أو الرابط لتوليد الـ QR code.*');

    try {
      const buffer = await qrcode.toBuffer(text, { width: 500, margin: 2 });
      await msg.sendMessage(buffer, 'image', { caption: `🔳 *QR Code:* \`${text}\`` });
    } catch (err) {
      await msg.sendReply(`❌ *خطأ:* ${err.message}`);
    }
  }
);
