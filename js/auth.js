/* ============================================================
   auth.js — إدارة المصادقة والجلسة
   ============================================================ */

const Auth = {
  currentUser: null,

  /* ─── تسجيل الدخول ───────────────────────────────────── */
  async login(username, password) {
    const users = await db.getAll('users');
    const user  = users.find(
      u => u.username === username && u.password === btoa(password)
    );
    if (!user) return false;

    this.currentUser = user;
    sessionStorage.setItem('crmUser', JSON.stringify({
      id      : user.id,
      username: user.username,
      role    : user.role,
      name    : user.name,
    }));
    return true;
  },

  /* ─── تسجيل الخروج ───────────────────────────────────── */
  logout() {
    this.currentUser = null;
    sessionStorage.removeItem('crmUser');
    /* إيقاف مراقبة التذكيرات */
    if (typeof WhatsApp !== 'undefined') WhatsApp.stop();
    location.reload();
  },

  /* ─── استعادة الجلسة من sessionStorage ─────────────── */
  restore() {
    const raw = sessionStorage.getItem('crmUser');
    if (!raw) return false;
    try {
      this.currentUser = JSON.parse(raw);
      return !!this.currentUser;
    } catch {
      return false;
    }
  },

  /* ─── مساعدات ────────────────────────────────────────── */
  isAdmin()    { return this.currentUser?.role === 'admin'; },
  isLoggedIn() { return !!this.currentUser; },
  name()       { return this.currentUser?.name || ''; },
  role()       { return this.currentUser?.role || ''; },
};
