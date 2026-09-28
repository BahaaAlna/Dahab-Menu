/* ============================================================
   🧰  دوال مساعدة مشتركة
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

/** تهريب النص قبل حقنه في HTML */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/** تهريب النص قبل وضعه داخل خاصية HTML */
export function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}
