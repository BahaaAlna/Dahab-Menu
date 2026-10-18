/* ============================================================
   🛵  صفحة طلب الدليفري

   الزبون بيتصفّح ويعبّي سلته بدون ما يسجّل — ما منوقفه بحاجز
   تسجيل وهو لسا ما قرر شو بدو. التسجيل بينطلب بلحظة وحدة بس:
   وقت يضغط «إتمام الطلب»، لأن هونيك منحتاج نعرف مين هو ووين
   نوصّل. السلة بتضل محفوظة وراء نافذة التسجيل، فما بيضيع شي.
   ============================================================ */

import {
  db, collection, addDoc, serverTimestamp,
  query, where, orderBy, limit, onSnapshot,
} from "./firebase.js";
import { CURRENCY, ORDER_STATUS } from "./config.js";
import { subscribeMenu } from "./menu-data.js";
import { loadCart, saveCart } from "./cart-store.js";
import { byOrder, groupBySection, escapeHtml } from "./utils.js";
import {
  onUser, signIn, signUp, logOut,
  loadProfile, saveProfile,
  prettyPhone, normalizePhone, authErrorMessage,
} from "./auth.js";
import { readFeatures } from "./features.js";

/* ---------- بوابة الميزة ----------
   إخفاء الخيار من صفحة الترحيب لا يكفي، لأن الرابط المباشر
   يبقى مفتوحاً. لذلك يُتحقَّق هنا أيضاً قبل رسم أي شيء، ويُعاد
   الزائر إلى صفحة الترحيب إن كانت الميزة موقوفة. */
if (!(await readFeatures()).delivery) {
  location.replace("./");
}

const $ = (id) => document.getElementById(id);

const orderMenu = $("orderMenu");
const cartBar = $("cartBar");
const gateErr = $("gateErr");
const coErr = $("coErr");
const authDialog = $("authDialog");
const accountDialog = $("accountDialog");
const checkoutDialog = $("checkoutDialog");
const doneDialog = $("doneDialog");

/** السلة: معرّف الصنف → الكمية.
 *  منرجّعها من تخزين المتصفح، فتحديث الصفحة ما بيفرّغها.
 *  يلي محفوظ هو معرّفات وكميات بس — الأسعار والأسماء بتجي
 *  من Firestore وقت يوصل المنيو، ومنطابقها بـ draw(). */
const cart = loadCart();
/** كل الأصناف المعروضة: معرّف → بيانات الصنف */
const itemsById = new Map();

let currentUser = null;
let profile = null;

/** صار true لما يضغط «إتمام الطلب» وهو مو مسجّل — حتى لما
 *  يخلّص تسجيل منكمّل معه للدفع بدل ما نرجّعه يضغط من جديد. */
let checkoutAfterAuth = false;

/* ============================================================
   أدوات صغيرة
   ============================================================ */

/** جمع عربي صحيح — «صنف واحد / صنفين / ٣ أصناف / ١٥ صنف» */
function countLabel(n) {
  if (n === 1) return "صنف واحد";
  if (n === 2) return "صنفين";
  if (n <= 10) return n + " أصناف";
  return n + " صنف";
}

function cartTotal() {
  let sum = 0;
  for (const [id, qty] of cart) {
    sum += (Number(itemsById.get(id)?.price) || 0) * qty;
  }
  return sum;
}

function setBusy(btn, busy, labelWhenIdle) {
  btn.disabled = busy;
  btn.textContent = busy ? "لحظة..." : labelWhenIdle;
}

/* ============================================================
   أيقونة الحساب العائمة
   ============================================================ */

const profileBtn = $("profileBtn");
const profileInitial = $("profileInitial");

function drawProfileBtn() {
  const name = (profile?.name || "").trim();
  const inside = Boolean(currentUser);

  profileBtn.classList.toggle("is-in", inside);
  profileBtn.setAttribute("aria-label", inside ? "حسابك" : "دخول أو حساب جديد");

  // أول حرف من الاسم بدل الأيقونة لما يكون مسجّل
  const showInitial = inside && Boolean(name);
  if (showInitial) profileInitial.textContent = name[0];
  profileInitial.hidden = !showInitial;
  $("profileIcon").hidden = showInitial;
}

