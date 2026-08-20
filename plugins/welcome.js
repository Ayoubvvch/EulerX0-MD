'use strict';

const { Module } = require('../main');
const { dbOps } = require('../core/database');

Module(
  {
    pattern: 'welcome ?(.*)',
    desc: 'Set custom group welcome message or toggle on/off',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return;
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');

    const input = match[1]?.trim();
    if (!input) {
      const current = await dbOps.getWelcome(msg.jid);
      return await msg.sendReply(`👋 *إعدادات رسالة الترحيب:*\n• *الحالة:* \`${current?.status || 'off'}\`\n• *الرسالة:* \n${current?.message || '_لم يتم تعيين رسالة_'}\n\n_لتغيير الرسالة:_ \`.welcome مرحباً بك #user في #group\`\n_للتعطيل:_ \`.welcome off\``);
    }

    if (input.toLowerCase() === 'on' || input.toLowerCase() === 'off') {
      const current = await dbOps.getWelcome(msg.jid);
      await dbOps.setWelcome(msg.jid, current?.message || 'مرحباً بك #user في مجموعة #group! 🎉', input.toLowerCase());
      return await msg.sendReply(`✅ *تم ضبط الترحيب على وضع:* \`${input.toLowerCase()}\``);
    }

    await dbOps.setWelcome(msg.jid, input, 'on');
    await msg.sendReply(`✅ *تم حفظ وتفعيل رسالة الترحيب الجديدة بنجاح!*`);
  }
);

Module(
  {
    pattern: 'goodbye ?(.*)',
    desc: 'Set custom group goodbye message or toggle on/off',
    use: 'group'
  },
  async (msg, match) => {
    if (!msg.isGroup) return;
    if (!msg.fromOwner && !(await msg.isAdmin())) return await msg.sendReply('❌ *للمشرفين فقط.*');

    const input = match[1]?.trim();
    if (!input) {
      const current = await dbOps.getGoodbye(msg.jid);
      return await msg.sendReply(`👋 *إعدادات رسالة المغادرة:*\n• *الحالة:* \`${current?.status || 'off'}\`\n• *الرسالة:* \n${current?.message || '_لم يتم تعيين رسالة_'}\n\n_لتغيير الرسالة:_ \`.goodbye وداعاً #user 👋\`\n_للتعطيل:_ \`.goodbye off\``);
    }

    if (input.toLowerCase() === 'on' || input.toLowerCase() === 'off') {
      const current = await dbOps.getGoodbye(msg.jid);
      await dbOps.setGoodbye(msg.jid, current?.message || 'وداعاً #user 👋', input.toLowerCase());
      return await msg.sendReply(`✅ *تم ضبط رسالة المغادرة على وضع:* \`${input.toLowerCase()}\``);
    }

    await dbOps.setGoodbye(msg.jid, input, 'on');
    await msg.sendReply(`✅ *تم حفظ وتفعيل رسالة المغادرة بنجاح!*`);
  }
);

// 👥 Group Update Event Listener
Module({ on: 'group-update' }, async (sock, update) => {
  const { id, participants, action } = update;
  if (!id || !participants || participants.length === 0) return;

  try {
    const meta = await sock.groupMetadata(id).catch(() => null);
    const groupName = meta?.subject || 'Group';
    const groupDesc = meta?.desc || '';
    const memberCount = meta?.participants?.length || 0;

    if (action === 'add') {
      const welcomeData = await dbOps.getWelcome(id);
      if (welcomeData && welcomeData.status === 'on' && welcomeData.message) {
        for (const user of participants) {
          const userNum = user.split('@')[0];
          let text = welcomeData.message
            .replace(/#user/g, `@${userNum}`)
            .replace(/#group/g, groupName)
            .replace(/#desc/g, groupDesc)
            .replace(/#count/g, String(memberCount));

          await sock.sendMessage(id, { text, mentions: [user] });
        }
      }
    } else if (action === 'remove') {
      const goodbyeData = await dbOps.getGoodbye(id);
      if (goodbyeData && goodbyeData.status === 'on' && goodbyeData.message) {
        for (const user of participants) {
          const userNum = user.split('@')[0];
          let text = goodbyeData.message
            .replace(/#user/g, `@${userNum}`)
            .replace(/#group/g, groupName)
            .replace(/#desc/g, groupDesc)
            .replace(/#count/g, String(memberCount));

          await sock.sendMessage(id, { text, mentions: [user] });
        }
      }
    }
  } catch (err) {
    console.error('Welcome/Goodbye event error:', err.message);
  }
});
