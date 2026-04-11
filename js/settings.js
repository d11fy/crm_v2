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

function loadGeneralSettings() {
  const get = key => localStorage.getItem(key) || '';
  document.getElementById('settingStoreName').value = get('storeName');
  document.getElementById('settingRenewLink').value = get('renewLink');
  document.getElementById('settingSheetsUrl').value = get('sheetsUrl');
  document.getElementById('settingWaServer').value  = get('waServerUrl');
}

function saveGeneralSettings() {
  const fields = {
    storeName  : 'settingStoreName',
    renewLink  : 'settingRenewLink',
    sheetsUrl  : 'settingSheetsUrl',
    waServerUrl: 'settingWaServer',
  };
  for (const [key, elId] of Object.entries(fields)) {
    localStorage.setItem(key, document.getElementById(elId)?.value.trim() || '');
  }
  showToast('✅ تم حفظ الإعدادات بنجاح', 'success');
}

/* ─── واتساب: تحديث الحالة وعرض QR ──────────────────────── */
let _waQrInterval = null;

async function refreshWaStatus() {
  const section = document.getElementById('waQrSection');
  if (!section) return;

  section.innerHTML = `
    <div class="spinner" style="margin:0 auto .75rem"></div>
    <p style="text-align:center;color:var(--text-muted);font-size:.85rem">جارٍ الفحص...</p>`;

  const data = await WhatsApp.getQR();

  if (data.connected) {
    _clearQrInterval();
    section.innerHTML = `
      <div class="wa-connected">
        <div class="wa-connected-icon">✅</div>
        <h4>واتساب متصل!</h4>
        <p>النظام يرسل التذكيرات تلقائياً بالكامل</p>
        <button class="btn btn-danger btn-sm" onclick="disconnectWa()" style="margin-top:.75rem">
          <i class="fas fa-unlink"></i> قطع الاتصال
        </button>
      </div>`;
    const badge = document.getElementById('waBadge');
    if (badge) { badge.textContent = '● متصل'; badge.style.color = 'var(--success)'; }
    return;
  }

  if (data.qr) {
    section.innerHTML = `
      <p style="text-align:center;font-size:.85rem;color:var(--text-muted);margin-bottom:.75rem">
        <strong>امسح الكود بهاتفك:</strong><br>
        واتساب ← الأجهزة المرتبطة ← ربط جهاز
      </p>
      <div style="text-align:center">
        <img src="${data.qr}" alt="QR Code"
          style="max-width:220px;border-radius:12px;border:3px solid var(--border)" />
      </div>
      <p style="text-align:center;margin-top:.75rem;font-size:.8rem;color:var(--warning)">
        ⏳ QR يتجدد كل 60 ثانية
      </p>`;
    _startQrAutoRefresh();
    const badge = document.getElementById('waBadge');
    if (badge) { badge.textContent = '● في انتظار المسح'; badge.style.color = 'var(--warning)'; }
    return;
  }

  /* السيرفر غير متاح */
  section.innerHTML = `
    <div class="wa-offline">
      <div style="font-size:2.5rem;margin-bottom:.75rem">🔌</div>
      <h4>السيرفر غير متاح</h4>
      <p>شغّل السيرفر أولاً ثم اضغط تحديث</p>
      <div class="wa-cmd-box">
        <code>cd "${window.location.pathname.replace('/index.html','').replace(/\//g,'\\')}"</code><br>
        <code>npm install</code><br>
        <code>node server.js</code>
      </div>
    </div>`;
  const badge = document.getElementById('waBadge');
  if (badge) { badge.textContent = '● غير متاح'; badge.style.color = 'var(--danger)'; }
}

function _startQrAutoRefresh() {
  _clearQrInterval();
  _waQrInterval = setInterval(refreshWaStatus, 30000); /* تحديث كل 30 ث */
}
function _clearQrInterval() {
  if (_waQrInterval) { clearInterval(_waQrInterval); _waQrInterval = null; }
}

async function testWaConnection() {
  const url = document.getElementById('settingWaServer')?.value.trim();
  if (!url) { showToast('أدخل رابط السيرفر أولاً', 'error'); return; }
  try {
    const base = url.replace('/send', '');
    const res  = await fetch(base + '/status', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (data.connected) {
      showToast('✅ السيرفر متصل وواتساب جاهز!', 'success');
    } else {
      showToast('⚠️ السيرفر يعمل لكن واتساب غير متصل — امسح QR', 'warning');
    }
  } catch {
    showToast('❌ السيرفر غير متاح — شغّل node server.js', 'error');
  }
}

async function disconnectWa() {
  if (!confirm('هل تريد قطع اتصال واتساب؟')) return;
  const base = (localStorage.getItem('waServerUrl') || 'http://localhost:3001/send').replace('/send', '');
  try {
    await fetch(base + '/disconnect');
    showToast('تم قطع اتصال واتساب', 'info');
    await refreshWaStatus();
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
