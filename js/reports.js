/* ============================================================
   reports.js — التقارير والإحصاءات
   ============================================================ */

let reportChart = null;

/* ─── تحميل التقارير ────────────────────────────────────── */
async function loadReports() {
  const period       = document.getElementById('reportPeriod')?.value || 'month';
  const [start, end] = getPeriodRange(period);

  const allSales = await db.getAll('sales');
  const filtered = allSales.filter(s => {
    const d = (s.date || '').slice(0, 10);
    return d >= start && d <= end;
  });

  /* ── ملخص الأرقام ── */
  const totalRevenue = filtered.reduce((a, s) => a + (s.salePrice || 0), 0);
  const totalCost    = filtered.reduce((a, s) => a + (s.costPrice || 0), 0);
  const totalProfit  = filtered.reduce((a, s) => a + (s.profit    || 0), 0);
  const salesCount   = filtered.length;
  const margin       = totalRevenue > 0
    ? Math.round((totalProfit / totalRevenue) * 100) + '%'
    : '0%';

  setEl('reportRevenue', fmtMoney(totalRevenue));
  setEl('reportCost',    fmtMoney(totalCost));
  setEl('reportProfit',  fmtMoney(totalProfit));
  setEl('reportCount',   salesCount);
  setEl('reportMargin',  margin);

  /* ── المخطط ── */
  buildReportChart(filtered, start, end);

  /* ── الجدول ── */
  buildReportTable(filtered);
}

/* ─── حساب نطاق التاريخ ─────────────────────────────────── */
function getPeriodRange(period) {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);

  if (period === 'today') return [today, today];

  if (period === 'week') {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return [s.toISOString().slice(0, 10), today];
  }

  if (period === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return [s.toISOString().slice(0, 10), today];
  }

  if (period === 'year') {
    return [`${now.getFullYear()}-01-01`, today];
  }

  /* مخصص */
  const s = document.getElementById('reportFrom')?.value || today;
  const e = document.getElementById('reportTo')?.value   || today;
  return [s < e ? s : e, s < e ? e : s]; /* نضمن أن البداية قبل النهاية */
}

/* ─── بناء مخطط الإيرادات ────────────────────────────────── */
function buildReportChart(sales, start, end) {
  const canvas = document.getElementById('reportChart');
  if (!canvas) return;

  /* توليد تسميات الأيام */
  const labels = [];
  const cur    = new Date(start);
  const endD   = new Date(end);
  while (cur <= endD) {
    labels.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  /* إجمالات يومية */
  const revenueData = labels.map(l =>
    sales.filter(s => (s.date || '').startsWith(l))
         .reduce((a, s) => a + (s.salePrice || 0), 0)
  );
  const profitData = labels.map(l =>
    sales.filter(s => (s.date || '').startsWith(l))
         .reduce((a, s) => a + (s.profit || 0), 0)
  );

  /* تقصير التسمية لـ MM-DD إذا كثرت الأيام */
  const displayLabels = labels.length > 31
    ? labels.map((l, i) => i % 7 === 0 ? l.slice(5) : '')
    : labels.map(l => l.slice(5));

  if (reportChart) reportChart.destroy();
  reportChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: displayLabels,
      datasets: [
        {
          label          : 'الإيرادات',
          data           : revenueData,
          borderColor    : '#6366F1',
          backgroundColor: 'rgba(99,102,241,.12)',
          fill           : true,
          tension        : 0.4,
          pointRadius    : labels.length > 30 ? 0 : 3,
        },
        {
          label          : 'الأرباح',
          data           : profitData,
          borderColor    : '#10B981',
          backgroundColor: 'rgba(16,185,129,.08)',
          fill           : true,
          tension        : 0.4,
          pointRadius    : labels.length > 30 ? 0 : 3,
        },
      ],
    },
    options: {
      responsive         : true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels  : { font: { family: 'Tajawal', size: 13 }, padding: 16 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('ar-SA')} ₪`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => v.toLocaleString('ar-SA') + ' ₪',
            font    : { family: 'Tajawal' },
          },
        },
        x: { ticks: { font: { family: 'Tajawal' } } },
      },
    },
  });
}

/* ─── جدول تفاصيل المبيعات ───────────────────────────────── */
function buildReportTable(sales) {
  const tbody = document.getElementById('reportTableBody');
  if (!tbody) return;

  if (sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-msg">
      <i class="fas fa-chart-bar" style="display:block;font-size:2rem;opacity:.3;margin-bottom:.5rem"></i>
      لا توجد مبيعات في هذه الفترة
    </td></tr>`;
    return;
  }

  const sorted = [...sales].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  tbody.innerHTML = sorted.map(s => `
    <tr>
      <td dir="ltr">${(s.date || '').slice(0, 10)}</td>
      <td><strong>${esc(s.customerName || '')}</strong></td>
      <td>${esc(s.subscriptionTypeName || '')}</td>
      <td>${(s.salePrice || 0).toLocaleString('ar-SA')} ₪</td>
      <td>${(s.costPrice || 0).toLocaleString('ar-SA')} ₪</td>
      <td class="profit-cell">+${(s.profit || 0).toLocaleString('ar-SA')} ₪</td>
      <td>${esc(s.employeeName || '—')}</td>
    </tr>`).join('');
}

/* ─── تصدير التقرير CSV ─────────────────────────────────── */
async function exportReportsCSV() {
  const period       = document.getElementById('reportPeriod')?.value || 'month';
  const [start, end] = getPeriodRange(period);

  const allSales = await db.getAll('sales');
  const filtered = allSales.filter(s => {
    const d = (s.date || '').slice(0, 10);
    return d >= start && d <= end;
  });

  if (filtered.length === 0) {
    showToast('لا توجد بيانات للتصدير في هذه الفترة', 'warning');
    return;
  }

  const rows = [
    ['التاريخ', 'العميل', 'نوع الاشتراك', 'سعر البيع', 'التكلفة', 'الربح', 'الموظف'],
    ...filtered
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(s => [
        (s.date || '').slice(0, 10),
        s.customerName        || '',
        s.subscriptionTypeName|| '',
        s.salePrice           || 0,
        s.costPrice           || 0,
        s.profit              || 0,
        s.employeeName        || '',
      ]),
  ];

  downloadCSV(rows, `تقرير_${start}_${end}.csv`);
  showToast(`تم تصدير ${filtered.length} سجل`, 'success');
}

/* ─── إظهار / إخفاء نطاق التاريخ المخصص ──────────────────── */
function toggleCustomDateRange() {
  const isCustom = document.getElementById('reportPeriod')?.value === 'custom';
  document.getElementById('customDateRange')?.classList.toggle('hidden', !isCustom);
  if (isCustom) {
    const today = new Date().toISOString().slice(0, 10);
    const from  = document.getElementById('reportFrom');
    const to    = document.getElementById('reportTo');
    if (from && !from.value) from.value = today;
    if (to   && !to.value)   to.value   = today;
  }
}
