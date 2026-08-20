'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const yts = require('yt-search');
const { Module } = require('../main');
const config = require('../config');
const { getTempPath } = require('../core/helpers');

// Fast yt-dlp downloader helper using system binary
function downloadWithYtDlp(url, format = 'mp3') {
  return new Promise((resolve, reject) => {
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    const outPath = getTempPath(`yt_${Date.now()}.${ext}`);

    const args =
      format === 'mp3'
        ? [
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--no-playlist',
            '--max-filesize', '100M',
            '-o', outPath,
            url
          ]
        : [
            '-f', 'best[ext=mp4][filesize<150M]/best[filesize<150M]/best',
            '--no-playlist',
            '-o', outPath,
            url
          ];

    const proc = spawn('yt-dlp', args);
    let stderr = '';

    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) {
        resolve(outPath);
      } else {
        // Check if output file was created with slightly different name
        if (fs.existsSync(outPath)) {
          resolve(outPath);
        } else {
          reject(new Error(`فشل التحميل عبر yt-dlp: ${stderr || code}`));
        }
      }
    });
    proc.on('error', (err) => reject(err));
  });
}

Module(
  {
    pattern: 'play|song|yta ?(.*)',
    desc: 'Search YouTube and download audio as MP3',
    use: 'youtube'
  },
  async (msg, match) => {
    const query = match[1] || msg.quoted?.text;
    if (!query) {
      return await msg.sendReply('⚠️ *يرجى كتابة اسم الأغنية أو رابط يوتيوب.*\n_مثال: .play faded alan walker_');
    }

    const wait = await msg.sendReply('🔍 *جارِ البحث والتحميل من يوتيوب...*');

    try {
      let targetUrl = query;
      let title = query;
      let duration = '';
      let thumb = null;

      if (!query.startsWith('http://') && !query.startsWith('https://')) {
        const search = await yts(query);
        if (!search || !search.videos || search.videos.length === 0) {
          return await msg.edit('❌ *لم يتم العثور على أي نتائج.*', wait.key);
        }
        const vid = search.videos[0];
        targetUrl = vid.url;
        title = vid.title;
        duration = vid.timestamp;
        thumb = vid.thumbnail;
      }

      await msg.edit(`⏳ *جارِ تحميل الصوت:* \`${title}\` (${duration})...`, wait.key);

      const filePath = await downloadWithYtDlp(targetUrl, 'mp3');
      const fileBuffer = fs.readFileSync(filePath);

      await msg.sendMessage(fileBuffer, 'audio', {
        mimetype: 'audio/mp4',
        ptt: false
      });

      await msg.edit('✅ *تم إرسال الصوت بنجاح!*', wait.key);
      try { fs.unlinkSync(filePath); } catch (_) {}
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'video|ytv ?(.*)',
    desc: 'Search YouTube and download video as MP4',
    use: 'youtube'
  },
  async (msg, match) => {
    const query = match[1] || msg.quoted?.text;
    if (!query) {
      return await msg.sendReply('⚠️ *يرجى كتابة اسم الفيديو أو رابط يوتيوب.*\n_مثال: .video no copyright sounds_');
    }

    const wait = await msg.sendReply('🔍 *جارِ البحث والتحميل من يوتيوب...*');

    try {
      let targetUrl = query;
      let title = query;
      let duration = '';

      if (!query.startsWith('http://') && !query.startsWith('https://')) {
        const search = await yts(query);
        if (!search || !search.videos || search.videos.length === 0) {
          return await msg.edit('❌ *لم يتم العثور على أي نتائج.*', wait.key);
        }
        const vid = search.videos[0];
        targetUrl = vid.url;
        title = vid.title;
        duration = vid.timestamp;
      }

      await msg.edit(`⏳ *جارِ تحميل الفيديو:* \`${title}\` (${duration})...`, wait.key);

      const filePath = await downloadWithYtDlp(targetUrl, 'mp4');
      const fileBuffer = fs.readFileSync(filePath);

      await msg.sendMessage(fileBuffer, 'video', {
        caption: `🎥 *${title}*\n⏱️ *المدة:* \`${duration}\`\n\n⚡ _EulerX0 Bot_`
      });

      await msg.edit('✅ *تم إرسال الفيديو بنجاح!*', wait.key);
      try { fs.unlinkSync(filePath); } catch (_) {}
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'yts ?(.*)',
    desc: 'Search YouTube videos with details',
    use: 'youtube'
  },
  async (msg, match) => {
    const query = match[1];
    if (!query) return await msg.sendReply('⚠️ *يرجى كتابة كلمة البحث.*');

    try {
      const res = await yts(query);
      const videos = (res.videos || []).slice(0, 8);
      if (videos.length === 0) return await msg.sendReply('❌ *لا توجد نتائج.*');

      let text = `🎬 *نتائج البحث في YouTube لـ:* \`${query}\`\n\n`;
      videos.forEach((v, i) => {
        text += `*${i + 1}.* *${v.title}*\n`;
        text += `   ⏱️ *المدة:* \`${v.timestamp}\` | 👁️ *المشاهدات:* \`${v.views}\`\n`;
        text += `   🔗 *الرابط:* ${v.url}\n\n`;
      });

      text += `_للتحميل: استخدم .play <الاسم/الرابط> أو .video <الاسم/الرابط>_`;
      await msg.sendReply(text);
    } catch (err) {
      await msg.sendReply(`❌ *خطأ:* ${err.message}`);
    }
  }
);
