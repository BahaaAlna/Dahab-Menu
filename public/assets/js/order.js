/* ============================================================
   🛵  صفحة طلب الدليفري

   يتصفّح الزبون ويملأ سلته دون تسجيل، فلا يُوقَف عند حاجز تسجيل
   وهو لم يقرّر بعد ما يريد. ولا يُطلَب التسجيل إلا في لحظة واحدة:
   عند الضغط على «إتمام الطلب»، إذ نحتاج عندها إلى معرفة هويته
   وعنوان التوصيل. وتبقى السلة محفوظة خلف نافذة التسجيل فلا يضيع شيء.
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
  onUser, signIn, signUp,
  loadProfile, saveProfile,
  normalizePhone, authErrorMessage,
} from "./auth.js";
import { readFeatures } from "./features.js";
import { mountAccountMenu } from "./account-menu.js";
import { LINK_SUFFIX } from "./dev-mode.js";
import {
  addressList, defaultAddressText, freeSlot, addressTitle,
} from "./profile-data.js";

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
const checkoutDialog = $("checkoutDialog");
const doneDialog = $("doneDialog");

/** السلة: معرّف الصنف → الكمية.
 *  تُستعاد من تخزين المتصفح، فلا يُفرغها تحديث الصفحة.
 *  والمحفوظ معرّفات وكميات فقط، أما الأسعار والأسماء فتأتي من
 *  Firestore عند وصول القائمة، وتُطابَق في draw(). */
const cart = loadCart();
/** كل الأصناف المعروضة: معرّف → بيانات الصنف */
const itemsById = new Map();

let currentUser = null;
let profile = null;

/** تصير true عند الضغط على «إتمام الطلب» دون تسجيل، حتى إذا
 *  أتمّ التسجيل نتابع معه إلى الدفع بدل مطالبته بالضغط من جديد. */
let checkoutAfterAuth = false;

/* ============================================================
   أدوات صغيرة
   ============================================================ */

/** صيغة جمع عربية صحيحة: «صنف واحد / صنفان / ٣ أصناف / ١٥ صنفاً» */
function countLabel(n) {
  if (n === 1) return "صنف واحد";
  if (n === 2) return "صنفان";
  if (n <= 10) return n + " أصناف";
  return n + " صنفاً";
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
  btn.textContent = busy ? "يُرجى الانتظار..." : labelWhenIdle;
}

/* ============================================================
   أيقونة الحساب العائمة
   ============================================================ */

/* القائمة المشتركة: «ملفي» و«طلباتي» وتسجيل الخروج. وكلتا
   الوجهتين صفحة قائمة بذاتها، فيعمل زرّ الرجوع في الهاتف. */
const menu = mountAccountMenu({ onSignIn: () => openAuth(false) });

function drawProfileBtn() {
  menu.update(currentUser, profile);
}

/* ============================================================
   نافذة التسجيل
   ============================================================ */

const tabLogin = $("tabLogin");
const tabSignup = $("tabSignup");
const loginForm = $("loginForm");
const signupForm = $("signupForm");

/** forCheckout: تُفتَح النافذة لأنه ضغط «إتمام الطلب» */
function openAuth(forCheckout) {
  checkoutAfterAuth = forCheckout;
  $("authWhy").hidden = !forCheckout;
  // يعيده الزر إلى حيث كان: إلى السلة إن كان متوجّهاً للدفع،
  // وإلى القائمة إن كان يتصفّح فقط
  $("authCloseBtn").textContent = forCheckout ? "العودة إلى السلة" : "متابعة التصفّح";
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

// لا تبقى كلمة المرور مكتوبة في الصفحة بعد إغلاق النافذة
authDialog.addEventListener("close", () => {
  loginForm.reset();
  signupForm.reset();
  gateErr.textContent = "";
});

authDialog.addEventListener("click", (e) => {
  if (e.target === authDialog) {
    checkoutAfterAuth = false;
    authDialog.close();
  }
});

const BAD_PHONE = "رقم الهاتف غير صحيح، والصيغة المطلوبة 09xxxxxxxx.";

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
    setBusy(btn, false, "تسجيل الدخول");
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

  if (!user) return;

  // نجح دخوله، فلا معنى لبقاء نافذة التسجيل مفتوحة أمامه
  if (authDialog.open) authDialog.close();

  // وإن كان متوجّهاً للدفع، يُتابع معه دون ضغط جديد
  if (checkoutAfterAuth) {
    checkoutAfterAuth = false;
    openCheckout();
  }
});

/* ============================================================
   رسم قائمة الطعام مع أزرار الكمية
   ============================================================ */

