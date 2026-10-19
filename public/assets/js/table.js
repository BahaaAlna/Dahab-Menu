/* ============================================================
   🍽️  صفحة الطلب من الطاولة

   الزبون في المطعم يمسح الرمز الملصَق على طاولته، فيفتح الرابط:

       https://dahab-hama.shop/table?t=3

   ورقم الطاولة يأتي من العنوان وحده، لأنه الشيء الوحيد الذي
   يعرفه الرمز ولا يعرفه الزبون بالضرورة. ولو تُرك له أن يكتبه
   بيده لأخطأ فيه أو عبث به، فذهب الطلب إلى طاولة غيره.

   وما عدا رقم الطاولة فالصفحة هي صفحة الدليفري نفسها: القائمة
   والسلة ونافذة التأكيد كلها من order-core.js. والفرق أن الطلب
   لا يحتاج رقم هاتف ولا عنواناً، فهو يُحمَل إلى الطاولة لا
   يُوصَّل إلى بيت.
   ============================================================ */

import { mountOrderPage, arabicNum } from "./order-core.js";

const $ = (id) => document.getElementById(id);

/** أقصى رقم طاولة تقبله قواعد Firestore */
const MAX_TABLE = 200;

/** رقم الطاولة من ‎?t=‎ — أو null إن غاب أو كان خارج المدى.
 *  يُتحقَّق منه هنا وفي القواعد: الواجهة تمنع الخطأ، والقواعد
 *  تمنع العبث، ولا يُستغنى بأحدهما عن الآخر. */
function readTableNumber() {
  const raw = new URLSearchParams(location.search).get("t");
  if (!/^\d{1,3}$/.test(String(raw || "").trim())) return null;

  const n = Number(raw);
  return n >= 1 && n <= MAX_TABLE ? n : null;
}

const table = readTableNumber();

if (table === null) {
  // لا رقم طاولة: تُعرَض شاشة «امسح رمز طاولتك» ولا تُحمَّل القائمة
  $("tableGate").hidden = false;
} else {
  $("orderApp").hidden = false;
  $("tableNum").textContent = arabicNum(table);
  $("coTableNum").textContent = arabicNum(table);

  await mountOrderPage({
    feature: "table",

    buildOrder: ({ items, total }) => {
      const name = $("coName").value.trim();

      const order = { type: "table", table, items, total };
      // الاسم اختياري، فلا تُرسَل خانة فارغة إلى قاعدة البيانات
      if (name) order.customer = { name };

      return { order };
    },
  });
}
