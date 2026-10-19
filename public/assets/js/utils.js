/* ============================================================
     دوال مساعدة مشتركة
   ============================================================ */

/** ترتيب حسب الحقل order تصاعدياً */
export function byOrder(a, b) {
  return (a.order || 0) - (b.order || 0);
}

/** تجميع الأصناف حسب القسم، مع ترتيب أصناف كل قسم */
export function groupBySection(items) {
  const grouped = {};
  for (const item of items) {
    (grouped[item.sectionId] ||= []).push(item);
  }
  for (const list of Object.values(grouped)) list.sort(byOrder);
  return grouped;
}

/** تهريب النص قبل إدراجه في HTML */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/** تهريب النص قبل وضعه داخل خاصية HTML */
export function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

/* ============================================================
   توحيد شكل رقم الهاتف
   قد يكتبه الزبون بصيغ عديدة: 0912345678 أو ‎+963 912 345 678‎
   أو 00963912345678، فتُردّ جميعها إلى صيغة واحدة: 963912345678

   كانت هذه الدالة في auth.js، وبقيت بعد إزالة الحسابات لأن
   نافذة التأكيد تتحقّق بها من الرقم الذي يكتبه الضيف.
   ============================================================ */
export function normalizePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");

  if (d.startsWith("00963")) d = d.slice(5);
  else if (d.startsWith("963")) d = d.slice(3);

  if (d.startsWith("0")) d = d.slice(1);

  // جوال: تسع خانات تبدأ بالرقم 9.  أرضي: تسع خانات تبدأ برمز المحافظة 1–8
  return /^[1-9]\d{8}$/.test(d) ? "963" + d : null;
}

/* ============================================================
   كتابة الرقم للعرض

     الجوال   0912 345 678   (4 – 3 – 3)
     الأرضي   033 4567 890   (3 – 4 – 3)

   تقبل الصيغة الموحَّدة (963…) أو المحلية (0…). وما لا يُعرَف شكله
   يُعاد كما هو، فلا يُخفى رقم قديم مخزَّن بصيغة غريبة.
   ============================================================ */
function groupLocal(d) {
  // d: أرقام محلية تبدأ بصفر. الجوال يبدأ بـ 09، وما سواه أرضي.
  const sizes = d.startsWith("09") ? [4, 3, 3] : [3, 4, 3];
  const parts = [];
  let i = 0;
  for (const n of sizes) {
    if (i >= d.length) break;
    parts.push(d.slice(i, i + n));
    i += n;
  }
  return parts.join(" ");
}

export function formatPhone(value) {
  const n = normalizePhone(value);
  return n ? groupLocal("0" + n.slice(3)) : String(value ?? "");
}

/** تنسيق حيّ أثناء الكتابة: يضع المسافات تلقائياً ولا يقبل أكثر من عشر خانات */
export function formatPhoneTyping(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00963")) d = "0" + d.slice(5);
  else if (d.startsWith("963")) d = "0" + d.slice(3);
  return groupLocal(d.slice(0, 10));
}
