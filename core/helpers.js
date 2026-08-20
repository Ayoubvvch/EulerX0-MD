'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const axios = require('axios');
const webp = require('node-webpmux');
const config = require('../config');

const TEMP_DIR = config.TEMP_DIR;

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function getTempPath(filename) {
  ensureTempDir();
  return path.join(TEMP_DIR, filename || `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`);
}

function cleanupTempFiles(maxAgeMs = 15 * 60 * 1000) {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile() && now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
        }
      } catch (_) {}
    }
  } catch (_) {}
}

async function getBuffer(urlOrPath, options = {}) {
  if (Buffer.isBuffer(urlOrPath)) return urlOrPath;
  if (typeof urlOrPath === 'string') {
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      const res = await axios.get(urlOrPath, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...options.headers
        },
        timeout: options.timeout || 30000
      });
      return Buffer.from(res.data);
    }
    if (fs.existsSync(urlOrPath)) {
      return fs.readFileSync(urlOrPath);
    }
  }
  return null;
}

// FFmpeg wrapper using promises
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', ...args]);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

// Convert audio to WhatsApp PTT (Opus OGG)
async function convertToOgg(inputBuffer) {
  const inPath = getTempPath(`in_${Date.now()}.bin`);
  const outPath = getTempPath(`out_${Date.now()}.ogg`);
  fs.writeFileSync(inPath, inputBuffer);

  try {
    await runFfmpeg([
      '-i', inPath,
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-vbr', 'on',
      '-compression_level', '10',
      '-application', 'voip',
      outPath
    ]);
    const res = fs.readFileSync(outPath);
    return res;
  } finally {
    try { fs.unlinkSync(inPath); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
}

// Convert audio to MP3
async function convertToMp3(inputBuffer) {
  const inPath = getTempPath(`in_${Date.now()}.bin`);
  const outPath = getTempPath(`out_${Date.now()}.mp3`);
  fs.writeFileSync(inPath, inputBuffer);

  try {
    await runFfmpeg([
      '-i', inPath,
      '-vn',
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '192k',
      outPath
    ]);
    const res = fs.readFileSync(outPath);
    return res;
  } finally {
    try { fs.unlinkSync(inPath); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
}

// Convert Image/Video to WebP Sticker with optional EXIF
async function createSticker(inputBuffer, options = {}) {
  const packname = options.packname || config.STICKER_DATA.split(';')[0] || 'EulerX0';
  const author = options.author || config.STICKER_DATA.split(';')[1] || 'Ayoubvvch';
  const isAnimated = Boolean(options.animated);

  const inPath = getTempPath(`stk_in_${Date.now()}.bin`);
  const outPath = getTempPath(`stk_out_${Date.now()}.webp`);
  fs.writeFileSync(inPath, inputBuffer);

  try {
    if (isAnimated) {
      await runFfmpeg([
        '-i', inPath,
        '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1',
        '-c:v', 'libwebp',
        '-lossless', '0',
        '-compression_level', '4',
        '-q:v', '50',
        '-loop', '0',
        '-preset', 'picture',
        '-an',
        '-vsync', '0',
        '-s', '512:512',
        outPath
      ]);
    } else {
      await runFfmpeg([
        '-i', inPath,
        '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1',
        '-c:v', 'libwebp',
        '-q:v', '75',
        outPath
      ]);
    }

    let webpBuffer = fs.readFileSync(outPath);

    // Inject EXIF metadata
    try {
      const img = new webp.Image();
      await img.load(webpBuffer);
      const json = {
        'sticker-pack-id': 'https://github.com/Ayoubvvch/eulerx0-bot',
        'sticker-pack-name': packname,
        'sticker-pack-publisher': author,
        emojis: ['⚡']
      };
      const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
      ]);
      const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf-8');
      const exif = Buffer.concat([exifAttr, jsonBuffer]);
      exif.writeUIntLE(jsonBuffer.length, 14, 4);
      img.exif = exif;
      webpBuffer = await img.save(null);
    } catch (_) {}

    return webpBuffer;
  } finally {
    try { fs.unlinkSync(inPath); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
}

// Convert WebP Sticker to PNG Image
async function stickerToPng(inputBuffer) {
  const inPath = getTempPath(`stk_in_${Date.now()}.webp`);
  const outPath = getTempPath(`stk_out_${Date.now()}.png`);
  fs.writeFileSync(inPath, inputBuffer);

  try {
    await runFfmpeg(['-i', inPath, outPath]);
    const res = fs.readFileSync(outPath);
    return res;
  } finally {
    try { fs.unlinkSync(inPath); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
}

// Apply audio filters (bass, slow, fast, reverse, blown, nightcore)
async function applyAudioEffect(inputBuffer, filterType) {
  const inPath = getTempPath(`aud_in_${Date.now()}.bin`);
  const outPath = getTempPath(`aud_out_${Date.now()}.mp3`);
  fs.writeFileSync(inPath, inputBuffer);

  const filters = {
    bass: ['-af', 'equalizer=f=40:width_type=h:width=50:g=10'],
    slow: ['-filter:a', 'atempo=0.75'],
    fast: ['-filter:a', 'atempo=1.5'],
    reverse: ['-filter_complex', 'areverse'],
    blown: ['-af', 'acrusher=level_in=8:level_out=18:bits=8:mode=log:aa=1'],
    nightcore: ['-filter:a', 'atempo=1.06,asetrate=44100*1.25']
  };

  const selectedFilter = filters[filterType] || filters.bass;

  try {
    await runFfmpeg(['-i', inPath, ...selectedFilter, outPath]);
    const res = fs.readFileSync(outPath);
    return res;
  } finally {
    try { fs.unlinkSync(inPath); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
}

function parseUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

module.exports = {
  TEMP_DIR,
  ensureTempDir,
  getTempPath,
  cleanupTempFiles,
  getBuffer,
  runFfmpeg,
  convertToOgg,
  convertToMp3,
  createSticker,
  stickerToPng,
  applyAudioEffect,
  parseUptime,
  formatBytes
};
