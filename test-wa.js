/**
 * test-wa.js — اختبار سريع لبوت واتساب
 * =============================================
 * شغّله هكذا:  node test-wa.js
 * امسح QR بهاتفك ثم أدخل رقم لإرسال رسالة اختبار
 * =============================================
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode   = require('qrcode-terminal');
const readline = require('readline');
const fs       = require('fs');

/* ─── مسار Chrome ─── */
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);
const chromePath = CHROME_PATHS.find(p => fs.existsSync(p));

/* ─── إدخال من المستخدم ─── */
const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));

/* ─── عميل واتساب ─── */
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'crm-test-bot' }),
  puppeteer: {
    headless: true,
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
});

console.log('\n══════════════════════════════════════');
console.log('  🤖 اختبار بوت واتساب');
console.log('══════════════════════════════════════');
if (chromePath) {
  console.log('✅ Chrome:', chromePath);
} else {
  console.error('❌ Chrome غير موجود — ثبّت Google Chrome أولاً');
  process.exit(1);
}
console.log('🚀 جارٍ التشغيل...\n');

client.on('qr', qr => {
  console.clear();
  console.log('\n══════════════════════════════════════');
  console.log('  📱 امسح QR Code بهاتفك:');
  console.log('  واتساب ← الأجهزة المرتبطة ← ربط جهاز');
  console.log('══════════════════════════════════════\n');
  qrcode.generate(qr, { small: true });
  console.log('\n⏳ في انتظار المسح...\n');
});

client.on('authenticated', () => {
  console.log('🔐 تم التحقق من الهوية...');
});

client.on('ready', async () => {
  console.log('\n✅ واتساب متصل وجاهز!\n');

  try {
    while (true) {
      console.log('─────────────────────────────────────');
      const phone = await ask('📞 أدخل رقم الهاتف (أو اكتب "خروج" للإنهاء): ');

      if (phone.trim() === 'خروج' || phone.trim().toLowerCase() === 'exit') break;

      const clean = phone.replace(/\D/g, '');
      if (!clean || clean.length < 9) {
        console.log('⚠️  رقم غير صحيح، حاول مجدداً\n');
        continue;
      }

      const chatId = clean + '@c.us';
      const now    = new Date().toLocaleString('ar-SA', {
        dateStyle: 'full', timeStyle: 'short', calendar: 'gregory'
      });

      const msg = [
        '🔔 *اختبار نظام التذكيرات*',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        'مرحباً 👋',
        '',
        '📋 *تفاصيل الاختبار:*',
        '▪️ الاشتراك: *بريميوم تجريبي*',
        '▪️ تاريخ الانتهاء: *2026-04-10*',
        '▪️ الوقت المتبقي: ⏰ *3 أيام متبقية*',
        '',
        'اشتراكك سينتهي قريباً، جدّده مسبقاً 💪',
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '✅ *جدّد اشتراكك الآن*',
        '📲 تواصل معنا لإتمام التجديد',
        '━━━━━━━━━━━━━━━━━━━━',
        '_متجر الاشتراكات — نسعد بخدمتك دائماً_ 🙏',
        '',
        `⏱️ _وقت الإرسال: ${now}_`,
      ].join('\n');

      process.stdout.write(`\n📤 جارٍ الإرسال إلى ${clean}...`);

      try {
        /* التحقق من أن الرقم مسجّل في واتساب */
        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
          console.log('\n⚠️  هذا الرقم غير مسجّل في واتساب\n');
          continue;
        }

        await client.sendMessage(chatId, msg);
        console.log(' ✅ تم الإرسال!\n');
        console.log('تحقق من هاتفك — يجب أن تصل الرسالة خلال ثوانٍ\n');
      } catch (err) {
        console.log('\n❌ فشل الإرسال:', err.message, '\n');
      }
    }
  } catch (e) {
    /* المستخدم ضغط Ctrl+C */
  }

  console.log('\n👋 إنهاء الاختبار...\n');
  rl.close();
  await client.destroy();
  process.exit(0);
});

client.on('auth_failure', msg => {
  console.error('\n❌ فشل التحقق:', msg);
  console.log('احذف مجلد ".wwebjs_auth" وأعد التشغيل\n');
  rl.close();
  process.exit(1);
});

client.on('disconnected', reason => {
  console.log('\n⚠️  انقطع الاتصال:', reason);
  rl.close();
  process.exit(0);
});

client.initialize();
