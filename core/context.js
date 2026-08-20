'use strict';

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage, jidNormalizedUser } = require('baileys');
const config = require('../config');
const { getTempPath, createSticker, getBuffer } = require('./helpers');

class MessageContext {
  constructor(sock, rawMsg) {
    this.client = sock;
    this.sock = sock;
    this.raw = rawMsg;
    this.data = rawMsg;
    this.key = rawMsg.key;
    this.id = rawMsg.key?.id;
    this.jid = rawMsg.key?.remoteJid;
    this.isGroup = Boolean(this.jid && this.jid.endsWith('@g.us'));
    this.fromMe = Boolean(rawMsg.key?.fromMe);

    // Identify sender
    if (this.isGroup) {
      this.sender = rawMsg.key?.participant || rawMsg.key?.participantAlt || this.jid;
    } else {
      this.sender = this.jid;
    }

    this.senderName = rawMsg.pushName || (this.fromMe ? 'Owner' : 'User');
    this.fromOwner = config.isOwner(this.sender, sock.user) || this.fromMe;
    
    // Extract message content & text
    this.message = rawMsg.message || {};
    this.text = this._extractText(this.message);
    this.body = this.text;

    // Quoted message handling
    this.quoted = null;
    this.reply_message = null;
    this._parseQuoted(this.message);
  }

