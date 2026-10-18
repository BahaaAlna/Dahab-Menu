/* ============================================================
   📇  صفحة «ملفي»

   تعديل الاسم، وإدارة ثلاثة عناوين محفوظة مع اختيار الافتراضي.
   كل تغيير يُحفظ في customers/{uid} على الخادم مباشرة، فيتبع
   الزبونَ إلى أي جهاز يدخل منه.

   رقم الهاتف معروض للقراءة فقط، وتثبيته الحقيقي في firestore.rules
   لا هنا: الموقع ملفات ساكنة، فإخفاء الحقل وحده لا يمنع أحداً من
   مناداة Firestore مباشرة.
   ============================================================ */

import { onUser, loadProfile, saveProfile, prettyPhone } from "./auth.js";
import { mountAccountMenu } from "./account-menu.js";
import { LINK_SUFFIX } from "./dev-mode.js";
import { escapeHtml } from "./utils.js";
import {
  ADDRESS_SLOTS, MIN_ADDRESS,
  addressList, freeSlot, addressTitle,
} from "./profile-data.js";

const $ = (id) => document.getElementById(id);

const pageLoading = $("pageLoading");
const gateCard = $("gateCard");
const profileBody = $("profileBody");
const addrList = $("addrList");
const addrDialog = $("addrDialog");
const toast = $("toast");

let currentUser = null;
let profile = null;

/** الخانة التي تُحرَّر الآن، أو "" إن كانت إضافة جديدة */
let editingSlot = "";

const menu = mountAccountMenu({
  onSignIn: () => location.assign("order.html" + LINK_SUFFIX),
});

/* روابط الرجوع تحافظ على وضع ‎?live=1‎ */
$("backLink").href = "order.html" + LINK_SUFFIX;
$("gateLink").href = "order.html" + LINK_SUFFIX;

/* ============================================================
   رسالة الحفظ العابرة
   ============================================================ */

let toastTimer = null;

