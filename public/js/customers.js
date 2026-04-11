/* ============================================================
   customers.js — إدارة العملاء والاشتراكات (v3)
   ============================================================ */

let allCustomers      = [];
let allSubscriptions  = [];
let customerFilter    = { search: '', status: 'all' };
let _subRowIdx        = 0;
let _subTypes         = [];
let _editSubData      = null; /* بيانات الاشتراك تحت التعديل */

/* ─── تحميل جميع العملاء والاشتراكات ───────────────────── */
async function loadCustomers() {
  [allCustomers, allSubscriptions] = await Promise.all([
    db.getAll('customers'),
    db.getAll('subscriptions'),
  ]);
  allCustomers.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  renderCustomers();
}

/* ─── رسم جدول العملاء ─────────────────────────────────── */
function renderCustomers() {
  const q   = customerFilter.search.toLowerCase().trim();
  const st  = customerFilter.status;
  const now = new Date();

  let list = [...allCustomers];
  if (q) list = list.filter(c =>
    (c.name     || '').toLowerCase().includes(q) ||
    (c.whatsapp || '').includes(q)
  );

  /* فلترة حسب الحالة */
  if (st !== 'all') {
    list = list.filter(c => {
      const subs   = allSubscriptions.filter(s => s.customerId === c.id);
      const active = subs.filter(s => s.status === 'active');
      if (st === 'active')    return active.length > 0;
      if (st === 'expired')   return active.length === 0 && subs.length > 0;
      if (st === 'cancelled') return subs.length === 0;
      return true;
    });
  }

  const tbody = document.getElementById('customersBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-msg">
      <i class="fas fa-search" style="display:block;font-size:2rem;opacity:.3;margin-bottom:.5rem"></i>
      لا توجد نتائج
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const subs   = allSubscriptions.filter(s => s.customerId === c.id);
    const active = subs.filter(s => s.status === 'active');

    /* أقرب اشتراك نشط للانتهاء */
    let soonestSub  = null;
    let soonestDays = Infinity;
    for (const s of active) {
      const d = Math.ceil((new Date(s.endDate) - now) / 86400000);
      if (d < soonestDays) { soonestDays = d; soonestSub = s; }
    }

    let statusBadge = '';
    if (active.length === 0 && subs.length > 0) {
      statusBadge = '<span class="badge expired">منتهية</span>';
    } else if (soonestSub) {
      if (soonestDays < 0)       statusBadge = '<span class="badge expired">منتهي</span>';
      else if (soonestDays <= 3) statusBadge = '<span class="badge warning">ينتهي قريباً</span>';
      else                        statusBadge = '<span class="badge active">نشط</span>';
    } else {
      statusBadge = '<span class="badge cancelled" style="background:#94A3B8">لا اشتراكات</span>';
    }

    const nextExpiry = soonestSub ? soonestSub.endDate.slice(0, 10) : '—';

    return `
      <tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td dir="ltr">${esc(c.whatsapp)}</td>
        <td>
          <span style="font-weight:600">${subs.length}</span>
          <span style="color:var(--text-muted);font-size:.8rem"> (${active.length} نشط)</span>
        </td>
        <td>${statusBadge}</td>
        <td>${nextExpiry}</td>
        <td class="actions-cell">
          <button class="icon-btn" title="عرض الاشتراكات" onclick="openCustomerDetail(${c.id})">
            <i class="fas fa-eye" style="color:var(--info)"></i>
          </button>
          <button class="icon-btn" title="إرسال واتساب" onclick="whatsappCustomer(${c.id})">
            <i class="fab fa-whatsapp" style="color:var(--whatsapp)"></i>
          </button>
          <button class="icon-btn" title="تعديل" onclick="openEditCustomer(${c.id})">
            <i class="fas fa-edit" style="color:var(--primary)"></i>
          </button>
          <button class="icon-btn" title="حذف" onclick="deleteCustomer(${c.id})">
            <i class="fas fa-trash" style="color:var(--danger)"></i>
          </button>
        </td>
      </tr>`;
  }).join('');
}

