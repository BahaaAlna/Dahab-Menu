/* ============================================================
   🍽️  صفحة المنيو — عرض مباشر للزبائن
   تستمع لتغييرات Firestore وتعيد الرسم فوراً عند أي تعديل
   من لوحة الإدارة.
   ============================================================ */

import { db, collection, onSnapshot, query, orderBy } from "./firebase.js";
import { COLLECTIONS, CURRENCY, DEFAULT_ICON } from "./config.js";
import { byOrder, groupBySection } from "./utils.js";

const menuWrap = document.getElementById("menuWrap");

let sections = [];
let items = [];
let sectionsLoaded = false;
let itemsLoaded = false;

/* ---------- الرسم ---------- */

function itemHtml(item) {
  const cls = item.available === false ? "item unavailable" : "item";
  return `<div class="${cls}">
        <span class="item-name">${item.name}</span>
        <span class="item-dots"></span>
        <span class="item-price">${item.price}<small>${CURRENCY}</small></span>
      </div>`;
}

function sectionHtml(section, sectionItems) {
  const icon = section.icon || DEFAULT_ICON;
  return `<section class="section">
      <div class="section-head">
        <span class="line"></span>
        <span class="section-icon">${icon}</span>
        <span class="section-title">${section.name}</span>
        <span class="section-icon">${icon}</span>
        <span class="line"></span>
      </div>
      <div class="items">${sectionItems.map(itemHtml).join("")}</div>
    </section>`;
}

function render() {
  if (!sectionsLoaded || !itemsLoaded) return;

  const bySection = groupBySection(items);
  const html = [...sections]
    .sort(byOrder)
    .map((sec) => [sec, bySection[sec.id] || []])
    .filter(([, list]) => list.length > 0)
    .map(([sec, list]) => sectionHtml(sec, list))
    .join("");

  menuWrap.innerHTML =
    html || '<div class="loading"><p>لا توجد أصناف حالياً</p></div>';
}

/* ---------- الاستماع المباشر ---------- */

onSnapshot(
  query(collection(db, COLLECTIONS.sections), orderBy("order")),
  (snap) => {
    sections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    sectionsLoaded = true;
    render();
  },
  (err) => {
    console.error("sections error:", err);
    menuWrap.innerHTML =
      '<div class="loading" style="color:#f87171;">خطأ في تحميل القائمة. تأكد من الاتصال بالإنترنت.</div>';
  }
);

onSnapshot(
  collection(db, COLLECTIONS.items),
  (snap) => {
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    itemsLoaded = true;
    render();
  },
  (err) => console.error("items error:", err)
);
