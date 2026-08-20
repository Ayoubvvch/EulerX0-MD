'use strict';

const os = require('os');
const { Module } = require('../main');
const config = require('../config');
const { parseUptime, formatBytes } = require('../core/helpers');

Module(
  {
    pattern: 'ping',
    desc: 'Check bot response speed and system health',
    use: 'system'
  },
  async (msg) => {
    const start = Date.now();
    const sent = await msg.sendReply('⚡ *Pinging...*');
    const latency = Date.now() - start;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const procMem = process.memoryUsage().rss;
    const uptimeStr = parseUptime(process.uptime());

    const text = `⚡ *Pong!* \`${latency}ms\`
━━━━━━━━━━━━━━━━━━━
🚀 *سرعة المعالجة:* \`${latency}ms\`
📊 *استهلاك الذاكرة (Process):* \`${formatBytes(procMem)}\`
🖥️ *استهلاك الذاكرة (System):* \`${formatBytes(usedMem)} / ${formatBytes(totalMem)}\`
⏱️ *مدة التشغيل:* \`${uptimeStr}\`
🟢 *الحالة:* متصل وشغال 100%
🤖 *النسخة:* \`v${config.VERSION} (Ultra-Light Remake)\``;

    await msg.edit(text, sent.key);
  }
);

Module(
  {
    pattern: 'alive',
    desc: 'Show bot active status and information',
    use: 'system'
  },
  async (msg) => {
    const uptimeStr = parseUptime(process.uptime());
    const text = `⚡ *_EulerX0 Bot is Active & Online!_* ⚡

• *Version:* ${config.VERSION} (Lightweight Remake)
• *Mode:* ${config.MODE}
• *Prefix:* ${config.HANDLERS === 'false' ? 'All (.,!,#,/, or None)' : config.HANDLERS}
• *Uptime:* ${uptimeStr}
• *SUDO Users:* ${config.getSudoList().length} configured
• *Platform:* ${os.type()} ${os.arch()}

_Powered by EulerX0 Remake Engine_ 🚀`;

    await msg.sendReply(text);
  }
);

Module(
  {
    pattern: 'menu|help',
    desc: 'Display all available commands and features',
    use: 'system'
  },
  async (msg) => {
    const { commands } = require('../main');
    const categories = {
      download: { name: '📥 التحميل والوسائط (Downloader)', list: [] },
      youtube: { name: '🎵 اليوتيوب والصوتيات (YouTube)', list: [] },
      converters: { name: '🎨 الملصقات والتحويلات (Converters)', list: [] },
      telegram: { name: '✈️ التيليجرام والنقل (Telegram)', list: [] },
      group: { name: '👥 إدارة المجموعات والحماية (Group)', list: [] },
      reminders: { name: '⏰ التذكيرات والطقس (Reminders & Weather)', list: [] },
      ai: { name: '🤖 الذكاء الاصطناعي (AI)', list: [] },
      media: { name: '🔍 أدوات البحث والميديا (Media Tools)', list: [] },
      system: { name: '⚙️ أوامر النظام (System)', list: [] },
      general: { name: '✨ أوامر عامة (General)', list: [] }
    };

    const seenPatterns = new Set();

    for (const cmd of commands) {
      if (cmd.excludeFromCommands || !cmd.pattern) continue;
      let src = cmd.pattern.source;
      src = src.replace(/^\^(\(\?:\[\.\,\!\/\#\]\)\?)?/, '');
      src = src.replace(/\?\(\.\*\)/g, '');
      src = src.replace(/\|.*/, '');
      src = src.replace(/[\^\$\(\)]/g, '').trim();

      if (!src || seenPatterns.has(src)) continue;
      seenPatterns.add(src);

      const catKey = categories[cmd.use] ? cmd.use : 'general';
      categories[catKey].list.push({
        cmd: `.${src}`,
        desc: cmd.desc || 'No description'
      });
    }

    let menuText = `╔══════════════════════╗
║   ⚡ *${config.BOT_NAME}* ⚡
║   *Version:* \`v${config.VERSION}\`
║   *Mode:* \`${config.MODE}\`
╚══════════════════════╝\n\n`;

    for (const [key, cat] of Object.entries(categories)) {
      if (cat.list.length === 0) continue;
      menuText += `┏━━━〔 *${cat.name}* 〕━━━┓\n`;
      for (const item of cat.list) {
        menuText += `┃ • \`${item.cmd}\` : _${item.desc}_\n`;
      }
      menuText += `┗━━━━━━━━━━━━━━━━━━━━┛\n\n`;
    }

    menuText += `_Type any command with prefix or without prefix._\n_Developer: Ayoubvvch_ 👑`;
    await msg.sendReply(menuText);
  }
);

Module(
  {
    pattern: 'restart|reboot',
    fromMe: true,
    desc: 'Restart bot process',
    use: 'system'
  },
  async (msg) => {
    await msg.sendReply('🔄 *جاري إعادة تشغيل البوت...*');
    setTimeout(() => {
      process.exit(0);
    }, 1500);
  }
);

Module(
  {
    pattern: 'uptime|runtime',
    desc: 'Check bot uptime',
    use: 'system'
  },
  async (msg) => {
    await msg.sendReply(`⏱️ *مدة التشغيل الحالية:* \`${parseUptime(process.uptime())}\``);
  }
);

Module(
  {
    pattern: 'jid',
    desc: 'Get current chat or quoted user JID',
    use: 'system'
  },
  async (msg) => {
    const targetJid = msg.reply_message ? msg.reply_message.jid : msg.jid;
    await msg.sendReply(`🆔 *JID:* \`${targetJid}\``);
  }
);

Module(
  {
    pattern: 'info',
    desc: 'Show system and bot hardware information',
    use: 'system'
  },
  async (msg) => {
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || 'Generic';
    const cpuCount = cpus.length;
    const totalMem = formatBytes(os.totalmem());
    const freeMem = formatBytes(os.freemem());
    const procMem = formatBytes(process.memoryUsage().rss);

    const info = `🖥️ *معلومات السيرفر والنظام:*
━━━━━━━━━━━━━━━━━━━
• *المنصة:* \`${os.type()} ${os.arch()} (${os.release()})\`
• *المعالج:* \`${cpuModel} (${cpuCount} Cores)\`
• *الرام الكلي:* \`${totalMem}\`
• *الرام المتاح:* \`${freeMem}\`
• *استهلاك البوت:* \`${procMem}\`
• *Node.js:* \`${process.version}\`
• *المدة:* \`${parseUptime(os.uptime())}\``;

    await msg.sendReply(info);
  }
);
