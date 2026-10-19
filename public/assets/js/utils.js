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

  // رقم الهاتف السوري: تسع خانات تبدأ بالرقم 9
  return /^9\d{8}$/.test(d) ? "963" + d : null;
}