/* ─── واتساب: رسالة تلقائية حسب حالة أقرب اشتراك ─────── */
async function whatsappCustomer(customerId) {
  const c    = allCustomers.find(x => x.id === customerId);
  if (!c) return;

  const subs   = allSubscriptions.filter(s => s.customerId === customerId);
  const active = subs.filter(s => s.status === 'active');

  /* أقرب اشتراك نشط للانتهاء */
  const now = new Date();
  let sub = null;
  if (active.length > 0) {
    sub = active.sort((a, b) => new Date(a.endDate) - new Date(b.endDate))[0];
  } else if (subs.length > 0) {
    sub = subs.sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  }

  if (!sub) { showToast('لا توجد اشتراكات لهذا العميل', 'warning'); return; }

  const days    = Math.ceil((new Date(sub.endDate) - now) / 86400000);
  const msgData = _buildMsgData(c, sub);

  let message, label;
  if (days < 0) {
    message = WhatsApp.buildExpiryMessage(msgData);
    label   = 'انتهاء اشتراك';
  } else if (days <= 3) {
    message = WhatsApp.buildMessage(msgData, days);
    label   = 'تذكير تجديد';
  } else {
    message = WhatsApp.buildServiceMessage(msgData);
    label   = 'استفسار خدمة';
  }

  const sent = await WhatsApp.sendViaServer(c.whatsapp, message);
  if (sent) showToast(`✅ تم إرسال ${label} لـ ${c.name}`, 'success');
  else      WhatsApp.openWhatsApp(c.whatsapp, message);
}

/* ─── بناء كائن بيانات الرسالة ────────────────────────── */
function _buildMsgData(customer, subscription) {
  return {
    name                : customer.name,
    whatsapp            : customer.whatsapp,
    subscriptionTypeName: subscription.subscriptionTypeName,
    endDate             : subscription.endDate,
    activationEmail     : subscription.activationEmail || '',
  };
}

/* ════════════════════════════════════════════════════════════
   مودال إضافة طلب جديد (عميل + اشتراكات)
════════════════════════════════════════════════════════════ */

async function openAddOrder() {
  _subTypes = (await db.getAll('subscriptionTypes')).filter(t => t.active);
  _subRowIdx = 0;

  document.getElementById('orderModalTitle').textContent = 'إضافة طلب جديد';
  document.getElementById('ordCustId').value       = '';
  document.getElementById('ordCustName').value     = '';
  document.getElementById('ordCustWhatsapp').value = '';
  document.getElementById('ordCustNotes').value    = '';

  /* تمكين حقول العميل (قد تكون readonly من تدفق آخر) */
  ['ordCustName','ordCustWhatsapp','ordCustNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.readOnly = false;
  });

  const container = document.getElementById('subscriptionRowsContainer');
  container.innerHTML = '';
  addSubscriptionRow();

  document.getElementById('orderModal').classList.remove('hidden');
}

