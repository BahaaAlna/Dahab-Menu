/* ============================================================
     لوحة الإدارة

   أربعة أقسام يبدّل بينها الشريط الجانبي:
     • الطلبات       — الداخلة من الطاولات ومن الدليفري  (admin-orders.js)
     • الأصناف       — الأقسام والأصناف والأسعار          (هذا الملف)
     • رموز الطاولات — توليد رمز لكل طاولة وطباعته        (admin-qr.js)
     • الإعدادات     — مفاتيح تشغيل الميزات               (هذا الملف)

   التبديل في المتصفح دون تحميل صفحة: الاستماع إلى Firestore
   قائم، فلو حُمِّلت صفحة جديدة عند كل نقرة لانقطع الاستماع
   وأُعيد بناؤه، وضاع الطلب الواصل في تلك اللحظة.
   ============================================================ */

import {
  db, auth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence,
  collection, doc, setDoc, addDoc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, writeBatch,
} from "./firebase.js";
import {
  COLLECTIONS, PRICE_STEP,
  PUBLIC_MENU, FEATURE_FLAGS,
} from "./config.js";
import { byOrder, groupBySection, escapeHtml, escapeAttr } from "./utils.js";
import { mountOrders } from "./admin-orders.js";
import { mountQr } from "./admin-qr.js";
import { mountReport } from "./admin-report.js";

const $ = (id) => document.getElementById(id);

/** أيقونة من ملف الرموز المشترك.
 *  بدل الإيموجي: الإيموجي يرسمه النظام لا نحن، فيختلف شكله بين
 *  جهاز وآخر ويأتي بألوانه فيكسر الذهبي والأسود. أما هذه فترث
 *  لون الزرّ، وتُطبَع وتكبُر دون أن تتشوّش. */
const icon = (id) =>
  '<svg class="ic" aria-hidden="true"><use href="assets/img/icons.svg#' + id + '"></use></svg>';

/* ============================================================
   0. الشريط الجانبي وتبديل الأقسام
   ============================================================ */

const side = $("side");

function showPane(name) {
  for (const btn of side.querySelectorAll("[data-pane]")) {
    btn.classList.toggle("is-on", btn.dataset.pane === name);
  }
  for (const pane of document.querySelectorAll(".pane")) {
    pane.hidden = pane.id !== "pane-" + name;
  }
  // القسم الجديد يبدأ من أعلاه، لا من موضع تمرير القسم السابق
  window.scrollTo(0, 0);
}

side.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pane]");
  if (btn) showPane(btn.dataset.pane);
});

/* ============================================================
   1. تسجيل الدخول
   ============================================================ */

/* ---------- من يدخل اللوحة؟ ----------
   كانت كلمة المرور مكتوبة في config.js ويُدخَل بـ signInAnonymously،
   وهذه حماية شكلية: الموقع ملفات ساكنة، فأي زائر يقرأ الكلمة من
   الكود. والأهمّ أن قواعد Firestore تعرّف الموظف بـ UID محدَّد،
   والمستخدم المجهول ليس ذلك الـ UID، فلا كتابة له بعد رفع القواعد.

   لذلك صار الدخول بحساب موظف حقيقي من Firebase Authentication،
   وهو الحساب نفسه الذي وُضع UID له في isStaff() داخل
   firestore.rules. ولم يبقَ في الكود أي سرّ. */

const bootEl = $("boot");
const loginWrap = $("loginWrap");
const adminEl = $("admin");
const emailInput = $("emailInput");
const pwInput = $("pwInput");
const loginErr = $("loginErr");

let panelOpen = false;

/** تُطفأ شاشة الانتظار عند أول جواب من Firebase، ولا تعود */
function endBoot() {
  bootEl.hidden = true;
}

function openPanel() {
  endBoot();
  if (panelOpen) return;
  panelOpen = true;

  loginWrap.hidden = true;
  adminEl.classList.add("active");
  startListening();

  /* الطلبات والرموز لا تُركَّب إلا بعد الدخول: قراءة الطلبات
     للموظف وحده في القواعد، وتركيبها قبل ذلك خطأ صلاحيات مؤكَّد. */
  mountOrders();
  mountQr();
  mountReport();
}

function showLogin() {
  endBoot();
  // لا شيء يتغيّر إن كانت شاشة الدخول ظاهرة أصلاً، فلا يُعاد رسمها
  if (!panelOpen && !loginWrap.hidden) return;

  panelOpen = false;
  loginWrap.hidden = false;
  adminEl.classList.remove("active");
}

