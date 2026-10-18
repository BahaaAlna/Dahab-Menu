/* ============================================================
   🚦  مفاتيح تشغيل الميزات

   ميزتان ما زالتا قيد التطوير: «طلب دليفري» و«طلب من الطاولة».
   تُدار كلتاهما من لوحة الإدارة عبر وثيقة واحدة في Firestore،
   فيظهر أثر التبديل على الموقع المنشور فوراً ودون إعادة نشر.

   القيمة الافتراضية لكل ميزة هي الإيقاف: إذا غابت الوثيقة أو
   تعذّرت قراءتها، تبقى الميزتان مخفيتين عن الزبائن. وهذا مقصود،
   إذ يُفضَّل أن تختفي ميزة جاهزة على أن تظهر ميزة غير جاهزة.
   ============================================================ */

import { db, doc, getDoc, onSnapshot } from "./firebase.js";
import { FEATURE_FLAGS } from "./config.js";
import { IS_LOCAL } from "./dev-mode.js";

/** الحالة الآمنة التي يُرجَع إليها عند أي خطأ */
export const ALL_OFF = Object.freeze({ delivery: false, table: false });

/** كل الميزات مفتوحة — تُستعمل على جهاز التطوير وحده */
const ALL_ON = Object.freeze({ delivery: true, table: true });

/* ---------- وضع التطوير المحلي ----------
   وثيقة المفاتيح تعيش في Firestore، وقراءتها من جهاز التطوير
   مرفوضة، فتُعتمد الحالة الآمنة وتختفي الميزتان. والنتيجة أن
   من يطوّر الميزتين لا يراهما أصلاً: صفحة الترحيب تعرض سطر
   «قيد التجهيز»، وصفحة الطلب تعيده إلى الترحيب فوراً.

   لذلك تُفتح الميزتان دائماً على العناوين المحلية، ودون أي
   اتصال بـ Firestore. أما الموقع المنشور فلا يتغيّر فيه شيء:
   تبقى المفاتيح وحدها هي الفيصل. */

/** لا تُعدّ الميزة مفعّلة إلا إذا كانت القيمة true صراحةً */
function normalize(data) {
  return {
    delivery: data?.delivery === true,
    table: data?.table === true,
  };
}

/** يستمع إلى المفاتيح وينادي cb عند كل تغيير.
 *  يُعيد دالة إيقاف الاستماع. */
export function subscribeFeatures(cb) {
  // محلياً: كل شيء مفتوح، ولا استماع ولا خطأ في الـ console
  if (IS_LOCAL) {
    cb(ALL_ON);
    return () => {};
  }

  return onSnapshot(
    doc(db, FEATURE_FLAGS.collection, FEATURE_FLAGS.doc),
    (snap) => cb(normalize(snap.exists() ? snap.data() : null)),
    (err) => {
      console.error("features error:", err);
      cb(ALL_OFF);
    }
  );
}

/** أقصى انتظار لردّ Firestore قبل اعتماد الحالة الآمنة (بالملّي ثانية).
 *  بدونه قد تبقى الصفحة معلّقة إلى ما لا نهاية عند انقطاع الشبكة،
 *  لأن Firestore يعيد المحاولة بصمت. */
const READ_TIMEOUT = 4000;

/** قراءة واحدة — للصفحات التي يكفيها التحقق مرة واحدة عند الفتح.
 *  تُرجع ALL_OFF عند أي خطأ أو تأخّر، فالميزة لا تُفتح إلا بتأكيد. */
export async function readFeatures() {
  if (IS_LOCAL) return ALL_ON;

  const read = (async () => {
    const snap = await getDoc(doc(db, FEATURE_FLAGS.collection, FEATURE_FLAGS.doc));
    return normalize(snap.exists() ? snap.data() : null);
  })();

  const timeout = new Promise((resolve) => setTimeout(() => resolve(ALL_OFF), READ_TIMEOUT));

  try {
    return await Promise.race([read, timeout]);
  } catch (err) {
    console.error("features error:", err);
    return ALL_OFF;
  }
}