/* ─── إضافة سطر اشتراك في المودال ──────────────────────── */
function addSubscriptionRow() {
  const idx   = _subRowIdx++;
  const today = new Date().toISOString().slice(0, 10);

  const typeOptions = _subTypes.map(t =>
    `<option value="${t.id}"
       data-cost="${t.costPrice}"
       data-sale="${t.salePrice}"
       data-months="${t.durationMonths}">
      ${esc(t.name)} — ${t.salePrice.toLocaleString('ar-SA')} ₪ (${durationLabel(t.durationMonths)})
    </option>`
  ).join('');

  const div = document.createElement('div');
  div.className = 'sub-entry-row';
  div.id        = `subRow-${idx}`;
  div.innerHTML = `
    <div class="sub-entry-header">
      <div class="sub-entry-label"><i class="fas fa-tag"></i> اشتراك ${idx + 1}</div>
      <button type="button" class="btn btn-sm btn-danger sub-remove-btn"
        onclick="removeSubRow(${idx})"><i class="fas fa-times"></i> حذف</button>
    </div>

    <div class="form-grid">
      <div class="form-group">
        <label>نوع الاشتراك *</label>
        <select id="subType-${idx}" onchange="onSubTypeChange(${idx})">
          <option value="">— اختر نوع الاشتراك —</option>
          ${typeOptions}
        </select>
      </div>
      <div class="form-group">
        <label>تاريخ البداية *</label>
        <input type="date" id="subStart-${idx}" value="${today}" oninput="calcEndDate(${idx})" />
      </div>
    </div>

    <div class="sub-entry-prices">
      <div class="form-group">
        <label>تاريخ النهاية <span class="hint-muted">(تلقائي)</span></label>
        <input type="text" id="subEnd-${idx}" readonly class="input-readonly" placeholder="يُحسب تلقائياً" />
      </div>
      <div class="form-group">
        <label>السعر الأصلي ₪ <span class="hint-muted">(مرجع)</span></label>
        <input type="number" id="subOriginalPrice-${idx}" readonly class="input-readonly" placeholder="—" />
      </div>
      <div class="form-group">
        <label style="color:var(--success);font-weight:600">سعر البيع الفعلي ₪ *</label>
        <input type="number" id="subSalePrice-${idx}" placeholder="0" min="0" step="0.01"
          oninput="calcSubProfit(${idx})" />
      </div>
      <div class="form-group">
        <label>سعر التكلفة ₪</label>
        <input type="number" id="subCostPrice-${idx}" readonly class="input-readonly" placeholder="—" />
      </div>
    </div>

    <div class="sub-entry-bottom">
      <div class="form-group">
        <label>صافي الربح ₪ <span class="hint-muted">(تلقائي)</span></label>
        <div class="profit-preview-box" id="subProfitPreview-${idx}">—</div>
      </div>
      <div class="form-group">
        <label><i class="fas fa-envelope"></i> إيميل التفعيل <span class="hint-muted">(اختياري)</span></label>
        <input type="email" id="subEmail-${idx}" placeholder="example@gmail.com" dir="ltr" />
      </div>
    </div>`;

  document.getElementById('subscriptionRowsContainer').appendChild(div);
  _updateRemoveBtns();
}

function removeSubRow(idx) {
  document.getElementById(`subRow-${idx}`)?.remove();
  _updateRemoveBtns();
}

function _updateRemoveBtns() {
  const rows = document.querySelectorAll('.sub-entry-row');
  rows.forEach(row => {
    const btn = row.querySelector('.sub-remove-btn');
    if (btn) btn.style.display = rows.length <= 1 ? 'none' : '';
  });
}

/* ─── تغيير نوع الاشتراك: تعبئة الأسعار والمدة ──────── */
function onSubTypeChange(idx) {
  const sel = document.getElementById(`subType-${idx}`);
  const opt = sel?.selectedOptions[0];
  if (!opt || !opt.value) {
    document.getElementById(`subOriginalPrice-${idx}`).value  = '';
    document.getElementById(`subCostPrice-${idx}`).value      = '';
    document.getElementById(`subEnd-${idx}`).value            = '';
    const pp = document.getElementById(`subProfitPreview-${idx}`);
    if (pp) { pp.textContent = '—'; pp.style.color = ''; }
    return;
  }
  document.getElementById(`subOriginalPrice-${idx}`).value = opt.dataset.sale;
  document.getElementById(`subCostPrice-${idx}`).value     = opt.dataset.cost;
  calcEndDate(idx);
  calcSubProfit(idx);
}

/* ─── حساب تاريخ النهاية ────────────────────────────── */
function calcEndDate(idx) {
  const sel    = document.getElementById(`subType-${idx}`);
  const opt    = sel?.selectedOptions[0];
  const months = opt && opt.value ? parseInt(opt.dataset.months) : null;
  const start  = document.getElementById(`subStart-${idx}`)?.value;
  const endEl  = document.getElementById(`subEnd-${idx}`);
  if (!endEl) return;
  if (!start || months === null) { endEl.value = ''; return; }
  endEl.value = addMonths(start, months);
}