/* تُحفظ الجلسة بين الزيارات، فلا يُعاد تسجيل الدخول في كل مرة.
   وتُضبَط قبل أي تسجيل دخول لا بعده: لذلك يُحتفَظ بالوعد
   ويُنتظَر في tryLogin، فالضبط بعد الدخول لا يفيد شيئاً. */
const persistenceReady = setPersistence(auth, browserLocalPersistence)
  .catch((e) => console.error("persistence error:", e));

/* رسائل الدخول بالعربية وبلغة مفهومة، لا أكواد Firebase.
   كانت الرسائل العامة في auth.js، وقد أُزيل مع حسابات الزبائن،
   فصارت هنا كاملةً: الموظف وحده من يسجّل دخولاً في الموقع. */
const LOGIN_MESSAGES = {
  "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة.",
  "auth/invalid-login-credentials": "البريد أو كلمة المرور غير صحيحة.",
  "auth/wrong-password": "كلمة المرور غير صحيحة.",
  "auth/user-not-found": "لا يوجد حساب موظف بهذا البريد.",
  "auth/invalid-email": "صيغة البريد غير صحيحة.",
  "auth/user-disabled": "هذا الحساب موقوف.",
  "auth/too-many-requests": "عدد المحاولات كبير. يُرجى الانتظار قليلاً ثم إعادة المحاولة.",
  "auth/network-request-failed": "لا يوجد اتصال بالإنترنت.",
  "auth/operation-not-allowed":
    "تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase Console.",
};

function loginErrorMessage(err) {
  return LOGIN_MESSAGES[err?.code] || "حدث خطأ. يُرجى إعادة المحاولة.";
}

async function tryLogin() {
  const email = emailInput.value.trim();
  const password = pwInput.value;
  loginErr.textContent = "";

  if (!email || !password) {
    loginErr.textContent = "يُرجى إدخال البريد وكلمة المرور.";
    return;
  }

  const btn = $("loginBtn");
  btn.disabled = true;
  btn.textContent = "يُرجى الانتظار...";

  try {
    await persistenceReady;
    await signInWithEmailAndPassword(auth, email, password);
    pwInput.value = "";
    // فتح اللوحة يتولّاه onAuthStateChanged أدناه
  } catch (err) {
    console.error("admin login error:", err);
    loginErr.textContent = loginErrorMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "تسجيل الدخول";
  }
}

$("loginBtn").addEventListener("click", tryLogin);
pwInput.addEventListener("keydown", (e) => e.key === "Enter" && tryLogin());
emailInput.addEventListener("keydown", (e) => e.key === "Enter" && pwInput.focus());

$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth).catch((e) => console.error("sign out error:", e));
  location.reload();
});

/* الجلسة المحفوظة تُستعاد من تخزين المتصفح دون نداء شبكة، فتُفتح
   اللوحة فوراً. ولا تُعرَض شاشة الدخول إلا إذا لم تكن ثمّة جلسة.

   والمستخدم المجهول لا يُقبَل هنا: قد تبقى في المتصفح جلسة مجهولة
   قديمة من النسخة السابقة من اللوحة، وهي ليست حساب موظف ولا تملك
   صلاحية الكتابة. تُنهى صراحةً كي لا تفتح اللوحة على فراغ. */
onAuthStateChanged(auth, (user) => {
  if (user && !user.isAnonymous) {
    openPanel();
    return;
  }

  if (user?.isAnonymous) {
    signOut(auth).catch((e) => console.error("stale session error:", e));
  }

  showLogin();
});

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
    clearStoredIcons();
  });
  watchFeatureFlags();
}

/* ============================================================
   تنظيف الرموز التعبيرية المخزَّنة

   القائمة بلا إيموجي، لكن أقساماً قديمة ما زالت تحمله في Firestore.
   تُمسَح مرة واحدة عند فتح اللوحة، ثم تُعاد كتابة النسخة المجمّعة.
   ============================================================ */

let iconsCleared = false;