profileBtn.addEventListener("click", () => {
  if (currentUser) {
    $("accName").textContent = profile?.name || "زبون دهب";
    $("accPhone").textContent = profile?.phone ? prettyPhone(profile.phone) : "";

    const addr = profile?.address;
    $("accAddr").textContent = addr ? "العنوان المحفوظ: " + addr : "";
    $("accAddr").hidden = !addr;

    accountDialog.showModal();
  } else {
    openAuth(false);
  }
});

$("accCloseBtn").addEventListener("click", () => accountDialog.close());

accountDialog.addEventListener("click", (e) => {
  if (e.target === accountDialog) accountDialog.close();
});

$("logoutBtn").addEventListener("click", async () => {
  accountDialog.close();
  // السلة بتضل متل ما هي — هي سلة المتصفح مو سلة الحساب
  await logOut();
});

/* ============================================================
   نافذة التسجيل
   ============================================================ */

const tabLogin = $("tabLogin");
const tabSignup = $("tabSignup");
const loginForm = $("loginForm");
const signupForm = $("signupForm");

/** forCheckout: عم نفتحها لأنه ضغط «إتمام الطلب» */
function openAuth(forCheckout) {
  checkoutAfterAuth = forCheckout;
  $("authWhy").hidden = !forCheckout;
  // الزر بيرجّعه لوين كان: للسلة إذا جاي يدفع، وللمنيو إذا بس عم يتفرّج
  $("authCloseBtn").textContent = forCheckout ? "رجوع للسلة" : "كمّل تصفّح";
  gateErr.textContent = "";
  authDialog.showModal();
}

function showTab(which) {
  const login = which === "login";
  tabLogin.classList.toggle("is-on", login);
  tabSignup.classList.toggle("is-on", !login);
  tabLogin.setAttribute("aria-selected", String(login));
  tabSignup.setAttribute("aria-selected", String(!login));
  loginForm.hidden = !login;
  signupForm.hidden = login;
  gateErr.textContent = "";
}

tabLogin.addEventListener("click", () => showTab("login"));
tabSignup.addEventListener("click", () => showTab("signup"));

$("authCloseBtn").addEventListener("click", () => {
  checkoutAfterAuth = false;
  authDialog.close();
});

authDialog.addEventListener("click", (e) => {
  if (e.target === authDialog) {
    checkoutAfterAuth = false;
    authDialog.close();
  }
});

const BAD_PHONE = "رقم الموبايل مو صحيح — لازم يكون مثل 09xxxxxxxx.";

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  gateErr.textContent = "";

  const phone = $("loginPhone").value;
  if (!normalizePhone(phone)) {
    gateErr.textContent = BAD_PHONE;
    return;
  }

  const btn = $("loginBtn");
  setBusy(btn, true);
  try {
    await signIn({ phone, password: $("loginPw").value });
  } catch (err) {
    gateErr.textContent = authErrorMessage(err);
  } finally {
    setBusy(btn, false, "دخول");
  }
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  gateErr.textContent = "";

  const phone = $("suPhone").value;
  if (!normalizePhone(phone)) {
    gateErr.textContent = BAD_PHONE;
    return;
  }

  const btn = $("signupBtn");
  setBusy(btn, true);
  try {
    await signUp({
      phone,
      name: $("suName").value,
      password: $("suPw").value,
    });
  } catch (err) {
    gateErr.textContent = authErrorMessage(err);
  } finally {
    setBusy(btn, false, "إنشاء الحساب");
  }
});

/* ============================================================
   تغيّر حالة الحساب
   ============================================================ */