/* ─── حساب صافي الربح ─────────────────────────────── */
function calcSubProfit(idx) {
  const sale   = parseFloat(document.getElementById(`subSalePrice-${idx}`)?.value)    || 0;
  const cost   = parseFloat(document.getElementById(`subCostPrice-${idx}`)?.value)    || 0;
  const profit = sale - cost;
  const el     = document.getElementById(`subProfitPreview-${idx}`);
  if (!el) return;
  el.textContent = (profit >= 0 ? '+' : '') + profit.toLocaleString('ar-SA') + ' ₪';
  el.style.color  = profit >= 0 ? '#065F46' : '#991B1B';
}

/* ─── حفظ الطلب (عميل + اشتراكات) ─────────────────── */
async function saveOrder() {
  const custId = parseInt(document.getElementById('ordCustId').value) || null;
  const name   = document.getElementById('ordCustName').value.trim();
  const phone  = document.getElementById('ordCustWhatsapp').value.trim();
  const notes  = document.getElementById('ordCustNotes').value.trim();

  if (!name)  { showToast('أدخل اسم العميل', 'error'); return; }
  if (!phone) { showToast('أدخل رقم الواتساب', 'error'); return; }

  /* جمع بيانات سطور الاشتراكات */
  const rows    = document.querySelectorAll('.sub-entry-row');
  const subsData = [];

  for (const row of rows) {
    const idx = row.id.replace('subRow-', '');
    const typeId   = parseInt(document.getElementById(`subType-${idx}`)?.value);
    const startDate= document.getElementById(`subStart-${idx}`)?.value;
    const endDate  = document.getElementById(`subEnd-${idx}`)?.value;
    const origP    = parseFloat(document.getElementById(`subOriginalPrice-${idx}`)?.value) || 0;
    const saleP    = parseFloat(document.getElementById(`subSalePrice-${idx}`)?.value);
    const costP    = parseFloat(document.getElementById(`subCostPrice-${idx}`)?.value)    || 0;
    const email    = document.getElementById(`subEmail-${idx}`)?.value.trim()             || '';

    if (!typeId)                          { showToast('اختر نوع الاشتراك', 'error'); return; }
    if (!startDate)                        { showToast('أدخل تاريخ البداية', 'error'); return; }
    if (isNaN(saleP) || saleP === null)   { showToast('أدخل سعر البيع الفعلي', 'error'); return; }

    const typeEl   = document.getElementById(`subType-${idx}`);
    const typeOpt  = typeEl?.selectedOptions[0];
    const typeName = typeOpt?.text.split(' — ')[0] || '';
    const durMonths= parseInt(typeOpt?.dataset.months) || 1;

    subsData.push({ typeId, typeName, durMonths, startDate, endDate, origP, saleP, costP, email });
  }

  if (subsData.length === 0) { showToast('أضف اشتراكاً واحداً على الأقل', 'error'); return; }

  /* حفظ / تحديث بيانات العميل */
  let customerId = custId;
  const custData = { name, whatsapp: phone, notes };

  if (custId) {
    const existing = await db.get('customers', custId);
    if (existing) {
      Object.assign(existing, custData);
      await db.update('customers', existing);
    }
    customerId = custId;
  } else {
    custData.createdAt = new Date().toISOString();
    custData.createdBy = Auth.currentUser?.id;
    customerId = await db.add('customers', custData);
    custData.id = customerId;
  }

  /* حفظ الاشتراكات */
  for (const s of subsData) {
    await db.add('subscriptions', {
      customerId,
      subscriptionTypeId  : s.typeId,
      subscriptionTypeName: s.typeName,
      durationMonths      : s.durMonths,
      startDate           : s.startDate,
      endDate             : s.endDate,
      originalPrice       : s.origP,
      salePrice           : s.saleP,
      costPrice           : s.costP,
      profit              : s.saleP - s.costP,
      activationEmail     : s.email,
      status              : 'active',
      createdAt           : new Date().toISOString(),
      createdBy           : Auth.currentUser?.id,
    });
  }

  /* إعادة تمكين حقول العميل */
  ['ordCustName','ordCustWhatsapp','ordCustNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.readOnly = false;
  });

  closeModal('orderModal');
  showToast(`✅ تم حفظ الطلب — ${subsData.length} اشتراك`, 'success');
  await loadCustomers();
  loadDashboard();
  WhatsApp.syncCustomers();
}

