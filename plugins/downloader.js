'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { Module } = require('../main');
const config = require('../config');

let tiktokApi = null;
try {
  tiktokApi = require('@tobyg74/tiktok-api-dl');
} catch (_) {}

function cleanUrl(url) {
  return url.replace(/[?&](utm_source|utm_medium|utm_campaign|fbclid|gclid|ref|referrer)=[^&]*/g, '')
    .replace(/[?&]$/, '')
    .trim();
}

async function resolveRedirect(url) {
  try {
    const res = await axios.get(url, { maxRedirects: 5 });
    return res.request.res.responseUrl || url;
  } catch (_) {
    return url;
  }
}

// ── TikTok Downloader Engine ────────────────────────────────────────────────
async function downloadTikTok(rawUrl) {
  const url = cleanUrl(rawUrl);

  if (tiktokApi && tiktokApi.Downloader) {
    for (const v of ['v1', 'v2', 'v3']) {
      try {
        const res = await tiktokApi.Downloader(url, { version: v });
        if (res && res.status === 'success' && res.result) {
          const r = res.result;
          if (r.type === 'image' || (r.images && r.images.length > 0)) {
            const images = (r.images || []).map((img) => (typeof img === 'string' ? img : img.url || img));
            const audio = r.music?.play_url || r.music?.url || null;
            return { type: 'images', images, audio, title: r.desc || r.title || 'TikTok Slides' };
          }
          const videoUrl = r.video?.play_addr?.url_list?.[0] || r.video?.download_addr?.url_list?.[0] || r.video?.play_addr || r.video1 || r.video2 || r.video;
          const audioUrl = r.music?.play_url || r.music?.url || null;
          if (videoUrl) {
            return { type: 'video', video: typeof videoUrl === 'string' ? videoUrl : videoUrl.url, audio: audioUrl, title: r.desc || r.title || 'TikTok Video' };
          }
        }
      } catch (_) {}
    }
  }

  // Fallback API: TikWM
  try {
    const res = await axios.post('https://www.tikwm.com/api/', { url }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (res.data?.data) {
      const d = res.data.data;
      if (d.images && d.images.length > 0) {
        return { type: 'images', images: d.images, audio: d.music, title: d.title || 'TikTok Photos' };
      }
      return { type: 'video', video: d.play || d.wmplay, audio: d.music, title: d.title || 'TikTok Video' };
    }
  } catch (_) {}

  throw new Error('فشل تحميل محتوى تيك توك، تأكد من صحة الرابط.');
}

// ── Instagram Downloader Engine ─────────────────────────────────────────────
async function downloadInstagram(rawUrl) {
  const url = cleanUrl(rawUrl);
  try {
    const res = await axios.get(`https://v3.fdownloader.net/api/ajaxSearch?q=${encodeURIComponent(url)}&w=`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if (res.data?.data) {
      const $ = cheerio.load(res.data.data);
      const links = [];
      $('a[href*="download"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http') && !links.includes(href)) links.push(href);
      });
      $('img[src*="instagram"]').each((_, el) => {
        const src = $(el).attr('src');
        if (src && !links.includes(src)) links.push(src);
      });

      if (links.length > 0) {
        return { links, title: 'Instagram Media' };
      }
    }
  } catch (_) {}

  // Secondary Instagram API
  try {
    const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(url)}`);
    if (res.data?.status && res.data?.data) {
      const items = Array.isArray(res.data.data) ? res.data.data : [res.data.data];
      const links = items.map((i) => i.url || i).filter(Boolean);
      if (links.length > 0) return { links, title: 'Instagram Media' };
    }
  } catch (_) {}

  throw new Error('فشل تحميل محتوى إنستغرام، يرجى التأكد من الرابط (الحسابات الخاصة غير مدعومة).');
}

// ── Facebook Downloader Engine ──────────────────────────────────────────────
async function downloadFacebook(rawUrl) {
  const url = cleanUrl(rawUrl);
  try {
    const res = await axios.post('https://snapsave.app/action.php?lang=en', `url=${encodeURIComponent(url)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const html = res.data;
    const hdMatch = html.match(/href=\\"([^\\"]+)\\"[^>]*>Download HD/i) || html.match(/"(https:\/\/[^"]+)"[^>]*>Download HD/i);
    const sdMatch = html.match(/href=\\"([^\\"]+)\\"[^>]*>Download SD/i) || html.match(/"(https:\/\/[^"]+)"[^>]*>Download SD/i);

    const videoUrl = hdMatch ? hdMatch[1].replace(/\\/g, '') : (sdMatch ? sdMatch[1].replace(/\\/g, '') : null);
    if (videoUrl) return { video: videoUrl, title: 'Facebook Video' };
  } catch (_) {}

  // Fallback API
  try {
    const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`);
    if (res.data?.status && res.data?.data) {
      const d = res.data.data;
      const v = d.hd || d.sd || d.video;
      if (v) return { video: v, title: d.title || 'Facebook Video' };
    }
  } catch (_) {}

  throw new Error('فشل تحميل فيديو فيسبوك.');
}

// ── Pinterest Downloader Engine ─────────────────────────────────────────────
async function downloadPinterest(rawUrl) {
  const url = cleanUrl(rawUrl);
  try {
    const res = await axios.get(`https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(url)}`);
    if (res.data?.status && res.data?.data) {
      return { url: res.data.data.url || res.data.data, title: 'Pinterest Media' };
    }
  } catch (_) {}

  throw new Error('فشل تحميل وسائط بنترست.');
}

// ── Commands Registration ───────────────────────────────────────────────────

Module(
  {
    pattern: 'tiktok|tt ?(.*)',
    desc: 'Download TikTok video, audio, or photo slides',
    use: 'download'
  },
  async (msg, match) => {
    let url = match[1] || msg.quoted?.text;
    if (!url) return await msg.sendReply('⚠️ *يرجى كتابة رابط تيك توك بعد الأمر.*\n_مثال: .tt https://vt.tiktok.com/..._');

    const wait = await msg.sendReply('⏳ *جارِ تحميل محتوى تيك توك...*');
    try {
      const data = await downloadTikTok(url);
      if (data.type === 'images') {
        for (let i = 0; i < data.images.length; i++) {
          await msg.sendMessage(data.images[i], 'image', { caption: `📸 *صورة (${i + 1}/${data.images.length})*` });
        }
        if (data.audio) {
          await msg.sendMessage(data.audio, 'audio', { ptt: false, mimetype: 'audio/mp4' });
        }
      } else if (data.type === 'video') {
        await msg.sendMessage(data.video, 'video', { caption: `🎥 *${data.title}*\n\n_تم التحميل بواسطة EulerX0_ ⚡` });
      }
      await msg.edit('✅ *تم التحميل بنجاح!*', wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'insta|ig ?(.*)',
    desc: 'Download Instagram post, reel, or carousel',
    use: 'download'
  },
  async (msg, match) => {
    let url = match[1] || msg.quoted?.text;
    if (!url) return await msg.sendReply('⚠️ *يرجى كتابة رابط إنستغرام بعد الأمر.*\n_مثال: .ig https://www.instagram.com/reel/..._');

    const wait = await msg.sendReply('⏳ *جارِ تحميل محتوى إنستغرام...*');
    try {
      const data = await downloadInstagram(url);
      for (const link of data.links) {
        const isImage = /\.(jpg|jpeg|png|webp)/i.test(link);
        await msg.sendMessage(link, isImage ? 'image' : 'video', { caption: '⚡ _تم التحميل بواسطة EulerX0_' });
      }
      await msg.edit('✅ *تم التحميل بنجاح!*', wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'fb|facebook ?(.*)',
    desc: 'Download Facebook video',
    use: 'download'
  },
  async (msg, match) => {
    let url = match[1] || msg.quoted?.text;
    if (!url) return await msg.sendReply('⚠️ *يرجى كتابة رابط فيسبوك بعد الأمر.*');

    const wait = await msg.sendReply('⏳ *جارِ تحميل فيديو فيسبوك...*');
    try {
      const data = await downloadFacebook(url);
      await msg.sendMessage(data.video, 'video', { caption: `🎥 *${data.title}*\n\n⚡ _EulerX0 Bot_` });
      await msg.edit('✅ *تم التحميل بنجاح!*', wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'pin|pinterest ?(.*)',
    desc: 'Download Pinterest pin media',
    use: 'download'
  },
  async (msg, match) => {
    let url = match[1] || msg.quoted?.text;
    if (!url) return await msg.sendReply('⚠️ *يرجى كتابة رابط بنترست بعد الأمر.*');

    const wait = await msg.sendReply('⏳ *جارِ تحميل وسائط بنترست...*');
    try {
      const data = await downloadPinterest(url);
      const isVideo = /\.(mp4|mov|webm)/i.test(data.url);
      await msg.sendMessage(data.url, isVideo ? 'video' : 'image', { caption: '📌 *Pinterest Media* ⚡' });
      await msg.edit('✅ *تم التحميل بنجاح!*', wait.key);
    } catch (err) {
      await msg.edit(`❌ *خطأ:* ${err.message}`, wait.key);
    }
  }
);

Module(
  {
    pattern: 'gitclone ?(.*)',
    desc: 'Download GitHub repository as ZIP archive',
    use: 'download'
  },
  async (msg, match) => {
    const raw = match[1] || msg.quoted?.text;
    if (!raw) return await msg.sendReply('⚠️ *يرجى كتابة رابط مستودع GitHub.*');

    const repoMatch = raw.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!repoMatch) return await msg.sendReply('❌ *رابط GitHub غير صالح.*');

    const user = repoMatch[1];
    const repo = repoMatch[2].replace(/\.git$/, '');
    const zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`;

    await msg.sendReply(`⏳ *جارِ تحميل مستودع ${user}/${repo}...*`);
    try {
      await msg.sendMessage(zipUrl, 'document', {
        fileName: `${repo}.zip`,
        mimetype: 'application/zip',
        caption: `📦 *مستودع:* ${user}/${repo}`
      });
    } catch (err) {
      await msg.sendReply(`❌ *خطأ:* ${err.message}`);
    }
  }
);