onUser(async (user) => {
  currentUser = user;
  profile = user ? await loadProfile(user.uid).catch(() => null) : null;

  drawProfileBtn();

  if (!user) {
    // طلع من حسابه — ما عاد إله حق يقرا الطلبات، فمنوقف المراقبة
    closeMyOrders();
    return;
  }

  if (profile?.address && !$("coAddress").value) {
    $("coAddress").value = profile.address;
  }

  // سجّل دخوله وهو رايح يدفع — منكمّل معه بدون ما يضغط من جديد
  if (checkoutAfterAuth) {
    checkoutAfterAuth = false;
    authDialog.close();
    openCheckout();
  }
});

/* ============================================================
   رسم المنيو مع أزرار الكمية
   ============================================================ */

function controlsHtml(item, qty) {
  if (item.available === false) return "";

  if (qty === 0) {
    return '<button class="qty-add" type="button" data-add="' + item.id +
      '" aria-label="أضف ' + escapeHtml(item.name) + '">+</button>';
  }

  return '<span class="qty">' +
    '<button class="qty-btn" type="button" data-dec="' + item.id + '" aria-label="أنقص">−</button>' +
    '<b class="qty-num">' + qty + '</b>' +
    '<button class="qty-btn" type="button" data-add="' + item.id + '" aria-label="زد">+</button>' +
    '</span>';
}

function itemHtml(item) {
  const out = item.available === false;
  const qty = cart.get(item.id) || 0;
  const cls = "item" + (out ? " unavailable" : "") + (qty ? " in-cart" : "");

  return '<div class="' + cls + '" data-row="' + item.id + '">' +
    '<span class="item-name">' + escapeHtml(item.name) + '</span>' +
    '<span class="item-dots"></span>' +
    '<span class="item-price">' + escapeHtml(item.price) + '<small>' + CURRENCY + '</small></span>' +
    controlsHtml(item, qty) +
    '</div>';
}

function sectionHtml(section, list) {
  return '<section class="section">' +
    '<div class="section-head">' +
      '<span class="line"></span>' +
      '<span class="section-gem" aria-hidden="true"></span>' +
      '<span class="section-title">' + escapeHtml(section.name) + '</span>' +
      '<span class="section-gem" aria-hidden="true"></span>' +
      '<span class="line"></span>' +
    '</div>' +
    '<div class="items">' + list.map(itemHtml).join("") + '</div>' +
    '</section>';
}

let lastSections = [];
let lastItems = [];

function draw(sections, items) {
  lastSections = sections;
  lastItems = items;

  itemsById.clear();
  for (const it of items) itemsById.set(it.id, it);

  /* مطابقة السلة مع المنيو الحالي.
     السلة ممكن تكون راجعة من تخزين المتصفح من قبل شوي أو من
     مبارح، وممكن المنيو تغيّر: صنف انشال، أو صار مو متوفر.
     منشيل هالأصناف ومنخبّر الزبون — أحسن من إن المجموع
     ينقص لحاله وهو ما بيعرف شو صار. */
  const goneNames = [];
  let goneUnknown = 0;

  for (const id of [...cart.keys()]) {
    const it = itemsById.get(id);
    if (!it) {
      cart.delete(id);
      goneUnknown += 1;
    } else if (it.available === false) {
      cart.delete(id);
      goneNames.push(it.name);
    }
  }

  if (goneNames.length || goneUnknown) {
    saveCart(cart);
    showCartNote(goneNames, goneUnknown);
  }

  const bySection = groupBySection(items);
  const html = [...sections]
    .sort(byOrder)
    .map((sec) => [sec, bySection[sec.id] || []])
    .filter(([, list]) => list.length > 0)
    .map(([sec, list]) => sectionHtml(sec, list))
    .join("");

  orderMenu.innerHTML =
    html || '<div class="loading"><p>لا توجد أصناف حالياً</p></div>';

  drawCart();
}

/* تحديث صف واحد بس.
   لو أعدنا رسم المنيو كله مع كل ضغطة على + أو −، رح تعيد
   كل الأقسام حركة الظهور (fadeUp) فيصير «رفّة» بكل ضغطة،
   وبتضيع مكان التمرير. فمنبدّل الصف المعني لحاله. */
