<div align="center">

# ⚡ EulerX0 MD (Multi-Device Bot)

**Ultra-lightweight, blazing-fast WhatsApp & Telegram Multi-Device Bot built from the ground up.**

[![Node.js Version](https://img.shields.io/badge/node.js-v20%20%7C%20v22-green.svg)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/Baileys-v7.0.0-blue.svg)](https://github.com/WhiskeySockets/Baileys)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-yellow.svg)](LICENSE)
[![Developer](https://img.shields.io/badge/Developer-Ayoubvvch-purple.svg)](https://github.com/Ayoubvvch)

</div>

---

## 🚀 التثبيت والتشغيل بأمر واحد (One-Line Automated Installation)

لتثبيت وتشغيل البوت بالكامل على أي سيرفر VPS جديد (Ubuntu / Debian)، قم بتشغيل هذا الأمر فقط في التيرمينال:

```bash
curl -fsSL https://raw.githubusercontent.com/Ayoubvvch/EulerX0-MD/main/install.sh | bash
```

يقوم السكربت تلقائياً بـ:
1. تحديث النظام وتثبيت جميع المتطلبات (`Node.js 22 LTS`, `ffmpeg`, `yt-dlp`, `sqlite3`, `git`, `pm2`).
2. استنساخ المستودع وتثبيت الحزم النظيفة والخفيفة.
3. إنشاء ملف الإعدادات `config.env`.
4. تشغيل البوت ولوحة التحكم عبر `PM2` مع الحفظ التلقائي عند إعادة إقلاع السيرفر.
5. عرض رابط لوحة التحكم Web Dashboard لربط الرقم بكود الاقتران أو QR.

---

## 🌟 الميزات الرئيسية (Core Features)

- ⚡ **خفيف وسريع جداً**: استهلاك رام منخفض جداً (~70-120 MB فقط) مقارنة بالإصدارات السابقة.
- 📥 **المحمّل الشامل للوسائط (`downloader.js`)**:
  - **TikTok**: تحميل فيديوهات بدون علامة مائية، صوتيات MP3، وألبومات الصور.
  - **Instagram**: تحميل البوستات، الريلز، والقصص (Stories).
  - **Facebook & Pinterest**: تنزيل مقاطع الفيديو والصور بأعلى جودة.
  - **GitHub Clone**: تحميل مستودعات GitHub كملفات ZIP (`.gitclone`).
- 🎵 **اليوتيوب والصوتيات (`youtube.js`)**:
  - تحميل فوري للصوتيات والفيديوهات عبر `yt-dlp` (`.play`, `.song`, `.video`, `.yts`).
- ✈️ **مراقبة ونقل قنوات تيليجرام (`telegram.js`)**:
  - نقل مباشر وتلقائي للرسائل والوسائط من قنوات تيليجرام إلى مجموعات الواتساب المستهدفة.
- 🎨 **محولات الوسائط والملصقات (`converters.js`)**:
  - صانع ملصقات ثابتة ومتحركة (`.s`)، تغيير الحقوق (`.take`)، تحويل الملصق لصورة (`.photo`)، تحويل الفيديو لصوت (`.mp3`)، مؤثرات صوتية احترافية (`.bass`, `.slow`, `.fast`, `.reverse`, `.nightcore`)، وتحويل النصوص لكلام (`.tts`).
- 👥 **إدارة وحماية المجموعات (`group.js` & `warn.js`)**:
  - طرد، إضافة، ترقية، خفض، قفل وفتح المجموعة، منشن جماعي (`.tagall`, `.hidetag`).
  - مضاد الروابط والسبام والكلمات المحظورة، ونظام التحذيرات التلقائي.
- 👋 **الترحيب والمغادرة المخصصة (`welcome.js`)**:
  - رسائل ترحيب ديناميكية مع متغيرات (`#user`, `#group`, `#desc`, `#count`).
- ⏰ **التذكيرات والطقس (`reminders.js` & `weather.js`)**:
  - ربط مع Firestore للتذكيرات المجدولة، وتقارير وتنبيهات الطقس الطبيعية لمدينة تطوان.
- 🤖 **الذكاء الاصطناعي (`ai.js`)**:
  - إجابات ذكية عبر GPT و Gemini وشات بوت للمحادثات الخاصة.
- 🖥️ **لوحة تحكم عبر الويب (Web Dashboard)**:
  - واجهة تحكم خفيفة على المنفذ `5000` لربط الجلسة بـ QR / Pairing Code ومتابعة أداء البوت.

---

## ⚙️ ملف الإعدادات (`config.env`)

```env
SESSION=EX0~AcMods
BOT_NAME=EulerX0 MD
MODE=public
HANDLERS=false
SUDO=212614389153
TZ=Africa/Casablanca
PORT=3000
DASHBOARD_PORT=5000
AUTO_READ_STATUS=false
READ_MESSAGES=false
ALWAYS_ONLINE=false
DISABLE_START_MESSAGE=false
```

---

## 🛠️ أوامر إدارة البوت عبر PM2

```bash
# عرض حالة البوت واستهلاك الرام
pm2 status

# متابعة اللوج المباشر للبوت
pm2 logs eulerx0-bot

# إعادة تشغيل البوت
pm2 restart eulerx0-bot

# إيقاف جميع العمليات
pm2 stop all
```

---

## 👑 المطور والحقوق
- **المطور:** [Ayoubvvch](https://github.com/Ayoubvvch)
- **المشروع:** EulerX0 MD
- **الترخيص:** GPL-3.0 License
