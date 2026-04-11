/* ============================================================
   dashboard.js — لوحة التحكم الرئيسية
   ============================================================ */

let salesChart  = null;
let profitDonut = null;

/* خريطة مؤقتة لبيانات العملاء (تُستخدم في الأزرار) */
const _dashCustomers = {};

async function loadDashboard() {
  const [customers, sales] = await Promise.all([
    db.getAll('customers'),
    db.getAll('sales'),
  ]);

  const now       = new Date();
  const todayStr  = now.toISOString().slice(0, 10);

  /* ── إحصاءات ── */
  const active      = customers.filter(c => c.status === 'active').length;
  const todaySales  = sales.filter(s => (s.date || '').startsWith(todayStr));
  const todayRev    = todaySales.reduce((a, s) => a + (s.salePrice || 0), 0);
  const todayProfit = todaySales.reduce((a, s) => a + (s.profit    || 0), 0);

  /* ينتهي خلال ≤7 أيام */
  const expiring = customers.filter(c => {
    if (c.status !== 'active') return false;
    const d = Math.ceil((new Date(c.endDate) - now) / 86400000);
    return d >= 0 && d <= 7;
  });

  /* اشتراكات منتهية لم تُحدَّث بعد */
  const expired = customers.filter(
    c => c.status === 'active' && new Date(c.endDate) < now
  );

  /* ── تحديث الكروت ── */
  setEl('statActive',       active);
  setEl('statTodaySales',   todaySales.length);
  setEl('statTodayRevenue', fmtMoney(todayRev));
  setEl('statTodayProfit',  fmtMoney(todayProfit));
  setEl('statExpiring',     expiring.length);
  setEl('statExpired',      expired.length);

  /* ── المخططات ── */
  buildSalesChart(sales, now);
  buildProfitDonut(sales);

  /* ── قائمة المنتهية قريباً ── */
  buildExpiringList(expiring, now);

  /* ── آخر المبيعات ── */
  buildRecentSales(sales.slice(-10).reverse());

  /* ── تحديث حالة الاشتراكات المنتهية تلقائياً ── */
  for (const c of expired) {
    c.status = 'expired';
    await db.update('customers', c);
  }
}

/* ─────────────────────────── المساعدات ─────────────────────── */

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function buildSalesChart(sales, now) {
  const canvas = document.getElementById('salesChart');
  if (!canvas) return;

  const labels = [];
  const data   = [];
  for (let i = 6; i >= 0; i--) {
    const d   = new Date(now);
    d.setDate(d.getDate() - i);
    const str = d.toISOString().slice(0, 10);
    labels.push(str.slice(5));
    data.push(
      sales
        .filter(s => (s.date || '').startsWith(str))
        .reduce((a, s) => a + (s.profit || 0), 0)
    );
  }

  if (salesChart) salesChart.destroy();
  salesChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label          : 'الأرباح اليومية',
        data,
        backgroundColor: 'rgba(99,102,241,0.75)',
        borderRadius   : 8,
        borderSkipped  : false,
      }],
    },
    options: {
      responsive         : true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales : {
        y: {
          beginAtZero: true,
          ticks: { callback: v => v.toLocaleString('ar-SA') + ' ₪' },
        },
      },
    },
  });
}

function buildProfitDonut(sales) {
  const canvas = document.getElementById('profitDonut');
  if (!canvas) return;

  const map = {};
  sales.forEach(s => {
    const k = s.subscriptionTypeName || 'غير محدد';
    map[k] = (map[k] || 0) + (s.profit || 0);
  });

  const labels = Object.keys(map);
  const data   = Object.values(map);
  const colors = ['#6366F1','#22D3EE','#F59E0B','#10B981','#EC4899','#EF4444','#8B5CF6'];

  if (profitDonut) profitDonut.destroy();

  if (labels.length === 0) {
    canvas.parentElement.innerHTML = '<p class="empty-msg">لا توجد مبيعات لعرض التوزيع</p>';
    return;
  }

  profitDonut = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, labels.length),
        hoverOffset    : 8,
      }],
    },
    options: {
      responsive         : true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels  : { font: { family: 'Tajawal', size: 12 }, padding: 12 },
        },
      },
    },
  });
}

function buildExpiringList(expiring, now) {
  const el = document.getElementById('expiringList');
  if (!el) return;

  if (expiring.length === 0) {
    el.innerHTML = '<p class="empty-msg">✅ لا توجد اشتراكات تنتهي خلال 7 أيام</p>';
    return;
  }

  /* تخزين مؤقت لبيانات العملاء (للـ onclick الآمن) */
  expiring.forEach(c => { _dashCustomers[c.id] = c; });

  el.innerHTML = expiring
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .map(c => {
      const days = Math.ceil((new Date(c.endDate) - now) / 86400000);
      const cls  = days <= 1 ? 'urgent' : days <= 3 ? 'warning' : '';
      const lbl  = days === 0 ? 'اليوم!' : days === 1 ? 'غداً!' : `${days} أيام`;
      return `
        <div class="expiring-item ${cls}">
          <div>
            <strong>${esc(c.name)}</strong>
            <span class="sub-info">${esc(c.subscriptionTypeName || '')}</span>
          </div>
          <div class="expiring-meta">
            <span class="badge ${cls || 'badge-primary'}">${lbl}</span>
            <button class="btn-icon" title="إرسال تذكير واتساب"
              onclick="dashSendWa(${c.id}, ${days})">💬</button>
          </div>
        </div>`;
    }).join('');
}

/* دالة إرسال واتساب آمنة من لوحة التحكم */
function dashSendWa(customerId, daysLeft) {
  const c = _dashCustomers[customerId];
  if (!c) return;
  const msg = WhatsApp.buildMessage(c, daysLeft);
  WhatsApp.openWhatsApp(c.whatsapp, msg);
}

function buildRecentSales(recent) {
  const el = document.getElementById('recentSales');
  if (!el) return;

  if (recent.length === 0) {
    el.innerHTML = '<p class="empty-msg">لا توجد مبيعات بعد</p>';
    return;
  }

  el.innerHTML = recent.map(s => `
    <div class="sale-row">
      <div class="sale-info">
        <strong>${esc(s.customerName)}</strong>
        <span>${esc(s.subscriptionTypeName || '')}</span>
      </div>
      <div class="sale-amounts">
        <span class="profit-badge">+${fmtMoney(s.profit)}</span>
        <span class="sale-date">${(s.date || '').slice(0, 10)}</span>
      </div>
    </div>`).join('');
}
