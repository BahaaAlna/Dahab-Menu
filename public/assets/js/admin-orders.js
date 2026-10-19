/* ============================================================
     الطلبات في لوحة الإدارة

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
  db, collection, doc, updateDoc, deleteDoc,
  query, orderBy, limit, onSnapshot,
} from "./firebase.js";
import { CURRENCY, ORDER_STATUS } from "./config.js";
import { escapeHtml, formatPhone } from "./utils.js";
import { mountAlerts } from "./admin-alert.js";

const $ = (id) => document.getElementById(id);

/** أحدث ما يُعرَض. المطبخ يعمل على طلبات اليوم، والقائمة التي
 *  لا تنتهي تُبطئ الصفحة ولا تُقرأ. */
const SHOWN = 60;

/** الحالات التي يُعدّ الطلب عندها منتهياً */
const DONE_STATES = ["delivered", "cancelled"];

/** مسار الطلب. الطاولة تُحمَل ولا تُوصَّل، فلا «في الطريق» لها */
const FLOW = {
  delivery: ["new", "confirmed", "preparing", "on_way", "delivered"],
  table:    ["new", "confirmed", "preparing", "delivered"],
};

/** نص الزرّ الذي ينقل الطلب إلى الحالة التالية */
const NEXT_LABEL = {
  confirmed: "تأكيد الطلب",
  preparing: "بدء التحضير",
  on_way:    "خرج للتوصيل",
  delivered: { delivery: "تم التسليم", table: "تم التقديم" },
};

/** طلب جديد لم يُلمَس منذ هذه المدة يُعلَّم متأخراً (بالدقائق) */
const LATE_AFTER = 5;

function nextOf(o) {
  if (DONE_STATES.includes(o.status)) return null;
  const flow = FLOW[o.type] || FLOW.delivery;
  const i = flow.indexOf(o.status);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
}

function nextLabel(o, key) {
  const l = NEXT_LABEL[key];
  return typeof l === "object" ? l[o.type] || l.delivery : l;
}

/** منذ كم الطلب؟ يُحدَّث دورياً دون إعادة رسم القائمة */
function sinceText(ms) {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return "منذ " + arabicNum(min) + " د";
  return "منذ " + arabicNum(Math.floor(min / 60)) + " س";
}

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
    : '<span class="ord-where">توصيل</span>';

  const st = statusOf(o.status);
  const ms = o.createdAt?.toMillis?.();
  const since = ms && !DONE_STATES.includes(o.status)
    ? '<span class="ord-since" data-ts="' + ms + '" data-st="' + o.status + '">' +
        escapeHtml(sinceText(ms)) + "</span>"
    : "";

  return '<div class="ord-head">' +
    where +
    '<span class="ord-when">' + escapeHtml(whenText(o.createdAt)) + "</span>" +
    since +
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
    bits.push('<a class="ord-tel" dir="ltr" href="tel:' + escapeHtml(c.phone) + '">' +
      escapeHtml(formatPhone(c.phone)) + "</a>");
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

/** الإجراء الأهم زرّ واحد كبير: نقل الطلب إلى خطوته التالية. أما
 *  بقية الحالات فتُطوى تحت «كل الحالات» لمن أخطأ أو يريد القفز. */
function statesHtml(o) {
  const next = nextOf(o);
  const done = DONE_STATES.includes(o.status);

  const main = next
    ? '<button class="btn ord-next" type="button" data-set="' + next + '" data-order="' +
        escapeHtml(o.id) + '">' + escapeHtml(nextLabel(o, next)) + "</button>"
    : "";

  const cancel = done ? "" :
    '<button class="btn ghost small ord-cancel" type="button" data-set="cancelled" data-order="' +
      escapeHtml(o.id) + '" data-confirm="إلغاء هذا الطلب؟">إلغاء</button>';

  // الحذف متاح لكل طلب مهما كانت حالته، ويُسأل عنه قبل التنفيذ
  const del =
    '<button class="btn ghost small ord-del" type="button" data-del="' +
      escapeHtml(o.id) + '">حذف</button>';

  const all = Object.entries(ORDER_STATUS).map(([key, s]) =>
    '<button class="ord-set' + (key === o.status ? " is-on" : "") + '" type="button" ' +
      'data-set="' + key + '" data-order="' + escapeHtml(o.id) + '">' +
      escapeHtml(s.label) +
    "</button>"
  ).join("");

  return '<div class="ord-main">' + main + cancel + del + "</div>" +
    '<details class="ord-more"><summary>كل الحالات</summary>' +
    '<div class="ord-acts">' + all + "</div></details>";
}

