'use strict';

const googleTTS = require('google-tts-api');
const { Module } = require('../main');
const config = require('../config');
const {
  createSticker,
  stickerToPng,
  convertToMp3,
  applyAudioEffect
} = require('../core/helpers');

Module(
  {
    pattern: 'sticker|s ?(.*)',
    desc: 'Convert image, gif or short video to WhatsApp sticker',
    use: 'converters'
  },
  async (msg, match) => {
    const isQuoted = Boolean(msg.quoted);
    const target = isQuoted ? msg.reply_message : msg;

    if (!target || (!target.image && !target.video && !msg.message?.imageMessage && !msg.message?.videoMessage)) {
      return await msg.sendReply('⚠️ *يرجى الرد على صورة أو فيديو قصير لتحويله إلى ملصق.*');
    }

    const wait = await msg.sendReply('⏳ *جارِ إنشاء الملصق...*');
    try {
      const buffer = await target.download('buffer');
      if (!buffer) throw new Error('فشل تحميل الوسائط.');

      const isAnimated = Boolean(target.video || msg.message?.videoMessage);
      const stickerBuffer = await createSticker(buffer, { animated: isAnimated });

      await msg.sendMessage(stickerBuffer, 'sticker');
      await msg.edit('✅ *تم إنشاء الملصق!*', wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'take ?(.*)',
    desc: 'Change sticker pack name and author',
    use: 'converters'
  },
  async (msg, match) => {
    if (!msg.quoted?.isSticker && !msg.reply_message?.sticker) {
      return await msg.sendReply('⚠️ *يرجى الرد على ملصق لتغيير حقوقه.*');
    }

    const rawMeta = match[1] || '';
    const [packname, author] = rawMeta.includes(';') ? rawMeta.split(';') : [rawMeta || config.STICKER_DATA.split(';')[0], 'Ayoubvvch'];

    const wait = await msg.sendReply('⏳ *جارِ تعديل حقوق الملصق...*');
    try {
      const buffer = await msg.reply_message.download('buffer');
      if (!buffer) throw new Error('فشل تحميل الملصق.');

      const stickerBuffer = await createSticker(buffer, { packname, author });
      await msg.sendMessage(stickerBuffer, 'sticker');
      await msg.edit('✅ *تم تعديل الحقوق!*', wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'photo|toimg',
    desc: 'Convert sticker to PNG photo',
    use: 'converters'
  },
  async (msg) => {
    if (!msg.quoted?.isSticker && !msg.reply_message?.sticker) {
      return await msg.sendReply('⚠️ *يرجى الرد على ملصق ثابت لتحويله إلى صورة.*');
    }

    const wait = await msg.sendReply('⏳ *جارِ تحويل الملصق إلى صورة...*');
    try {
      const buffer = await msg.reply_message.download('buffer');
      if (!buffer) throw new Error('فشل تحميل الملصق.');

      const pngBuffer = await stickerToPng(buffer);
      await msg.sendMessage(pngBuffer, 'image', { caption: '🖼️ *تم تحويل الملصق بنجاح!*' });
      await msg.edit('✅ *تم!*', wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'mp3|tomp3',
    desc: 'Convert video or voice note to MP3 audio',
    use: 'converters'
  },
  async (msg) => {
    const isQuoted = Boolean(msg.quoted);
    const target = isQuoted ? msg.reply_message : msg;

    if (!target || (!target.video && !target.audio && !msg.message?.videoMessage && !msg.message?.audioMessage)) {
      return await msg.sendReply('⚠️ *يرجى الرد على فيديو أو تسجيل صوتي لتحويله إلى MP3.*');
    }

    const wait = await msg.sendReply('⏳ *جارِ تحويل الملف إلى MP3...*');
    try {
      const buffer = await target.download('buffer');
      if (!buffer) throw new Error('فشل تحميل الملف.');

      const mp3Buffer = await convertToMp3(buffer);
      await msg.sendMessage(mp3Buffer, 'audio', { mimetype: 'audio/mp4', ptt: false });
      await msg.edit('✅ *تم التحويل بنجاح!*', wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

// Audio Effects (bass, slow, fast, reverse, blown, nightcore)
const audioEffects = ['bass', 'slow', 'fast', 'reverse', 'blown', 'nightcore'];
audioEffects.forEach((effect) => {
  Module(
    {
      pattern: `${effect}$`,
      desc: `Apply ${effect} audio effect to voice/audio message`,
      use: 'converters'
    },
    async (msg) => {
      const isQuoted = Boolean(msg.quoted);
      const target = isQuoted ? msg.reply_message : msg;

      if (!target || (!target.audio && !target.video && !msg.message?.audioMessage && !msg.message?.videoMessage)) {
        return await msg.sendReply(`⚠️ *يرجى الرد على صوت أو تسجيل صوتي لتطبيق تأثير ${effect}.*`);
      }

      const wait = await msg.sendReply(`⏳ *جارِ تطبيق تأثير ${effect}...*`);
      try {
        const buffer = await target.download('buffer');
        if (!buffer) throw new Error('فشل تحميل الصوت.');

        const effectBuffer = await applyAudioEffect(buffer, effect);
        await msg.sendMessage(effectBuffer, 'audio', { mimetype: 'audio/mp4', ptt: false });
        await msg.edit('✅ *تم تطبيق التأثير بنجاح!*', wait.key);
      } catch (err) {
        await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
      }
    }
  );
});

Module(
  {
    pattern: 'tts ?(.*)',
    desc: 'Text to speech synthesizer',
    use: 'converters'
  },
  async (msg, match) => {
    let text = match[1] || msg.quoted?.text;
    if (!text) return await msg.sendReply('⚠️ *يرجى كتابة النص لتحويله إلى صوت.*\n_مثال: .tts ar السلام عليكم_');

    let lang = 'ar';
    const firstWord = text.split(' ')[0].toLowerCase();
    if (['ar', 'en', 'fr', 'es', 'de', 'tr'].includes(firstWord)) {
      lang = firstWord;
      text = text.substring(firstWord.length).trim();
    }

    try {
      const url = googleTTS.getAudioUrl(text, {
        lang: lang,
        slow: false,
        host: 'https://translate.google.com'
      });

      await msg.sendMessage({ url }, 'audio', { ptt: true, mimetype: 'audio/ogg; codecs=opus' });
    } catch (err) {
      await msg.sendReply(`❌ *خطأ:* ${err.message}`);
    }
  }
);
