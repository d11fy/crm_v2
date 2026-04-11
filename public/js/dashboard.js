/* ============================================================
   dashboard.js — لوحة التحكم (v3: يقرأ من subscriptions)
   ============================================================ */

let salesChart  = null;
let profitDonut = null;

async function loadDashboard() {
  const [customers, subs] = await Promise.all([
    db.getAll('customers'),
    db.getAll('subscriptions'),
  ]);

  const now      = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  /* ── إحصاءات ── */
  const active       = subs.filter(s => s.status === 'active');
  const todaySubs    = subs.filter(s => (s.createdAt || '').startsWith(todayStr));
  const todayRev     = todaySubs.reduce((a, s) => a + (s.salePrice || 0), 0);
  const todayProfit  = todaySubs.reduce((a, s) => a + (s.profit    || 0), 0);

  /* ينتهي خلال ≤7 أيام */
  const expiring = active.filter(s => {
    const d = Math.ceil((new Date(s.endDate) - now) / 86400000);
    return d >= 0 && d <= 7;
  });

  /* اشتراكات منتهية لم تُحدَّث */
  const expired = active.filter(s => new Date(s.endDate) < now);

  /* ── تحديث الكروت ── */
  setEl('statActive',       active.length - expired.length);
  setEl('statTodaySales',   todaySubs.length);
  setEl('statTodayRevenue', fmtMoney(todayRev));
  setEl('statTodayProfit',  fmtMoney(todayProfit));
  setEl('statExpiring',     expiring.length);
  setEl('statExpired',      expired.length);

  /* ── المخططات ── */
  buildSalesChart(subs, now);
  buildProfitDonut(subs);

  /* ── قائمة المنتهية قريباً ── */
  const custMap = {};
  customers.forEach(c => { custMap[c.id] = c; });
  buildExpiringList(expiring, now, custMap);

  /* ── آخر المبيعات (اشتراكات) ── */
  const recent = [...subs]
    .sort((a, b) => (b.createdAt||'').localeCompare(a.createdAt||''))
    .slice(0, 10);
  buildRecentSales(recent, custMap);

  /* ── تحديث حالة الاشتراكات المنتهية تلقائياً ── */
  for (const s of expired) {
    s.status = 'expired';
    await db.update('subscriptions', s);
  }
}

/* ─────────────────────────── المساعدات ─────────────────────── */

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function buildSalesChart(subs, now) {
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
      subs
        .filter(s => (s.createdAt || '').startsWith(str))
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

function buildProfitDonut(subs) {
  const canvas = document.getElementById('profitDonut');
  if (!canvas) return;

  const map = {};
  subs.forEach(s => {
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

function buildExpiringList(expiring, now, custMap) {
  const el = document.getElementById('expiringList');
  if (!el) return;

  if (expiring.length === 0) {
    el.innerHTML = '<p class="empty-msg">✅ لا توجد اشتراكات تنتهي خلال 7 أيام</p>';
    return;
  }

  el.innerHTML = expiring
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .map(s => {
      const days = Math.ceil((new Date(s.endDate) - now) / 86400000);
      const cls  = days <= 1 ? 'urgent' : days <= 3 ? 'warning' : '';
      const lbl  = days === 0 ? 'اليوم!' : days === 1 ? 'غداً!' : `${days} أيام`;
      const c    = custMap[s.customerId] || {};
      return `
        <div class="expiring-item ${cls}">
          <div>
            <strong>${esc(c.name || '—')}</strong>
            <span class="sub-info">${esc(s.subscriptionTypeName || '')}</span>
          </div>
          <div class="expiring-meta">
            <span class="badge ${cls || 'badge-primary'}">${lbl}</span>
            <button class="btn-icon" title="إرسال تذكير واتساب"
              onclick="dashSendWa(${s.customerId}, ${s.id}, ${days})">💬</button>
          </div>
        </div>`;
    }).join('');
}

/* دالة إرسال واتساب آمنة من لوحة التحكم */
async function dashSendWa(customerId, subId, daysLeft) {
  const [customer, sub] = await Promise.all([
    db.get('customers', customerId),
    db.get('subscriptions', subId),
  ]);
  if (!customer || !sub) return;
  const msgData = {
    name: customer.name, whatsapp: customer.whatsapp,
    subscriptionTypeName: sub.subscriptionTypeName,
    endDate: sub.endDate, activationEmail: sub.activationEmail || '',
  };
  const msg = WhatsApp.buildMessage(msgData, daysLeft);
  WhatsApp.openWhatsApp(customer.whatsapp, msg);
}

function buildRecentSales(recent, custMap) {
  const el = document.getElementById('recentSales');
  if (!el) return;

  if (recent.length === 0) {
    el.innerHTML = '<p class="empty-msg">لا توجد مبيعات بعد</p>';
    return;
  }

  el.innerHTML = recent.map(s => {
    const c = custMap[s.customerId] || {};
    return `
      <div class="sale-row">
        <div class="sale-info">
          <strong>${esc(c.name || '—')}</strong>
          <span>${esc(s.subscriptionTypeName || '')}</span>
        </div>
        <div class="sale-amounts">
          <span class="profit-badge">+${fmtMoney(s.profit)}</span>
          <span class="sale-date">${(s.createdAt || '').slice(0, 10)}</span>
        </div>
      </div>`;
  }).join('');
}
