/* ============================================================
   🛠️  لوحة الإدارة — إضافة/تعديل/حذف الأقسام والأصناف
   ينعكس كل تعديل فوراً على صفحة قائمة الطعام لدى الزبائن.
   ============================================================ */

import {
  db, auth, signInAnonymously,
  collection, doc, setDoc, addDoc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, writeBatch,
} from "./firebase.js";
import {
  ADMIN_PASSWORD, COLLECTIONS, DEFAULT_ICON, PRICE_STEP,
  PUBLIC_MENU, FEATURE_FLAGS,
} from "./config.js";
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
    loginErr.textContent = "كلمة المرور غير صحيحة";
    pwInput.value = "";
    setTimeout(() => (loginErr.textContent = ""), 2500);
    return;
  }
  sessionStorage.setItem(SESSION_KEY, "1");
  signInAnonymously(auth)
    .then(openPanel)
    .catch((e) => {
      loginErr.textContent =
        "تعذّر الاتصال بـ Firebase. يُرجى التأكد من تفعيل Anonymous Authentication.";
      console.error(e);
    });
}

$("loginBtn").addEventListener("click", tryLogin);
pwInput.addEventListener("keydown", (e) => e.key === "Enter" && tryLogin());

$("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});

// دخول تلقائي في حال كانت الجلسة ما زالت مفتوحة
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

let sectionsReady = false;
let itemsReady = false;

function startListening() {
  onSnapshot(
    query(collection(db, COLLECTIONS.sections), orderBy("order")),
    (snap) => {
      sections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      sectionsReady = true;
      render();
      scheduleAggregateWrite();
    }
  );
  onSnapshot(collection(db, COLLECTIONS.items), (snap) => {
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    itemsReady = true;
    render();
    scheduleAggregateWrite();
  });
  watchFeatureFlags();
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
            <button type="button" class="stepper-btn" title="إنقاص"
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
              <button type="button" class="stepper-btn" title="إنقاص"
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
    toast("تعذّر الحفظ", true);
    console.error(e);
  }
};

/* حماية: في متصفح كروم تغيّر عجلة الفأرة قيمة حقل الرقم المركَّز، وبما أنّ
   التغيير يُحفَظ فوراً في Firestore، فقد يتغيّر أحد الأسعار من دون قصد.
   لذلك يُلغى التركيز عند أول تمرير. */
document.addEventListener(
  "wheel",
  () => {
    const el = document.activeElement;
    if (el && el.type === "number") el.blur();
  },
  { passive: true }
);

/** زيادة سعر صنف محفوظ أو إنقاصه — يُحفَظ مباشرة في Firestore */
window.__stepPrice = (itemId, dir) => {
  const item = items.find((x) => x.id === itemId);
  if (!item) return;
  const next = Math.max(0, (Number(item.price) || 0) + dir * PRICE_STEP);
  if (next === item.price) return;
  const el = $(`pr-${itemId}`);
  if (el) el.value = next;
  window.__updField(itemId, "price", next);
};

/** زيادة قيمة حقل محلي أو إنقاصها (صف الإضافة) — من دون حفظ */
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
    toast("تعذّر التنفيذ", true);
  }
};

window.__delItem = (itemId, name) => {
  showConfirm(`حذف "${name}"؟`, "هذا الإجراء لا يمكن التراجع عنه.", async () => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.items, itemId));
      toast("تم الحذف");
    } catch (e) {
      toast("تعذّر الحذف", true);
    }
  });
};

window.__addItem = async (sectionId) => {
  const nameEl = $(`new-nm-${sectionId}`);
  const priceEl = $(`new-pr-${sectionId}`);
  const name = nameEl.value.trim();
  const price = Number(priceEl.value);

  if (!name) return toast("يُرجى إدخال اسم الصنف", true);
  if (!price || price < 0) return toast("يُرجى إدخال سعر صحيح", true);

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
    toast("تعذّرت الإضافة", true);
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
  if (!name) return toast("يُرجى إدخال اسم القسم", true);

  try {
    if (editingSecId) {
      await updateDoc(doc(db, COLLECTIONS.sections, editingSecId), { name, icon });
      // تحديث اسم القسم ورمزه داخل جميع أصنافه
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
    toast("تعذّر الحفظ", true);
    console.error(e);
  }
});

