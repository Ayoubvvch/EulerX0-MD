'use strict';

const { Module } = require('../main');
const config = require('../config');
const { dbOps } = require('../core/database');

// ── Group Moderation Commands ───────────────────────────────────────────────

Module(
  {
    pattern: 'kick ?(.*)',
    desc: 'Kick a member from the group',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return await msg.sendReply('⚠️ *هذا الأمر يعمل في المجموعات فقط.*');
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *عذراً، هذا الأمر للمشرفين فقط.*');
    if (!(await msg.isBotAdmin())) return await msg.sendReply('❌ *يجب أن يكون البوت مشرفاً (Admin) لتنفيذ هذا الأمر.*');

    let target = msg.quoted ? msg.quoted.sender : (msg.mention && msg.mention[0]) || match[1];
    if (!target) return await msg.sendReply('⚠️ *يرجى الرد على العضو أو الإشارة إليه (@).*');

    const targetJid = target.includes('@') ? target : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
      await msg.sock.groupParticipantsUpdate(msg.jid, [targetJid], 'remove');
      await msg.sendReply('👢 *تم طرد العضو بنجاح.*');
    } catch (err) {
      await msg.sendReply(`❌ *فشل الطرد:* ${err.message}`);
    }
  }
);

Module(
  {
    pattern: 'add ?(.*)',
    desc: 'Add a user to the group',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return await msg.sendReply('⚠️ *هذا الأمر يعمل في المجموعات فقط.*');
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *هذا الأمر للمشرفين فقط.*');
    if (!(await msg.isBotAdmin())) return await msg.sendReply('❌ *يجب أن يكون البوت مشرفاً.*');

    const num = match[1]?.replace(/[^0-9]/g, '');
    if (!num) return await msg.sendReply('⚠️ *يرجى كتابة رقم الهاتف مع الرمز الدولي.*\n_مثال: .add 212612345678_');

    const targetJid = `${num}@s.whatsapp.net`;
    try {
      await msg.sock.groupParticipantsUpdate(msg.jid, [targetJid], 'add');
      await msg.sendReply('✅ *تمت إضافة العضو بنجاح.*');
    } catch (err) {
      await msg.sendReply(`❌ *فشل إضافة العضو:* ${err.message}`);
    }
  }
);

Module(
  {
    pattern: 'promote ?(.*)',
    desc: 'Promote a member to group admin',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return await msg.sendReply('⚠️ *في المجموعات فقط.*');
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');
    if (!(await msg.isBotAdmin())) return await msg.sendReply('❌ *يجب أن يكون البوت مشرفاً.*');

    let target = msg.quoted ? msg.quoted.sender : (msg.mention && msg.mention[0]) || match[1];
    if (!target) return await msg.sendReply('⚠️ *يرجى الرد على العضو أو الإشارة إليه.*');

    const targetJid = target.includes('@') ? target : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
      await msg.sock.groupParticipantsUpdate(msg.jid, [targetJid], 'promote');
      await msg.sendReply('👑 *تمت ترقية العضو إلى مشرف بنجاح.*');
    } catch (err) {
      await msg.sendReply(`❌ *خطأ:* ${err.message}`);
    }
  }
);

Module(
  {
    pattern: 'demote ?(.*)',
    desc: 'Demote an admin to normal member',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return await msg.sendReply('⚠️ *في المجموعات فقط.*');
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');
    if (!(await msg.isBotAdmin())) return await msg.sendReply('❌ *يجب أن يكون البوت مشرفاً.*');

    let target = msg.quoted ? msg.quoted.sender : (msg.mention && msg.mention[0]) || match[1];
    if (!target) return await msg.sendReply('⚠️ *يرجى الرد على المشرف أو الإشارة إليه.*');

    const targetJid = target.includes('@') ? target : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
      await msg.sock.groupParticipantsUpdate(msg.jid, [targetJid], 'demote');
      await msg.sendReply('📉 *تم خفض المشرف إلى عضو عادي.*');
    } catch (err) {
      await msg.sendReply(`❌ *خطأ:* ${err.message}`);
    }
  }
);

Module(
  {
    pattern: 'mute',
    desc: 'Mute group (only admins can send messages)',
    use: 'group'
  },
  async (msg) => {
    if (!msg.isGroup) return;
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');
    if (!(await msg.isBotAdmin())) return await msg.sendReply('❌ *البوت ليس مشرفاً.*');

    await msg.sock.groupSettingUpdate(msg.jid, 'announcement');
    await msg.sendReply('🔒 *تم قفل المجموعة (المشرفين فقط يمكنهم إرسال الرسائل).*');
  }
);

Module(
  {
    pattern: 'unmute',
    desc: 'Unmute group (all members can send messages)',
    use: 'group'
  },
  async (msg) => {
    if (!msg.isGroup) return;
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');
    if (!(await msg.isBotAdmin())) return await msg.sendReply('❌ *البوت ليس مشرفاً.*');

    await msg.sock.groupSettingUpdate(msg.jid, 'not_announcement');
    await msg.sendReply('🔓 *تم فتح المجموعة (الجميع يمكنهم إرسال الرسائل).*');
  }
);

