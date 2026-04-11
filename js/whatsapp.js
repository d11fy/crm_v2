/* ============================================================
   whatsapp.js — نظام إرسال واتساب التلقائي
   ============================================================
   يعتمد على server.js (Node.js + whatsapp-web.js)

   خطوات التشغيل:
   1. افتح Terminal/CMD في مجلد المشروع
   2. npm install
   3. node server.js
   4. امسح QR Code بهاتفك من الصفحة:
      http://localhost:3001/qr-page
   5. النظام سيرسل التذكيرات تلقائياً!
   ============================================================ */

const WhatsApp = {
  INTERVAL_MS : 5 * 60 * 1000,  /* فحص كل 5 دقائق */
  SERVER_URL  : 'http://localhost:3001',
  _timer      : null,
  _connected  : false,
  _checkTimer : null,

  /* ─── بناء رسالة التذكير ──────────────────────────────── */
  buildMessage(customer, daysLeft) {
    const storeName = localStorage.getItem('storeName') || 'المتجر';
    const renewLink = localStorage.getItem('renewLink') || '';

    /* الوقت المتبقي بصياغة واضحة */
    let timeLeft;
    if (daysLeft === 0)      timeLeft = '⏰ *ينتهي اليوم!*';
    else if (daysLeft === 1) timeLeft = '⏰ *يوم واحد متبقي فقط!*';
    else                     timeLeft = `⏰ *${daysLeft} أيام متبقية*`;

    /* إيموجي الإلحاح حسب عدد الأيام */
    const urgency = daysLeft === 0 ? '🚨' : daysLeft === 1 ? '⚠️' : '🔔';

    const subName = customer.subscriptionTypeName || 'الاشتراك';

    let msg = '';

    /* التحية */
    msg += `${urgency} *تذكير تجديد اشتراك*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    /* اسم العميل */
    msg += `مرحباً *${customer.name}* 👋\n\n`;

    /* تفاصيل الاشتراك */
    msg += `📋 *تفاصيل اشتراكك:*\n`;
    msg += `▪️ الاشتراك: *${subName}*\n`;
    msg += `▪️ تاريخ الانتهاء: *${customer.endDate}*\n`;
    msg += `▪️ الوقت المتبقي: ${timeLeft}\n\n`;

    /* رسالة الإلحاح */
    if (daysLeft === 0) {
      msg += `اشتراكك في *${storeName}* انتهى صلاحيته اليوم.\n`;
      msg += `جدّده الآن لتستمر في الاستمتاع بالخدمة دون انقطاع! 🚀\n\n`;
    } else if (daysLeft === 1) {
      msg += `اشتراكك في *${storeName}* على وشك الانتهاء!\n`;
      msg += `لا تفوّت الاستمرارية — جدّده اليوم قبل فوات الأوان ⚡\n\n`;
    } else {
      msg += `اشتراكك في *${storeName}* سينتهي قريباً.\n`;
      msg += `جدّده مسبقاً واستمر بلا انقطاع 💪\n\n`;
    }

    /* CTA */
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `✅ *جدّد اشتراكك الآن*\n`;
    if (renewLink) {
      msg += `👇 اضغط الرابط أدناه:\n${renewLink}\n`;
    } else {
      msg += `📲 تواصل معنا لإتمام التجديد\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `_${storeName} — نسعد بخدمتك دائماً_ 🙏`;

    return msg;
  },

  /* ─── فتح wa.me (احتياطي إذا السيرفر غير متصل) ──────── */
  openWhatsApp(phone, message) {
    const clean = String(phone || '').replace(/\D/g, '');
    if (!clean) { showToast('رقم الواتساب غير صحيح', 'error'); return; }
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(message)}`, '_blank');
  },

  /* ─── إرسال عبر السيرفر ─────────────────────────────── */
  async sendViaServer(phone, message) {
    const url = localStorage.getItem('waServerUrl') || this.SERVER_URL + '/send';
    try {
      const res = await fetch(url, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ phone, message }),
      });
      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  },

  /* ─── فحص حالة السيرفر ───────────────────────────────── */
  async checkServerStatus() {
    const base = localStorage.getItem('waServerUrl')
      ? localStorage.getItem('waServerUrl').replace('/send', '')
      : this.SERVER_URL;
    try {
      const res  = await fetch(base + '/status', { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      this._connected = data.connected;
      return data;
    } catch {
      this._connected = false;
      return { connected: false, hasQR: false };
    }
  },

  /* ─── جلب صورة QR ───────────────────────────────────── */
  async getQR() {
    const base = localStorage.getItem('waServerUrl')
      ? localStorage.getItem('waServerUrl').replace('/send', '')
      : this.SERVER_URL;
    try {
      const res  = await fetch(base + '/qr', { signal: AbortSignal.timeout(4000) });
      return await res.json();
    } catch {
      return { connected: false, error: 'السيرفر غير متاح' };
    }
  },

  /* ─── مفاتيح لمنع إعادة الإرسال ─────────────────────── */
  _key(customerId, type) { return `reminder_${customerId}_${type}`; },

  async wasReminderSent(customerId, type) {
    try {
      const logs = await db.getByIndex('reminderLog', 'key', this._key(customerId, type));
      return logs.length > 0;
    } catch { return false; }
  },

  async markReminderSent(customerId, type) {
    try {
      await db.add('reminderLog', {
        key   : this._key(customerId, type),
        sentAt: new Date().toISOString(),
      });
    } catch { /* مكرر */ }
  },

  /* ─── إرسال تذكير واحد ──────────────────────────────── */
  async sendReminder(customer, daysLeft, type) {
    const message = this.buildMessage(customer, daysLeft);

    /* حاول السيرفر أولاً */
    const ok = await this.sendViaServer(customer.whatsapp, message);

    if (ok) {
      console.log(`✅ تذكير أُرسل تلقائياً لـ ${customer.name}`);
    } else {
      /* احتياطي: فتح wa.me */
      this.openWhatsApp(customer.whatsapp, message);
    }

    await this.markReminderSent(customer.id, type);
    return ok;
  },

  /* ─── فحص الاشتراكات المنتهية قريباً ────────────────── */
  async checkExpiringSubscriptions() {
    let customers;
    try { customers = await db.getAll('customers'); }
    catch { return []; }

    const now     = new Date();
    const pending = [];

    for (const c of customers) {
      if (c.status !== 'active') continue;
      const days = Math.ceil((new Date(c.endDate) - now) / 86400000);

      if (days === 3 && !(await this.wasReminderSent(c.id, '3d'))) {
        pending.push({ customer: c, daysLeft: 3, type: '3d' });
      }
      if (days <= 1 && days >= 0 && !(await this.wasReminderSent(c.id, '1d'))) {
        pending.push({ customer: c, daysLeft: days, type: '1d' });
      }
    }

    if (pending.length > 0) {
      /* إذا السيرفر متصل → أرسل تلقائياً بصمت */
      const status = await this.checkServerStatus();
      if (status.connected) {
        for (const p of pending) {
          await this.sendReminder(p.customer, p.daysLeft, p.type);
        }
        updateReminderBadge(0);
        showToast(`✅ تم إرسال ${pending.length} تذكير تلقائياً`, 'success');
      } else {
        /* السيرفر غير متصل → اعرض اللوحة اليدوية */
        _showReminderFloatPanel(pending);
        updateReminderBadge(pending.length);
      }
    }

    return pending;
  },

  /* ─── بدء المراقبة الدورية ──────────────────────────── */
  start() {
    this.checkExpiringSubscriptions();
    this._timer = setInterval(
      () => this.checkExpiringSubscriptions(),
      this.INTERVAL_MS
    );
    /* مراقبة حالة السيرفر كل 30 ثانية */
    this._checkTimer = setInterval(
      () => this._updateConnectionBadge(),
      30000
    );
    this._updateConnectionBadge();
  },

  stop() {
    clearInterval(this._timer);
    clearInterval(this._checkTimer);
  },

  async _updateConnectionBadge() {
    const status = await this.checkServerStatus();
    const badge  = document.getElementById('waBadge');
    if (!badge) return;
    if (status.connected) {
      badge.textContent  = '● متصل';
      badge.style.color  = 'var(--success)';
    } else {
      badge.textContent  = '● غير متصل';
      badge.style.color  = 'var(--danger)';
    }
  },
};

/* ═══════════════════════════════════════════════════════════
   لوحة التذكيرات العائمة (للإرسال اليدوي عند قطع الاتصال)
═══════════════════════════════════════════════════════════ */
let _floatPending = [];

function _showReminderFloatPanel(pending) {
  _floatPending = pending;
  let panel = document.getElementById('reminderPanel');
  if (panel) panel.remove();

  panel           = document.createElement('div');
  panel.id        = 'reminderPanel';
  panel.className = 'reminder-panel';

  const header        = document.createElement('div');
  header.className    = 'reminder-header';
  header.innerHTML    = `<span>🔔 تذكيرات (${pending.length})</span>`;
  const closeBtn      = document.createElement('button');
  closeBtn.textContent= '✕';
  closeBtn.onclick    = () => panel.remove();
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const list       = document.createElement('div');
  list.className   = 'reminder-list';

  pending.forEach(p => {
    const item       = document.createElement('div');
    item.className   = 'reminder-item';

    const info       = document.createElement('div');
    info.className   = 'reminder-info';
    info.innerHTML   = `
      <strong>${esc(p.customer.name)}</strong>
      <span>${p.daysLeft <= 1 ? '⚠️ ينتهي غداً!' : `ينتهي خلال ${p.daysLeft} أيام`}</span>`;

    const btn        = document.createElement('button');
    btn.className    = 'btn-whatsapp';
    btn.innerHTML    = '<i class="fab fa-whatsapp"></i> إرسال';
    btn.onclick      = async () => {
      const ok = await WhatsApp.sendReminder(p.customer, p.daysLeft, p.type);
      item.classList.add('sent');
      showToast(ok
        ? `✅ تم الإرسال لـ ${p.customer.name}`
        : `📱 يُرجى الإرسال يدوياً من واتساب`, ok ? 'success' : 'warning');
    };

    item.appendChild(info);
    item.appendChild(btn);
    list.appendChild(item);
  });
  panel.appendChild(list);

  const sendAll     = document.createElement('button');
  sendAll.className = 'reminder-send-all';
  sendAll.innerHTML = '<i class="fab fa-whatsapp"></i> إرسال الكل';
  sendAll.onclick   = () => sendAllReminders();
  panel.appendChild(sendAll);

  document.body.appendChild(panel);
}

/* ─── إرسال الكل ─────────────────────────────────────────── */
async function sendAllReminders() {
  const list = _floatPending.length > 0 ? _floatPending : await _getPendingList();
  if (!list.length) { showToast('لا توجد تذكيرات معلّقة', 'info'); return; }

  let sent = 0;
  for (const p of list) {
    const ok = await WhatsApp.sendReminder(p.customer, p.daysLeft, p.type);
    if (ok) sent++;
  }

  document.getElementById('reminderPanel')?.remove();
  showToast(`✅ تم إرسال ${sent} من ${list.length} تذكير`, 'success');

  if (!document.getElementById('remindersPage')?.classList.contains('hidden')) {
    loadRemindersPage();
  }
}

async function _getPendingList() {
  const customers = await db.getAll('customers');
  const now       = new Date();
  const pending   = [];
  for (const c of customers) {
    if (c.status !== 'active') continue;
    const days = Math.ceil((new Date(c.endDate) - now) / 86400000);
    if (days >= 0 && days <= 3) {
      const type = days <= 1 ? '1d' : '3d';
      if (!(await WhatsApp.wasReminderSent(c.id, type)))
        pending.push({ customer: c, daysLeft: days, type });
    }
  }
  return pending;
}
