'use strict';

const { Module } = require('../main');
const { dbOps } = require('../core/database');
const { parseUptime } = require('../core/helpers');

Module(
  {
    pattern: 'afk ?(.*)',
    desc: 'Set Away From Keyboard (AFK) status with reason',
    use: 'general'
  },
  async (msg, match) => {
    const reason = match[1]?.trim() || 'غير متاح حالياً';
    await dbOps.setAfk(msg.sender, reason);
    await msg.sendReply(`💤 *أصبحت الآن في وضع عدم الاتصال (AFK):*\n📝 *السبب:* ${reason}`);
  }
);

Module({ on: 'text' }, async (msg, text) => {
  // 1. If sender was AFK and sent a message, remove AFK
  const selfAfk = await dbOps.getAfk(msg.sender);
  if (selfAfk) {
    await dbOps.removeAfk(msg.sender);
    const timeSpent = Math.floor((Date.now() - selfAfk.timestamp) / 1000);
    await msg.sendReply(`👋 *مرحباً بعودتك! تم إلغاء وضع AFK.*\n⏱️ *مدة الغياب:* \`${parseUptime(timeSpent)}\``);
  }

  // 2. If message mentions an AFK user
  if (msg.raw?.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    const mentions = msg.raw.message.extendedTextMessage.contextInfo.mentionedJid;
    for (const jid of mentions) {
      const afkData = await dbOps.getAfk(jid);
      if (afkData) {
        const timeSpent = Math.floor((Date.now() - afkData.timestamp) / 1000);
        const name = jid.split('@')[0];
        await msg.sendReply(`💤 *المستخدم @${name} غير متصل حالياً (AFK):*\n📝 *السبب:* ${afkData.reason}\n⏱️ *منذ:* \`${parseUptime(timeSpent)}\``);
      }
    }
  }
});
