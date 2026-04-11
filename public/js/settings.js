/* ============================================================
   settings.js — إدارة الإعدادات (للمدير فقط)
   ============================================================ */

/* ══════════════════════════════════════════════════════════
   أنواع الاشتراكات
   ══════════════════════════════════════════════════════════ */

async function loadSubscriptionTypes() {
  const types = await db.getAll('subscriptionTypes');
  const tbody = document.getElementById('subTypesBody');
  if (!tbody) return;

  if (types.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-msg">
      <i class="fas fa-tags" style="display:block;font-size:2rem;opacity:.3;margin-bottom:.5rem"></i>
      لا توجد أنواع اشتراكات — أضف نوعاً الآن
    </td></tr>`;
    return;
  }

  tbody.innerHTML = types.map(t => `
    <tr class="${!t.active ? 'row-disabled' : ''}">
      <td><strong>${esc(t.name)}</strong></td>
      <td>${durationLabel(t.durationMonths)}</td>
      <td>${(t.costPrice || 0).toLocaleString('ar-SA')} ₪</td>
      <td>${(t.salePrice || 0).toLocaleString('ar-SA')} ₪</td>
      <td class="profit-cell">+${((t.salePrice || 0) - (t.costPrice || 0)).toLocaleString('ar-SA')} ₪</td>
      <td>
        <span class="badge ${t.active ? 'active' : 'expired'}">
          ${t.active ? 'مفعّل' : 'موقوف'}
        </span>
      </td>
      <td class="actions-cell">
        <button class="icon-btn" title="تعديل" onclick="openEditSubType(${t.id})">
          <i class="fas fa-edit" style="color:var(--primary)"></i>
        </button>
        <button class="icon-btn" title="${t.active ? 'إيقاف' : 'تفعيل'}"
          onclick="toggleSubType(${t.id}, ${!t.active})">
          <i class="fas ${t.active ? 'fa-pause-circle' : 'fa-play-circle'}"
             style="color:${t.active ? 'var(--warning)' : 'var(--success)'}"></i>
        </button>
        <button class="icon-btn" title="حذف" onclick="deleteSubType(${t.id})">
          <i class="fas fa-trash" style="color:var(--danger)"></i>
        </button>
      </td>
    </tr>`).join('');
}

/* ─── فتح مودال الإضافة ────────────────────────────────── */
function openAddSubType() {
  _resetSubTypeForm();
  document.getElementById('subTypeModalTitle').textContent = 'إضافة نوع اشتراك جديد';
  document.getElementById('subTypeModal').classList.remove('hidden');
}

/* ─── فتح مودال التعديل ────────────────────────────────── */
async function openEditSubType(id) {
  const t = await db.get('subscriptionTypes', id);
  if (!t) return;

  document.getElementById('subTypeModalTitle').textContent = 'تعديل نوع الاشتراك';
  document.getElementById('stId').value       = t.id;
  document.getElementById('stName').value     = t.name;
  document.getElementById('stDuration').value = t.durationMonths;
  document.getElementById('stCost').value     = t.costPrice;
  document.getElementById('stSale').value     = t.salePrice;
  document.getElementById('stDesc').value     = t.description || '';
  updateSubTypeProfit();
  document.getElementById('subTypeModal').classList.remove('hidden');
}

/* ─── تصفير نموذج نوع الاشتراك ──────────────────────────── */
function _resetSubTypeForm() {
  document.getElementById('stId').value       = '';
  document.getElementById('stName').value     = '';
  document.getElementById('stDuration').value = '1';
  document.getElementById('stCost').value     = '';
  document.getElementById('stSale').value     = '';
  document.getElementById('stDesc').value     = '';
  updateSubTypeProfit();
}

/* ─── معاينة الربح فورياً ────────────────────────────────── */
function updateSubTypeProfit() {
  const cost = parseFloat(document.getElementById('stCost')?.value) || 0;
  const sale = parseFloat(document.getElementById('stSale')?.value) || 0;
  const el   = document.getElementById('stProfitPreview');
  if (!el) return;
  const profit = sale - cost;
  el.textContent = `الربح: ${profit.toLocaleString('ar-SA')} ₪`;
  el.style.color = profit >= 0 ? '#065F46' : '#991B1B';
}

/* ─── حفظ نوع الاشتراك ───────────────────────────────────── */
async function saveSubType() {
  const id     = parseInt(document.getElementById('stId').value) || null;
  const name   = document.getElementById('stName').value.trim();
  const months = parseInt(document.getElementById('stDuration').value);
  const cost   = parseFloat(document.getElementById('stCost').value);
  const sale   = parseFloat(document.getElementById('stSale').value);
  const desc   = document.getElementById('stDesc').value.trim();

  if (!name)          { showToast('أدخل اسم الاشتراك', 'error'); return; }
  if (!months)        { showToast('اختر المدة', 'error'); return; }
  if (isNaN(cost))    { showToast('أدخل سعر التكلفة', 'error'); return; }
  if (isNaN(sale))    { showToast('أدخل سعر البيع', 'error'); return; }
  if (sale < cost)    { showToast('سعر البيع أقل من التكلفة!', 'warning'); }

  const data = {
    name,
    durationMonths: months,
    costPrice     : cost,
    salePrice     : sale,
    description   : desc,
    active        : true,
  };

  if (id) {
    data.id = id;
    await db.update('subscriptionTypes', data);
    showToast('✅ تم تحديث نوع الاشتراك', 'success');
  } else {
    await db.add('subscriptionTypes', data);
    showToast('✅ تم إضافة نوع الاشتراك', 'success');
  }

  closeModal('subTypeModal');
  await loadSubscriptionTypes();
}

/* ─── تفعيل / إيقاف نوع الاشتراك ───────────────────────── */
async function toggleSubType(id, newActive) {
  const t = await db.get('subscriptionTypes', id);
  if (!t) return;
  t.active = newActive;
  await db.update('subscriptionTypes', t);
  await loadSubscriptionTypes();
  showToast(newActive ? 'تم تفعيل الاشتراك' : 'تم إيقاف الاشتراك', 'info');
}

/* ─── حذف نوع الاشتراك ───────────────────────────────────── */
async function deleteSubType(id) {
  const t = await db.get('subscriptionTypes', id);
  if (!confirm(`هل تريد حذف "${t?.name || 'هذا الاشتراك'}"؟`)) return;
  await db.delete('subscriptionTypes', id);
  await loadSubscriptionTypes();
  showToast('تم حذف نوع الاشتراك', 'info');
}


/* ══════════════════════════════════════════════════════════
   إدارة المستخدمين
   ══════════════════════════════════════════════════════════ */

async function loadUsers() {
  const users = await db.getAll('users');
  const tbody = document.getElementById('usersBody');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">لا يوجد مستخدمون</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isCurrentUser = u.id === Auth.currentUser?.id;
    return `
      <tr>
        <td>
          <strong>${esc(u.name)}</strong>
          ${isCurrentUser ? '<span style="font-size:.72rem;color:var(--primary);margin-right:.4rem">(أنت)</span>' : ''}
        </td>
        <td dir="ltr">${esc(u.username)}</td>
        <td>
          <span class="badge ${u.role === 'admin' ? 'admin badge-primary' : 'active badge-success'}">
            ${u.role === 'admin' ? '👑 مدير' : '👤 موظف'}
          </span>
        </td>
        <td class="actions-cell">
          <button class="icon-btn" title="تعديل" onclick="openEditUser(${u.id})">
            <i class="fas fa-edit" style="color:var(--primary)"></i>
          </button>
          ${!isCurrentUser ? `
          <button class="icon-btn" title="حذف" onclick="deleteUser(${u.id})">
            <i class="fas fa-trash" style="color:var(--danger)"></i>
          </button>` : ''}
        </td>
      </tr>`;
  }).join('');
}

/* ─── فتح مودال إضافة مستخدم ────────────────────────────── */
function openAddUser() {
  _resetUserForm();
  document.getElementById('userModalTitle').textContent = 'إضافة مستخدم جديد';
  document.getElementById('userModal').classList.remove('hidden');
}

/* ─── فتح مودال تعديل مستخدم ────────────────────────────── */
async function openEditUser(id) {
  const u = await db.get('users', id);
  if (!u) return;
  document.getElementById('userModalTitle').textContent = 'تعديل المستخدم';
  document.getElementById('userId').value    = u.id;
  document.getElementById('userName').value  = u.name;
  document.getElementById('userUname').value = u.username;
  document.getElementById('userPass').value  = '';
  document.getElementById('userRole').value  = u.role;
  document.getElementById('userModal').classList.remove('hidden');
}

/* ─── تصفير نموذج المستخدم ───────────────────────────────── */
function _resetUserForm() {
  document.getElementById('userId').value    = '';
  document.getElementById('userName').value  = '';
  document.getElementById('userUname').value = '';
  document.getElementById('userPass').value  = '';
  document.getElementById('userRole').value  = 'employee';
}

/* ─── حفظ المستخدم ───────────────────────────────────────── */
async function saveUser() {
  const id       = parseInt(document.getElementById('userId').value) || null;
  const name     = document.getElementById('userName').value.trim();
  const username = document.getElementById('userUname').value.trim();
  const password = document.getElementById('userPass').value;
  const role     = document.getElementById('userRole').value;

  if (!name)     { showToast('أدخل الاسم الكامل', 'error'); return; }
  if (!username) { showToast('أدخل اسم الدخول', 'error'); return; }

  if (id) {
    /* تعديل مستخدم موجود */
    const existing = await db.get('users', id);
    existing.name     = name;
    existing.username = username;
    existing.role     = role;
    if (password) existing.password = btoa(password);
    await db.update('users', existing);
    showToast('✅ تم تحديث بيانات المستخدم', 'success');
  } else {
    /* إضافة مستخدم جديد */
    if (!password) { showToast('أدخل كلمة المرور للمستخدم الجديد', 'error'); return; }

    /* التحقق من عدم تكرار اسم المستخدم */
    const all    = await db.getAll('users');
    const exists = all.find(u => u.username === username);
    if (exists)  { showToast('اسم الدخول مستخدم بالفعل، اختر اسماً آخر', 'error'); return; }

    await db.add('users', {
      name, username,
      password : btoa(password),
      role,
      createdAt: new Date().toISOString(),
    });
    showToast('✅ تم إضافة المستخدم بنجاح', 'success');
  }

  closeModal('userModal');
  await loadUsers();
}

/* ─── حذف مستخدم ────────────────────────────────────────── */
async function deleteUser(id) {
  if (id === Auth.currentUser?.id) {
    showToast('لا يمكنك حذف حسابك الحالي', 'error'); return;
  }
  const u = await db.get('users', id);
  if (!confirm(`هل تريد حذف المستخدم "${u?.name || ''}"؟`)) return;
  await db.delete('users', id);
  await loadUsers();
  showToast('تم حذف المستخدم', 'info');
}


/* ══════════════════════════════════════════════════════════
   الإعدادات العامة
   ══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   قوالب الرسائل الافتراضية
══════════════════════════════════════════════════════════ */
const DEFAULT_REMINDER_TEMPLATE =
`🔔 *تذكير تجديد اشتراك*
━━━━━━━━━━━━━━━━━━━━

مرحباً *{اسم}* 👋

📋 *تفاصيل اشتراكك:*
▪️ الاشتراك: *{اشتراك}*
▪️ تاريخ الانتهاء: *{تاريخ_الانتهاء}*
▪️ الوقت المتبقي: ⏰ *{أيام_متبقية}*

اشتراكك في *{المتجر}* سينتهي قريباً.
جدّده مسبقاً واستمر بلا انقطاع 💪

━━━━━━━━━━━━━━━━━━━━
✅ *جدّد اشتراكك الآن*
📲 {رابط_التجديد}
━━━━━━━━━━━━━━━━━━━━
_{المتجر} — نسعد بخدمتك دائماً_ 🙏`;

const DEFAULT_EXPIRY_TEMPLATE =
`🔴 *انتهى اشتراكك!*
━━━━━━━━━━━━━━━━━━━━

مرحباً *{اسم}* 👋

للأسف، اشتراكك قد انتهى الآن:

📋 *تفاصيل الاشتراك المنتهي:*
▪️ الاشتراك: *{اشتراك}*
▪️ انتهى في: *{تاريخ_الانتهاء}*

🔄 جدّد الآن للاستمرار في *{المتجر}*!

━━━━━━━━━━━━━━━━━━━━
✅ *جدّد اشتراكك الآن*
📲 {رابط_التجديد}
━━━━━━━━━━━━━━━━━━━━
_{المتجر} — نسعد بخدمتك دائماً_ 🙏`;

const DEFAULT_SERVICE_TEMPLATE =
`⭐ *استفسار عن جودة الخدمة*
━━━━━━━━━━━━━━━━━━━━

مرحباً *{اسم}* 😊

نتمنى أن تكون بخير وأن خدمتنا تلبّي توقعاتك!

📋 *اشتراكك الحالي:*
▪️ الاشتراك: *{اشتراك}*
▪️ صالح حتى: *{تاريخ_الانتهاء}*

نودّ أن نطمئن عليك:
✅ هل الاشتراك يعمل بشكل جيد؟
✅ هل هناك أي مشكلة نقدر نساعدك فيها؟

━━━━━━━━━━━━━━━━━━━━
💬 ردّ علينا بأي وقت، نحن هنا لخدمتك!
_{المتجر} — رضاك يهمنا_ 🙏`;

/* ── تطبيق القالب على بيانات اشتراك ────────────────────── */
function applyTemplate(template, data, daysLeft) {
  const storeName = localStorage.getItem('storeName') || 'المتجر';
  const renewLink = localStorage.getItem('renewLink') || 'تواصل معنا لإتمام التجديد';

  let timeLeft;
  if (daysLeft === 0)      timeLeft = 'ينتهي اليوم!';
  else if (daysLeft === 1) timeLeft = 'يوم واحد متبقي فقط!';
  else if (daysLeft < 0)  timeLeft = 'انتهى الاشتراك';
  else                     timeLeft = `${daysLeft} أيام متبقية`;

  let msg = template
    .replace(/{اسم}/g,             data.name                   || '')
    .replace(/{اشتراك}/g,          data.subscriptionTypeName   || '')
    .replace(/{تاريخ_الانتهاء}/g,  (data.endDate || '').slice(0, 10))
    .replace(/{أيام_متبقية}/g,     timeLeft)
    .replace(/{المتجر}/g,          storeName)
    .replace(/{رابط_التجديد}/g,    renewLink);

  /* إيميل التفعيل: يُعرض إن وُجد، ويُحذف السطر بالكامل إن لم يوجد */
  const email = data.activationEmail || '';
  if (email) {
    msg = msg.replace(/{إيميل_التفعيل}/g, email);
  } else {
    msg = msg.replace(/[^\n]*\{إيميل_التفعيل\}[^\n]*/g, '').replace(/\n{3,}/g, '\n\n');
  }

  return msg.trim();
}

/* ── تبويب نشط ──────────────────────────────────────────── */
let _activeTab = 'reminder';

const _tabIds = {
  reminder: 'reminderTemplate',
  expiry  : 'expiryTemplate',
  service : 'serviceTemplate',
};

function switchMsgTab(tab, btn) {
  _activeTab = tab;
  document.querySelectorAll('.template-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  Object.keys(_tabIds).forEach(t => {
    document.getElementById(_tabIds[t]).style.display = t === tab ? 'block' : 'none';
  });
  /* إخفاء/إظهار select الأيام (غير مناسب لرسالة الخدمة) */
  const sel = document.getElementById('previewDaysSelect2')?.parentElement;
  if (sel) sel.style.visibility = tab === 'service' ? 'hidden' : 'visible';
  livePreviewMsg();
}

/* ── إدراج متغير في موضع المؤشر ────────────────────────── */
function insertVar(variable) {
  const ta = document.getElementById(_tabIds[_activeTab]);
  if (!ta) return;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  ta.value    = ta.value.slice(0, start) + variable + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + variable.length;
  ta.focus();
  livePreviewMsg();
}

/* ── معاينة مباشرة ──────────────────────────────────────── */
function livePreviewMsg() {
  const preview = document.getElementById('liveMsgPreview');
  if (!preview) return;

  const days    = parseInt(document.getElementById('previewDaysSelect2')?.value ?? 3);
  const now     = new Date();
  const endDate = new Date(now.getTime() + days * 86400000);

  const fakeCustomer = {
    name                : 'محمد أحمد',
    subscriptionTypeName: 'بريميوم 6 أشهر',
    endDate             : endDate.toISOString().slice(0, 10),
    activationEmail     : 'user@example.com',
  };

  const raw     = document.getElementById(_tabIds[_activeTab])?.value || '';
  const applied = applyTemplate(raw, fakeCustomer, _activeTab === 'service' ? 30 : days);

  preview.innerHTML = applied
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n/g, '<br>')
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g,   '<em>$1</em>');
}

/* ── استعادة القالب الافتراضي ───────────────────────────── */
function resetTemplate() {
  if (!confirm('هل تريد استعادة الرسالة الافتراضية؟')) return;
  const defaults = {
    reminder: DEFAULT_REMINDER_TEMPLATE,
    expiry  : DEFAULT_EXPIRY_TEMPLATE,
    service : DEFAULT_SERVICE_TEMPLATE,
  };
  document.getElementById(_tabIds[_activeTab]).value = defaults[_activeTab];
  livePreviewMsg();
  showToast('تم استعادة الرسالة الافتراضية', 'info');
}

/* ══════════════════════════════════════════════════════════
   الإعدادات العامة
══════════════════════════════════════════════════════════ */
function loadGeneralSettings() {
  const get = key => localStorage.getItem(key) || '';
  document.getElementById('settingStoreName').value = get('storeName');
  document.getElementById('settingRenewLink').value = get('renewLink');
  document.getElementById('settingSheetsUrl').value = get('sheetsUrl');

  /* تحميل قوالب الرسائل */
  document.getElementById('reminderTemplate').value =
    get('reminderTemplate') || DEFAULT_REMINDER_TEMPLATE;
  document.getElementById('expiryTemplate').value =
    get('expiryTemplate') || DEFAULT_EXPIRY_TEMPLATE;
  document.getElementById('serviceTemplate').value =
    get('serviceTemplate') || DEFAULT_SERVICE_TEMPLATE;

  /* معاينة أولية */
  setTimeout(livePreviewMsg, 100);
}

function saveGeneralSettings() {
  const fields = {
    storeName: 'settingStoreName',
    renewLink: 'settingRenewLink',
    sheetsUrl: 'settingSheetsUrl',
  };
  for (const [key, elId] of Object.entries(fields)) {
    localStorage.setItem(key, document.getElementById(elId)?.value.trim() || '');
  }
  /* حفظ القوالب */
  localStorage.setItem('reminderTemplate',
    document.getElementById('reminderTemplate')?.value || DEFAULT_REMINDER_TEMPLATE);
  localStorage.setItem('expiryTemplate',
    document.getElementById('expiryTemplate')?.value || DEFAULT_EXPIRY_TEMPLATE);
  localStorage.setItem('serviceTemplate',
    document.getElementById('serviceTemplate')?.value || DEFAULT_SERVICE_TEMPLATE);

  /* إعادة مزامنة مع السيرفر */
  WhatsApp.syncCustomers();
  showToast('✅ تم حفظ الإعدادات بنجاح', 'success');
}

/* ─── واتساب: QR يُعرَض تلقائياً عبر Socket.io ──────────── */

/* تُستدعى من app.js عند فتح صفحة الإعدادات */
function refreshWaStatus() {
  /* الحالة تأتي من السوكيت — نعرض حالة الانتظار مؤقتاً */
  const section = document.getElementById('waQrSection');
  if (!section) return;

  if (WhatsApp._connected) {
    _onWaReady();
  } else if (WhatsApp._socket?.connected) {
    /* السوكيت متصل لكن واتساب لم يتحقق بعد */
    _onWaLoading();
  } else {
    section.innerHTML = `
      <div class="wa-offline">
        <div style="font-size:2.5rem;margin-bottom:.75rem">🔌</div>
        <h4>السيرفر غير متاح</h4>
        <p>تأكد أن السيرفر يعمل على المنفذ 3001</p>
      </div>`;
  }
}

async function disconnectWa() {
  if (!confirm('هل تريد قطع اتصال واتساب؟')) return;
  try {
    await fetch('/disconnect', { method: 'POST' });
    showToast('تم قطع اتصال واتساب', 'info');
  } catch {
    showToast('تعذّر الاتصال بالسيرفر', 'error');
  }
}

/* ─── اختبار اتصال Google Sheets ────────────────────────── */
async function testSheetsConnection() {
  const url = document.getElementById('settingSheetsUrl')?.value.trim();
  if (!url) { showToast('أدخل رابط Apps Script أولاً', 'error'); return; }

  const btn = document.querySelector('[onclick="testSheetsConnection()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ الاختبار…'; }

  try {
    await fetch(url, {
      method : 'POST',
      mode   : 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ type: 'test', timestamp: Date.now() }),
    });
    showToast('✅ تم الاتصال بـ Google Sheets بنجاح', 'success');
  } catch (err) {
    showToast('❌ تعذّر الاتصال: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plug"></i> اختبار'; }
  }
}

/* ─── معاينة رسالة التذكير ───────────────────────────────── */
function previewReminderMsg() {
  const box  = document.getElementById('msgPreviewBox');
  const text = document.getElementById('msgPreviewText');
  if (!box || !text) return;

  const days = parseInt(document.getElementById('previewDaysSelect')?.value ?? 3);

  /* عميل وهمي للمعاينة */
  const now = new Date();
  const endDate   = new Date(now);
  endDate.setDate(now.getDate() + days);

  const fakeCustomer = {
    name                : 'محمد أحمد',
    subscriptionTypeName: 'بريميوم 6 أشهر',
    endDate             : endDate.toISOString().slice(0, 10),
    whatsapp            : '972501234567',
  };

  const msg = WhatsApp.buildMessage(fakeCustomer, days);

  /* عرض بتنسيق فقاعة واتساب */
  text.innerHTML = msg
    .replace(/\n/g, '<br>')
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>');

  box.classList.remove('hidden');
}

/* ─── تشغيل الجدولة فوراً (للاختبار) ───────────────────── */
async function triggerSchedulerNow() {
  const btn = document.querySelector('[onclick="triggerSchedulerNow()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ الإرسال...'; }

  /* مزامنة العملاء أولاً */
  await WhatsApp.syncCustomers();

  try {
    const res  = await fetch('/run-scheduler', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ تم تشغيل الجدولة — ${data.customers} عميل في القائمة`, 'success');
    } else {
      showToast('⚠️ ' + (data.error || 'واتساب غير متصل'), 'warning');
    }
  } catch {
    showToast('❌ تعذّر الاتصال بالسيرفر', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال التذكيرات الآن';
    }
  }
}

/* ─── مسح سجل الإرسال (للاختبار المتكرر) ───────────────── */
async function clearReminderLog() {
  if (!confirm('سيُمكّنك هذا من إعادة إرسال التذكيرات لنفس العملاء.\nهل تريد المتابعة؟')) return;

  /* مسح سجل السيرفر */
  try {
    await fetch('/clear-reminders', { method: 'POST' });
  } catch { /* السيرفر غير متاح */ }

  /* مسح سجل المتصفح (IndexedDB) */
  try {
    const all = await db.getAll('reminderLog');
    for (const r of all) await db.delete('reminderLog', r.id);
  } catch { /* تجاهل */ }

  showToast('✅ تم مسح سجل التذكيرات — يمكنك إعادة الإرسال الآن', 'success');
}
