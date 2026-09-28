/* ============================================================
   🛠️  لوحة الإدارة — إضافة/تعديل/حذف الأقسام والأصناف
   كل تعديل ينعكس فوراً على صفحة المنيو عند الزبائن.
   ============================================================ */

import {
  db, auth, signInAnonymously,
  collection, doc, setDoc, addDoc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, writeBatch,
} from "./firebase.js";
import { ADMIN_PASSWORD, COLLECTIONS, DEFAULT_ICON, PRICE_STEP } from "./config.js";
import { byOrder, groupBySection, escapeHtml, escapeAttr } from "./utils.js";

const $ = (id) => document.getElementById(id);

/* ============================================================
   1. تسجيل الدخول
   ============================================================ */

const SESSION_KEY = "dahab_admin";
const loginWrap = $("loginWrap");
const adminEl = $("admin");
const pwInput = $("pwInput");
const loginErr = $("loginErr");

function openPanel() {
  loginWrap.style.display = "none";
  adminEl.classList.add("active");
  startListening();
}

function tryLogin() {
  if (pwInput.value !== ADMIN_PASSWORD) {
    loginErr.textContent = "كلمة السر خاطئة";
    pwInput.value = "";
    setTimeout(() => (loginErr.textContent = ""), 2500);
    return;
  }
  sessionStorage.setItem(SESSION_KEY, "1");
  signInAnonymously(auth)
    .then(openPanel)
    .catch((e) => {
      loginErr.textContent =
        "خطأ في الاتصال بـ Firebase. تأكد من تفعيل Anonymous Authentication.";
      console.error(e);
    });
}

$("loginBtn").addEventListener("click", tryLogin);
pwInput.addEventListener("keydown", (e) => e.key === "Enter" && tryLogin());

