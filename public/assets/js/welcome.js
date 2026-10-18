/* ============================================================
   👋  صفحة الترحيب

   الصفحة كلها روابط عادية ما عدا خيار «طلب من الطاولة» —
   هاد بيفتح نافذة تشرح للزبون إنه يمسح كود طاولته.
   منستعمل <dialog> الأصلي تبع المتصفح: بيجي جاهز بإغلاق
   على Esc وحبس التركيز جواته، بدون أي مكتبة.
   ============================================================ */

const dialog = document.getElementById("scanDialog");
const openBtn = document.getElementById("tableBtn");
const closeBtn = document.getElementById("scanCloseBtn");

openBtn.addEventListener("click", () => dialog.showModal());
closeBtn.addEventListener("click", () => dialog.close());

/* الضغط على الخلفية السودا برّا الصندوق بيسكّر */
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});
