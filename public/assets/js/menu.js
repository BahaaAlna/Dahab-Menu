/* ============================================================
   🍽️  صفحة المنيو — عرض مباشر للزبائن

   التحميل كله صار بـ menu-data.js — هون بس الرسم.
   ============================================================ */

import { CURRENCY } from "./config.js";
import { subscribeMenu } from "./menu-data.js";
import { byOrder, groupBySection, escapeHtml } from "./utils.js";

const menuWrap = document.getElementById("menuWrap");

/* ---------- الرسم ----------
   كل نص جاي من قاعدة البيانات لازم يمرق على escapeHtml قبل
   ما ينحقن بالصفحة — لأن الطلبات صارت مفتوحة للزبائن. */

function itemHtml(item) {
  const cls = item.available === false ? "item unavailable" : "item";
  return `<div class="${cls}">
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="item-dots"></span>
        <span class="item-price">${escapeHtml(item.price)}<small>${CURRENCY}</small></span>
      </div>`;
}

function sectionHtml(section, sectionItems) {
  return `<section class="section">
      <div class="section-head">
        <span class="line"></span>
        <span class="section-gem" aria-hidden="true"></span>
        <span class="section-title">${escapeHtml(section.name)}</span>
        <span class="section-gem" aria-hidden="true"></span>
        <span class="line"></span>
      </div>
      <div class="items">${sectionItems.map(itemHtml).join("")}</div>
    </section>`;
}

function draw(sections, items) {
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

function showError() {
  menuWrap.innerHTML =
    '<div class="loading" style="color:#f87171;">خطأ في تحميل القائمة. تأكد من الاتصال بالإنترنت.</div>';
}

subscribeMenu(draw, showError);
