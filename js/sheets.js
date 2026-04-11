/* ============================================================
   sheets.js — النسخ الاحتياطي على Google Sheets
   ============================================================

   ════════════════════════════════════════════════════════════
   خطوات إعداد Google Sheets (اقرأ بعناية)
   ════════════════════════════════════════════════════════════

   1. أنشئ ملف Google Sheet جديد من drive.google.com
   2. من القائمة العلوية: Extensions ← Apps Script
   3. احذف كل الكود الموجود والصق الكود أدناه كاملاً
   4. احفظ المشروع (Ctrl+S) ثم اضغط: Deploy ← New deployment
   5. اختر النوع: Web app
   6. اضبط:
        • Execute as: Me (أنا)
        • Who has access: Anyone (أي شخص)
   7. اضغط Deploy وانسخ الـ Deployment URL
   8. الصق الرابط في إعدادات النظام ← رابط Apps Script

   ════════════════════════════════════════════════════════════
   كود Google Apps Script — انسخه كاملاً:
   ════════════════════════════════════════════════════════════

   function doPost(e) {
     try {
       const data = JSON.parse(e.postData.contents);
       const ss   = SpreadsheetApp.getActiveSpreadsheet();

       if (data.type === 'customer') {
         let sh = ss.getSheetByName('العملاء');
         if (!sh) {
           sh = ss.insertSheet('العملاء');
           sh.appendRow([
             'ID', 'الاسم', 'واتساب', 'نوع الاشتراك',
             'سعر البيع', 'تاريخ البداية', 'تاريخ النهاية',
             'الحالة', 'ملاحظات', 'تاريخ الإضافة'
           ]);
           sh.setFrozenRows(1);
           sh.getRange(1,1,1,10).setBackground('#4F46E5').setFontColor('#FFFFFF').setFontWeight('bold');
         }
         sh.appendRow([
           data.id, data.name, data.whatsapp, data.subscriptionType,
           data.salePrice, data.startDate, data.endDate, data.status,
           data.notes || '', new Date().toLocaleString('ar-SA')
         ]);
       }

       if (data.type === 'sale') {
         let sh = ss.getSheetByName('المبيعات');
         if (!sh) {
           sh = ss.insertSheet('المبيعات');
           sh.appendRow([
             'ID', 'العميل', 'واتساب', 'نوع الاشتراك',
             'سعر البيع', 'التكلفة', 'الربح', 'التاريخ', 'الموظف'
           ]);
           sh.setFrozenRows(1);
           sh.getRange(1,1,1,9).setBackground('#10B981').setFontColor('#FFFFFF').setFontWeight('bold');
         }
         sh.appendRow([
           data.id, data.customerName, data.whatsapp, data.subscriptionType,
           data.salePrice, data.costPrice, data.profit, data.date, data.employee
         ]);
       }

       return ContentService
         .createTextOutput(JSON.stringify({ success: true }))
         .setMimeType(ContentService.MimeType.JSON);

     } catch(err) {
       return ContentService
         .createTextOutput(JSON.stringify({ success: false, error: err.message }))
         .setMimeType(ContentService.MimeType.JSON);
     }
   }

   function doGet(e) {
     return ContentService
       .createTextOutput('CRM Sheets API v1.0 — running OK')
       .setMimeType(ContentService.MimeType.TEXT);
   }

   ════════════════════════════════════════════════════════════ */

const Sheets = {

  /* رابط Apps Script من الإعدادات */
  get url() {
    return localStorage.getItem('sheetsUrl') || '';
  },

  /* ─── إرسال بيانات للـ Sheet ─────────────────────────── */
  async send(payload) {
    const url = this.url;
    if (!url) return; /* لم يُضبط الرابط بعد */

    try {
      await fetch(url, {
        method : 'POST',
        mode   : 'no-cors', /* Apps Script يرفض CORS — no-cors كافٍ للإرسال */
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload),
      });
      console.log('[Sheets] ✅ تم الإرسال:', payload.type);
    } catch (err) {
      console.warn('[Sheets] ⚠️ تعذّر الإرسال:', err.message);
    }
  },

  /* ─── نسخ بيانات عميل ────────────────────────────────── */
  backupCustomer(customer, subType) {
    return this.send({
      type            : 'customer',
      id              : customer.id              || '',
      name            : customer.name            || '',
      whatsapp        : customer.whatsapp        || '',
      subscriptionType: subType?.name            || '',
      salePrice       : subType?.salePrice       || 0,
      startDate       : customer.startDate       || '',
      endDate         : customer.endDate         || '',
      status          : customer.status          || '',
      notes           : customer.notes           || '',
    });
  },

  /* ─── نسخ بيانات بيع ─────────────────────────────────── */
  backupSale(sale) {
    return this.send({
      type            : 'sale',
      id              : sale.id                  || '',
      customerName    : sale.customerName        || '',
      whatsapp        : sale.whatsapp            || '',
      subscriptionType: sale.subscriptionTypeName|| '',
      salePrice       : sale.salePrice           || 0,
      costPrice       : sale.costPrice           || 0,
      profit          : sale.profit              || 0,
      date            : (sale.date || '').slice(0, 10),
      employee        : sale.employeeName        || '',
    });
  },
};
