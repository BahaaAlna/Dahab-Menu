/* ============================================================
   🧪  حساب الزبون على جهاز التطوير وحده

   تسجيل الدخول الحقيقي يمرّ بـ Firebase، وهو متعذّر محلياً لسببين:
   أولهما أن «البريد وكلمة المرور» غير مفعّل في Firebase Console،
   وثانيهما أن قواعد Firestore لم تُرفَع بعد فيُرفض حفظ ملف الزبون.
   والنتيجة أن واجهات الحساب كلها غير قابلة للتجربة أثناء التطوير.

   لذلك يُستبدَل هنا بمخزن محلي في المتصفح: إنشاء حساب وتسجيل دخول
   وخروج تعمل فوراً ودون إنترنت ودون أي تحقّق. الواجهة التي يراها
   المطوّر هي الواجهة نفسها، والفرق في مصدر البيانات فقط.

   ⚠️ هذا الملف للتطوير فقط، ولا يعمل إلا على عنوان محلي
   (انظر dev-mode.js). لا يُستعمل على الموقع المنشور إطلاقاً،
   ولا يصلح بديلاً عن تسجيل دخول حقيقي.
   ============================================================ */

import { newProfile } from "./profile-data.js";

const ACCOUNTS_KEY = "dahab:dev-accounts";
const SESSION_KEY = "dahab:dev-session";

/* ============================================================
   المخزن
   ============================================================ */

function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeAccounts(all) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(all));
}

/** الحسابات مخزَّنة بالرقم الموحَّد مفتاحاً، فالبحث مباشر */
function findByUid(uid) {
  return Object.values(readAccounts()).find((a) => a.uid === uid) || null;
}

/* ============================================================
   كلمة المرور

   لا تُخزَّن كما هي حتى في مخزن تطويري: تُخزَّن بصمتها مع ملح
   عشوائي. المخزن محلي ومؤقت، غير أن تخزين كلمة مرور صريحة عادة
   سيّئة يسهل أن تُنسخ إلى مكان أخطر.
   ============================================================ */

async function hashPassword(password, salt) {
  const bytes = new TextEncoder().encode(salt + ":" + password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ============================================================
   المستمعون — يحاكون onAuthStateChanged
   ============================================================ */

const listeners = new Set();

function currentUser() {
  const uid = localStorage.getItem(SESSION_KEY);
  if (!uid) return null;
  const account = findByUid(uid);
  return account ? { uid: account.uid } : null;
}

function notify() {
  const user = currentUser();
  for (const cb of listeners) cb(user);
}

/** ينادي cb بالمستخدم الحالي ثم عند كل تغيّر، ويُعيد دالة الإيقاف.
 *  النداء الأول مؤجَّل كما في Firebase، فلا يُنادى قبل أن يُكمل
 *  المستدعي تهيئة ما حوله. */
export function onUser(cb) {
  listeners.add(cb);
  queueMicrotask(() => {
    if (listeners.has(cb)) cb(currentUser());
  });
  return () => listeners.delete(cb);
}

/* ============================================================
   العمليات — ترمي أكواد Firebase نفسها لتعمل رسائل الخطأ كما هي
   ============================================================ */

export async function signUp({ canonical, name, password }) {
  const all = readAccounts();
  if (all[canonical]) throw { code: "auth/email-already-in-use" };
  if (String(password || "").length < 6) throw { code: "auth/weak-password" };

  const salt = crypto.randomUUID();
  all[canonical] = {
    uid: crypto.randomUUID(),
    ...newProfile({ name, phone: canonical }),
    salt,
    hash: await hashPassword(password, salt),
  };

  writeAccounts(all);
  localStorage.setItem(SESSION_KEY, all[canonical].uid);
  notify();
  return { uid: all[canonical].uid };
}

export async function signIn({ canonical, password }) {
  const account = readAccounts()[canonical];
  if (!account) throw { code: "auth/user-not-found" };

  const attempt = await hashPassword(password, account.salt);
  if (attempt !== account.hash) throw { code: "auth/wrong-password" };

  localStorage.setItem(SESSION_KEY, account.uid);
  notify();
  return { uid: account.uid };
}

export async function logOut() {
  localStorage.removeItem(SESSION_KEY);
  notify();
}

/* ---------- ملف الزبون ---------- */

export async function loadProfile(uid) {
  const account = findByUid(uid);
  if (!account) return null;

  // كلمة المرور لا تخرج من المخزن مهما كان
  const { salt, hash, uid: _uid, ...profile } = account;
  return profile;
}

export async function saveProfile(uid, data) {
  const all = readAccounts();
  const key = Object.keys(all).find((k) => all[k].uid === uid);
  if (!key) return;
  all[key] = { ...all[key], ...data };
  writeAccounts(all);
}

/* ============================================================
   أدوات المطوّر — تُنادى من console المتصفح
   ============================================================ */

/** يمسح جميع الحسابات المحلية والجلسة الحالية */
export function wipe() {
  localStorage.removeItem(ACCOUNTS_KEY);
  localStorage.removeItem(SESSION_KEY);
  notify();
  return "تم مسح جميع الحسابات المحلية.";
}

/** يعرض الحسابات الموجودة دون كلمات المرور */
export function list() {
  return Object.values(readAccounts()).map((a) => ({
    uid: a.uid,
    name: a.name,
    phone: a.phone,
    addresses: a.addresses,
    defaultAddress: a.defaultAddress,
  }));
}

// متاحة من console المتصفح:  dahabDev.wipe()  /  dahabDev.list()
window.dahabDev = { wipe, list };