/* ════════════════════════════════════════════════════════════
   تفاصيل العميل — عرض كل اشتراكاته
════════════════════════════════════════════════════════════ */

async function openCustomerDetail(customerId) {
  const [customer, subs] = await Promise.all([
    db.get('customers', customerId),
    db.getByIndex('subscriptions', 'customerId', customerId),
  ]);
  if (!customer) return;

  const now = new Date();
  const sorted = subs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  document.getElementById('detailModalTitle').textContent = `اشتراكات: ${customer.name}`;

  document.getElementById('customerDetailBody').innerHTML = `
    <div class="customer-detail-header">
      <div>
        <div class="detail-name"><i class="fas fa-user"></i> ${esc(customer.name)}</div>
        <div class="detail-phone" dir="ltr"><i class="fab fa-whatsapp"></i> ${esc(customer.whatsapp)}</div>
        ${customer.notes ? `<div class="detail-notes"><i class="fas fa-sticky-note"></i> ${esc(customer.notes)}</div>` : ''}
      </div>
      <button class="btn btn-sm btn-primary" onclick="openAddSubToCustomer(${customer.id})">
        <i class="fas fa-plus"></i> إضافة اشتراك
      </button>
    </div>

    <div class="table-responsive" style="margin-top:1rem">
      <table>
        <thead>
          <tr>
            <th>نوع الاشتراك</th>
            <th>البداية</th>
            <th>النهاية</th>
            <th>سعر البيع</th>
            <th>التكلفة</th>
            <th>الربح</th>
            <th>إيميل التفعيل</th>
            <th>الحالة</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.length === 0
            ? '<tr><td colspan="9" class="empty-msg">لا توجد اشتراكات</td></tr>'
            : sorted.map(s => {
                const days = Math.ceil((new Date(s.endDate) - now) / 86400000);
                let badge  = '';
                if (s.status === 'active') {
                  if (days < 0)        badge = '<span class="badge expired">منتهي</span>';
                  else if (days <= 3)  badge = '<span class="badge warning">ينتهي قريباً</span>';
                  else                 badge = '<span class="badge active">نشط</span>';
                } else if (s.status === 'expired') {
                  badge = '<span class="badge expired">منتهي</span>';
                } else {
                  badge = '<span class="badge cancelled">ملغي</span>';
                }
                return `
                  <tr>
                    <td><strong>${esc(s.subscriptionTypeName)}</strong></td>
                    <td>${(s.startDate||'').slice(0,10)}</td>
                    <td>${(s.endDate  ||'').slice(0,10)}</td>
                    <td>${(s.salePrice ||0).toLocaleString('ar-SA')} ₪</td>
                    <td>${(s.costPrice ||0).toLocaleString('ar-SA')} ₪</td>
                    <td class="profit-cell">+${(s.profit ||0).toLocaleString('ar-SA')} ₪</td>
                    <td dir="ltr" style="font-size:.82rem">${s.activationEmail ? esc(s.activationEmail) : '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td>${badge}</td>
                    <td class="actions-cell">
                      <button class="icon-btn" onclick="openEditSubscription(${s.id})" title="تعديل">
                        <i class="fas fa-edit" style="color:var(--primary)"></i>
                      </button>
                      <button class="icon-btn" onclick="deleteSubscription(${s.id},${customer.id})" title="حذف">
                        <i class="fas fa-trash" style="color:var(--danger)"></i>
                      </button>
                    </td>
                  </tr>`;
              }).join('')
          }
        </tbody>
      </table>
    </div>`;

  document.getElementById('customerDetailModal').classList.remove('hidden');
}

/* ─── إضافة اشتراك لعميل موجود ─────────────────────── */
async function openAddSubToCustomer(customerId) {
  const customer = await db.get('customers', customerId);
  if (!customer) return;

  closeModal('customerDetailModal');

  _subTypes  = (await db.getAll('subscriptionTypes')).filter(t => t.active);
  _subRowIdx = 0;

  document.getElementById('orderModalTitle').textContent = `إضافة اشتراك — ${esc(customer.name)}`;
  document.getElementById('ordCustId').value             = customer.id;
  document.getElementById('ordCustName').value           = customer.name;
  document.getElementById('ordCustWhatsapp').value       = customer.whatsapp;
  document.getElementById('ordCustNotes').value          = customer.notes || '';

  /* العميل موجود — تجميد حقوله */
  ['ordCustName','ordCustWhatsapp','ordCustNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.readOnly = true;
  });

  const container = document.getElementById('subscriptionRowsContainer');
  container.innerHTML = '';
  addSubscriptionRow();

  document.getElementById('orderModal').classList.remove('hidden');
}