function updateRow(id) {
  const row = orderMenu.querySelector('[data-row="' + id + '"]');
  const item = itemsById.get(id);
  if (row && item) row.outerHTML = itemHtml(item);
  drawCart();
}

/* ============================================================
   تنبيه «انشال صنف من سلتك»
   ============================================================ */

const cartNote = $("cartNote");
let noteTimer = 0;

function hideCartNote() {
  clearTimeout(noteTimer);
  cartNote.hidden = true;
}

function showCartNote(names, unknownCount) {
  const total = names.length + unknownCount;
  let text;

  if (total === 1 && names.length === 1) {
    text = "«" + names[0] + "» ما عاد متوفر — شلناه من سلتك.";
  } else if (total === 1) {
    text = "في صنف ما عاد متوفر — شلناه من سلتك.";
  } else {
    text = "شلنا " + total + " أصناف من سلتك لأنها ما عادت متوفرة.";
  }

  // textContent مو innerHTML — الأسماء جاية من قاعدة البيانات
  $("cartNoteText").textContent = text;
  cartNote.hidden = false;

  clearTimeout(noteTimer);
  noteTimer = setTimeout(hideCartNote, 9000);
}

$("cartNoteClose").addEventListener("click", hideCartNote);

function drawCart() {
  const count = [...cart.values()].reduce((a, b) => a + b, 0);
  cartBar.hidden = count === 0;
  $("cartCount").textContent = countLabel(count);
  $("cartTotal").textContent = cartTotal() + " " + CURRENCY;
}

orderMenu.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  const dec = e.target.closest("[data-dec]");
  if (!add && !dec) return;

  const id = add ? add.dataset.add : dec.dataset.dec;
  const qty = cart.get(id) || 0;

  if (add) cart.set(id, Math.min(qty + 1, 99));
  else if (qty <= 1) cart.delete(id);
  else cart.set(id, qty - 1);

  saveCart(cart);
  updateRow(id);
});

subscribeMenu(draw, () => {
  orderMenu.innerHTML =
    '<div class="loading" style="color:#f87171;">خطأ في تحميل القائمة. تأكد من الاتصال بالإنترنت.</div>';
});

/* ============================================================
   التأكيد والإرسال
   ============================================================ */

function cartLines() {
  return [...cart].map(([id, qty]) => {
    const it = itemsById.get(id);
    return { name: it.name, price: Number(it.price) || 0, qty };
  });
}

function openCheckout() {
  coErr.textContent = "";
  const lines = cartLines();

  $("coLines").innerHTML = lines
    .map((l) =>
      '<div class="co-line">' +
        '<span>' + escapeHtml(l.name) + ' <b>×' + l.qty + '</b></span>' +
        '<span>' + (l.price * l.qty) + ' ' + CURRENCY + '</span>' +
      '</div>'
    )
    .join("");

  $("coTotal").textContent = cartTotal();
  if (profile?.address && !$("coAddress").value) {
    $("coAddress").value = profile.address;
  }
  checkoutDialog.showModal();
}

/* هون بس منطلب تسجيل الدخول — مو قبل. */
$("checkoutBtn").addEventListener("click", () => {
  if (!currentUser) {
    openAuth(true);
    return;
  }
  openCheckout();
});

$("cancelBtn").addEventListener("click", () => checkoutDialog.close());

checkoutDialog.addEventListener("click", (e) => {
  if (e.target === checkoutDialog) checkoutDialog.close();
});

