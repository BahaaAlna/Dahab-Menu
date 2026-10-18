/* ============================================================
   🔑  حساب الزبون — رقم الموبايل وكلمة المرور

   لا تتوفّر لدينا واجهة لإرسال الرسائل القصيرة، فلا يمكن استعمال
   تحقّق Firebase عبر SMS لأنه يتطلّب خطة مدفوعة. والحل أن يكون
   رقم الموبايل هو اسم المستخدم، ويُركَّب له بريد داخلي شكلي:

        0912345678  →  963912345678@dahab.local

   لا يرى الزبون هذا البريد إطلاقاً، فهو لا يرى سوى «رقم الموبايل»
   و«كلمة المرور». أما Firebase فيتعامل معه كحساب بريد وكلمة مرور
   عادي، وبذلك نحصل على تسجيل دخول حقيقي ومجاني دون أي خدمة خارجية.

   ⚠️ ملاحظة صريحة: لا شيء يتحقّق من أن الرقم يعود فعلاً لصاحبه،
   فذلك يتطلّب رسالة قصيرة. وبما أن الاتصال بالزبون يجري لتأكيد
   الطلب، فهذا مقبول، غير أنه يجب أن يكون معلوماً.
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

/** النطاق الشكلي — غير موجود ولا يُرسَل إليه شيء، وهو مفتاح داخلي فقط */
const FAKE_DOMAIN = "dahab.local";

/** مجموعة ملفات الزبائن — يُخزَّن فيها الاسم والعنوان لتعبئتهما
 *  تلقائياً في الطلب التالي، فلا يعيد الزبون كتابتهما كل مرة. */
export const CUSTOMERS = "customers";

/* ============================================================
   توحيد شكل الرقم
   قد يكتبه الزبون بصيغ عديدة: 0912345678 أو +963 912 345 678
   أو 00963912345678، فتُردّ جميعها إلى صيغة واحدة: 963912345678
   ============================================================ */

export function normalizePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");

  if (d.startsWith("00963")) d = d.slice(5);
  else if (d.startsWith("963")) d = d.slice(3);

  if (d.startsWith("0")) d = d.slice(1);

  // رقم الموبايل السوري: تسع خانات تبدأ بالرقم 9
  return /^9\d{8}$/.test(d) ? "963" + d : null;
}

/** الصيغة المعروضة للزبون: 0912345678 */
export function prettyPhone(canonical) {
  const d = String(canonical || "").replace(/^963/, "");
  return "0" + d;
}

function emailFor(canonical) {
  return `${canonical}@${FAKE_DOMAIN}`;
}

/* ============================================================
   رسائل الخطأ — بالعربية وبلغة مفهومة للزبون، لا أكواد Firebase
   ============================================================ */

const MESSAGES = {
  "auth/email-already-in-use": "يوجد حساب بهذا الرقم مسبقاً. يُرجى تسجيل الدخول.",
  "auth/invalid-credential": "الرقم أو كلمة المرور غير صحيحة.",
  "auth/invalid-login-credentials": "الرقم أو كلمة المرور غير صحيحة.",
  "auth/wrong-password": "كلمة المرور غير صحيحة.",
  "auth/user-not-found": "لا يوجد حساب بهذا الرقم. يُرجى إنشاء حساب جديد.",
  "auth/weak-password": "كلمة المرور قصيرة، والحد الأدنى ست خانات.",
  "auth/too-many-requests": "عدد المحاولات كبير. يُرجى الانتظار قليلاً ثم إعادة المحاولة.",
  "auth/network-request-failed": "لا يوجد اتصال بالإنترنت.",
  "auth/operation-not-allowed":
    "تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase Console.",
};

export function authErrorMessage(err) {
  return MESSAGES[err?.code] || "حدث خطأ. يُرجى إعادة المحاولة.";
}

/* ============================================================
   العمليات
   ============================================================ */

/** إنشاء حساب جديد: الرقم والاسم وكلمة المرور */
export async function signUp({ phone, name, password }) {
  const canonical = normalizePhone(phone);
  if (!canonical) throw { code: "dahab/bad-phone" };

  await setPersistence(auth, browserLocalPersistence);
  const cred = await createUserWithEmailAndPassword(
    auth, emailFor(canonical), password
  );

  // ملف الزبون — الاسم والرقم جاهزان للطلب التالي
  await setDoc(doc(db, CUSTOMERS, cred.user.uid), {
    name: String(name).trim(),
    phone: canonical,
    address: "",
  });

  return cred.user;
}

/** تسجيل الدخول */
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

/** ينادي cb بالمستخدم الحالي (أو null) وعند كل تغيّر في الحالة */
export function onUser(cb) {
  return onAuthStateChanged(auth, cb);
}

/** ملف الزبون المخزَّن — الاسم والعنوان لتعبئة الطلب */
export async function loadProfile(uid) {
  const snap = await getDoc(doc(db, CUSTOMERS, uid));
  return snap.exists() ? snap.data() : null;
}

/** يُحدَّث العنوان بعد أول طلب، فيأتي الطلب التالي معبّأً */
export function saveProfile(uid, data) {
  return setDoc(doc(db, CUSTOMERS, uid), data, { merge: true });
}