function orderHtml(o) {
  const note = o.note
    ? '<p class="ord-note">ملاحظة: ' + escapeHtml(o.note) + "</p>"
    : "";

  return '<article class="ord' + (DONE_STATES.includes(o.status) ? " is-done" : "") +
    (o.status === "new" ? " is-new" : "") + '">' +
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
  let typeFilter = "all";
  const tabs = $("ordTabs");

  /** يُحدَّث نص «منذ كذا» وتُعلَّم الطلبات الجديدة المتأخرة */
  function tick() {
    document.querySelectorAll(".ord-since").forEach((el) => {
      const ms = Number(el.dataset.ts);
      el.textContent = sinceText(ms);
      el.classList.toggle("is-late",
        el.dataset.st === "new" && Date.now() - ms > LATE_AFTER * 60000);
    });
  }
  setInterval(tick, 30000);

  /** معرّفات ما رأيناه، كي لا يُنبَّه على طلب قديم.
   *  أول لقطة تملأ المجموعة بلا تنبيه: اللوحة تُفتح على طلبات
   *  اليوم كلها، ولا معنى لعشرين نغمة دفعةً واحدة. */
  const seen = new Set();
  let firstSnapshot = true;

  function draw() {
    // المنتهي يُؤخَّر إلى آخر القائمة مع بقاء ترتيب الوقت داخل كل مجموعة
    const byType = typeFilter === "all" ? all : all.filter((o) => o.type === typeFilter);
    const live = byType.filter((o) => !DONE_STATES.includes(o.status));
    const ended = byType.filter((o) => DONE_STATES.includes(o.status));
    const shown = hideDone.checked ? live : [...live, ...ended];

    // عدّاد كل تبويب = الطلبات الجارية منه
    const liveAll = all.filter((o) => !DONE_STATES.includes(o.status));
    const counts = {
      all: liveAll.length,
      delivery: liveAll.filter((o) => o.type === "delivery").length,
      table: liveAll.filter((o) => o.type === "table").length,
    };
    tabs.querySelectorAll("[data-ftype]").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.ftype === typeFilter);
      b.querySelector("i").textContent = arabicNum(counts[b.dataset.ftype]);
    });

    listEl.innerHTML = shown.length
      ? shown.map(orderHtml).join("")
      : '<p class="ord-empty">لا توجد طلبات بعد.</p>';

    /* عدّاد الجديد على زرّ القسم: الموظف قد يكون في «الأصناف»
       حين يصل الطلب، فيلزم ما يلفت نظره إلى أن شيئاً ينتظره. */
    const fresh = all.filter((o) => o.status === "new").length;
    navCount.hidden = fresh === 0;
    navCount.textContent = arabicNum(fresh);

    tick();
  }

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ftype]");
    if (!b) return;
    typeFilter = b.dataset.ftype;
    draw();
  });

  hideDone.addEventListener("change", draw);

  /* تغيير الحالة. الكتابة تُترك لـ Firestore ليُعيدها إلينا عبر
     onSnapshot، فلا يُرسَم شيء مرّتين ولا تظهر حالة لم تُحفَظ. */
  listEl.addEventListener("click", async (e) => {
    /* الحذف نهائي ولا رجعة فيه، فلا يتم قبل تأكيد صريح */
    const delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      if (!confirm("هل أنت متأكد من حذف هذا الطلب نهائياً؟\nلا يمكن التراجع عن الحذف.")) return;

      delBtn.disabled = true;
      try {
        await deleteDoc(doc(db, "orders", delBtn.dataset.del));
      } catch (err) {
        console.error("order delete error:", err);
        alert("تعذّر حذف الطلب. يُرجى إعادة المحاولة.");
        delBtn.disabled = false;
      }
      return;
    }

    const btn = e.target.closest("[data-set]");
    if (!btn || btn.classList.contains("is-on")) return;
    if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;

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
