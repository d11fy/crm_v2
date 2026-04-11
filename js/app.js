/* ============================================================
   app.js — التحكم الرئيسي بالتطبيق
   ============================================================ */

/* ── أدوات مساعدة عامة ──────────────────────────────────── */

/** تحويل HTML الخاص للحماية من XSS */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** تنسيق المبلغ بالريال السعودي */
function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString('ar-SA') + ' ₪';
}

/** إظهار رسالة منبثقة (Toast) */
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

/** إغلاق مودال بمعرّفه */
function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

/** تصدير CSV مع BOM عربي */
function downloadCSV(rows, filename) {
  const bom = '\uFEFF';
  const csv = bom + rows
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(','))
    .join('\r\n');
  const a   = document.createElement('a');
  a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download= filename;
  a.click();
}

/** عرض/إخفاء كلمة المرور في صفحة تسجيل الدخول */
function togglePasswordVisibility() {
  const inp  = document.getElementById('loginPassword');
  const icon = document.getElementById('passEyeIcon');
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type      = 'text';
    icon.className= 'fas fa-eye-slash';
  } else {
    inp.type      = 'password';
    icon.className= 'fas fa-eye';
  }
}

/* ── الشريط الجانبي (موبايل) ─────────────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

/* ── عناوين الصفحات ─────────────────────────────────────── */
const PAGE_TITLES = {
  dashboard   : 'لوحة التحكم',
  customers   : 'إدارة العملاء',
  sales       : 'تسجيل المبيعات',
  reports     : 'التقارير والأرباح',
  reminders   : 'التذكيرات',
  settings    : 'الإعدادات',
};

/* ── التنقل بين الصفحات ──────────────────────────────────── */
function navigateTo(page) {
  /* إخفاء جميع الصفحات وإزالة الـ active */
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  /* إظهار الصفحة المطلوبة */
  const target = document.getElementById(page + 'Page');
  if (target) target.classList.remove('hidden');

  /* تفعيل رابط القائمة */
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  /* تحديث عنوان الصفحة */
  const heading = document.getElementById('pageHeading');
  if (heading) heading.textContent = PAGE_TITLES[page] || '';

  /* تحميل بيانات الصفحة */
  switch (page) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'customers':
      loadCustomers();
      break;
    case 'sales':
      loadSalesPage();
      break;
    case 'reports':
      loadReports();
      break;
    case 'reminders':
      loadRemindersPage();
      break;
    case 'settings':
      if (!Auth.isAdmin()) {
        showToast('هذه الصفحة للمدير فقط', 'error');
        navigateTo('dashboard');
        return;
      }
      loadSubscriptionTypes();
      loadUsers();
      loadGeneralSettings();
      /* تحديث حالة واتساب وعرض QR إن وجد */
      setTimeout(refreshWaStatus, 300);
      break;
  }

  /* إغلاق القائمة الجانبية على الجوال */
  if (window.innerWidth < 768) closeSidebar();
}