$("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});

// دخول تلقائي إذا الجلسة ما زالت مفتوحة
if (sessionStorage.getItem(SESSION_KEY) === "1") {
  signInAnonymously(auth).then(openPanel);
}

/* ============================================================
   2. البيانات — استماع مباشر لـ Firestore
   ============================================================ */

let sections = [];
let items = [];
let searchTerm = "";
const collapsedSections = new Set();

function startListening() {
  onSnapshot(
    query(collection(db, COLLECTIONS.sections), orderBy("order")),
    (snap) => {
      sections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    }
  );
  onSnapshot(collection(db, COLLECTIONS.items), (snap) => {
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
}

/* ============================================================
   3. الرسم
   ============================================================ */

const listEl = $("sectionsList");

function renderStats() {
  const available = items.filter((i) => i.available !== false).length;
  $("statSections").textContent = sections.length;
  $("statItems").textContent = items.length;
  $("statAvail").textContent = available;
  $("statOut").textContent = items.length - available;
}

function itemRowHtml(item) {
  const off = item.available === false;
  const dim = off ? "unavailable" : "";
  return `<div class="item-row" data-id="${item.id}">
        <input type="text" class="field-input ${dim}" value="${escapeAttr(item.name)}"
               onchange="window.__updField('${item.id}','name',this.value)">
        <div class="stepper">
          <input type="number" class="field-input ${dim}" value="${item.price}" id="pr-${item.id}"
                 onchange="window.__updField('${item.id}','price',Number(this.value))">
          <span class="stepper-btns">
            <button type="button" class="stepper-btn" title="زيادة"
                    onclick="window.__stepPrice('${item.id}',1)">▲</button>
            <button type="button" class="stepper-btn" title="نقصان"
                    onclick="window.__stepPrice('${item.id}',-1)">▼</button>
          </span>
        </div>
        <div class="item-actions">
          <button class="icon-btn toggle-avail ${off ? "off" : ""}"
                  onclick="window.__toggleAvail('${item.id}')"
                  title="${off ? "غير متوفر" : "متوفر"}">${off ? "✗" : "✓"}</button>
          <button class="icon-btn del"
                  onclick="window.__delItem('${item.id}','${escapeAttr(item.name)}')"
                  title="حذف">🗑</button>
        </div>
      </div>`;
}

function sectionCardHtml(sec, secItems) {
  const collapsed = collapsedSections.has(sec.id) ? "collapsed" : "";
  return `<div class="section-card ${collapsed}" data-sid="${sec.id}">
      <div class="section-header" onclick="window.__toggleSec('${sec.id}')">
        <div class="section-header-left">
          <span class="icon">${sec.icon || DEFAULT_ICON}</span>
          <span class="title">${escapeHtml(sec.name)}</span>
          <span class="badge">${secItems.length} صنف</span>
        </div>
        <div class="section-header-actions">
          <button class="icon-btn" onclick="event.stopPropagation();window.__editSec('${sec.id}')" title="تعديل">✎</button>
          <button class="icon-btn del" onclick="event.stopPropagation();window.__delSec('${sec.id}')" title="حذف">🗑</button>
          <span class="toggle">▾</span>
        </div>
      </div>
      <div class="section-body">
        ${secItems.map(itemRowHtml).join("")}
        <div class="add-row">
          <input type="text" class="field-input" placeholder="اسم صنف جديد..." id="new-nm-${sec.id}">
          <div class="stepper">
            <input type="number" class="field-input" placeholder="السعر" id="new-pr-${sec.id}">
            <span class="stepper-btns">
              <button type="button" class="stepper-btn" title="زيادة"
                      onclick="window.__stepInput('new-pr-${sec.id}',1)">▲</button>
              <button type="button" class="stepper-btn" title="نقصان"
                      onclick="window.__stepInput('new-pr-${sec.id}',-1)">▼</button>
            </span>
          </div>
          <button class="btn small" onclick="window.__addItem('${sec.id}')">+ إضافة</button>
        </div>
      </div>
    </div>`;
}

function render() {
  renderStats();

  const bySection = groupBySection(items);
  const term = searchTerm.trim().toLowerCase();

  let html = "";
  for (const sec of [...sections].sort(byOrder)) {
    let secItems = bySection[sec.id] || [];
    if (term) {
      secItems = secItems.filter((i) => i.name.toLowerCase().includes(term));
      if (secItems.length === 0) continue;
    }
    html += sectionCardHtml(sec, secItems);
  }

  if (!html) {
    html = term
      ? `<div class="loading-full">لا نتائج للبحث "${escapeHtml(searchTerm)}"</div>`
      : `<div class="loading-full">لا توجد أقسام. اضغط "إضافة قسم جديد" للبدء.</div>`;
  }
  listEl.innerHTML = html;
}

/* ============================================================
   4. عمليات الأصناف
   ============================================================ */

window.__toggleSec = (sid) => {
  if (collapsedSections.has(sid)) collapsedSections.delete(sid);
  else collapsedSections.add(sid);
  render();
};

window.__updField = async (itemId, field, value) => {
  try {
    await updateDoc(doc(db, COLLECTIONS.items, itemId), { [field]: value });
    toast("تم الحفظ ✓");
  } catch (e) {
    toast("فشل الحفظ", true);
    console.error(e);
  }
};

/* حماية: في كروم، عجلة الفأرة بتغيّر قيمة حقل الرقم المركَّز — وبما إن
   التغيير بينحفظ فوراً على Firestore، ممكن سعر ينتغيّر بالغلط.
   منلغي التركيز عند أول سكرول. */
document.addEventListener(
  "wheel",
  () => {
    const el = document.activeElement;
    if (el && el.type === "number") el.blur();
  },
  { passive: true }
);

/** زيادة/نقصان سعر صنف محفوظ — يحفظ مباشرة على Firestore */
window.__stepPrice = (itemId, dir) => {
  const item = items.find((x) => x.id === itemId);
  if (!item) return;
  const next = Math.max(0, (Number(item.price) || 0) + dir * PRICE_STEP);
  if (next === item.price) return;
  const el = $(`pr-${itemId}`);
  if (el) el.value = next;
  window.__updField(itemId, "price", next);
};

/** زيادة/نقصان قيمة حقل محلي (صف الإضافة) — بدون حفظ */
window.__stepInput = (inputId, dir) => {
  const el = $(inputId);
  if (!el) return;
  el.value = Math.max(0, (Number(el.value) || 0) + dir * PRICE_STEP);
};

window.__toggleAvail = async (itemId) => {
  const item = items.find((x) => x.id === itemId);
  if (!item) return;
  try {
    await updateDoc(doc(db, COLLECTIONS.items, itemId), {
      available: item.available === false,
    });
    toast(item.available === false ? "أصبح متوفراً" : "أصبح غير متوفر");
  } catch (e) {
    toast("فشل", true);
  }
};

window.__delItem = (itemId, name) => {
  showConfirm(`حذف "${name}"؟`, "هذا الإجراء لا يمكن التراجع عنه.", async () => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.items, itemId));
      toast("تم الحذف");
    } catch (e) {
      toast("فشل الحذف", true);
    }
  });
};

