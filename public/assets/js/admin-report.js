/* ============================================================
     تقرير المبيعات

   يقرأ طلبات المدة المختارة من Firestore قراءةً واحدة (لا استماعاً
   مباشراً: التقرير لقطة عن مدة انتهت أو تكاد، وليس شاشة مطبخ)،
   ويحسب منها:
     • إجمالي المبيعات وعدد الطلبات ومتوسط الطلب
     • التوزيع بين التوصيل والطاولات
     • الأصناف الأكثر مبيعاً
     • المبيعات لكل ساعة (ليوم واحد) أو لكل يوم (لمدة أطول)

   المبيعات لا تشمل الطلبات الملغاة: الطلب الملغى لم يُحضَّر ولا
   يدخل الصندوق. وتُعرَض الملغاة منفصلةً كي لا تختفي أخبارها.

   حدود اليوم بتوقيت جهاز الموظف، وهو توقيت المطعم نفسه.

   القراءة للموظف وحده بحكم قواعد Firestore، فلا تُركَّب هذه
   الوحدة إلا بعد تسجيل الدخول.
   ============================================================ */

import { db, collection, query, where, orderBy, limit, getDocs } from "./firebase.js";
import { CURRENCY } from "./config.js";
import { escapeHtml, formatPhone } from "./utils.js";

const $ = (id) => document.getElementById(id);

/** سقف ما يُقرأ دفعةً واحدة. مدة أطول منه تُعرَض مع تنبيه. */
const MAX_ORDERS = 5000;

/** أقصى عدد أصناف في قائمة الأكثر مبيعاً */
const TOP_ITEMS = 10;

function arabicNum(n) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
}

/** مبلغ بفاصل آلاف وأرقام عربية */
function money(n) {
  return arabicNum(Math.round(n).toLocaleString("en-US").replace(/,/g, "٬"));
}

