/* ============================================================
   db.js — IndexedDB Database Manager (v3)
   ============================================================ */
const DB_NAME    = 'SubscriptionCRM';
const DB_VERSION = 3;

class Database {
  constructor() { this.db = null; }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onerror   = () => reject(req.error);
      req.onsuccess = () => { this.db = req.result; resolve(); };

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        /* ── users ── */
        if (!db.objectStoreNames.contains('users')) {
          const s = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
          s.createIndex('username', 'username', { unique: true });
        }

        /* ── subscriptionTypes ── */
        if (!db.objectStoreNames.contains('subscriptionTypes')) {
          const s = db.createObjectStore('subscriptionTypes', { keyPath: 'id', autoIncrement: true });
          s.createIndex('active', 'active', { unique: false });
        }

        /* ── customers (v3: personal info only) ── */
        if (!db.objectStoreNames.contains('customers')) {
          const s = db.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
          s.createIndex('whatsapp',  'whatsapp',  { unique: false });
          s.createIndex('createdAt', 'createdAt', { unique: false });
        }

        /* ── subscriptions (NEW in v3) ── */
        if (!db.objectStoreNames.contains('subscriptions')) {
          const s = db.createObjectStore('subscriptions', { keyPath: 'id', autoIncrement: true });
          s.createIndex('customerId', 'customerId', { unique: false });
          s.createIndex('status',     'status',     { unique: false });
          s.createIndex('endDate',    'endDate',    { unique: false });
          s.createIndex('createdAt',  'createdAt',  { unique: false });
        }

        /* ── sales (legacy) ── */
        if (!db.objectStoreNames.contains('sales')) {
          const s = db.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
          s.createIndex('date',       'date',       { unique: false });
          s.createIndex('customerId', 'customerId', { unique: false });
        }

        /* ── reminderLog ── */
        if (!db.objectStoreNames.contains('reminderLog')) {
          const s = db.createObjectStore('reminderLog', { keyPath: 'id', autoIncrement: true });
          s.createIndex('key', 'key', { unique: true });
        }
      };
    });
  }

  /* ── Generic helpers ── */
  _tx(store, mode = 'readonly') {
    return this.db.transaction(store, mode).objectStore(store);
  }

  add(store, data) {
    return new Promise((res, rej) => {
      const r = this._tx(store, 'readwrite').add(data);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  get(store, id) {
    return new Promise((res, rej) => {
      const r = this._tx(store).get(id);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  getAll(store) {
    return new Promise((res, rej) => {
      const r = this._tx(store).getAll();
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  update(store, data) {
    return new Promise((res, rej) => {
      const r = this._tx(store, 'readwrite').put(data);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  delete(store, id) {
    return new Promise((res, rej) => {
      const r = this._tx(store, 'readwrite').delete(id);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  getByIndex(store, idx, val) {
    return new Promise((res, rej) => {
      const r = this._tx(store).index(idx).getAll(val);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  getByRange(store, idx, lower, upper) {
    return new Promise((res, rej) => {
      const range = IDBKeyRange.bound(lower, upper);
      const r     = this._tx(store).index(idx).getAll(range);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  /* ── Migrate old data (v2 customers → v3 subscriptions) ── */
  async migrate() {
    const existingSubs = await this.getAll('subscriptions');
    if (existingSubs.length > 0) return; // already migrated

    const customers = await this.getAll('customers');
    const oldSales  = await this.getAll('sales');

    for (const c of customers) {
      if (!c.subscriptionTypeId || !c.startDate) continue;
      const sale = oldSales.find(s => s.customerId === c.id);
      await this.add('subscriptions', {
        customerId          : c.id,
        subscriptionTypeId  : c.subscriptionTypeId,
        subscriptionTypeName: c.subscriptionTypeName || '',
        durationMonths      : 1,
        startDate           : c.startDate,
        endDate             : c.endDate || c.startDate,
        originalPrice       : sale?.salePrice || 0,
        salePrice           : sale?.salePrice || 0,
        costPrice           : sale?.costPrice || 0,
        profit              : sale?.profit    || 0,
        activationEmail     : '',
        status              : c.status || 'active',
        notes               : '',
        createdAt           : c.createdAt || new Date().toISOString(),
        createdBy           : c.createdBy,
      });
    }
  }

  /* ── Seed default data ── */
  async seed() {
    const users = await this.getAll('users');
    if (users.length === 0) {
      await this.add('users', { username: 'admin',    password: btoa('admin123'), role: 'admin',    name: 'المدير',  createdAt: new Date().toISOString() });
      await this.add('users', { username: 'employee', password: btoa('emp123'),   role: 'employee', name: 'الموظف', createdAt: new Date().toISOString() });
    }

    const types = await this.getAll('subscriptionTypes');
    if (types.length === 0) {
      const defaults = [
        { name: 'بيسك شهري',      durationMonths: 1,  costPrice: 50,  salePrice: 100, description: 'اشتراك شهري أساسي',  active: true },
        { name: 'ستاندرد 3 أشهر', durationMonths: 3,  costPrice: 130, salePrice: 270, description: 'اشتراك ربع سنوي',    active: true },
        { name: 'بريميوم 6 أشهر', durationMonths: 6,  costPrice: 240, salePrice: 480, description: 'اشتراك نصف سنوي',   active: true },
        { name: 'سنوي',           durationMonths: 12, costPrice: 450, salePrice: 900, description: 'اشتراك سنوي كامل',  active: true },
      ];
      for (const d of defaults) await this.add('subscriptionTypes', d);
    }
  }
}

const db = new Database();