Module(
  {
    pattern: 'tagall|everyone ?(.*)',
    desc: 'Mention all members in the group',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return;
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');

    const meta = await msg.getGroupMetadata();
    if (!meta || !meta.participants) return;

    const customMsg = match[1] || 'إشعار لجميع الأعضاء 📢';
    let text = `📢 *${customMsg}*\n━━━━━━━━━━━━━━━━━━━\n`;
    const mentions = [];

    meta.participants.forEach((p, i) => {
      text += `• @${p.id.split('@')[0]}\n`;
      mentions.push(p.id);
    });

    await msg.sock.sendMessage(msg.jid, { text, mentions });
  }
);

Module(
  {
    pattern: 'hidetag ?(.*)',
    desc: 'Send a message with invisible mentions to all members',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return;
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');

    const meta = await msg.getGroupMetadata();
    if (!meta || !meta.participants) return;

    const text = match[1] || msg.quoted?.text || '📢';
    const mentions = meta.participants.map((p) => p.id);

    await msg.sock.sendMessage(msg.jid, { text, mentions });
  }
);

Module(
  {
    pattern: 'link',
    desc: 'Get group invite link',
    use: 'group'
  },
  async (msg) => {
    if (!msg.isGroup) return;
    if (!(await msg.isBotAdmin())) return await msg.sendReply('❌ *البوت ليس مشرفاً.*');

    try {
      const code = await msg.sock.groupInviteCode(msg.jid);
      await msg.sendReply(`🔗 *رابط المجموعة:*\nhttps://chat.whatsapp.com/${code}`);
    } catch (err) {
      await msg.sendReply(`❌ *خطأ:* ${err.message}`);
    }
  }
);

Module(
  {
    pattern: 'revoke',
    desc: 'Revoke / Reset group invite link',
    use: 'group'
  },
  async (msg) => {
    if (!msg.isGroup) return;
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');
    if (!(await msg.isBotAdmin())) return await msg.sendReply('❌ *البوت ليس مشرفاً.*');

    try {
      const code = await msg.sock.groupRevokeInvite(msg.jid);
      await msg.sendReply(`🔄 *تم تجديد رابط المجموعة بنجاح:*\nhttps://chat.whatsapp.com/${code}`);
    } catch (err) {
      await msg.sendReply(`❌ *خطأ:* ${err.message}`);
    }
  }
);

Module(
  {
    pattern: 'ginfo',
    desc: 'Show detailed group metadata',
    use: 'group'
  },
  async (msg) => {
    if (!msg.isGroup) return;
    const meta = await msg.getGroupMetadata();
    if (!meta) return await msg.sendReply('❌ *تعذر جلب معلومات المجموعة.*');

    const admins = meta.participants.filter((p) => p.admin).length;
    const info = `👥 *معلومات المجموعة:*
━━━━━━━━━━━━━━━━━━━
• *الاسم:* ${meta.subject}
• *المعرّف:* \`${meta.id}\`
• *عدد الأعضاء:* \`${meta.participants.length}\`
• *عدد المشرفين:* \`${admins}\`
• *المنشئ:* \`${meta.owner || 'غير معروف'}\`
• *الوصف:* \n${meta.desc || '_لا يوجد وصف_'}`;

    await msg.sendReply(info);
  }
);

// ── Security & Filter Auto-Checkers (on: 'text') ────────────────────────────

Module({ on: 'text' }, async (msg, text) => {
  if (!msg.isGroup || msg.fromOwner) return;

  const isSenderAdmin = await msg.isAdmin();
  if (isSenderAdmin) return;

  // 1. Antilink Check
  const antilink = await dbOps.getAntilink(msg.jid);
  if (antilink && antilink.status === 'on') {
    const hasLink = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+)/gi.test(text);
    if (hasLink) {
      if (await msg.isBotAdmin()) {
        try {
          await msg.sock.sendMessage(msg.jid, { delete: msg.key });
          if (antilink.action === 'kick') {
            await msg.sock.groupParticipantsUpdate(msg.jid, [msg.sender], 'remove');
            await msg.sendReply('🚫 *تم طرد العضو لإرساله رابط غير مصرح به.*');
          } else {
            const count = await dbOps.setWarn(msg.jid, msg.sender, 'إرسال روابط');
            await msg.sendReply(`⚠️ *تحذير للعضو لإرساله رابط (${count}/${config.WARN_LIMIT})*`);
            if (count >= config.WARN_LIMIT) {
              await msg.sock.groupParticipantsUpdate(msg.jid, [msg.sender], 'remove');
              await dbOps.resetWarn(msg.jid, msg.sender);
              await msg.sendReply('🚫 *تم طرد العضو لتجاوزه الحد الأقصى من التحذيرات.*');
            }
          }
        } catch (_) {}
      }
    }
  }

  // 2. Antiword Check
  const words = await dbOps.getAntiwords(msg.jid);
  if (words.length > 0) {
    const lower = text.toLowerCase();
    const hit = words.find((w) => lower.includes(w));
    if (hit && (await msg.isBotAdmin())) {
      try {
        await msg.sock.sendMessage(msg.jid, { delete: msg.key });
        await msg.sendReply('⚠️ *تم حذف الرسالة لاحتوائها على كلمة محظورة.*');
      } catch (_) {}
    }
  }

  // 3. Custom Chat Filters
  const filters = await dbOps.getFilters(msg.jid);
  for (const f of filters) {
    if (text.toLowerCase() === f.pattern.toLowerCase()) {
      await msg.sendReply(f.text);
      break;
    }
  }
});
