/* ============================================================
   📥  الطلبات في لوحة الإدارة

   الطلبان الداخلي والخارجي يصلان إلى المجموعة نفسها، ويُميَّزان
   بخانة type: «طاولة» تحمل رقمها، و«دليفري» يحمل اسم الزبون
   ورقمه وعنوانه. فيُعرَضان في قائمة واحدة مرتّبة بالأحدث، لأن
   المطبخ يعمل بترتيب الوقت لا بترتيب نوع الطلب.

   الاستماع مباشر (onSnapshot): الطلب الجديد يظهر من تلقاء نفسه
   دون أن يُحدِّث الموظف الصفحة، وهذا هو المقصود من اللوحة.

   القراءة والكتابة هنا للموظف وحده بحكم قواعد Firestore، فلا
   تُستدعى هذه الوحدة إلا بعد تسجيل الدخول.
   ============================================================ */

import {
  db, collection, doc, updateDoc,
  query, orderBy, limit, onSnapshot,
} from "./firebase.js";
import { CURRENCY, ORDER_STATUS } from "./config.js";
import { escapeHtml } from "./utils.js";
import { mountAlerts } from "./admin-alert.js";

const $ = (id) => document.getElementById(id);

/** أحدث ما يُعرَض. المطبخ يعمل على طلبات اليوم، والقائمة التي
 *  لا تنتهي تُبطئ الصفحة ولا تُقرأ. */
const SHOWN = 60;

/** الحالات التي يُعدّ الطلب عندها منتهياً */
const DONE_STATES = ["delivered", "cancelled"];

/** أرقام عربية — كما في صفحات الزبون */
function arabicNum(n) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
}

/** وقت الطلب بصيغة قصيرة. الطابع يصل من الخادم، وقد يكون null
 *  للحظة واحدة بعد الإرسال قبل أن يُثبِّته الخادم. */
function whenText(createdAt) {
  const ms = createdAt?.toMillis?.();
  if (!ms) return "الآن";

  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("ar-SY", { hour: "2-digit", minute: "2-digit" });

  return today ? time : d.toLocaleDateString("ar-SY") + " — " + time;
}

function statusOf(key) {
  return ORDER_STATUS[key] || { label: key || "—", tone: "wait" };
}

/* ---------- رسم الطلب ---------- */

function headHtml(o) {
  // الطاولة أهم ما في طلبها، والاسم أهم ما في طلب الدليفري
  const where = o.type === "table"
    ? '<span class="ord-where is-table">طاولة ' + arabicNum(o.table ?? "؟") + "</span>"
    : '<span class="ord-where">دليفري</span>';

  const st = statusOf(o.status);

  return '<div class="ord-head">' +
    where +
    '<span class="ord-when">' + escapeHtml(whenText(o.createdAt)) + "</span>" +
    '<span class="ord-state is-' + st.tone + '">' + escapeHtml(st.label) + "</span>" +
  "</div>";
}

/** بيانات الزبون — للدليفري وحده، وللطاولة اسم إن كتبه */
function whoHtml(o) {
  const c = o.customer;
  if (!c) return "";

  const bits = [];
  if (c.name) bits.push('<b>' + escapeHtml(c.name) + "</b>");
  // الرقم قابل للنقر: الموظف يتصل منه مباشرة بدل نسخه
  if (c.phone) {
    bits.push('<a class="ord-tel" href="tel:' + escapeHtml(c.phone) + '">' +
      escapeHtml(c.phone) + "</a>");
  }
  if (c.address) bits.push('<span class="ord-addr">' + escapeHtml(c.address) + "</span>");

  return bits.length ? '<div class="ord-who">' + bits.join("") + "</div>" : "";
}

function linesHtml(o) {
  const list = Array.isArray(o.items) ? o.items : [];

  return '<div class="ord-lines">' + list.map((l) =>
    '<div class="ord-line">' +
      "<span>" + escapeHtml(l?.name ?? "—") +
        ' <b>×' + arabicNum(Number(l?.qty) || 0) + "</b></span>" +
      "<span>" + ((Number(l?.price) || 0) * (Number(l?.qty) || 0)) + " " + CURRENCY + "</span>" +
    "</div>"
  ).join("") + "</div>";
}