/* ── صفحة التذكيرات ─────────────────────────────────────── */
async function loadRemindersPage() {
  const container = document.getElementById('remindersContent');
  if (!container) return;

  const customers = await db.getAll('customers');
  const now       = new Date();
  const pending   = [];

  for (const c of customers) {
    if (c.status !== 'active') continue;
    const end  = new Date(c.endDate);
    const days = Math.ceil((end - now) / 86400000);
    if (days >= 0 && days <= 3) {
      const type = days <= 1 ? '1d' : '3d';
      const sent = await WhatsApp.wasReminderSent(c.id, type);
      pending.push({ customer: c, daysLeft: days, type, sent });
    }
  }

  /* تحديث badge */
  const unsent = pending.filter(p => !p.sent).length;
  updateReminderBadge(unsent);

  if (pending.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-check-circle text-green"></i>
        <h4>لا توجد اشتراكات تنتهي قريباً</h4>
        <p>جميع الاشتراكات النشطة سليمة حتى الآن</p>
      </div>`;
    return;
  }

  container.innerHTML = pending
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(p => {
      const c    = p.customer;
      const days = p.daysLeft;
      const cls  = days <= 1 ? 'days-1' : days === 2 ? 'days-2' : 'days-3';
      const lbl  = days === 0 ? 'اليوم!' : days === 1 ? 'غداً!' : `${days} أيام`;
      return `
        <div class="reminder-card ${cls} ${p.sent ? 'sent' : ''}" id="rc-${c.id}-${p.type}">
          <div class="reminder-days">${lbl}</div>
          <div class="reminder-info">
            <strong>${esc(c.name)}</strong>
            <span>${esc(c.subscriptionTypeName || '')} — ينتهي ${c.endDate}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:.4rem;align-items:flex-end;">
            <button class="btn-wa" onclick="sendReminderFromPage(${c.id},'${p.type}',${days})">
              <i class="fab fa-whatsapp"></i>
              ${p.sent ? 'إعادة إرسال' : 'إرسال'}
            </button>
          </div>
        </div>`;
    }).join('');
}

async function sendReminderFromPage(customerId, type, daysLeft) {
  const c = await db.get('customers', customerId);
  if (!c) return;
  await WhatsApp.sendReminder(c, daysLeft, type);
  /* تحديث الكرت بصرياً */
  const card = document.getElementById(`rc-${customerId}-${type}`);
  if (card) card.classList.add('sent');
  showToast(`تم إرسال تذكير لـ ${c.name}`, 'success');
}

function updateReminderBadge(count) {
  const badge1 = document.getElementById('reminderNavBadge');
  const badge2 = document.getElementById('notifBadge');
  [badge1, badge2].forEach(b => {
    if (!b) return;
    b.textContent = count;
    b.classList.toggle('hidden', count === 0);
  });
}

/* ── تسجيل الدخول ────────────────────────────────────────── */
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn      = document.getElementById('loginBtn');
  const errBox   = document.getElementById('loginError');

  if (!username || !password) {
    errBox.textContent = 'يرجى ملء جميع الحقول';
    errBox.classList.remove('hidden');
    return;
  }

  btn.disabled      = true;
  btn.innerHTML     = '<i class="fas fa-spinner fa-spin"></i> جارٍ التحقق…';
  errBox.classList.add('hidden');

  const ok = await Auth.login(username, password);

  if (!ok) {
    errBox.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
    errBox.classList.remove('hidden');
    btn.disabled  = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> تسجيل الدخول';
    return;
  }
  startApp();
}

/* ── بدء التطبيق بعد تسجيل الدخول ──────────────────────── */
function startApp() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');

  /* بيانات المستخدم في الشريط الجانبي */
  document.getElementById('userDisplayName').textContent = Auth.name();
  document.getElementById('userDisplayRole').textContent = Auth.isAdmin() ? 'مدير' : 'موظف';

  /* إخفاء عناصر المدير فقط عن الموظف */
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !Auth.isAdmin());
  });

  navigateTo('dashboard');

  /* بدء مراقبة التذكيرات */
  WhatsApp.start();
}

/* ── تهيئة التطبيق ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {

  /* 1. تهيئة قاعدة البيانات */
  await db.init();
  await db.seed();

  /* 2. استعادة الجلسة */
  if (Auth.restore()) {
    startApp();
    return;
  }

  /* 3. إظهار صفحة تسجيل الدخول */
  document.getElementById('loginPage').classList.remove('hidden');

  /* ── مستمعو الأحداث ── */

  /* نموذج تسجيل الدخول */
  document.getElementById('loginForm')
    .addEventListener('submit', handleLogin);

  /* تسجيل الخروج */
  document.getElementById('logoutBtn')
    .addEventListener('click', () => Auth.logout());

  /* التنقل عبر القائمة الجانبية */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });

  /* إغلاق المودال بالضغط على الخلفية */
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  /* بحث العملاء */
  document.getElementById('customerSearch')
    ?.addEventListener('input', e => {
      customerFilter.search = e.target.value;
      renderCustomers();
    });

  document.getElementById('customerStatusFilter')
    ?.addEventListener('change', e => {
      customerFilter.status = e.target.value;
      renderCustomers();
    });

  /* فترة التقارير */
  document.getElementById('reportPeriod')
    ?.addEventListener('change', () => {
      toggleCustomDateRange();
      loadReports();
    });

  /* معاينة ربح نوع الاشتراك */
  document.getElementById('stCost')?.addEventListener('input', updateSubTypeProfit);
  document.getElementById('stSale')?.addEventListener('input', updateSubTypeProfit);

  /* تبديل عميل جديد / موجود في مودال البيع */
  document.getElementById('saleIsNew')
    ?.addEventListener('change', toggleNewCustomerFields);
  document.getElementById('saleIsExisting')
    ?.addEventListener('change', toggleNewCustomerFields);

  /* الإكمال التلقائي لاسم العميل */
  document.getElementById('saleExistingCustomer')
    ?.addEventListener('input', onSaleCustomerInput);

  /* Enter في حقل بحث العملاء */
  document.getElementById('saleExistingCustomer')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
});

/* ── تنقل إضافي عند الضغط (delegation) ─────────────────── */
document.addEventListener('click', e => {
  const ni = e.target.closest('.nav-item');
  if (ni && ni.dataset.page) navigateTo(ni.dataset.page);
});
