/* ============================================================
   🧺  حفظ السلة في المتصفح

   يتصفّح الزبون دون حساب، فتبقى السلة في الذاكرة وحدها. وأي
   تحديث للصفحة أو ضغطة «رجوع» كانت تُفرغها، وهذه أسهل طريقة
   لخسارة طلب. لذلك تُحفَظ في localStorage.

   تُحفَظ المعرّفات والكميات فقط، دون سعر أو اسم. فالأسعار تأتي
   دائماً محدَّثة من Firestore، ولا يمكن أن يظهر للزبون سعر قديم
   محفوظ من يوم سابق.

   كل قراءة وكتابة مغلّفة بـ try/catch: ففي التصفّح الخاص أو عند
   إغلاق التخزين يرمي localStorage خطأ، ويجب أن تبقى الصفحة
   تعمل كالمعتاد لكن دون حفظ.
   ============================================================ */

/* لكل نوع طلب سلّته: الدليفري والطاولة طلبان مختلفان في وقتين
   ومكانين. فمن ملأ سلة دليفري في بيته ثم مسح رمز طاولة في
   المطعم لا ينبغي أن يجد طلب الأمس بانتظاره على الطاولة. */
function keyFor(scope) {
  return "dahab_cart:" + scope;
}

/** رقم النسخة — عند تغيير شكل المحفوظ يُزاد هذا الرقم،
 *  فيُهمَل المحفوظ القديم بدل أن يتسبّب في كسر الصفحة. */
const VERSION = 1;

/** السلة الأقدم من يوم واحد لم يعد لها معنى، فالزبون العائد بعد
 *  يومين لا ينبغي أن يجد طلب الأمس في انتظاره. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function drop(scope) {
  try {
    localStorage.removeItem(keyFor(scope));
  } catch {
    /* تعذّر الحذف — لا ضرر في ذلك */
  }
}

/** تُرجع Map من معرّف الصنف إلى الكمية، وسلة فارغة إذا لم يكن
 *  هناك محفوظ، أو كان المحفوظ قديماً أو تالفاً أو التخزين مغلقاً. */
export function loadCart(scope) {
  const empty = new Map();

  let raw;
  try {
    raw = localStorage.getItem(keyFor(scope));
  } catch {
    return empty; // تصفّح خاص أو تخزين مغلق
  }
  if (!raw) return empty;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    drop(scope);
    return empty;
  }

  // نسخة أخرى أو شكل غير متوقَّع — يُهمَل بدل محاولة تفسيره
  if (!data || data.v !== VERSION || typeof data.items !== "object" || !data.items) {
    drop(scope);
    return empty;
  }

  if (!Number.isFinite(data.at) || Date.now() - data.at > MAX_AGE_MS) {
    drop(scope);
    return empty;
  }

  const cart = new Map();
  for (const [id, qty] of Object.entries(data.items)) {
    const n = Number(qty);
    // الحدود ذاتها التي تحكم السلة في الصفحة
    if (id && Number.isInteger(n) && n > 0 && n <= 99) cart.set(id, n);
  }
  return cart;
}

/** يُحفَظ بعد كل تغيير، والسلة الفارغة تعني حذف المحفوظ. */
export function saveCart(scope, cart) {
  if (!cart.size) {
    drop(scope);
    return;
  }

  const items = {};
  for (const [id, qty] of cart) items[id] = qty;

  try {
    localStorage.setItem(
      keyFor(scope),
      JSON.stringify({ v: VERSION, at: Date.now(), items })
    );
  } catch {
    /* التخزين مغلق أو ممتلئ — يبقى الطلب عاملاً دون حفظ */
  }
}