/* ════════════════════════════════════════════════════════════
   تعديل بيانات العميل (اسم / واتساب / ملاحظات فقط)
════════════════════════════════════════════════════════════ */

async function openEditCustomer(id) {
  const c = await db.get('customers', id);
  if (!c) return;

  document.getElementById('editCustId').value       = c.id;
  document.getElementById('editCustName').value     = c.name     || '';
  document.getElementById('editCustWhatsapp').value = c.whatsapp || '';
  document.getElementById('editCustNotes').value    = c.notes    || '';

  document.getElementById('editCustomerModal').classList.remove('hidden');
}

async function saveEditCustomer() {
  const id    = parseInt(document.getElementById('editCustId').value);
  const name  = document.getElementById('editCustName').value.trim();
  const phone = document.getElementById('editCustWhatsapp').value.trim();
  const notes = document.getElementById('editCustNotes').value.trim();

  if (!name)  { showToast('أدخل اسم العميل', 'error'); return; }
  if (!phone) { showToast('أدخل رقم الواتساب', 'error'); return; }

  const existing = await db.get('customers', id);
  if (!existing) return;
  Object.assign(existing, { name, whatsapp: phone, notes });
  await db.update('customers', existing);

  closeModal('editCustomerModal');
  showToast('✅ تم تحديث بيانات العميل', 'success');
  await loadCustomers();
  WhatsApp.syncCustomers();
}

/* ════════════════════════════════════════════════════════════
   تعديل اشتراك موجود
════════════════════════════════════════════════════════════ */

async function openEditSubscription(subId) {
  const s = await db.get('subscriptions', subId);
  if (!s) return;
  _editSubData = s;

  document.getElementById('editSubId').value        = s.id;
  document.getElementById('editSubStart').value     = (s.startDate || '').slice(0, 10);
  document.getElementById('editSubEnd').value       = (s.endDate   || '').slice(0, 10);
  document.getElementById('editSubSalePrice').value = s.salePrice  || 0;
  document.getElementById('editSubEmail').value     = s.activationEmail || '';
  document.getElementById('editSubStatus').value    = s.status     || 'active';
  calcEditSubProfit();

  document.getElementById('editSubscriptionModal').classList.remove('hidden');
}

function calcEditSubEnd() {
  if (!_editSubData) return;
  const start  = document.getElementById('editSubStart').value;
  if (!start) return;
  const newEnd = addMonths(start, _editSubData.durationMonths || 1);
  document.getElementById('editSubEnd').value = newEnd;
}

