/* ============================================================
   whatsapp.js — واجهة واتساب (v3)
   ============================================================ */

const WhatsApp = {
  SERVER_URL : window.location.origin,
  _socket    : null,
  _connected : false,

  /* ─── الاتصال بالسوكيت ──────────────────────────────── */
  initSocket() {
    if (this._socket) return;
    this._socket = io(this.SERVER_URL, { transports: ['websocket', 'polling'] });

    this._socket.on('connect', () => { console.log('🔌 متصل بسوكيت السيرفر'); });

    this._socket.on('wa-ready', () => {
      this._connected = true;
      this._updateBadge(true);
      _onWaReady();
    });

    this._socket.on('wa-qr', (data) => {
      this._connected = false;
      this._updateBadge(false, 'scanning');
      _onWaQR(data.qr, data.attempt);
    });

    this._socket.on('wa-loading', () => {
      this._connected = false;
      this._updateBadge(false, 'loading');
      _onWaLoading();
    });

    this._socket.on('wa-disconnected', (data) => {
      this._connected = false;
      this._updateBadge(false);
      _onWaDisconnected(data.reason);
    });

    this._socket.on('reminders-sent', (data) => {
      showToast(`✅ أُرسل ${data.count} تذكير تلقائي`, 'success');
    });

    /* انتهاء اشتراك من السيرفر */
    this._socket.on('subscription-expired', async (data) => {
      try {
        const s = await db.get('subscriptions', data.subId);
        if (s && s.status === 'active') {
          s.status = 'expired';
          await db.update('subscriptions', s);

          const custPage = document.getElementById('customersPage');
          if (custPage && !custPage.classList.contains('hidden')) loadCustomers();

          const dashPage = document.getElementById('dashboardPage');
          if (dashPage && !dashPage.classList.contains('hidden')) loadDashboard();

          WhatsApp.syncCustomers();
          const c = await db.get('customers', s.customerId);
          showToast(`🔴 انتهى اشتراك ${c?.name || ''} — تم إرسال إشعار واتساب`, 'warning');
        }
      } catch (e) { console.error(e); }
    });
  },

  /* ─── تحديث شارة الاتصال ─────────────────────────── */
  _updateBadge(connected, state) {
    const badge = document.getElementById('waBadge');
    if (!badge) return;
    if (connected) {
      badge.textContent = '● متصل';
      badge.style.color = 'var(--success)';
    } else if (state === 'scanning') {
      badge.textContent = '● في انتظار المسح';
      badge.style.color = 'var(--warning)';
    } else if (state === 'loading') {
      badge.textContent = '● جارٍ التشغيل';
      badge.style.color = 'var(--primary)';
    } else {
      badge.textContent = '● غير متصل';
      badge.style.color = 'var(--danger)';
    }
  },

  /* ─── مزامنة الاشتراكات النشطة مع السيرفر ──────────── */
  async syncCustomers() {
    try {
      const [customers, subscriptions] = await Promise.all([
        db.getAll('customers'),
        db.getAll('subscriptions'),
      ]);
      const custMap = {};
      customers.forEach(c => { custMap[c.id] = c; });

      /* إرسال الاشتراكات النشطة مع بيانات العميل */
      const payload = subscriptions
        .filter(s => s.status === 'active')
        .map(s => ({
          subId               : s.id,
          customerId          : s.customerId,
          customerName        : custMap[s.customerId]?.name     || '',
          whatsapp            : custMap[s.customerId]?.whatsapp || '',
          subscriptionTypeName: s.subscriptionTypeName,
          endDate             : s.endDate,
          activationEmail     : s.activationEmail || '',
          status              : s.status,
        }));

      const settings = {
        storeName       : localStorage.getItem('storeName')        || 'المتجر',
        renewLink       : localStorage.getItem('renewLink')        || '',
        reminderTemplate: localStorage.getItem('reminderTemplate') || '',
        expiryTemplate  : localStorage.getItem('expiryTemplate')   || '',
        serviceTemplate : localStorage.getItem('serviceTemplate')  || '',
      };

      await fetch(this.SERVER_URL + '/sync-customers', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ customers: payload, settings }),
      });
    } catch { /* السيرفر غير متاح */ }
  },

  /* ─── بناء رسائل من القوالب ─────────────────────────── */
  buildMessage(msgData, daysLeft) {
    const tpl = localStorage.getItem('reminderTemplate') ||
      (typeof DEFAULT_REMINDER_TEMPLATE !== 'undefined' ? DEFAULT_REMINDER_TEMPLATE : '{اسم} — {أيام_متبقية}');
    return applyTemplate(tpl, msgData, daysLeft);
  },

  buildExpiryMessage(msgData) {
    const tpl = localStorage.getItem('expiryTemplate') ||
      (typeof DEFAULT_EXPIRY_TEMPLATE !== 'undefined' ? DEFAULT_EXPIRY_TEMPLATE : '{اسم} — انتهى اشتراكك');
    return applyTemplate(tpl, msgData, 0);
  },

  buildServiceMessage(msgData) {
    const tpl = localStorage.getItem('serviceTemplate') ||
      (typeof DEFAULT_SERVICE_TEMPLATE !== 'undefined' ? DEFAULT_SERVICE_TEMPLATE : 'مرحباً {اسم}، كيف الخدمة؟');
    return applyTemplate(tpl, msgData, 30);
  },

  /* ─── فتح wa.me ─────────────────────────────────────── */
  openWhatsApp(phone, message) {
    const clean = String(phone || '').replace(/\D/g, '');
    if (!clean) { showToast('رقم الواتساب غير صحيح', 'error'); return; }
    window.open(
      `https://wa.me/${clean}${message ? '?text=' + encodeURIComponent(message) : ''}`,
      '_blank'
    );
  },

  /* ─── إرسال عبر السيرفر ─────────────────────────────── */
  async sendViaServer(phone, message) {
    try {
      const res  = await fetch(this.SERVER_URL + '/send', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ phone, message }),
      });
      const data = await res.json();
      return data.success === true;
    } catch { return false; }
  },

  /* ─── منع تكرار الإرسال (subId + type) ──────────────── */
  _key(subId, type) { return `reminder_${subId}_${type}`; },

  async wasReminderSent(subId, type) {
    try {
      const logs = await db.getByIndex('reminderLog', 'key', this._key(subId, type));
      return logs.length > 0;
    } catch { return false; }
  },

  async markReminderSent(subId, type) {
    try {
      await db.add('reminderLog', {
        key   : this._key(subId, type),
        sentAt: new Date().toISOString(),
      });
    } catch { /* مكرر */ }
  },

  /* ─── إرسال تذكير واحد ──────────────────────────────── */
  async sendReminder(msgData, daysLeft, type, subId) {
    const message = this.buildMessage(msgData, daysLeft);
    const ok      = await this.sendViaServer(msgData.whatsapp, message);

    if (!ok) this.openWhatsApp(msgData.whatsapp, message);
    await this.markReminderSent(subId, type);
    return ok;
  },

  /* ─── بدء النظام ────────────────────────────────────── */
  start() {
    this.initSocket();
    this.syncCustomers();
    setInterval(() => this.syncCustomers(), 2 * 60 * 1000);
  },
};

