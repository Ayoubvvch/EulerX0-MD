'use strict';

const { Module } = require('../main');
const fancy = require('./utils/fancy');

Module(
  {
    pattern: 'fancy ?(.*)',
    desc: 'Transform text into 30+ fancy aesthetic fonts',
    use: 'general'
  },
  async (msg, match) => {
    let text = match[1] || msg.quoted?.text;
    if (!text) {
      return await msg.sendReply('⚠️ *يرجى كتابة النص لتحويله إلى خطوط مميزة.*\n_مثال: .fancy EulerX0 Bot_');
    }

    // Check if numeric code specified (e.g. .fancy 5 Hello)
    const parts = text.trim().split(' ');
    const code = parseInt(parts[0], 10);

    if (!isNaN(code) && code >= 1 && code <= 33 && parts.length > 1) {
      const targetText = parts.slice(1).join(' ');
      const mapped = fancy.apply(fancy[code - 1], targetText);
      return await msg.sendReply(mapped);
    }

    const list = fancy.list(text, fancy);
    await msg.sendReply(`✨ *الخطوط المزخرفة لـ:* \`${text}\`\n${list}\n_للاختيار المباشر:_ \`.fancy <الرقم> <النص>\``);
  }
);
