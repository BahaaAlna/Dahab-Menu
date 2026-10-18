/* ============================================================
   👋  صفحة الترحيب

   الصفحة كلها روابط عادية عدا خيار «طلب من الطاولة»، فهو
   يفتح نافذة تشرح للزبون كيف يمسح كود طاولته. وتُستعمل هنا
   نافذة <dialog> الأصلية في المتصفح: تأتي جاهزة بالإغلاق عبر
   Esc وبحصر التركيز داخلها، دون أي مكتبة خارجية.

   خيارا الطلب مخفيان في HTML افتراضياً، ولا يظهران إلا إذا
   فعّلتهما لوحة الإدارة. وهكذا لا يلمح الزبون ميزة غير جاهزة
   في اللحظات الأولى قبل وصول ردّ Firestore.
   ============================================================ */

import { subscribeFeatures } from "./features.js";

const dialog = document.getElementById("scanDialog");
const openBtn = document.getElementById("tableBtn");
const closeBtn = document.getElementById("scanCloseBtn");
const deliveryChoice = document.getElementById("deliveryChoice");
const soonNote = document.getElementById("choicesSoon");

openBtn.addEventListener("click", () => dialog.showModal());
closeBtn.addEventListener("click", () => dialog.close());

/* الضغط على الخلفية السوداء خارج الصندوق يُغلق النافذة */
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});

/* ---------- مفاتيح الميزات ---------- */

subscribeFeatures((flags) => {
  deliveryChoice.hidden = !flags.delivery;
  openBtn.hidden = !flags.table;
  soonNote.hidden = flags.delivery || flags.table;

  // إغلاق نافذة الطاولة إذا أُوقفت الميزة والنافذة مفتوحة
  if (!flags.table && dialog.open) dialog.close();
});
