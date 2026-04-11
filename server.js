/* ============================================================
   server.js — CRM WhatsApp Server (v3)
   ============================================================ */
'use strict';

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode     = require('qrcode');

/* ── إعداد الخادم ─────────────────────────────────────────── */
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
const PORT   = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ── حالة عالمية ──────────────────────────────────────────── */
let syncedCustomers = []; /* قائمة الاشتراكات من المتصفح */
let syncedSettings  = {};
let waClient        = null;
let waReady         = false;

/* ─── تهيئة واتساب ────────────────────────────────────────── */
function initWhatsApp() {
  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  });

  /* ── QR Code ── */
  waClient.on('qr', async (qr) => {
    console.log('📱 QR Code جديد — امسحه من الهاتف');
    try {
      const qrImg = await qrcode.toDataURL(qr);
      io.emit('wa-qr', { qr: qrImg, attempt: 1 });
    } catch (e) { console.error('خطأ QR:', e.message); }
  });

  /* ── تحميل ── */
  waClient.on('loading_screen', () => {
    console.log('⏳ جارٍ تشغيل واتساب...');
    io.emit('wa-loading');
  });

  /* ── جاهز ── */
  waClient.on('ready', () => {
    waReady = true;
    console.log('\n✅ واتساب متصل وجاهز!\n');
    io.emit('wa-ready');
    /* تشغيل المجدول فور الاتصال */
    runScheduler();
  });

  /* ── قطع الاتصال ── */
  waClient.on('disconnected', (reason) => {
    waReady = false;
    console.log('🔌 انقطع واتساب:', reason);
    io.emit('wa-disconnected', { reason });
    /* إعادة التهيئة بعد 10 ثواني */
    setTimeout(initWhatsApp, 10000);
  });

  waClient.on('auth_failure', () => {
    console.log('❌ فشل المصادقة — سيُعاد تشغيل الجلسة');
    io.emit('wa-disconnected', { reason: 'auth_failure' });
  });

  waClient.initialize().catch(e => {
    console.error('❌ خطأ في تشغيل واتساب:', e.message);
    setTimeout(initWhatsApp, 15000);
  });
}

/* ─── إرسال رسالة واتساب ──────────────────────────────────── */
async function sendWaMessage(phone, message) {
  if (!waReady || !waClient) return false;
  try {
    const clean = String(phone).replace(/\D/g, '');
    if (!clean || clean.length < 7) return false;
    const chatId = clean.includes('@c.us') ? clean : `${clean}@c.us`;
    await waClient.sendMessage(chatId, message);
    return true;
  } catch (e) {
    console.error('❌ خطأ إرسال:', e.message);
    return false;
  }
}

/* ─── تطبيق قالب الرسالة ─────────────────────────────────── */
function applyTemplate(template, sub, daysLeft) {
  const st = syncedSettings;
  const storeName = st.storeName || 'المتجر';
  const renewLink = st.renewLink || '';

  let timeLeft;
  if (daysLeft <= 0)     timeLeft = 'انتهى الاشتراك';
  else if (daysLeft === 1) timeLeft = 'يوم واحد متبقي فقط!';
  else                    timeLeft = `${daysLeft} أيام متبقية`;

  let msg = template
    .replace(/{اسم}/g,            sub.customerName         || '')
    .replace(/{اشتراك}/g,         sub.subscriptionTypeName || '')
    .replace(/{تاريخ_الانتهاء}/g, (sub.endDate || '').slice(0, 10))
    .replace(/{أيام_متبقية}/g,    timeLeft)
    .replace(/{المتجر}/g,         storeName)
    .replace(/{رابط_التجديد}/g,   renewLink);

  const email = sub.activationEmail || '';
  if (email) {
    msg = msg.replace(/{إيميل_التفعيل}/g, email);
  } else {
    msg = msg.replace(/[^\n]*\{إيميل_التفعيل\}[^\n]*/g, '').replace(/\n{3,}/g, '\n\n');
  }

  return msg.trim();
}

/* ─── المجدول التلقائي (كل 5 دقائق) ─────────────────────── */
let _schedulerTimer = null;

