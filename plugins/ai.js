'use strict';

const axios = require('axios');
const { Module } = require('../main');
const config = require('../config');

// AI Question & Answer helper
async function askAI(prompt) {
  try {
    const res = await axios.get(`https://api.siputzx.my.id/api/ai/chatgpt4o?content=${encodeURIComponent(prompt)}`, { timeout: 15000 });
    if (res.data?.status && res.data?.data) {
      return res.data.data;
    }
  } catch (_) {}

  // Fallback Gemini / AI API
  try {
    const res = await axios.get(`https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(prompt)}`, { timeout: 15000 });
    if (res.data?.status && res.data?.data) {
      return res.data.data;
    }
  } catch (_) {}

  throw new Error('فشل الحصول على رد من الذكاء الاصطناعي.');
}

Module(
  {
    pattern: 'ai|gpt|gemini ?(.*)',
    desc: 'Ask AI question',
    use: 'ai'
  },
  async (msg, match) => {
    const query = match[1] || msg.quoted?.text;
    if (!query) return await msg.sendReply('⚠️ *يرجى كتابة السؤال أو الطلب.*\n_مثال: .ai كيف أتعلم البرمجة؟_');

    const wait = await msg.sendReply('🧠 *جارِ التفكير والمعالجة...*');
    try {
      const answer = await askAI(query);
      await msg.edit(`🤖 *الذكاء الاصطناعي:*\n\n${answer}`, wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

// Auto-Chatbot trigger if CHATBOT=on
Module({ on: 'text' }, async (msg, text) => {
  if (config.CHATBOT !== 'on' || msg.isGroup || msg.fromOwner) return;
  if (text.startsWith('.') || text.startsWith('!') || text.startsWith('#') || text.startsWith('/')) return;

  try {
    const reply = await askAI(text);
    if (reply) {
      await msg.sendReply(reply);
    }
  } catch (_) {}
});