window.__addItem = async (sectionId) => {
  const nameEl = $(`new-nm-${sectionId}`);
  const priceEl = $(`new-pr-${sectionId}`);
  const name = nameEl.value.trim();
  const price = Number(priceEl.value);

  if (!name) return toast("أدخل اسم الصنف", true);
  if (!price || price < 0) return toast("أدخل سعر صحيح", true);

  const sec = sections.find((s) => s.id === sectionId);
  const maxOrder = items
    .filter((i) => i.sectionId === sectionId)
    .reduce((m, i) => Math.max(m, i.order || 0), -1);

  try {
    await addDoc(collection(db, COLLECTIONS.items), {
      sectionId,
      sectionName: sec.name,
      sectionIcon: sec.icon,
      sectionOrder: sec.order,
      name,
      price,
      order: maxOrder + 1,
      available: true,
    });
    nameEl.value = "";
    priceEl.value = "";
    toast("تمت الإضافة ✓");
  } catch (e) {
    toast("فشل الإضافة", true);
    console.error(e);
  }
};

/* ============================================================
   5. عمليات الأقسام
   ============================================================ */

let editingSecId = null;

$("addSectionBtn").addEventListener("click", () => {
  editingSecId = null;
  $("secModalTitle").textContent = "قسم جديد";
  $("secName").value = "";
  $("secIcon").value = DEFAULT_ICON;
  openModal("sectionModal");
});

window.__editSec = (sid) => {
  const sec = sections.find((x) => x.id === sid);
  if (!sec) return;
  editingSecId = sid;
  $("secModalTitle").textContent = "تعديل قسم";
  $("secName").value = sec.name;
  $("secIcon").value = sec.icon || DEFAULT_ICON;
  openModal("sectionModal");
};

$("secSaveBtn").addEventListener("click", async () => {
  const name = $("secName").value.trim();
  const icon = $("secIcon").value.trim() || DEFAULT_ICON;
  if (!name) return toast("أدخل اسم القسم", true);

  try {
    if (editingSecId) {
      await updateDoc(doc(db, COLLECTIONS.sections, editingSecId), { name, icon });
      // تحديث اسم/رمز القسم داخل كل أصنافه
      const batch = writeBatch(db);
      items
        .filter((i) => i.sectionId === editingSecId)
        .forEach((i) =>
          batch.update(doc(db, COLLECTIONS.items, i.id), {
            sectionName: name,
            sectionIcon: icon,
          })
        );
      await batch.commit();
      toast("تم التحديث ✓");
    } else {
      const maxOrder = sections.reduce((m, s) => Math.max(m, s.order || 0), -1);
      await setDoc(doc(db, COLLECTIONS.sections, "sec_" + Date.now()), {
        name,
        icon,
        order: maxOrder + 1,
      });
      toast("تمت إضافة القسم ✓");
    }
    closeModal("sectionModal");
  } catch (e) {
    toast("فشل الحفظ", true);
    console.error(e);
  }
});

window.__delSec = (sid) => {
  const sec = sections.find((x) => x.id === sid);
  const secItems = items.filter((i) => i.sectionId === sid);
  showConfirm(
    `حذف قسم "${sec.name}"؟`,
    `سيتم حذف القسم و${secItems.length} صنف معه.`,
    async () => {
      try {
        const batch = writeBatch(db);
        secItems.forEach((i) => batch.delete(doc(db, COLLECTIONS.items, i.id)));
        batch.delete(doc(db, COLLECTIONS.sections, sid));
        await batch.commit();
        toast("تم حذف القسم");
      } catch (e) {
        toast("فشل الحذف", true);
      }
    }
  );
};

/* ============================================================
   6. البحث وشريط الأدوات
   ============================================================ */

$("search").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  render();
});

$("expandAll").addEventListener("click", () => {
  collapsedSections.clear();
  render();
});

$("collapseAll").addEventListener("click", () => {
  sections.forEach((s) => collapsedSections.add(s.id));
  render();
});

/* ============================================================
   7. النوافذ المنبثقة والتنبيهات
   ============================================================ */

window.openModal = (id) => $(id).classList.add("active");
window.closeModal = (id) => $(id).classList.remove("active");

let confirmCallback = null;

function showConfirm(title, msg, cb) {
  $("confirmTitle").textContent = title;
  $("confirmMsg").textContent = msg;
  confirmCallback = cb;
  openModal("confirmModal");
}

$("confirmYesBtn").addEventListener("click", () => {
  if (confirmCallback) confirmCallback();
  closeModal("confirmModal");
  confirmCallback = null;
});

document.querySelectorAll(".modal-back").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.remove("active");
  });
});

const toastEl = $("toast");
let toastTimeout;

function toast(msg, isErr = false) {
  toastEl.textContent = msg;
  toastEl.className = "toast " + (isErr ? "err " : "") + "show";
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove("show"), 2200);
}