function calcEditSubProfit() {
  if (!_editSubData) return;
  const sale   = parseFloat(document.getElementById('editSubSalePrice')?.value) || 0;
  const cost   = _editSubData.costPrice || 0;
  const profit = sale - cost;
  const el     = document.getElementById('editSubProfitPreview');
  if (el) {
    el.textContent = `الربح: ${(profit >= 0 ? '+' : '')}${profit.toLocaleString('ar-SA')} ₪`;
    el.style.color = profit >= 0 ? '#065F46' : '#991B1B';
  }
}

async function saveEditSubscription() {
  const id        = parseInt(document.getElementById('editSubId').value);
  const startDate = document.getElementById('editSubStart').value;
  const endDate   = document.getElementById('editSubEnd').value;
  const salePrice = parseFloat(document.getElementById('editSubSalePrice').value);
  const email     = document.getElementById('editSubEmail').value.trim();
  const status    = document.getElementById('editSubStatus').value;

  if (!startDate)              { showToast('أدخل تاريخ البداية', 'error'); return; }
  if (isNaN(salePrice))        { showToast('أدخل سعر البيع الفعلي', 'error'); return; }

  const s = await db.get('subscriptions', id);
  if (!s) return;

  s.startDate      = startDate;
  s.endDate        = endDate;
  s.salePrice      = salePrice;
  s.profit         = salePrice - (s.costPrice || 0);
  s.activationEmail= email;
  s.status         = status;
  await db.update('subscriptions', s);

  closeModal('editSubscriptionModal');
  showToast('✅ تم تحديث الاشتراك', 'success');
  await loadCustomers();
  loadDashboard();
  WhatsApp.syncCustomers();
  /* إعادة فتح تفاصيل العميل */
  openCustomerDetail(s.customerId);
}

/* ─── حذف اشتراك ────────────────────────────────────── */
async function deleteSubscription(subId, customerId) {
  if (!confirm('هل تريد حذف هذا الاشتراك؟')) return;
  await db.delete('subscriptions', subId);
  /* تحديث المصفوفة في الذاكرة */
  allSubscriptions = allSubscriptions.filter(s => s.id !== subId);
  showToast('تم حذف الاشتراك', 'info');
  await loadCustomers();
  loadDashboard();
  openCustomerDetail(customerId);
}

/* ─── حذف عميل وجميع اشتراكاته ────────────────────── */
async function deleteCustomer(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!confirm(`هل تريد حذف "${c?.name || 'هذا العميل'}" وجميع اشتراكاته؟`)) return;

  /* حذف جميع الاشتراكات */
  const subs = allSubscriptions.filter(s => s.customerId === id);
  for (const s of subs) await db.delete('subscriptions', s.id);

  await db.delete('customers', id);
  showToast('تم حذف العميل وجميع اشتراكاته', 'info');
  await loadCustomers();
  loadDashboard();
  WhatsApp.syncCustomers();
}

/* ─── تصدير CSV ─────────────────────────────────────── */
function exportCustomersCSV() {
  const rows = [
    ['الاسم', 'واتساب', 'عدد الاشتراكات', 'الاشتراكات النشطة', 'ملاحظات'],
    ...allCustomers.map(c => {
      const subs   = allSubscriptions.filter(s => s.customerId === c.id);
      const active = subs.filter(s => s.status === 'active').length;
      return [c.name, c.whatsapp, subs.length, active, c.notes || ''];
    }),
  ];
  downloadCSV(rows, `customers_${new Date().toISOString().slice(0,10)}.csv`);
  showToast(`تم تصدير ${allCustomers.length} عميل`, 'success');
}

/* ─── تحويل الأشهر إلى تاريخ نهاية ──────────────────── */
/* months < 0 → تُعامَل كدقائق (قيم اختبار) */
function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  const m = parseInt(months);
  if (m < 0) {
    return new Date(d.getTime() + Math.abs(m) * 60 * 1000).toISOString().slice(0, 16);
  }
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}