function controlsHtml(item, qty) {
  if (item.available === false) return "";

  if (qty === 0) {
    return '<button class="qty-add" type="button" data-add="' + item.id +
      '" aria-label="أضف ' + escapeHtml(item.name) + '">+</button>';
  }

  return '<span class="qty">' +
    '<button class="qty-btn" type="button" data-dec="' + item.id + '" aria-label="إنقاص الكمية">−</button>' +
    '<b class="qty-num">' + qty + '</b>' +
    '<button class="qty-btn" type="button" data-add="' + item.id + '" aria-label="زيادة الكمية">+</button>' +
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

  /* مطابقة السلة مع القائمة الحالية.
     قد تكون السلة مستعادة من تخزين المتصفح منذ قليل أو منذ يوم،
     وقد تكون القائمة تغيّرت: صنف حُذف، أو لم يعد متوفراً. تُحذف
     هذه الأصناف ويُخبَر الزبون، فذلك أفضل من أن ينقص المجموع
     من تلقاء نفسه دون أن يعرف السبب. */
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

/* تحديث صف واحد فقط.
   لو أُعيد رسم القائمة كاملة مع كل ضغطة على + أو −، لأعادت جميع
   الأقسام حركة الظهور (fadeUp) فيحدث ارتجاف مع كل ضغطة، ويضيع
   موضع التمرير. لذلك يُستبدَل الصف المعني وحده. */
function updateRow(id) {
  const row = orderMenu.querySelector('[data-row="' + id + '"]');
  const item = itemsById.get(id);
  if (row && item) row.outerHTML = itemHtml(item);
  drawCart();
}

/* ============================================================
   تنبيه حذف صنف من السلة
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
    text = "«" + names[0] + "» لم يعد متوفراً، وقد حُذف من سلتك.";
  } else if (total === 1) {
    text = "أحد الأصناف لم يعد متوفراً، وقد حُذف من سلتك.";
  } else {
    text = "حُذفت " + total + " أصناف من سلتك لأنها لم تعد متوفرة.";
  }

  // تُستعمل textContent لا innerHTML، لأن الأسماء واردة من قاعدة البيانات
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
    '<div class="loading" style="color:#f87171;">تعذّر تحميل القائمة. يُرجى التحقق من الاتصال بالإنترنت.</div>';
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
  drawAddressChoices();
  checkoutDialog.showModal();
}

/* ============================================================
   اختيار العنوان عند الدفع

   العناوين المحفوظة تُعرَض خيارات جاهزة، والافتراضي مُحدَّد سلفاً،
   ويبقى «عنوان آخر» لطلب يُرسَل إلى مكان غير معتاد دون أن يُحشَر
   في الملف المحفوظ.
   ============================================================ */

const coAddrChoices = $("coAddrChoices");
const coAddress = $("coAddress");

function drawAddressChoices() {
  const list = addressList(profile);

  if (list.length === 0) {
    coAddrChoices.hidden = true;
    coAddrChoices.innerHTML = "";
    coAddress.hidden = false;
    return;
  }

  coAddrChoices.hidden = false;
  coAddrChoices.innerHTML = list.map((entry, i) =>
    '<label class="co-addr">' +
      '<input type="radio" name="coAddr" value="' + escapeHtml(entry.text) + '"' +
        (entry.isDefault ? " checked" : "") + '>' +
      '<span class="co-addr-body">' +
        '<b>' + escapeHtml(addressTitle(entry, i)) + '</b>' +
        '<small>' + escapeHtml(entry.text) + '</small>' +
      '</span>' +
    '</label>'
  ).join("") +
    '<label class="co-addr">' +
      '<input type="radio" name="coAddr" value="">' +
      '<span class="co-addr-body"><b>عنوان آخر</b></span>' +
    '</label>';

  // الحقل لا يظهر إلا مع خيار «عنوان آخر»
  coAddress.hidden = true;
  coAddress.value = defaultAddressText(profile);
}

coAddrChoices?.addEventListener("change", (e) => {
  const picked = e.target.value;
  const other = picked === "";

  coAddress.hidden = !other;
  coAddress.value = other ? "" : picked;
  if (other) coAddress.focus();
});

/* هنا وحدها يُطلَب تسجيل الدخول، لا قبل ذلك. */
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

  // لا تُفتَح النافذة إلا بعد التسجيل، غير أن الطلب لا يُبنى على افتراض
  if (!currentUser) {
    coErr.textContent = "انقطعت الجلسة. يُرجى تسجيل الدخول من جديد.";
    return;
  }

  const address = $("coAddress").value.trim();
  if (address.length < 5) {
    coErr.textContent = "يُرجى كتابة عنوان واضح ليتسنّى لنا التوصيل.";
    return;
  }

  const lines = cartLines();
  if (lines.length === 0) {
    coErr.textContent = "السلة فارغة.";
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

    // عنوان جديد يُحفَظ في أول خانة فارغة، فيجد الزبون عناوينه
    // جاهزة في الطلب التالي. أما إن امتلأت الخانات الثلاث فلا
    // يُلمَس شيء: إدارتها من صفحة «ملفي» وحدها.
    rememberAddress(address);

    // أُفرغت السلة بالكامل، فالرسم الكامل هنا في محلّه
    cart.clear();
    saveCart(cart);
    hideCartNote();
    draw(lastSections, lastItems);
    checkoutDialog.close();
    doneDialog.showModal();
  } catch (err) {
    // يبقى السبب التقني في الكونسول، فالزبون يحتاج أن يعرف ما يفعل
    // لا ما حدث
    console.error("order error:", err);
    coErr.textContent =
      err?.code === "permission-denied"
        ? "تعذّر استقبال الطلب حالياً. يُرجى الاتصال بنا وسنسجّله لك."
        : "لم يصل الطلب. يُرجى التحقق من الإنترنت وإعادة المحاولة.";
  } finally {
    setBusy(btn, false, "تأكيد وإرسال");
  }
});

/* متابعة الطلب تفتح صفحة الطلبات */
$("doneTrackBtn").addEventListener("click", () => {
  location.assign("orders.html" + LINK_SUFFIX);
});

/** يحفظ عنواناً لم يكن محفوظاً، إن بقيت خانة فارغة */
function rememberAddress(address) {
  if (!profile) return;

  const known = addressList(profile).some((e) => e.text === address);
  if (known) return;

  const slot = freeSlot(profile);
  if (!slot) return;

  const addresses = { ...(profile.addresses || {}), [slot]: { label: "", text: address } };
  const patch = { addresses };
  if (!profile.defaultAddress) patch.defaultAddress = slot;

  Object.assign(profile, patch);
  saveProfile(currentUser.uid, patch).catch((err) => {
    console.error("address save error:", err);
  });
}

$("doneBtn").addEventListener("click", () => doneDialog.close());

drawProfileBtn();
