'use strict';

const { Module } = require('../main');
const config = require('../config');
const { dbOps } = require('../core/database');

Module(
  {
    pattern: 'mode ?(.*)',
    fromMe: true,
    desc: 'Switch bot mode between public and private',
    use: 'system'
  },
  async (msg, match) => {
    const newMode = match[1]?.trim().toLowerCase();
    if (newMode !== 'public' && newMode !== 'private') {
      return await msg.sendReply(`ℹ️ *الوضع الحالي:* \`${config.MODE}\`\n_للتبديل:_ \`.mode public\` أو \`.mode private\``);
    }

    config.MODE = newMode;
    await dbOps.setVar('MODE', newMode);
    await msg.sendReply(`✅ *تم تحويل وضع البوت إلى:* \`${newMode}\``);
  }
);

Module(
  {
    pattern: 'setsudo ?(.*)',
    fromMe: true,
    desc: 'Add a SUDO user number: .setsudo 2126xxxxxx',
    use: 'system'
  },
  async (msg, match) => {
    let num = match[1]?.replace(/[^0-9]/g, '');
    if (!num && msg.quoted) {
      num = msg.quoted.sender.split('@')[0].replace(/[^0-9]/g, '');
    }
    if (!num) return await msg.sendReply('⚠️ *يرجى كتابة رقم الهاتف أو الرد على رسالة المستخدم.*');

    const sudoList = config.getSudoList();
    if (sudoList.includes(num)) {
      return await msg.sendReply('ℹ️ *الرقم مسجل بالفعل ضمن قائمة SUDO.*');
    }

    sudoList.push(num);
    const updatedSudo = sudoList.join(',');
    config.SUDO = updatedSudo;
    await dbOps.setVar('SUDO', updatedSudo);

    await msg.sendReply(`👑 *تمت إضافة المستخدم +${num} إلى قائمة المشرفين (SUDO) بنجاح!*`);
  }
);

Module(
  {
    pattern: 'delsudo ?(.*)',
    fromMe: true,
    desc: 'Remove a SUDO user number',
    use: 'system'
  },
  async (msg, match) => {
    let num = match[1]?.replace(/[^0-9]/g, '');
    if (!num && msg.quoted) {
      num = msg.quoted.sender.split('@')[0].replace(/[^0-9]/g, '');
    }
    if (!num) return await msg.sendReply('⚠️ *يرجى كتابة الرقم لحذفه من SUDO.*');

    let sudoList = config.getSudoList();
    if (!sudoList.includes(num)) {
      return await msg.sendReply('❌ *الرقم غير موجود في قائمة SUDO.*');
    }

    sudoList = sudoList.filter((n) => n !== num);
    const updatedSudo = sudoList.join(',');
    config.SUDO = updatedSudo;
    await dbOps.setVar('SUDO', updatedSudo);

    await msg.sendReply(`✅ *تم حذف المستخدم +${num} من قائمة المشرفين (SUDO).*`);
  }
);

Module(
  {
    pattern: 'setvar ?(.*)',
    fromMe: true,
    desc: 'Set dynamic bot variable: .setvar KEY VALUE',
    use: 'system'
  },
  async (msg, match) => {
    const raw = match[1]?.trim();
    if (!raw || !raw.includes(' ')) {
      return await msg.sendReply('⚠️ *الصيغة:* \`.setvar BOT_NAME EulerX0 Bot\`');
    }

    const firstSpace = raw.indexOf(' ');
    const key = raw.substring(0, firstSpace).trim().toUpperCase();
    const val = raw.substring(firstSpace + 1).trim();

    await dbOps.setVar(key, val);
    await msg.sendReply(`✅ *تم تحديث المتغير:* \`${key}\` = \`${val}\``);
  }
);

Module(
  {
    pattern: 'getvar ?(.*)',
    fromMe: true,
    desc: 'Get bot variable value',
    use: 'system'
  },
  async (msg, match) => {
    const key = match[1]?.trim().toUpperCase();
    if (!key) return await msg.sendReply('⚠️ *يرجى كتابة اسم المتغير.*');

    const val = await dbOps.getVar(key);
    await msg.sendReply(`⚙️ *قيمة المتغير \`${key}\`:* \`${val !== null ? val : 'غير معرف'}\``);
  }
);

Module(
  {
    pattern: 'block ?(.*)',
    fromMe: true,
    desc: 'Block user from WhatsApp',
    use: 'system'
  },
  async (msg, match) => {
    let target = msg.quoted ? msg.quoted.sender : match[1];
    if (!target) return await msg.sendReply('⚠️ *يرجى الرد على المستخدم لعمل حظر.*');

    const targetJid = target.includes('@') ? target : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
      await msg.sock.updateBlockStatus(targetJid, 'block');
      await msg.sendReply('🚫 *تم حظر المستخدم بنجاح.*');
    } catch (err) {
      await msg.sendReply(`❌ *خطأ:* ${err.message}`);
    }
  }
);

Module(
  {
    pattern: 'unblock ?(.*)',
    fromMe: true,
    desc: 'Unblock user from WhatsApp',
    use: 'system'
  },
  async (msg, match) => {
    let target = msg.quoted ? msg.quoted.sender : match[1];
    if (!target) return await msg.sendReply('⚠️ *يرجى الرد على المستخدم لإلغاء الحظر.*');

    const targetJid = target.includes('@') ? target : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
      await msg.sock.updateBlockStatus(targetJid, 'unblock');
      await msg.sendReply('✅ *تم إلغاء حظر المستخدم بنجاح.*');
    } catch (err) {
      await msg.sendReply(`❌ *خطأ:* ${err.message}`);
    }
  }
);