$("confirmBtn").addEventListener("click", async () => {
  coErr.textContent = "";

  // النافذة ما بتنفتح إلا وهو مسجّل، بس ما منبني طلب على افتراض
  if (!currentUser) {
    coErr.textContent = "انقطعت الجلسة — سجّل دخولك كمان مرة.";
    return;
  }

  const address = $("coAddress").value.trim();
  if (address.length < 5) {
    coErr.textContent = "اكتب عنوان واضح لنعرف وين نوصّل.";
    return;
  }

  const lines = cartLines();
  if (lines.length === 0) {
    coErr.textContent = "السلة فاضية.";
    return;
  }

  const note = $("coNote").value.trim();
  const btn = $("confirmBtn");
  setBusy(btn, true);

  const order = {
    uid: currentUser.uid,
    type: "delivery",
    items: lines,
    total: cartTotal(),
    status: "new",
    createdAt: serverTimestamp(),
    customer: {
      name: profile?.name || "زبون دهب",
      phone: profile?.phone || "",
      address,
    },
  };
  if (note) order.note = note;

  try {
    await addDoc(collection(db, "orders"), order);

    // منحفظ العنوان للطلب الجاي
    saveProfile(currentUser.uid, { address }).catch(() => {});
    if (profile) profile.address = address;

    // السلة انفرغت كلها — هون الرسم الكامل بمحله
    cart.clear();
    saveCart(cart);
    hideCartNote();
    draw(lastSections, lastItems);
    checkoutDialog.close();
    doneDialog.showModal();
  } catch (err) {
    // السبب التقني بيضل بالكونسول — الزبون بدو يعرف شو يعمل، مو شو صار
    console.error("order error:", err);
    coErr.textContent =
      err?.code === "permission-denied"
        ? "ما قدرنا نستقبل الطلب هلأ. اتصل فينا ونحنا منسجّله إلك."
        : "ما وصل الطلب. تأكد من الإنترنت وجرّب كمان مرة.";
  } finally {
    setBusy(btn, false, "تأكيد وإرسال");
  }
});

/* ============================================================
   📜  طلباتي — متابعة حالة الطلب

   أول سؤال بيسأله الزبون بعد ما يبعت: «وين صار طلبي؟».
   بدون هالنافذة بيضل يتصل بالمطعم. الحالة بتتغيّر من
   الداشبورد، ومنراقبها بـ onSnapshot فبتوصله لحالها.

   القواعد بـ firestore.rules مسموح فيها يقرا طلباته هو بس
   (resource.data.uid == request.auth.uid) — فما في خطر
   إنه يشوف طلبات غيره حتى لو عبث بالكود.
   ============================================================ */

const ordersDialog = $("ordersDialog");
const ordList = $("ordList");

/** بنوقف المراقبة وقت تنسكّر النافذة — ما منخلي مستمع
 *  شغّال ع الفاضي، لأن كل تحديث بينحسب قراءة. */
let stopOrders = null;

/** آخر ٢٠ طلب بتكفي وزيادة — الزبون ما بيرجع أبعد من هيك */
const ORDERS_SHOWN = 20;

function orderTimeMs(o) {
  // createdAt بيجي null للحظة قبل ما السيرفر يختم الوقت
  return o.createdAt?.toMillis ? o.createdAt.toMillis() : Date.now();
}

const AR_DAY = new Intl.DateTimeFormat("ar-SY", { day: "numeric", month: "long" });
const AR_TIME = new Intl.DateTimeFormat("ar-SY", { hour: "numeric", minute: "2-digit" });

/** «اليوم ٨:٣٠ م» / «مبارح ...» / «١٨ تشرين الأول ...» */
function whenLabel(ms) {
  const midnight = (d) => new Date(d).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(Date.now()) - midnight(ms)) / 86400000);
  const time = AR_TIME.format(new Date(ms));

  if (days === 0) return "اليوم " + time;
  if (days === 1) return "مبارح " + time;
  return AR_DAY.format(new Date(ms)) + " — " + time;
}

/** حالة مو معروفة؟ منعرضها كما هي بدل ما نخبّي الطلب */
function statusOf(raw) {
  return ORDER_STATUS[raw] || { label: String(raw || "—"), tone: "wait" };
}