async function clearStoredIcons() {
  if (iconsCleared || !sectionsReady || !itemsReady) return;
  iconsCleared = true;

  const dirtySecs = sections.filter((s) => s.icon);
  const dirtyItems = items.filter((i) => i.sectionIcon);
  if (!dirtySecs.length && !dirtyItems.length) return;

  try {
    // الدفعة الواحدة تتّسع لـ 500 كتابة، والقائمة أقل من مئة
    const batch = writeBatch(db);
    dirtySecs.forEach((s) => batch.update(doc(db, COLLECTIONS.sections, s.id), { icon: "" }));
    dirtyItems.forEach((i) => batch.update(doc(db, COLLECTIONS.items, i.id), { sectionIcon: "" }));
    await batch.commit();
    scheduleAggregateWrite();
  } catch (err) {
    console.error("icon cleanup error:", err);
    iconsCleared = false;
  }
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
                  title="${off ? "غير متوفر" : "متوفر"}">${icon(off ? "close" : "check")}</button>
          <button class="icon-btn del"
                  onclick="window.__delItem('${item.id}','${escapeAttr(item.name)}')"
                  title="حذف">${icon("trash")}</button>
        </div>
      </div>`;
}

function sectionCardHtml(sec, secItems) {
  const collapsed = collapsedSections.has(sec.id) ? "collapsed" : "";
  return `<div class="section-card ${collapsed}" data-sid="${sec.id}">
      <div class="section-header" onclick="window.__toggleSec('${sec.id}')">
        <div class="section-header-left">
          <span class="title">${escapeHtml(sec.name)}</span>
          <span class="badge">${secItems.length} صنف</span>
        </div>
        <div class="section-header-actions">
          <button class="icon-btn" onclick="event.stopPropagation();window.__editSec('${sec.id}')" title="تعديل">${icon("edit")}</button>
          <button class="icon-btn del" onclick="event.stopPropagation();window.__delSec('${sec.id}')" title="حذف">${icon("trash")}</button>
          <span class="toggle">${icon("chevron")}</span>
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
    toast("تم الحفظ");
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
    toast("تمت الإضافة");
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
  openModal("sectionModal");
});

window.__editSec = (sid) => {
  const sec = sections.find((x) => x.id === sid);
  if (!sec) return;
  editingSecId = sid;
  $("secModalTitle").textContent = "تعديل قسم";
  $("secName").value = sec.name;
  openModal("sectionModal");
};

$("secSaveBtn").addEventListener("click", async () => {
  const name = $("secName").value.trim();
  if (!name) return toast("يُرجى إدخال اسم القسم", true);

  try {
    if (editingSecId) {
      await updateDoc(doc(db, COLLECTIONS.sections, editingSecId), { name, icon: "" });
      // تحديث اسم القسم ورمزه داخل جميع أصنافه
      const batch = writeBatch(db);
      items
        .filter((i) => i.sectionId === editingSecId)
        .forEach((i) =>
          batch.update(doc(db, COLLECTIONS.items, i.id), {
            sectionName: name,
            sectionIcon: "",
          })
        );
      await batch.commit();
      toast("تم التحديث");
    } else {
      const maxOrder = sections.reduce((m, s) => Math.max(m, s.order || 0), -1);
      await setDoc(doc(db, COLLECTIONS.sections, "sec_" + Date.now()), {
        name,
        icon: "",
        order: maxOrder + 1,
      });
      toast("تمت إضافة القسم");
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

/* وصول القائمة أول مرة ليس تعديلاً.
   كانت اللوحة تكتب النسخة المجمّعة عند كل فتح لها، لأن أول لقطة
   من Firestore تُنادي هذه الدالة كما يُناديها أي تعديل. والكتابة
   الواحدة تُوقظ onSnapshot على كل جهاز زبون متّصل فيُعيد تحميل
   القائمة، فضلاً عن أنها كتابة محسوبة من حصّة الخطة المجانية.
   لذلك تُتجاهَل أول مرة، ولا يُكتَب إلا بعد تغيير حقيقي. */
let firstSnapshotSettled = false;

function scheduleAggregateWrite() {
  if (!sectionsReady || !itemsReady) return;

  if (!firstSnapshotSettled) {
    firstSnapshotSettled = true;
    return;
  }

  clearTimeout(aggTimer);
  aggTimer = setTimeout(writeAggregate, 1200);
}

async function writeAggregate() {
  try {
    await setDoc(doc(db, PUBLIC_MENU.collection, PUBLIC_MENU.doc), {
      sections: [...sections].sort(byOrder).map((s) => ({
        id: s.id,
        name: s.name,
        icon: "",
        order: s.order || 0,
      })),
      // المعرّف لا غنى عنه: السلة في صفحة الطلب تُفهرَس به، ولولاه
      // لصارت كل الأصناف صنفاً واحداً مجهولاً ومجموعها صفراً.
      items: [...items].sort(byOrder).map((i) => ({
        id: i.id,
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
    toast(value ? "تم تفعيل الميزة" : "تم إيقاف الميزة");
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
