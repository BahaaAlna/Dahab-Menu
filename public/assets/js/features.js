/* ============================================================
     مفاتيح تشغيل الميزات

   ميزتان ما زالتا قيد التطوير: «طلب دليفري» و«طلب من الطاولة».
   تُدار كلتاهما من لوحة الإدارة عبر وثيقة واحدة في Firestore،
   فيظهر أثر التبديل على الموقع المنشور فوراً ودون إعادة نشر.

   القيمة الافتراضية لكل ميزة هي الإيقاف: إذا غابت الوثيقة أو
   تعذّرت قراءتها ولا نسخة محفوظة، تبقى الميزتان مخفيتين عن
   الزبائن. وهذا مقصود، إذ يُفضَّل أن تختفي ميزة جاهزة على أن
   تظهر ميزة غير جاهزة.

   ⟶ السرعة: صفحة الترحيب كانت تنتظر تحميل مكتبة Firebase كاملة
   ثم اتصالاً مفتوحاً بالخادم قبل أن تُظهر الخيارين، فيرى الزبون
   خياراً واحداً ثم يحتاج إلى تحديث الصفحة. والترتيب الآن:
     ١. آخر قيم معروفة من تخزين المتصفح — تُرسَم في الحال.
     ٢. قراءة واحدة خفيفة عبر REST (طلب fetch عادي، بلا مكتبة).
     ٣. استماع مباشر عبر المكتبة يُحمَّل في الخلفية، لتصل التغييرات
        لاحقاً دون تحديث.
   ============================================================ */

import { FEATURE_FLAGS, firebaseConfig } from "./config.js";
import { IS_LOCAL } from "./dev-mode.js";

/** الحالة الآمنة التي يُرجَع إليها عند أي خطأ */
export const ALL_OFF = Object.freeze({ delivery: false, table: false });

/** كل الميزات مفتوحة — تُستعمل على جهاز التطوير وحده */
const ALL_ON = Object.freeze({ delivery: true, table: true });

/** مفتاح التخزين المحلي لآخر قيم معروفة */
const CACHE_KEY = "dahab:features";

/** أقصى انتظار لردّ الخادم قبل اعتماد البديل (بالملّي ثانية) */
const READ_TIMEOUT = 6000;

/* ---------- وضع التطوير المحلي ----------
   وثيقة المفاتيح تعيش في Firestore، وقراءتها من جهاز التطوير
   مرفوضة أحياناً، فتُفتح الميزتان دائماً على العناوين المحلية دون
   أي اتصال. أما الموقع المنشور فلا يتغيّر فيه شيء: تبقى المفاتيح
   وحدها هي الفيصل. */

/** لا تُعدّ الميزة مفعّلة إلا إذا كانت القيمة true صراحةً */
function normalize(data) {
  return {
    delivery: data?.delivery === true,
    table: data?.table === true,
  };
}

/* ---------- آخر قيم معروفة ---------- */

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch (_) {
    return null;   // تخزين محجوب أو تالف: كأنه غير موجود
  }
}

function writeCache(flags) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(flags));
  } catch (_) { /* لا يضرّ: يُقرأ من الخادم في الزيارة التالية */ }
}

/* ---------- قراءة REST ----------
   طلب fetch واحد إلى واجهة Firestore العامة، يصل في أجزاء من
   الثانية لأنه لا ينتظر مكتبة ولا اتصالاً مفتوحاً. والقراءة مسموحة
   للجميع بحكم القواعد. وثيقة غائبة (404) تعني: كل شيء مطفأ. */
async function fetchFlags() {
  const { projectId, apiKey } = firebaseConfig;
  const url =
    "https://firestore.googleapis.com/v1/projects/" + projectId +
    "/databases/(default)/documents/" +
    FEATURE_FLAGS.collection + "/" + FEATURE_FLAGS.doc +
    "?key=" + encodeURIComponent(apiKey);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), READ_TIMEOUT);

  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (res.status === 404) return { ...ALL_OFF };
    if (!res.ok) throw new Error("features http " + res.status);

    const f = (await res.json()).fields || {};
    return normalize({
      delivery: f.delivery?.booleanValue,
      table: f.table?.booleanValue,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** يستمع إلى المفاتيح وينادي cb عند كل تغيير.
 *  يُعيد دالة إيقاف الاستماع. */
export function subscribeFeatures(cb) {
  // محلياً: كل شيء مفتوح، ولا استماع ولا خطأ في الـ console
  if (IS_LOCAL) {
    cb(ALL_ON);
    return () => {};
  }

  let stopped = false;
  let unsubscribe = () => {};
  let known = readCache();
  let delivered = false;

  const push = (flags) => {
    if (stopped) return;
    known = flags;
    delivered = true;
    writeCache(flags);
    cb(flags);
  };

  // ١. آخر قيم معروفة: الرسم الفوري
  if (known) {
    delivered = true;
    cb(known);
  }

  // ٢. قراءة REST الخفيفة
  fetchFlags().then(push).catch((err) => {
    console.error("features error:", err);
    if (!delivered) push({ ...ALL_OFF });
  });

  // ٣. استماع مباشر في الخلفية — المكتبة تُحمَّل بعد أن رُسمت الصفحة
  import("./firebase.js").then(({ db, doc, onSnapshot }) => {
    if (stopped) return;
    unsubscribe = onSnapshot(
      doc(db, FEATURE_FLAGS.collection, FEATURE_FLAGS.doc),
      (snap) => push(normalize(snap.exists() ? snap.data() : null)),
      (err) => console.error("features listen error:", err)
    );
  }).catch((err) => console.error("features sdk error:", err));

  return () => {
    stopped = true;
    unsubscribe();
  };
}

/** قراءة واحدة — للصفحات التي يكفيها التحقق مرة واحدة عند الفتح.
 *  عند تعذّر الوصول تُرجع آخر قيم معروفة، وإلا ALL_OFF: الميزة لا
 *  تُفتح إلا بتأكيد أو بسابقة تأكيد. */
export async function readFeatures() {
  if (IS_LOCAL) return ALL_ON;

  try {
    const flags = await fetchFlags();
    writeCache(flags);
    return flags;
  } catch (err) {
    console.error("features error:", err);
    return readCache() || { ...ALL_OFF };
  }
}