/* ══════════════════════════════════════════════════════════
   تحديث UI بناءً على حالة واتساب
══════════════════════════════════════════════════════════ */

function _onWaReady() {
  const section = document.getElementById('waQrSection');
  if (!section) return;
  section.innerHTML = `
    <div class="wa-connected">
      <div class="wa-connected-icon">✅</div>
      <h4>واتساب متصل!</h4>
      <p>النظام يرسل التذكيرات تلقائياً لكل العملاء</p>
      <button class="btn btn-danger btn-sm" onclick="disconnectWa()" style="margin-top:.75rem">
        <i class="fas fa-unlink"></i> قطع الاتصال
      </button>
    </div>`;
  const badge = document.getElementById('waBadge');
  if (badge) { badge.textContent = '● متصل'; badge.style.color = 'var(--success)'; }
}

function _onWaQR(qrImg, attempt) {
  const section = document.getElementById('waQrSection');
  if (!section) return;
  section.innerHTML = `
    <p style="text-align:center;font-size:.85rem;color:var(--text-muted);margin-bottom:.75rem">
      <strong>امسح الكود بهاتفك:</strong><br>
      واتساب ← الأجهزة المرتبطة ← ربط جهاز
      ${attempt > 1 ? `<br><span style="color:var(--warning)">محاولة ${attempt}</span>` : ''}
    </p>
    <div style="text-align:center">
      <img src="${qrImg}" alt="QR Code"
        style="max-width:220px;border-radius:12px;border:3px solid var(--border)" />
    </div>
    <p style="text-align:center;margin-top:.75rem;font-size:.8rem;color:var(--warning)">
      ⏳ QR يتجدد تلقائياً عند انتهاء الصلاحية
    </p>`;
}

