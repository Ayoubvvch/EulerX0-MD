'use strict';

const { commands } = require('../main');
const { MessageContext } = require('./context');
const config = require('../config');

function unwrapMessage(rawMsg) {
  if (!rawMsg || !rawMsg.message) return null;
  let m = rawMsg.message;

  while (
    m &&
    (m.ephemeralMessage ||
      m.viewOnceMessage ||
      m.viewOnceMessageV2 ||
      m.viewOnceMessageV2Extension ||
      m.documentWithCaptionMessage)
  ) {
    m =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message;
  }

  return m;
}

async function handleMessageUpsert(sock, messageUpsert) {
  if (!messageUpsert || !messageUpsert.messages || !messageUpsert.messages[0]) return;
  const rawMsg = messageUpsert.messages[0];
  if (!rawMsg.message) return;

  // Auto read status if enabled
  if (rawMsg.key?.remoteJid === 'status@broadcast' && config.AUTO_READ_STATUS) {
    try {
      await sock.readMessages([rawMsg.key]);
    } catch (_) {}
    return;
  }

  const unwrapped = unwrapMessage(rawMsg);
  if (!unwrapped) return;
  rawMsg.message = unwrapped;

  const msg = new MessageContext(sock, rawMsg);
  const text = msg.text?.trim() || '';

  // Auto read incoming message
  if (config.READ_MESSAGES && msg.jid) {
    try {
      await sock.readMessages([rawMsg.key]);
    } catch (_) {}
  }

  // Check Private mode
  if (config.MODE === 'private' && !msg.fromOwner) {
    return;
  }

  const isOwner = msg.fromOwner;
  const senderNumber = msg.sender?.split('@')[0]?.split(':')[0] || 'Unknown';

  // 1. Check commands by pattern
  let commandExecuted = false;

  if (text) {
    for (const cmd of commands) {
      if (cmd.pattern) {
        if (cmd.fromMe && !isOwner) continue;

        const match = text.match(cmd.pattern);
        if (match) {
          commandExecuted = true;
          console.log(`⚡ [Command] Executing ${cmd.pattern.source} for ${senderNumber} (${isOwner ? 'Owner' : 'User'})`);
          
          if (config.READ_COMMAND && msg.jid) {
            try { await sock.readMessages([rawMsg.key]); } catch (_) {}
          }

          try {
            await cmd.function(msg, match);
          } catch (err) {
            console.error(`❌ [Command Error] ${cmd.pattern.source}:`, err.message || err);
            try {
              await msg.sendReply(`❌ *خطأ أثناء تنفيذ الأمر:*\n\`\`\`${err.message || err}\`\`\``);
            } catch (_) {}
          }
          break;
        }
      }
    }
  }

  // 2. Dispatch event-based plugins (on: 'text' or on: 'message')
  for (const cmd of commands) {
    if (cmd.on) {
      if (cmd.fromMe && !isOwner) continue;

      if ((cmd.on === 'text' && text) || cmd.on === 'message') {
        try {
          await cmd.function(msg, text);
        } catch (err) {
          // Event handlers ignore or log quietly
        }
      }
    }
  }
}

async function handleGroupParticipantsUpdate(sock, update) {
  for (const cmd of commands) {
    if (cmd.on === 'group-update') {
      try {
        await cmd.function(sock, update);
      } catch (err) {
        console.error('Error in group-update handler:', err.message);
      }
    }
  }
}

async function triggerStartHooks(sock) {
  for (const cmd of commands) {
    if (cmd.on === 'start') {
      try {
        await cmd.function(sock);
      } catch (err) {
        console.error('Error in start hook:', err.message);
      }
    }
  }
}

module.exports = {
  handleMessageUpsert,
  handleGroupParticipantsUpdate,
  triggerStartHooks
};
