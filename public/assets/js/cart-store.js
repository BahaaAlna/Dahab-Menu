/* ============================================================
   🧺  حفظ السلة بالمتصفح

   الزبون عم يتصفّح بدون حساب، فالسلة عايشة بالذاكرة بس —
   أي تحديث للصفحة أو ضغطة «رجوع» كانت بتفرّغها، وهاد أسهل
   طريقة نخسر فيها طلب. فمنحفظها بـ localStorage.

   منحفظ المعرّفات والكميات بس — ولا سعر ولا اسم. الأسعار
   دائماً بتجي طازة من Firestore، فما في حالة يطلع فيها
   الزبون سعر قديم محفوظ من مبارح.

   كل قراءة وكتابة مغلّفة بـ try/catch: بالتصفّح الخاص أو لما
   يكون التخزين مقفول، localStorage بيرمي خطأ — والصفحة لازم
   تضل تشتغل عادي، بس بدون حفظ.
   ============================================================ */

const KEY = "dahab_cart";

/** رقم النسخة — إذا غيّرنا شكل المحفوظ منزوّده، فالمحفوظ
 *  القديم بينرمى بدل ما يكسر الصفحة. */
const VERSION = 1;

/** سلة أقدم من يوم ما عاد إلها معنى — الزبون يلي بيرجع بعد
 *  يومين ما لازم يلاقي غدا مبارح ناطره بالسلة. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function drop() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ما منقدر نشيل — ما بيضر */
  }
}

/** بترجّع Map من معرّف الصنف للكمية. سلة فاضية إذا ما في
 *  شي محفوظ، أو المحفوظ قديم أو خربان أو التخزين مقفول. */
export function loadCart() {
  const empty = new Map();

  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return empty; // تصفّح خاص أو تخزين مقفول
  }
  if (!raw) return empty;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    drop();
    return empty;
  }

  // نسخة تانية أو شكل غريب — منرميه بدل ما نحاول نفهمه
  if (!data || data.v !== VERSION || typeof data.items !== "object" || !data.items) {
    drop();
    return empty;
  }

  if (!Number.isFinite(data.at) || Date.now() - data.at > MAX_AGE_MS) {
    drop();
    return empty;
  }

  const cart = new Map();
  for (const [id, qty] of Object.entries(data.items)) {
    const n = Number(qty);
    // نفس الحدود يلي بتحكم السلة بالصفحة
    if (id && Number.isInteger(n) && n > 0 && n <= 99) cart.set(id, n);
  }
  return cart;
}

/** بينحفظ بعد كل تغيير. سلة فاضية = منشيل المحفوظ. */
export function saveCart(cart) {
  if (!cart.size) {
    drop();
    return;
  }

  const items = {};
  for (const [id, qty] of cart) items[id] = qty;

  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: VERSION, at: Date.now(), items })
    );
  } catch {
    /* التخزين مقفول أو مليان — الطلب بيضل شغال بدون حفظ */
  }
}
