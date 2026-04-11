/* ============================================================
   sales.js — تسجيل المبيعات السريع
   ============================================================ */

/* ─── تحميل صفحة المبيعات ─────────────────────────────── */
async function loadSalesPage() {
  const types = (await db.getAll('subscriptionTypes')).filter(t => t.active);
  renderSaleCards(types);
  await loadRecentSalesTable();
}

/* ─── عرض كروت أنواع الاشتراكات ───────────────────────── */
function renderSaleCards(types) {
  const container = document.getElementById('saleCards');
  if (!container) return;

  if (types.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted)">
        <i class="fas fa-tags" style="font-size:2.5rem;opacity:.3;display:block;margin-bottom:.75rem"></i>
        لا توجد أنواع اشتراكات نشطة. أضفها من صفحة الإعدادات.
      </div>`;
    return;
  }

  container.innerHTML = types.map(t => `
    <div class="sale-card" onclick="openSaleModal(${t.id})">
      <div class="sale-card-icon">💳</div>
      <h3>${esc(t.name)}</h3>
      <p class="sale-card-desc">${esc(t.description || '')}</p>
      <div class="sale-card-details">
        <span class="duration-badge">${durationLabel(t.durationMonths)}</span>
      </div>
      <div class="sale-card-price">
        <span class="price-main">${t.salePrice.toLocaleString('ar-SA')} ₪</span>
        <span class="profit-hint">ربح: ${(t.salePrice - t.costPrice).toLocaleString('ar-SA')} ₪</span>
      </div>
      <div class="sale-card-hover"><i class="fas fa-plus-circle"></i> تسجيل بيع</div>
    </div>`).join('');
}

/* ─── تحويل المدة إلى نص ────────────────────────────────── */
function durationLabel(months) {
  const m = parseInt(months);
  if (m < 0)   return `${Math.abs(m)} دقائق (تجربة)`;
  if (m === 1)  return 'شهر واحد';
  if (m === 3)  return '3 أشهر';
  if (m === 6)  return '6 أشهر';
  if (m === 12) return 'سنة كاملة';
  return `${m} شهر`;
}

/* ─── مودال تسجيل البيع ─────────────────────────────────── */
let _activeSaleTypeId = null;

async function openSaleModal(typeId) {
  _activeSaleTypeId = typeId;
  const t = await db.get('subscriptionTypes', typeId);
  if (!t) { showToast('نوع الاشتراك غير موجود', 'error'); return; }

  /* تحميل العملاء للإكمال التلقائي */
  const customers = await db.getAll('customers');
  const datalist  = document.getElementById('saleCustomerList');
  if (datalist) {
    datalist.innerHTML = customers.map(c =>
      `<option value="${esc(c.name)}" data-id="${c.id}" data-phone="${esc(c.whatsapp)}"></option>`
    ).join('');
  }

  /* تعبئة ملخص الاشتراك */
  document.getElementById('saleModalTypeName').textContent = t.name;
  document.getElementById('saleModalDuration').textContent = durationLabel(t.durationMonths);
  document.getElementById('saleModalPrice').textContent    = t.salePrice.toLocaleString('ar-SA') + ' ₪';
  document.getElementById('saleModalCost').textContent     = t.costPrice.toLocaleString('ar-SA') + ' ₪';
  document.getElementById('saleModalProfit').textContent   = (t.salePrice - t.costPrice).toLocaleString('ar-SA') + ' ₪';

  /* تصفير الحقول */
  document.getElementById('saleCustomerName').value    = '';
  document.getElementById('saleCustomerPhone').value   = '';
  document.getElementById('saleExistingCustomer').value = '';
  document.getElementById('saleCustomerPhone2').value  = '';
  document.getElementById('_saleExistingId').value     = '';
  document.getElementById('saleIsNew').checked         = true;
  toggleNewCustomerFields();

  document.getElementById('saleModal').classList.remove('hidden');
}

/* ─── تبديل حقول العميل (جديد / موجود) ─────────────────── */
function toggleNewCustomerFields() {
  const isNew = document.getElementById('saleIsNew')?.checked;
  document.getElementById('newCustomerFields')?.classList.toggle('hidden', !isNew);
  document.getElementById('existingCustomerField')?.classList.toggle('hidden', isNew);
}

/* ─── ملء الهاتف تلقائياً عند اختيار عميل موجود ─────────── */
function onSaleCustomerInput() {
  const name = document.getElementById('saleExistingCustomer').value;
  const opts = [...(document.getElementById('saleCustomerList')?.options || [])];
  const opt  = opts.find(o => o.value === name);
  if (opt) {
    document.getElementById('_saleExistingId').value    = opt.dataset.id  || '';
    document.getElementById('saleCustomerPhone2').value = opt.dataset.phone || '';
  } else {
    /* مسح عند حذف الاسم */
    document.getElementById('_saleExistingId').value    = '';
    document.getElementById('saleCustomerPhone2').value = '';
  }
}

/* ─── تأكيد البيع ────────────────────────────────────────── */
async function confirmSale() {
  if (!_activeSaleTypeId) return;

  const t     = await db.get('subscriptionTypes', _activeSaleTypeId);
  const isNew = document.getElementById('saleIsNew').checked;
  const start = new Date().toISOString().slice(0, 10);
  const end   = addMonths(start, t.durationMonths);

  let customerName, phone, customerId;

  /* ── عميل جديد ── */
  if (isNew) {
    customerName = document.getElementById('saleCustomerName').value.trim();
    phone        = document.getElementById('saleCustomerPhone').value.trim();

    if (!customerName) { showToast('أدخل اسم العميل', 'error'); return; }
    if (!phone)        { showToast('أدخل رقم الواتساب', 'error'); return; }

    const cData = {
      name     : customerName,
      whatsapp : phone,
      notes    : '',
      createdAt: new Date().toISOString(),
      createdBy: Auth.currentUser?.id,
    };
    customerId = await db.add('customers', cData);

  /* ── عميل موجود (تجديد) ── */
  } else {
    customerId = parseInt(document.getElementById('_saleExistingId').value);
    if (!customerId) { showToast('اختر عميلاً من القائمة أولاً', 'error'); return; }

    const cust = await db.get('customers', customerId);
    if (!cust)  { showToast('لم يتم العثور على العميل', 'error'); return; }

    customerName = cust.name;
    phone        = cust.whatsapp;
  }

  /* ── تسجيل الاشتراك ── */
  const sub = {
    customerId,
    subscriptionTypeId  : _activeSaleTypeId,
    subscriptionTypeName: t.name,
    durationMonths      : t.durationMonths,
    startDate           : start,
    endDate             : end,
    originalPrice       : t.salePrice,
    salePrice           : t.salePrice,
    costPrice           : t.costPrice,
    profit              : t.salePrice - t.costPrice,
    activationEmail     : '',
    status              : 'active',
    createdAt           : new Date().toISOString(),
    createdBy           : Auth.currentUser?.id,
  };
  await db.add('subscriptions', sub);

  closeModal('saleModal');
  showToast(`✅ تم تسجيل البيع — ربح ${fmtMoney(sub.profit)}`, 'success');

  /* تحديث الجدول ولوحة التحكم */
  await loadRecentSalesTable();
  loadDashboard();
  WhatsApp.syncCustomers();
}

/* ─── جدول آخر المبيعات (من subscriptions) ──────────────── */
async function loadRecentSalesTable() {
  const [subs, customers] = await Promise.all([
    db.getAll('subscriptions'),
    db.getAll('customers'),
  ]);
  const custMap = {};
  customers.forEach(c => { custMap[c.id] = c; });

  const recent = [...subs]
    .sort((a, b) => (b.createdAt||'').localeCompare(a.createdAt||''))
    .slice(0, 20);

  const tbody = document.getElementById('recentSalesBody');
  if (!tbody) return;

  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">لا توجد مبيعات بعد</td></tr>';
    return;
  }

  tbody.innerHTML = recent.map(s => {
    const c = custMap[s.customerId] || {};
    return `
      <tr>
        <td dir="ltr">${(s.createdAt || '').slice(0, 16).replace('T', ' ')}</td>
        <td>${esc(c.name || '—')}</td>
        <td>${esc(s.subscriptionTypeName || '')}</td>
        <td>${(s.salePrice || 0).toLocaleString('ar-SA')} ₪</td>
        <td>${(s.costPrice || 0).toLocaleString('ar-SA')} ₪</td>
        <td class="profit-cell">+${(s.profit || 0).toLocaleString('ar-SA')} ₪</td>
      </tr>`;
  }).join('');
}
