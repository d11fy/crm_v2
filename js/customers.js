/* ============================================================
   customers.js — إدارة العملاء
   ============================================================ */

let allCustomers   = [];
let customerFilter = { search: '', status: 'all' };

/* ─── تحميل جميع العملاء ───────────────────────────────── */
async function loadCustomers() {
  allCustomers = await db.getAll('customers');
  allCustomers.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  renderCustomers();
}

/* ─── رسم جدول العملاء ─────────────────────────────────── */
function renderCustomers() {
  const q   = customerFilter.search.toLowerCase().trim();
  const st  = customerFilter.status;
  const now = new Date();

  let list = [...allCustomers];
  if (q)          list = list.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.whatsapp || '').includes(q)
  );
  if (st !== 'all') list = list.filter(c => c.status === st);

  const tbody = document.getElementById('customersBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-msg">
      <i class="fas fa-search" style="display:block;font-size:2rem;opacity:.3;margin-bottom:.5rem"></i>
      لا توجد نتائج
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const end  = new Date(c.endDate);
    const days = Math.ceil((end - now) / 86400000);
    let statusBadge = '';

    if (c.status === 'active') {
      if (days < 0)       statusBadge = '<span class="badge expired">منتهي</span>';
      else if (days <= 3) statusBadge = '<span class="badge warning">ينتهي قريباً</span>';
      else                statusBadge = '<span class="badge active">نشط</span>';
    } else if (c.status === 'expired') {
      statusBadge = '<span class="badge expired">منتهي</span>';
    } else {
      statusBadge = '<span class="badge cancelled">ملغي</span>';
    }

    return `
      <tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td dir="ltr">${esc(c.whatsapp)}</td>
        <td>${esc(c.subscriptionTypeName || '—')}</td>
        <td>${c.startDate || '—'}</td>
        <td>${c.endDate   || '—'}</td>
        <td>${statusBadge}</td>
        <td class="actions-cell">
          <button class="icon-btn" title="إرسال واتساب"
            onclick="whatsappCustomer(${c.id})">
            <i class="fab fa-whatsapp" style="color:var(--whatsapp)"></i>
          </button>
          <button class="icon-btn" title="تعديل"
            onclick="openEditCustomer(${c.id})">
            <i class="fas fa-edit" style="color:var(--primary)"></i>
          </button>
          <button class="icon-btn" title="حذف"
            onclick="deleteCustomer(${c.id})">
            <i class="fas fa-trash" style="color:var(--danger)"></i>
          </button>
        </td>
      </tr>`;
  }).join('');
}

/* ─── واتساب العميل من جدول العملاء ────────────────────── */
function whatsappCustomer(customerId) {
  const c = allCustomers.find(x => x.id === customerId);
  if (!c) return;
  WhatsApp.openWhatsApp(c.whatsapp, '');
}

/* ─── فتح مودال الإضافة ────────────────────────────────── */
async function openAddCustomer() {
  const types = (await db.getAll('subscriptionTypes')).filter(t => t.active);
  _populateSubTypeSelect('customerSubType', types);
  _resetCustomerForm();
  document.getElementById('customerModalTitle').textContent = 'إضافة عميل جديد';
  document.getElementById('customerModal').classList.remove('hidden');
}

/* ─── فتح مودال التعديل ────────────────────────────────── */
async function openEditCustomer(id) {
  const c     = await db.get('customers', id);
  const types = (await db.getAll('subscriptionTypes')).filter(t => t.active);
  _populateSubTypeSelect('customerSubType', types);

  document.getElementById('customerModalTitle').textContent = 'تعديل بيانات العميل';
  document.getElementById('custId').value           = c.id;
  document.getElementById('custName').value         = c.name || '';
  document.getElementById('custWhatsapp').value     = c.whatsapp || '';
  document.getElementById('customerSubType').value  = c.subscriptionTypeId || '';
  document.getElementById('custNotes').value        = c.notes || '';
  document.getElementById('custStartDate').value    = c.startDate || new Date().toISOString().slice(0, 10);
  document.getElementById('customerModal').classList.remove('hidden');
}

/* ─── تعبئة قائمة أنواع الاشتراكات ──────────────────────── */
function _populateSubTypeSelect(selectId, types) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">— اختر نوع الاشتراك —</option>' +
    types.map(t =>
      `<option value="${t.id}" data-months="${t.durationMonths}">
        ${esc(t.name)} — ${t.salePrice.toLocaleString('ar-SA')} ₪
        (${durationLabel(t.durationMonths)})
      </option>`
    ).join('');
}