/** أزرار الحالة — الحالة الحالية معلَّمة، وضغط غيرها ينقل إليها */
function statesHtml(o) {
  return '<div class="ord-acts">' + Object.entries(ORDER_STATUS).map(([key, s]) =>
    '<button class="ord-set' + (key === o.status ? " is-on" : "") + '" type="button" ' +
      'data-set="' + key + '" data-order="' + escapeHtml(o.id) + '">' +
      escapeHtml(s.label) +
    "</button>"
  ).join("") + "</div>";
}

function orderHtml(o) {
  const note = o.note
    ? '<p class="ord-note">ملاحظة: ' + escapeHtml(o.note) + "</p>"
    : "";

  return '<article class="ord' + (DONE_STATES.includes(o.status) ? " is-done" : "") + '">' +
    headHtml(o) +
    whoHtml(o) +
    linesHtml(o) +
    note +
    '<p class="ord-foot">المجموع: <strong>' + (Number(o.total) || 0) + "</strong> " + CURRENCY + "</p>" +
    statesHtml(o) +
  "</article>";
}

/* ============================================================
   التركيب
   ============================================================ */

export function mountOrders() {
  const listEl = $("ordersList");
  const hideDone = $("ordHideDone");
  const navCount = $("navNewCount");

  const announce = mountAlerts();

  let all = [];

  /** معرّفات ما رأيناه، كي لا يُنبَّه على طلب قديم.
   *  أول لقطة تملأ المجموعة بلا تنبيه: اللوحة تُفتح على طلبات
   *  اليوم كلها، ولا معنى لعشرين نغمة دفعةً واحدة. */
  const seen = new Set();
  let firstSnapshot = true;

  function draw() {
    const shown = hideDone.checked
      ? all.filter((o) => !DONE_STATES.includes(o.status))
      : all;

    listEl.innerHTML = shown.length
      ? shown.map(orderHtml).join("")
      : '<p class="ord-empty">لا توجد طلبات بعد.</p>';

    /* عدّاد الجديد على زرّ القسم: الموظف قد يكون في «الأصناف»
       حين يصل الطلب، فيلزم ما يلفت نظره إلى أن شيئاً ينتظره. */
    const fresh = all.filter((o) => o.status === "new").length;
    navCount.hidden = fresh === 0;
    navCount.textContent = arabicNum(fresh);
  }

  hideDone.addEventListener("change", draw);

  /* تغيير الحالة. الكتابة تُترك لـ Firestore ليُعيدها إلينا عبر
     onSnapshot، فلا يُرسَم شيء مرّتين ولا تظهر حالة لم تُحفَظ. */
  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-set]");
    if (!btn || btn.classList.contains("is-on")) return;

    btn.disabled = true;
    try {
      await updateDoc(doc(db, "orders", btn.dataset.order), { status: btn.dataset.set });
    } catch (err) {
      console.error("status update error:", err);
      alert("تعذّر تغيير حالة الطلب. يُرجى إعادة المحاولة.");
    } finally {
      btn.disabled = false;
    }
  });

  onSnapshot(
    query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(SHOWN)),
    (snap) => {
      all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      /* الطلب الجديد هو ما لم نره قبلاً وحالته «جديد». وتغيير
         حالة طلب قائم يُعيد اللقطة أيضاً، فلا يُنبَّه عليه. */
      const fresh = all.filter((o) => !seen.has(o.id) && o.status === "new");
      for (const o of all) seen.add(o.id);

      if (firstSnapshot) firstSnapshot = false;
      else if (fresh.length) announce(fresh[0]);

      draw();
    },
    (err) => {
      console.error("orders error:", err);
      listEl.innerHTML =
        '<p class="ord-err">تعذّر تحميل الطلبات. تأكّد من أن حسابك مذكور في isStaff() داخل firestore.rules.</p>';
    }
  );
}