function _onWaLoading() {
  const section = document.getElementById('waQrSection');
  if (!section) return;
  section.innerHTML = `
    <div class="spinner" style="margin:0 auto .75rem"></div>
    <p style="text-align:center;color:var(--text-muted);font-size:.85rem">جارٍ تشغيل واتساب...</p>`;
}

function _onWaDisconnected(reason) {
  const section = document.getElementById('waQrSection');
  if (!section) return;
  const isManual = reason === 'manual';
  section.innerHTML = `
    <div class="wa-offline">
      <div style="font-size:2.5rem;margin-bottom:.75rem">🔌</div>
      <h4>${isManual ? 'تم قطع الاتصال' : 'انقطع الاتصال'}</h4>
      <p>${isManual ? 'أعِد تشغيل السيرفر لإعادة الربط' : 'جارٍ إعادة الاتصال تلقائياً...'}</p>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   لوحة التذكيرات العائمة
══════════════════════════════════════════════════════════ */
let _floatPending = [];

function _showReminderFloatPanel(pending) {
  _floatPending = pending;
  let panel = document.getElementById('reminderPanel');
  if (panel) panel.remove();

  panel           = document.createElement('div');
  panel.id        = 'reminderPanel';
  panel.className = 'reminder-panel';

  const header     = document.createElement('div');
  header.className = 'reminder-header';
  header.innerHTML = `<span>🔔 تذكيرات (${pending.length})</span>`;
  const closeBtn   = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => panel.remove();
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const list = document.createElement('div');
  list.className = 'reminder-list';

  pending.forEach(p => {
    const item     = document.createElement('div');
    item.className = 'reminder-item';

    const info     = document.createElement('div');
    info.className = 'reminder-info';
    info.innerHTML = `
      <strong>${esc(p.customer.name)}</strong>
      <span>${p.daysLeft <= 1 ? '⚠️ ينتهي غداً!' : `ينتهي خلال ${p.daysLeft} أيام`}</span>`;

    const btn     = document.createElement('button');
    btn.className = 'btn-whatsapp';
    btn.innerHTML = '<i class="fab fa-whatsapp"></i> إرسال';
    btn.onclick   = async () => {
      const ok = await WhatsApp.sendReminder(p.customer, p.daysLeft, p.type, p.subId);
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

async function sendAllReminders() {
  const list = _floatPending.length > 0 ? _floatPending : await _getPendingList();
  if (!list.length) { showToast('لا توجد تذكيرات معلّقة', 'info'); return; }

  let sent = 0;
  for (const p of list) {
    const ok = await WhatsApp.sendReminder(p.customer, p.daysLeft, p.type, p.subId);
    if (ok) sent++;
  }

  document.getElementById('reminderPanel')?.remove();
  showToast(`✅ تم إرسال ${sent} من ${list.length} تذكير`, 'success');

  if (!document.getElementById('remindersPage')?.classList.contains('hidden')) {
    loadRemindersPage();
  }
}

async function _getPendingList() {
  const [subs, customers] = await Promise.all([
    db.getAll('subscriptions'),
    db.getAll('customers'),
  ]);
  const custMap = {};
  customers.forEach(c => { custMap[c.id] = c; });

  const now     = new Date();
  const pending = [];

  for (const s of subs) {
    if (s.status !== 'active') continue;
    const cust = custMap[s.customerId];
    if (!cust) continue;
    const days = Math.ceil((new Date(s.endDate) - now) / 86400000);
    if (days >= 0 && days <= 3) {
      const type = days <= 1 ? '1d' : '3d';
      if (!(await WhatsApp.wasReminderSent(s.id, type))) {
        pending.push({
          customer: {
            name                : cust.name,
            whatsapp            : cust.whatsapp,
            subscriptionTypeName: s.subscriptionTypeName,
            endDate             : s.endDate,
            activationEmail     : s.activationEmail || '',
          },
          subId: s.id,
          daysLeft: days,
          type,
        });
      }
    }
  }
  return pending;
}