/* ─── تصفير نموذج العميل ────────────────────────────────── */
function _resetCustomerForm() {
  document.getElementById('custId').value          = '';
  document.getElementById('custName').value        = '';
  document.getElementById('custWhatsapp').value    = '';
  document.getElementById('customerSubType').value = '';
  document.getElementById('custNotes').value       = '';
  document.getElementById('custStartDate').value   = new Date().toISOString().slice(0, 10);
}

/* ─── حفظ العميل (إضافة أو تعديل) ──────────────────────── */
async function saveCustomer() {
  const id     = parseInt(document.getElementById('custId').value) || null;
  const name   = document.getElementById('custName').value.trim();
  const phone  = document.getElementById('custWhatsapp').value.trim();
  const typeId = parseInt(document.getElementById('customerSubType').value);
  const notes  = document.getElementById('custNotes').value.trim();
  const start  = document.getElementById('custStartDate').value;

  /* التحقق من الحقول المطلوبة */
  if (!name)   { showToast('أدخل اسم العميل', 'error'); return; }
  if (!phone)  { showToast('أدخل رقم الواتساب', 'error'); return; }
  if (!typeId) { showToast('اختر نوع الاشتراك', 'error'); return; }
  if (!start)  { showToast('أدخل تاريخ البداية', 'error'); return; }

  const subType = await db.get('subscriptionTypes', typeId);
  if (!subType) { showToast('نوع الاشتراك غير موجود', 'error'); return; }

  const endDate = addMonths(start, subType.durationMonths);

  const data = {
    name,
    whatsapp            : phone,
    subscriptionTypeId  : typeId,
    subscriptionTypeName: subType.name,
    startDate           : start,
    endDate,
    status              : 'active',
    notes,
    createdAt           : new Date().toISOString(),
    createdBy           : Auth.currentUser?.id,
  };

  if (id) {
    /* تعديل عميل موجود */
    data.id = id;
    await db.update('customers', data);
    Sheets.backupCustomer(data, subType);
    showToast('✅ تم تحديث بيانات العميل', 'success');
  } else {
    /* إضافة عميل جديد + تسجيل بيع تلقائي */
    const newId = await db.add('customers', data);
    data.id     = newId;

    const sale = {
      customerId          : newId,
      customerName        : name,
      whatsapp            : phone,
      subscriptionTypeId  : typeId,
      subscriptionTypeName: subType.name,
      salePrice           : subType.salePrice,
      costPrice           : subType.costPrice,
      profit              : subType.salePrice - subType.costPrice,
      date                : new Date().toISOString(),
      employeeName        : Auth.name(),
      employeeId          : Auth.currentUser?.id,
    };
    const saleId = await db.add('sales', sale);
    sale.id      = saleId;

    Sheets.backupCustomer(data, subType);
    Sheets.backupSale(sale);
    showToast('✅ تم إضافة العميل وتسجيل البيع', 'success');
  }

  closeModal('customerModal');
  await loadCustomers();
  loadDashboard();
}

/* ─── حذف عميل ──────────────────────────────────────────── */
async function deleteCustomer(id) {
  const c = allCustomers.find(x => x.id === id);
  const name = c ? c.name : 'هذا العميل';
  if (!confirm(`هل تريد حذف "${name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
  await db.delete('customers', id);
  showToast('تم حذف العميل', 'info');
  await loadCustomers();
  loadDashboard();
}

/* ─── تصدير CSV ─────────────────────────────────────────── */
function exportCustomersCSV() {
  const rows = [
    ['الاسم', 'واتساب', 'نوع الاشتراك', 'تاريخ البداية', 'تاريخ النهاية', 'الحالة', 'ملاحظات'],
    ...allCustomers.map(c => [
      c.name, c.whatsapp, c.subscriptionTypeName || '',
      c.startDate || '', c.endDate || '', c.status || '', c.notes || '',
    ]),
  ];
  downloadCSV(rows, `customers_${new Date().toISOString().slice(0,10)}.csv`);
  showToast(`تم تصدير ${allCustomers.length} عميل`, 'success');
}

/* ─── إضافة أشهر إلى تاريخ ─────────────────────────────── */
function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + parseInt(months));
  return d.toISOString().slice(0, 10);
}