function runScheduler() {
  if (_schedulerTimer) clearInterval(_schedulerTimer);
  _schedulerTimer = setInterval(_checkExpiringSubscriptions, 5 * 60 * 1000);
  _checkExpiringSubscriptions(); /* تشغيل فوري */
}

async function _checkExpiringSubscriptions() {
  if (!waReady || syncedCustomers.length === 0) return;

  const now  = new Date();
  let   sent = 0;

  for (const sub of syncedCustomers) {
    if (sub.status !== 'active') continue;
    const days = Math.ceil((new Date(sub.endDate) - now) / 86400000);

    /* اشتراك انتهى للتو → إشعار */
    if (days < 0 && days >= -1) {
      const tpl = syncedSettings.expiryTemplate || '';
      if (tpl) {
        const msg = applyTemplate(tpl, sub, days);
        const ok  = await sendWaMessage(sub.whatsapp, msg);
        if (ok) {
          sent++;
          io.emit('subscription-expired', { subId: sub.subId });
        }
      }
      continue;
    }

    /* اشتراك ينتهي خلال 0-3 أيام → تذكير */
    if (days >= 0 && days <= 3) {
      const tpl = syncedSettings.reminderTemplate || '';
      if (tpl) {
        const msg = applyTemplate(tpl, sub, days);
        await sendWaMessage(sub.whatsapp, msg);
        sent++;
      }
    }
  }

  if (sent > 0) {
    console.log(`📨 أُرسل ${sent} تذكير تلقائي`);
    io.emit('reminders-sent', { count: sent });
  }
}

/* ══════════════════════════════════════════════════════════
   مسارات API
══════════════════════════════════════════════════════════ */

/* مزامنة الاشتراكات من المتصفح */
app.post('/sync-customers', (req, res) => {
  const { customers, settings } = req.body || {};
  if (Array.isArray(customers)) syncedCustomers = customers;
  if (settings)                 syncedSettings  = settings;
  res.json({ ok: true, count: syncedCustomers.length });
});

/* إرسال رسالة */
app.post('/send', async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone || !message) {
    return res.json({ success: false, error: 'phone and message required' });
  }
  const ok = await sendWaMessage(phone, message);
  res.json({ success: ok });
});

/* تشغيل المجدول يدوياً */
app.post('/run-scheduler', async (req, res) => {
  await _checkExpiringSubscriptions();
  res.json({ ok: true });
});

/* مسح سجل التذكيرات (يتم في المتصفح — هذا للسيرفر فقط) */
app.post('/clear-reminders', (req, res) => {
  res.json({ ok: true });
});

/* قطع اتصال واتساب */
app.post('/disconnect', async (req, res) => {
  if (waClient) {
    try { await waClient.destroy(); } catch {}
    waReady = false;
    io.emit('wa-disconnected', { reason: 'manual' });
  }
  res.json({ ok: true });
});

/* SPA fallback */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ══════════════════════════════════════════════════════════
   Socket.io
══════════════════════════════════════════════════════════ */
io.on('connection', (socket) => {
  console.log('🔌 عميل متصل:', socket.id);

  /* إرسال الحالة الحالية للعميل الجديد */
  if (waReady) {
    socket.emit('wa-ready');
  } else {
    socket.emit('wa-loading');
  }

  socket.on('disconnect', () => {
    console.log('🔌 عميل قطع:', socket.id);
  });
});

/* ══════════════════════════════════════════════════════════
   تشغيل الخادم
══════════════════════════════════════════════════════════ */
server.listen(PORT, () => {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  🌐 النظام يعمل على: http://localhost:${PORT}`);
  console.log(`  📱 افتح الرابط في المتصفح وسجّل الدخول`);
  console.log(`  ⚙️  اذهب للإعدادات لمسح QR Code واتساب`);
  console.log(`${'═'.repeat(50)}\n`);
  initWhatsApp();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ المنفذ ${PORT} مشغول!`);
    console.error(`   نفّذ في CMD: netstat -ano | findstr :${PORT}`);
    console.error(`   ثم: taskkill /F /PID <الرقم>\n`);
  } else {
    console.error('خطأ في السيرفر:', err.message);
  }
  process.exit(1);
});