function orderCardHtml(o) {
  const state = statusOf(o.status);
  const lines = Array.isArray(o.items) ? o.items : [];

  const linesHtml = lines.map((l) => {
    const qty = Number(l.qty) || 1;
    const price = Number(l.price) || 0;
    return '<div class="ord-line">' +
      '<span>' + escapeHtml(l.name) + ' <b>×' + qty + '</b></span>' +
      '<span>' + (price * qty) + ' ' + CURRENCY + '</span>' +
      '</div>';
  }).join("");

  return '<article class="ord">' +
    '<div class="ord-head">' +
      '<span class="ord-when">' + escapeHtml(whenLabel(orderTimeMs(o))) + '</span>' +
      '<span class="ord-state is-' + state.tone + '">' + escapeHtml(state.label) + '</span>' +
    '</div>' +
    '<div class="ord-lines">' + linesHtml + '</div>' +
    (o.note ? '<p class="ord-note">ملاحظتك: ' + escapeHtml(o.note) + '</p>' : '') +
    '<div class="ord-foot">المجموع: <strong>' +
      (Number(o.total) || 0) + '</strong> ' + CURRENCY +
    '</div>' +
    '</article>';
}

function drawOrders(list) {
  if (list.length === 0) {
    ordList.innerHTML =
      '<p class="ord-empty">لسا ما عملت ولا طلب.<br>' +
      'اختار يلي بدك ياه من المنيو وابعتلنا.</p>';
    return;
  }
  ordList.innerHTML = list.map(orderCardHtml).join("");
}

function ordersError(err) {
  console.error("my orders error:", err);
  ordList.innerHTML =
    '<p class="ord-err">ما قدرنا نجيب طلباتك هلأ.<br>' +
    'تأكد من الإنترنت وجرّب كمان مرة.</p>';
}

function snapToList(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* المسار الأساسي بدو فهرس مركّب (uid + createdAt) — موجود
   بـ firestore.indexes.json. إذا الفهرس لسا ما انرفع، Firestore
   بترجع failed-precondition؛ وقتها منجيب طلباته بدون ترتيب
   ومنرتّبهن هون. نفس النتيجة بالضبط، بس بدون فهرس.
   (نفس فكرة الاحتياط يلي بـ menu-data.js) */
function watchMyOrders() {
  if (!currentUser) return;
  stopMyOrders();

  const mine = where("uid", "==", currentUser.uid);
  const ref = collection(db, "orders");

  stopOrders = onSnapshot(
    query(ref, mine, orderBy("createdAt", "desc"), limit(ORDERS_SHOWN)),
    (snap) => drawOrders(snapToList(snap)),
    (err) => {
      if (err?.code !== "failed-precondition") return ordersError(err);

      console.warn("فهرس الطلبات لسا ما انرفع — رتّبناهن محلياً.");
      stopOrders = onSnapshot(
        query(ref, mine),
        (snap) => drawOrders(
          snapToList(snap)
            .sort((a, b) => orderTimeMs(b) - orderTimeMs(a))
            .slice(0, ORDERS_SHOWN)
        ),
        ordersError
      );
    }
  );
}

function stopMyOrders() {
  if (stopOrders) stopOrders();
  stopOrders = null;
}

/** منادى من onUser وقت يطلع من حسابه — ولهيك declaration مو const */
function closeMyOrders() {
  stopMyOrders();
  if (ordersDialog.open) ordersDialog.close();
}

function openMyOrders() {
  if (!currentUser) {
    openAuth(false);
    return;
  }
  ordList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  ordersDialog.showModal();
  watchMyOrders();
}

$("myOrdersBtn").addEventListener("click", () => {
  accountDialog.close();
  openMyOrders();
});

$("doneTrackBtn").addEventListener("click", () => {
  doneDialog.close();
  openMyOrders();
});

$("ordCloseBtn").addEventListener("click", () => ordersDialog.close());

ordersDialog.addEventListener("click", (e) => {
  if (e.target === ordersDialog) ordersDialog.close();
});

// بتشمل زر «رجوع» بالموبايل و Esc — مو بس زر «تمام»
ordersDialog.addEventListener("close", stopMyOrders);

$("doneBtn").addEventListener("click", () => doneDialog.close());

drawProfileBtn();