window.__delSec = (sid) => {
  const sec = sections.find((x) => x.id === sid);
  const secItems = items.filter((i) => i.sectionId === sid);
  showConfirm(
    `حذف قسم "${sec.name}"؟`,
    `سيُحذف القسم ومعه ${secItems.length} صنف.`,
    async () => {
      try {
        const batch = writeBatch(db);
        secItems.forEach((i) => batch.delete(doc(db, COLLECTIONS.items, i.id)));
        batch.delete(doc(db, COLLECTIONS.sections, sid));
        await batch.commit();
        toast("تم حذف القسم");
      } catch (e) {
        toast("تعذّر الحذف", true);
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


/* ============================================================
   8. النسخة المجمّعة للزبائن

   تقرأ صفحة قائمة الطعام وثيقة واحدة (menu_public/current) بدل
   أن تقرأ ثماني وثمانين وثيقة لكل زبون. وتُعاد كتابتها من هنا بعد
   أي تعديل، لأن لوحة الإدارة هي المصدر الوحيد لتعديل القائمة.

   التأجيل ألفاً ومئتي مللي ثانية يجعل التعديلات المتتابعة (مثل حذف
   قسم مع أصنافه) تصدر في كتابة واحدة بدل عشرات.
   ============================================================ */

let aggTimer = null;

function scheduleAggregateWrite() {
  if (!sectionsReady || !itemsReady) return;
  clearTimeout(aggTimer);
  aggTimer = setTimeout(writeAggregate, 1200);
}

async function writeAggregate() {
  try {
    await setDoc(doc(db, PUBLIC_MENU.collection, PUBLIC_MENU.doc), {
      sections: [...sections].sort(byOrder).map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.icon || DEFAULT_ICON,
        order: s.order || 0,
      })),
      items: [...items].sort(byOrder).map((i) => ({
        sectionId: i.sectionId,
        name: i.name,
        price: i.price,
        order: i.order || 0,
        available: i.available !== false,
      })),
      updatedAt: Date.now(),
    });
  } catch (e) {
    // لا يُزعَج الموظف، فالقائمة لديه صحيحة وإنما تأخّرت النسخة المجمّعة
    console.error("تعذّر تحديث النسخة المجمّعة:", e);
  }
}


/* ============================================================
   9. مفاتيح تشغيل الميزات

   «طلب دليفري» و«طلب من الطاولة» ما زالتا قيد التطوير، لكنّ
   الموقع منشور. فبدل سحب الكود عند كل تراجع، تُخزَّن حالة كل
   ميزة في وثيقة واحدة بـ Firestore، ويقرؤها الزبائن مباشرة.
   الإيقاف من هنا يخفي الميزة فوراً دون إعادة نشر.

   الميزة مطفأة ما لم تُضبَط على true، فغياب الوثيقة يعني
   أن الميزتين مخفيتان.
   ============================================================ */

const flagDelivery = $("flagDelivery");
const flagTable = $("flagTable");

function watchFeatureFlags() {
  onSnapshot(
    doc(db, FEATURE_FLAGS.collection, FEATURE_FLAGS.doc),
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      flagDelivery.checked = data?.delivery === true;
      flagTable.checked = data?.table === true;
    },
    (e) => {
      console.error("features error:", e);
      toast("تعذّرت قراءة حالة الميزات", true);
    }
  );
}

/** الكتابة بـ merge حتى لا يمحو مفتاحٌ المفتاحَ الآخر */
async function writeFlag(key, value, el) {
  try {
    await setDoc(
      doc(db, FEATURE_FLAGS.collection, FEATURE_FLAGS.doc),
      { [key]: value, updatedAt: Date.now() },
      { merge: true }
    );
    toast(value ? "تم تفعيل الميزة ✓" : "تم إيقاف الميزة");
  } catch (e) {
    el.checked = !value; // إعادة المفتاح إلى حالته السابقة عند تعذّر الحفظ
    toast("تعذّر حفظ الإعداد", true);
    console.error(e);
  }
}

flagDelivery.addEventListener("change", (e) =>
  writeFlag("delivery", e.target.checked, e.target)
);
flagTable.addEventListener("change", (e) =>
  writeFlag("table", e.target.checked, e.target)
);