  _extractText(m) {
    if (!m) return '';
    if (typeof m === 'string') return m;
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
    if (m.imageMessage?.caption) return m.imageMessage.caption;
    if (m.videoMessage?.caption) return m.videoMessage.caption;
    if (m.documentMessage?.caption) return m.documentMessage.caption;
    if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;
    if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
    if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
    if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
      try {
        const parsed = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
        return parsed.id || parsed.name || '';
      } catch (_) {}
    }
    return '';
  }

  _parseQuoted(m) {
    const ctx = m?.extendedTextMessage?.contextInfo ||
      m?.imageMessage?.contextInfo ||
      m?.videoMessage?.contextInfo ||
      m?.stickerMessage?.contextInfo ||
      m?.audioMessage?.contextInfo ||
      m?.documentMessage?.contextInfo;

    if (ctx && ctx.quotedMessage) {
      const qParticipant = ctx.participant || this.jid;
      const qMsg = ctx.quotedMessage;
      const qText = this._extractText(qMsg);
      const isSticker = Boolean(qMsg.stickerMessage);
      const isImage = Boolean(qMsg.imageMessage);
      const isVideo = Boolean(qMsg.videoMessage);
      const isAudio = Boolean(qMsg.audioMessage);
      const isDocument = Boolean(qMsg.documentMessage);

      this.quoted = {
        key: {
          remoteJid: ctx.remoteJid || this.jid,
          fromMe: qParticipant?.split('@')[0] === this.sock.user?.id?.split('@')[0]?.split(':')[0],
          id: ctx.stanzaId,
          participant: qParticipant
        },
        message: qMsg,
        text: qText,
        sender: qParticipant,
        isSticker,
        image: isImage,
        video: isVideo,
        audio: isAudio,
        document: isDocument
      };

      this.reply_message = {
        id: ctx.stanzaId,
        jid: qParticipant,
        text: qText,
        caption: qText,
        sticker: isSticker,
        image: isImage,
        video: isVideo,
        audio: isAudio,
        document: isDocument,
        data: { key: this.quoted.key, message: qMsg },
        download: async (type = 'buffer') => {
          return await this._downloadMedia({ key: this.quoted.key, message: qMsg }, type);
        }
      };
    }
  }

  async react(emoji) {
    if (!emoji || !this.key) return;
    try {
      await this.sock.sendMessage(this.jid, {
        react: { text: emoji, key: this.key }
      });
    } catch (_) {}
  }

  async reply(text, options = {}) {
    return await this.sendReply(text, 'text', options);
  }

  async sendReply(content, type = 'text', options = {}) {
    try {
      return await this.sendMessage(content, type, { quoted: this.raw, ...options });
    } catch (err) {
      // Fallback without quote if quoted failed
      return await this.sendMessage(content, type, { ...options, quoted: null });
    }
  }

  async send(content, type = 'text', options = {}) {
    return await this.sendMessage(content, type, options);
  }

  async sendMessage(content, type = 'text', options = {}) {
    const { quoted, caption, ptt, fileName, mimetype, ...rest } = options;
    const sendOpts = {};
    if (quoted) sendOpts.quoted = quoted;

    try {
      if (type === 'text') {
        const payload = typeof content === 'string' ? { text: content, ...rest } : content;
        return await this.sock.sendMessage(this.jid, payload, sendOpts);
      }

      if (type === 'image') {
        const buf = Buffer.isBuffer(content) ? content : await getBuffer(content?.url || content);
        return await this.sock.sendMessage(this.jid, { image: buf, caption, ...rest }, sendOpts);
      }

      if (type === 'video') {
        const buf = Buffer.isBuffer(content) ? content : await getBuffer(content?.url || content);
        return await this.sock.sendMessage(this.jid, { video: buf, caption, ...rest }, sendOpts);
      }

      if (type === 'audio') {
        const buf = Buffer.isBuffer(content) ? content : await getBuffer(content?.url || content);
        return await this.sock.sendMessage(
          this.jid,
          { audio: buf, mimetype: mimetype || (ptt ? 'audio/ogg; codecs=opus' : 'audio/mp4'), ptt: Boolean(ptt), ...rest },
          sendOpts
        );
      }

      if (type === 'sticker') {
        const buf = Buffer.isBuffer(content) ? content : await getBuffer(content?.url || content);
        return await this.sock.sendMessage(this.jid, { sticker: buf, ...rest }, sendOpts);
      }

      if (type === 'document') {
        const buf = Buffer.isBuffer(content) ? content : await getBuffer(content?.url || content);
        return await this.sock.sendMessage(
          this.jid,
          { document: buf, fileName: fileName || 'document', mimetype: mimetype || 'application/octet-stream', caption, ...rest },
          sendOpts
        );
      }
    } catch (err) {
      console.error(`sendMessage error (${type}):`, err.message);
      throw err;
    }
  }

  async edit(newText, key = this.key) {
    try {
      return await this.sock.sendMessage(this.jid, {
        text: newText,
        edit: key
      });
    } catch (_) {
      return await this.sock.sendMessage(this.jid, { text: newText });
    }
  }

  async download(type = 'buffer') {
    return await this._downloadMedia(this.raw, type);
  }

  async _downloadMedia(msgObj, type = 'buffer') {
    try {
      const buffer = await downloadMediaMessage(msgObj, 'buffer', {}, {
        logger: config.logger,
        reuploadRequest: this.sock.updateMediaMessage
      });

      if (type === 'buffer') return buffer;

      const ext = 'bin';
      const tmpFile = getTempPath(`media_${Date.now()}.${ext}`);
      fs.writeFileSync(tmpFile, buffer);
      return tmpFile;
    } catch (err) {
      console.error('Download media error:', err.message);
      return null;
    }
  }

  async getGroupMetadata() {
    if (!this.isGroup) return null;
    try {
      return await this.sock.groupMetadata(this.jid);
    } catch (_) {
      return null;
    }
  }

  async isAdmin(userJid = this.sender) {
    if (!this.isGroup) return false;
    const meta = await this.getGroupMetadata();
    if (!meta || !meta.participants) return false;
    const cleanUser = userJid.split('@')[0].split(':')[0];
    const p = meta.participants.find((p) => p.id.split('@')[0].split(':')[0] === cleanUser);
    return Boolean(p && (p.admin === 'admin' || p.admin === 'superadmin'));
  }

  async isBotAdmin() {
    if (!this.isGroup || !this.sock.user?.id) return false;
    return await this.isAdmin(jidNormalizedUser(this.sock.user.id));
  }
}

module.exports = { MessageContext };