function flash(message, isError) {
  toast.textContent = message;
  toast.classList.toggle("is-bad", Boolean(isError));
  toast.hidden = false;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

/* ============================================================
   الحفظ على الخادم
   ============================================================ */

/** يكتب التعديل ثم يعيد الرسم. يُرجع true عند النجاح. */
async function persist(patch, okMessage) {
  const before = JSON.parse(JSON.stringify(profile));
  Object.assign(profile, patch);

  try {
    await saveProfile(currentUser.uid, patch);
    if (okMessage) flash(okMessage, false);
    return true;
  } catch (err) {
    console.error("profile save error:", err);
    profile = before;          // لا تُظهر للزبون تغييراً لم يُحفَظ
    draw();
    flash(
      err?.code === "permission-denied"
        ? "تعذّر الحفظ: قواعد قاعدة البيانات لم تُرفَع بعد."
        : "تعذّر حفظ التعديل. يُرجى إعادة المحاولة.",
      true
    );
    return false;
  }
}

/* ============================================================
   رسم العناوين
   ============================================================ */

function addressCardHtml(entry, index) {
  return '<article class="addr' + (entry.isDefault ? " is-default" : "") + '">' +
    '<div class="addr-head">' +
      '<span class="addr-label">' +
        '<svg class="ic" aria-hidden="true"><use href="assets/img/icons.svg#pin"></use></svg>' +
        escapeHtml(addressTitle(entry, index)) +
      '</span>' +
      (entry.isDefault ? '<span class="addr-tag">الافتراضي</span>' : "") +
    '</div>' +
    '<p class="addr-text">' + escapeHtml(entry.text) + '</p>' +
    '<div class="addr-acts">' +
      (entry.isDefault
        ? ""
        : '<button class="link-btn" type="button" data-default="' + entry.slot + '">اجعله الافتراضي</button>') +
      '<button class="link-btn" type="button" data-edit="' + entry.slot + '">تعديل</button>' +
      '<button class="link-btn is-bad" type="button" data-del="' + entry.slot + '">حذف</button>' +
    '</div>' +
    '</article>';
}

function draw() {
  $("pName").value = profile?.name || "";
  $("pPhone").value = profile?.phone ? prettyPhone(profile.phone) : "";

  const list = addressList(profile);
  $("addrCount").textContent = "(" + list.length + " من " + ADDRESS_SLOTS.length + ")";

  addrList.innerHTML = list.length
    ? list.map(addressCardHtml).join("")
    : '<p class="addr-empty">لا عنوان محفوظاً بعد. أضف عنواناً ليُعبَّأ تلقائياً عند الطلب.</p>';

  // لا تُتاح الإضافة بعد امتلاء الخانات الثلاث
  $("addAddrBtn").hidden = !freeSlot(profile);
}

/* ============================================================
   الاسم
   ============================================================ */

$("saveNameBtn").addEventListener("click", async () => {
  const name = $("pName").value.trim();
  $("nameErr").textContent = "";

  if (name.length < 2) {
    $("nameErr").textContent = "يُرجى كتابة الاسم.";
    return;
  }

  const btn = $("saveNameBtn");
  btn.disabled = true;
  btn.textContent = "يُرجى الانتظار...";

  await persist({ name }, "حُفظت بياناتك.");
  menu.update(currentUser, profile);

  btn.disabled = false;
  btn.textContent = "حفظ البيانات";
});

/* ============================================================
   العناوين — إضافة وتعديل
   ============================================================ */

function openAddrDialog(slot) {
  editingSlot = slot;
  const existing = slot ? profile?.addresses?.[slot] : null;

  $("addrTitle").textContent = existing ? "تعديل العنوان" : "عنوان جديد";
  $("addrLabel").value = existing?.label || "";
  $("addrText").value = existing?.text || "";
  $("addrErr").textContent = "";

  addrDialog.showModal();
}

$("addAddrBtn").addEventListener("click", () => openAddrDialog(""));
$("addrCancelBtn").addEventListener("click", () => addrDialog.close());

addrDialog.addEventListener("click", (e) => {
  if (e.target === addrDialog) addrDialog.close();
});

$("addrSaveBtn").addEventListener("click", async () => {
  const text = $("addrText").value.trim();
  const label = $("addrLabel").value.trim();
  $("addrErr").textContent = "";

  if (text.length < MIN_ADDRESS) {
    $("addrErr").textContent = "يُرجى كتابة عنوان واضح ليتسنّى لنا التوصيل.";
    return;
  }

  const slot = editingSlot || freeSlot(profile);
  if (!slot) {
    $("addrErr").textContent = "لا يمكن حفظ أكثر من ثلاثة عناوين.";
    return;
  }

  const addresses = { ...(profile.addresses || {}), [slot]: { label, text } };
  const patch = { addresses };

  // أول عنوان يُحفظ يصير الافتراضي من تلقائه
  if (!profile.defaultAddress) patch.defaultAddress = slot;

  const btn = $("addrSaveBtn");
  btn.disabled = true;
  btn.textContent = "يُرجى الانتظار...";

  const ok = await persist(patch, editingSlot ? "حُفظ التعديل." : "أُضيف العنوان.");

  btn.disabled = false;
  btn.textContent = "حفظ";

  if (ok) {
    addrDialog.close();
    draw();
  }
});

/* ============================================================
   العناوين — الافتراضي والحذف
   ============================================================ */

addrList.addEventListener("click", async (e) => {
  const makeDefault = e.target.closest("[data-default]");
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-del]");

  if (edit) {
    openAddrDialog(edit.dataset.edit);
    return;
  }

  if (makeDefault) {
    await persist({ defaultAddress: makeDefault.dataset.default }, "تغيّر العنوان الافتراضي.");
    draw();
    return;
  }

  if (del) {
    const slot = del.dataset.del;
    const addresses = { ...(profile.addresses || {}) };
    delete addresses[slot];

    const patch = { addresses };
    // حُذف الافتراضي، فيُنقَل إلى أول عنوان باقٍ
    if (profile.defaultAddress === slot) {
      const left = ADDRESS_SLOTS.find((s) => addresses[s]?.text);
      patch.defaultAddress = left || "";
    }

    await persist(patch, "حُذف العنوان.");
    draw();
  }
});

/* ============================================================
   حالة الحساب
   ============================================================ */

onUser(async (user) => {
  currentUser = user;
  pageLoading.hidden = true;

  if (!user) {
    profile = null;
    menu.update(null, null);
    gateCard.hidden = false;
    profileBody.hidden = true;
    return;
  }

  profile = (await loadProfile(user.uid).catch(() => null)) || {};
  menu.update(user, profile);

  gateCard.hidden = true;
  profileBody.hidden = false;
  draw();
});