/** yyyy-mm-dd بالتوقيت المحلي، وهي صيغة خانة التاريخ */
function ymd(d) {
  const p = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/** بداية اليوم المحلي لسلسلة yyyy-mm-dd */
function dayStart(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dateLabel(date) {
  return date.toLocaleDateString("ar-SY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/* ---------- الحساب ---------- */

function summarize(orders, days) {
  const live = orders.filter((o) => o.status !== "cancelled");
  const cancelled = orders.filter((o) => o.status === "cancelled");

  const sum = (list) => list.reduce((t, o) => t + (Number(o.total) || 0), 0);

  const byType = {
    delivery: live.filter((o) => o.type === "delivery"),
    table: live.filter((o) => o.type === "table"),
  };

  // الأصناف: الاسم هو المفتاح، فصنفان بالاسم نفسه يُجمعان
  const itemMap = new Map();
  for (const o of live) {
    for (const l of Array.isArray(o.items) ? o.items : []) {
      const name = String(l?.name ?? "—");
      const qty = Number(l?.qty) || 0;
      const row = itemMap.get(name) || { name, qty: 0, amount: 0 };
      row.qty += qty;
      row.amount += qty * (Number(l?.price) || 0);
      itemMap.set(name, row);
    }
  }
  const items = [...itemMap.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount);

  // التوزيع الزمني: ساعات لليوم الواحد، وأيام لما فوقه
  const buckets = new Map();
  for (const o of live) {
    const ms = o.createdAt?.toMillis?.();
    if (!ms) continue;
    const d = new Date(ms);
    const key = days === 1 ? d.getHours() : ymd(d);
    const b = buckets.get(key) || { key, count: 0, amount: 0 };
    b.count += 1;
    b.amount += Number(o.total) || 0;
    buckets.set(key, b);
  }

  return {
    count: live.length,
    sales: sum(live),
    avg: live.length ? sum(live) / live.length : 0,
    cancelledCount: cancelled.length,
    cancelledSales: sum(cancelled),
    byType: {
      delivery: { count: byType.delivery.length, sales: sum(byType.delivery) },
      table: { count: byType.table.length, sales: sum(byType.table) },
    },
    items,
    buckets: [...buckets.values()].sort((a, b) => (a.key > b.key ? 1 : -1)),
  };
}

/* ---------- الرسم ---------- */

function statHtml(value, label) {
  return '<div class="stat"><div class="stat-val">' + value + "</div>" +
    '<div class="divider"><span></span><i></i><span></span></div>' +
    '<div class="stat-lbl">' + escapeHtml(label) + "</div></div>";
}

function rowsHtml(head, rows) {
  return '<table class="rep-table"><thead><tr>' +
    head.map((h) => "<th>" + escapeHtml(h) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows.map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") +
    "</tbody></table>";
}

function barsHtml(buckets, days) {
  if (!buckets.length) return "";
  const max = Math.max(...buckets.map((b) => b.amount), 1);

  return '<div class="rep-bars">' + buckets.map((b) => {
    const label = days === 1
      ? arabicNum(String(b.key).padStart(2, "0")) + ":٠٠"
      : arabicNum(b.key.slice(5).replace("-", "/"));
    const pct = Math.max(3, Math.round((b.amount / max) * 100));
    return '<div class="rep-bar"><span class="rep-bar-lbl">' + label + "</span>" +
      '<span class="rep-bar-track"><i style="width:' + pct + '%"></i></span>' +
      '<span class="rep-bar-val">' + money(b.amount) + " " + CURRENCY +
        " · " + arabicNum(b.count) + " طلب</span></div>";
  }).join("") + "</div>";
}

function reportHtml(s, days) {
  const type = (label, t) => [label, arabicNum(t.count), money(t.sales) + " " + CURRENCY];

  const top = s.items.slice(0, TOP_ITEMS).map((i, n) =>
    [arabicNum(n + 1), escapeHtml(i.name), arabicNum(i.qty), money(i.amount) + " " + CURRENCY]);

  return '<div class="stats rep-stats">' +
      statHtml(money(s.sales) + " <small>" + CURRENCY + "</small>", "إجمالي المبيعات") +
      statHtml(arabicNum(s.count), "عدد الطلبات") +
      statHtml(money(s.avg) + " <small>" + CURRENCY + "</small>", "متوسط الطلب") +
      statHtml(arabicNum(s.cancelledCount), "طلبات ملغاة (غير محسوبة)") +
    "</div>" +

    '<h3 class="rep-h">حسب النوع</h3>' +
    rowsHtml(["النوع", "الطلبات", "المبيعات"], [
      type("توصيل", s.byType.delivery),
      type("طاولات", s.byType.table),
    ]) +

    '<h3 class="rep-h">' + (days === 1 ? "المبيعات حسب الساعة" : "المبيعات حسب اليوم") + "</h3>" +
    (s.buckets.length ? barsHtml(s.buckets, days) : '<p class="rep-empty">لا مبيعات في هذه المدة.</p>') +

    '<h3 class="rep-h">الأصناف الأكثر مبيعاً</h3>' +
    (top.length
      ? rowsHtml(["#", "الصنف", "الكمية", "المبلغ"], top)
      : '<p class="rep-empty">لا أصناف مباعة في هذه المدة.</p>');
}

/* ---------- تنزيل CSV ---------- */

function csvCell(v) {
  return '"' + String(v ?? "").replace(/"/g, '""') + '"';
}

function toCsv(orders) {
  const head = ["التاريخ", "الوقت", "النوع", "الطاولة", "الاسم", "الهاتف", "العنوان", "الأصناف", "المجموع", "الحالة"];
  const lines = [head.map(csvCell).join(",")];

  for (const o of orders) {
    const ms = o.createdAt?.toMillis?.();
    const d = ms ? new Date(ms) : null;
    const items = (Array.isArray(o.items) ? o.items : [])
      .map((l) => (l?.name ?? "") + " ×" + (Number(l?.qty) || 0)).join(" ؛ ");

    lines.push([
      d ? ymd(d) : "",
      d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
      o.type === "table" ? "طاولة" : "توصيل",
      o.table ?? "",
      o.customer?.name ?? "",
      o.customer?.phone ? formatPhone(o.customer.phone) : "",
      o.customer?.address ?? "",
      items,
      Number(o.total) || 0,
      o.status ?? "",
    ].map(csvCell).join(","));
  }
  // BOM في المقدمة: بدونه يعرض إكسل العربية رموزاً مشوّهة
  return "﻿" + lines.join("\r\n");
}

/* ============================================================
   التركيب
   ============================================================ */

export function mountReport() {
  const fromEl = $("repFrom");
  const toEl = $("repTo");
  const outEl = $("repOut");
  const errEl = $("repErr");
  const loadBtn = $("repLoadBtn");

  let lastOrders = [];

  function setRange(from, to) {
    fromEl.value = ymd(from);
    toEl.value = ymd(to);
  }

  async function load() {
    errEl.textContent = "";

    if (!fromEl.value || !toEl.value) {
      errEl.textContent = "يُرجى اختيار تاريخ البداية والنهاية.";
      return;
    }

    const start = dayStart(fromEl.value);
    const end = addDays(dayStart(toEl.value), 1);   // نهاية اليوم الأخير، غير شاملة

    if (end <= start) {
      errEl.textContent = "تاريخ النهاية قبل تاريخ البداية.";
      return;
    }

    const days = Math.round((end - start) / 86400000);

    loadBtn.disabled = true;
    outEl.innerHTML = '<p class="rep-empty">جارٍ تحميل التقرير...</p>';

    try {
      const snap = await getDocs(query(
        collection(db, "orders"),
        where("createdAt", ">=", start),
        where("createdAt", "<", end),
        orderBy("createdAt", "asc"),
        limit(MAX_ORDERS)
      ));

      lastOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const title = days === 1
        ? dateLabel(start)
        : "من " + dateLabel(start) + " إلى " + dateLabel(addDays(end, -1));
      $("repPrintTitle").textContent = title;
      $("repPrintFoot").textContent =
        "أُنشئ هذا التقرير في " + new Date().toLocaleString("ar-SY") + " — لوحة إدارة دهب";

      outEl.innerHTML =
        (lastOrders.length >= MAX_ORDERS
          ? '<p class="err-msg">تجاوزت المدة ' + arabicNum(MAX_ORDERS) + " طلب، فالتقرير غير كامل. اختر مدة أقصر.</p>"
          : "") +
        reportHtml(summarize(lastOrders, days), days);
    } catch (err) {
      console.error("report error:", err);
      outEl.innerHTML = "";
      errEl.textContent = "تعذّر تحميل التقرير (" + (err?.code || "unknown") + "). يُرجى إعادة المحاولة.";
    } finally {
      loadBtn.disabled = false;
    }
  }

  /* اختصارات المدة */
  $("repToday").addEventListener("click", () => {
    const t = new Date();
    setRange(t, t);
    load();
  });
  $("repYesterday").addEventListener("click", () => {
    const y = addDays(new Date(), -1);
    setRange(y, y);
    load();
  });
  $("repWeek").addEventListener("click", () => {
    const t = new Date();
    setRange(addDays(t, -6), t);
    load();
  });
  $("repMonth").addEventListener("click", () => {
    const t = new Date();
    setRange(new Date(t.getFullYear(), t.getMonth(), 1), t);
    load();
  });

  loadBtn.addEventListener("click", load);

  /* الطباعة تطبع التقرير وحده: التفاصيل في admin.css تحت @media print */
  $("repPrintBtn").addEventListener("click", () => {
    if (!outEl.querySelector(".rep-stats")) {
      errEl.textContent = "لا يوجد تقرير للطباعة. اضغط «عرض التقرير» أولاً.";
      return;
    }
    document.body.classList.add("print-report");
    window.addEventListener("afterprint",
      () => document.body.classList.remove("print-report"), { once: true });
    window.print();
  });

  $("repCsvBtn").addEventListener("click", () => {
    if (!lastOrders.length) {
      errEl.textContent = "لا توجد طلبات لتنزيلها.";
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(lastOrders)], { type: "text/csv;charset=utf-8" }));
    a.download = "dahab-orders-" + fromEl.value + "_" + toEl.value + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // يُفتح على تقرير اليوم
  const now = new Date();
  setRange(now, now);
  load();
}
