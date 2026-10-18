/* ============================================================
   🔑  حساب الزبون — رقم الموبايل + كلمة سر

   ما عنا API للرسائل القصيرة، فما منقدر نستعمل تحقق Firebase
   بالـ SMS (بدو خطة مدفوعة). الحل: منخلي رقم الموبايل هو
   اسم المستخدم، ومنركّبله إيميل داخلي شكلي:

        0912345678  →  963912345678@dahab.local

   الزبون بحياته ما بيشوف هالإيميل — هو بس بيشوف «رقم الموبايل»
   و«كلمة السر». وFirebase بيتعامل معه كحساب إيميل/كلمة سر عادي،
   فمنستفيد من تسجيل دخول حقيقي ومجاني بدون أي خدمة خارجية.

   ⚠️ ملاحظة صريحة: ما في شي بيتأكد إن الرقم فعلاً لصاحبه —
   هاد بدو SMS. بما إنكم بتتصلوا بالزبون لتأكيد الدليفري،
   هاد مقبول، بس لازم يكون معروف.
   ============================================================ */

import {
  auth, db, doc, getDoc, setDoc,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "./firebase.js";

/** الدومين الشكلي — ما بينوجد ولا بينبعتله شي، هو بس مفتاح داخلي */
const FAKE_DOMAIN = "dahab.local";

/** مجموعة ملفات الزباين — منخزن الاسم والعنوان لتعبئتهم تلقائياً
 *  بالطلب الجاي، فالزبون ما يعيد كتابتهم كل مرة. */
export const CUSTOMERS = "customers";

/* ============================================================
   توحيد شكل الرقم
   الزبون ممكن يكتبه بألف شكل: 0912345678 أو +963 912 345 678
   أو 00963912345678. منرجّعهم كلهن لشكل واحد: 963912345678
   ============================================================ */

export function normalizePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");

  if (d.startsWith("00963")) d = d.slice(5);
  else if (d.startsWith("963")) d = d.slice(3);

  if (d.startsWith("0")) d = d.slice(1);

  // الموبايل السوري: 9 خانات بتبلش بـ 9
  return /^9\d{8}$/.test(d) ? "963" + d : null;
}

/** الشكل يلي منعرضه للزبون: 0912345678 */
export function prettyPhone(canonical) {
  const d = String(canonical || "").replace(/^963/, "");
  return "0" + d;
}

function emailFor(canonical) {
  return `${canonical}@${FAKE_DOMAIN}`;
}

/* ============================================================
   رسائل الخطأ — بالعربي وبلغة الزبون، مو أكواد Firebase
   ============================================================ */

const MESSAGES = {
  "auth/email-already-in-use": "في حساب بهالرقم من قبل. جرّب تسجيل الدخول.",
  "auth/invalid-credential": "الرقم أو كلمة السر غلط.",
  "auth/invalid-login-credentials": "الرقم أو كلمة السر غلط.",
  "auth/wrong-password": "كلمة السر غلط.",
  "auth/user-not-found": "ما في حساب بهالرقم. سجّل حساب جديد.",
  "auth/weak-password": "كلمة السر قصيرة — بدها ٦ خانات على الأقل.",
  "auth/too-many-requests": "محاولات كتير. استنى شوي وجرّب كمان مرة.",
  "auth/network-request-failed": "ما في اتصال بالإنترنت.",
  "auth/operation-not-allowed":
    "تسجيل الدخول بالإيميل/كلمة السر مو مفعّل بـ Firebase Console.",
};

export function authErrorMessage(err) {
  return MESSAGES[err?.code] || "صار خطأ. جرّب كمان مرة.";
}

/* ============================================================
   العمليات
   ============================================================ */

/** حساب جديد: رقم + اسم + كلمة سر */
export async function signUp({ phone, name, password }) {
  const canonical = normalizePhone(phone);
  if (!canonical) throw { code: "dahab/bad-phone" };

  await setPersistence(auth, browserLocalPersistence);
  const cred = await createUserWithEmailAndPassword(
    auth, emailFor(canonical), password
  );

  // ملف الزبون — الاسم والرقم جاهزين للطلب الجاي
  await setDoc(doc(db, CUSTOMERS, cred.user.uid), {
    name: String(name).trim(),
    phone: canonical,
    address: "",
  });

  return cred.user;
}

/** تسجيل دخول */
export async function signIn({ phone, password }) {
  const canonical = normalizePhone(phone);
  if (!canonical) throw { code: "dahab/bad-phone" };

  await setPersistence(auth, browserLocalPersistence);
  const cred = await signInWithEmailAndPassword(
    auth, emailFor(canonical), password
  );
  return cred.user;
}

export function logOut() {
  return signOut(auth);
}

/** بينادي cb بالمستخدم الحالي (أو null) وكل مرة بتتغير الحالة */
export function onUser(cb) {
  return onAuthStateChanged(auth, cb);
}

/** ملف الزبون المخزّن — الاسم والعنوان لتعبئة الطلب */
export async function loadProfile(uid) {
  const snap = await getDoc(doc(db, CUSTOMERS, uid));
  return snap.exists() ? snap.data() : null;
}

/** منحدّث العنوان بعد أول طلب، فالطلب الجاي بيجي معبّى */
export function saveProfile(uid, data) {
  return setDoc(doc(db, CUSTOMERS, uid), data, { merge: true });
}
