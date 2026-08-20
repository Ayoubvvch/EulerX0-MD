'use strict';

const { Module } = require('../main');
const config = require('../config');
const { dbOps } = require('../core/database');

Module(
  {
    pattern: 'warn ?(.*)',
    desc: 'Give a warning to a group member',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return await msg.sendReply('⚠️ *هذا الأمر يعمل في المجموعات فقط.*');
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');

    let target = msg.quoted ? msg.quoted.sender : (msg.mention && msg.mention[0]) || match[1];
    if (!target) return await msg.sendReply('⚠️ *يرجى الرد على العضو أو الإشارة إليه لتوجيه تحذير.*');

    const targetJid = target.includes('@') ? target : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const reason = match[1]?.replace(/@[0-9]+/g, '').trim() || 'مخالفة قوانين المجموعة';

    const count = await dbOps.setWarn(msg.jid, targetJid, reason);
    const limit = config.WARN_LIMIT || 4;

    const warnMsg = `⚠️ *تحذير للعضو:* @${targetJid.split('@')[0]}
📝 *السبب:* ${reason}
📊 *العدد:* \`${count}/${limit}\``;

    await msg.sock.sendMessage(msg.jid, { text: warnMsg, mentions: [targetJid] });

    if (count >= limit) {
      if (await msg.isBotAdmin()) {
        try {
          await msg.sock.groupParticipantsUpdate(msg.jid, [targetJid], 'remove');
          await dbOps.resetWarn(msg.jid, targetJid);
          await msg.sendReply(`🚫 *تم طرد العضو لتجاوز الحد الأقصى للتحذيرات (${limit}/${limit}).*`);
        } catch (e) {
          await msg.sendReply(`❌ *تعذر طرد العضو:* ${e.message}`);
        }
      } else {
        await msg.sendReply('⚠️ *وصل العضو للحد الأقصى للتحذيرات ولكن البوت ليس مشرفاً لطرده.*');
      }
    }
  }
);

Module(
  {
    pattern: 'resetwarn ?(.*)',
    desc: 'Reset warnings for a member',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return;
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');

    let target = msg.quoted ? msg.quoted.sender : (msg.mention && msg.mention[0]) || match[1];
    if (!target) return await msg.sendReply('⚠️ *يرجى الرد على العضو أو الإشارة إليه.*');

    const targetJid = target.includes('@') ? target : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    await dbOps.resetWarn(msg.jid, targetJid);
    await msg.sendReply(`✅ *تمت إعادة تعيين وتصفير تحذيرات العضو:* @${targetJid.split('@')[0]}`);
  }
);

Module(
  {
    pattern: 'getwarn ?(.*)',
    desc: 'Check warning count for a member',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return;
    let target = msg.quoted ? msg.quoted.sender : (msg.mention && msg.mention[0]) || match[1] || msg.sender;
    const targetJid = target.includes('@') ? target : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

    const warn = await dbOps.getWarn(msg.jid, targetJid);
    const limit = config.WARN_LIMIT || 4;
    await msg.sendReply(`📊 *تحذيرات العضو:* @${targetJid.split('@')[0]}\n• *العدد:* \`${warn.count}/${limit}\`\n• *آخر سبب:* ${warn.reason || 'لا يوجد'}`);
  }
);
