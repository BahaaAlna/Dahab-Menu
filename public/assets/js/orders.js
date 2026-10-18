/* ============================================================
   📜  صفحة «طلباتي»

   أول سؤال يسأله الزبون بعد الإرسال: «أين صار طلبي؟». تُراقَب
   الحالة بـ onSnapshot، فيتغيّر ما يراه فور تغييرها من لوحة
   الإدارة دون تحديث الصفحة.

   القواعد في firestore.rules تسمح له بقراءة طلباته وحدها
   (resource.data.uid == request.auth.uid)، فلا سبيل إلى طلبات
   غيره مهما عبث بالكود.
   ============================================================ */

import {
  db, collection, query, where, orderBy, limit, onSnapshot,
} from "./firebase.js";
import { CURRENCY, ORDER_STATUS } from "./config.js";
import { onUser, loadProfile } from "./auth.js";
import { mountAccountMenu } from "./account-menu.js";
import { LINK_SUFFIX } from "./dev-mode.js";
import { escapeHtml } from "./utils.js";

const $ = (id) => document.getElementById(id);

const pageLoading = $("pageLoading");
const gateCard = $("gateCard");
const ordList = $("ordList");

let currentUser = null;
let stopOrders = null;

/** آخر عشرين طلباً تكفي وزيادة — لا يعود الزبون أبعد من ذلك */
const ORDERS_SHOWN = 20;

const menu = mountAccountMenu({
  onSignIn: () => location.assign("order.html" + LINK_SUFFIX),
});

$("backLink").href = "order.html" + LINK_SUFFIX;
$("gateLink").href = "order.html" + LINK_SUFFIX;

/* ============================================================
   التاريخ والحالة
   ============================================================ */

function orderTimeMs(o) {
  // createdAt يأتي فارغاً للحظة قبل أن يختم الخادم الوقت
  return o.createdAt?.toMillis ? o.createdAt.toMillis() : Date.now();
}

const AR_DAY = new Intl.DateTimeFormat("ar-SY", { day: "numeric", month: "long" });
const AR_TIME = new Intl.DateTimeFormat("ar-SY", { hour: "numeric", minute: "2-digit" });

/** «اليوم ٨:٣٠ م» أو «أمس ...» أو «١٨ تشرين الأول ...» */
function whenLabel(ms) {
  const midnight = (d) => new Date(d).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(Date.now()) - midnight(ms)) / 86400000);
  const time = AR_TIME.format(new Date(ms));

  if (days === 0) return "اليوم " + time;
  if (days === 1) return "أمس " + time;
  return AR_DAY.format(new Date(ms)) + " — " + time;
}

/** حالة غير معروفة تُعرَض كما هي بدل إخفاء الطلب */
function statusOf(raw) {
  return ORDER_STATUS[raw] || { label: String(raw || "—"), tone: "wait" };
}

/* ============================================================
   الرسم
   ============================================================ */

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

  const address = o.customer?.address;

  return '<article class="ord">' +
    '<div class="ord-head">' +
      '<span class="ord-when">' + escapeHtml(whenLabel(orderTimeMs(o))) + '</span>' +
      '<span class="ord-state is-' + state.tone + '">' + escapeHtml(state.label) + '</span>' +
    '</div>' +
    '<div class="ord-lines">' + linesHtml + '</div>' +
    (address ? '<p class="ord-note">العنوان: ' + escapeHtml(address) + '</p>' : "") +
    (o.note ? '<p class="ord-note">ملاحظتك: ' + escapeHtml(o.note) + '</p>' : "") +
    '<div class="ord-foot">المجموع: <strong>' +
      (Number(o.total) || 0) + '</strong> ' + CURRENCY +
    '</div>' +
    '</article>';
}

function drawOrders(list) {
  ordList.hidden = false;

  if (list.length === 0) {
    ordList.innerHTML =
      '<p class="addr-empty">لم تقم بأي طلب بعد.<br>' +
      'اختر ما تريده من القائمة وأرسله إلينا.</p>';
    return;
  }
  ordList.innerHTML = list.map(orderCardHtml).join("");
}

function ordersError(err) {
  console.error("my orders error:", err);
  ordList.hidden = false;
  ordList.innerHTML =
    '<p class="ord-err">تعذّر جلب طلباتك حالياً.<br>' +
    'يُرجى التحقق من الإنترنت وإعادة المحاولة.</p>';
}

function snapToList(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ============================================================
   المراقبة

   المسار الأساسي يحتاج فهرساً مركّباً (uid + createdAt) موجوداً في
   firestore.indexes.json. وإن لم يُرفَع الفهرس بعد ردّت Firestore
   بـ failed-precondition، فتُجلَب الطلبات دون ترتيب وتُرتَّب هنا.
   النتيجة ذاتها تماماً لكن دون فهرس.
   ============================================================ */

function stopWatching() {
  if (stopOrders) stopOrders();
  stopOrders = null;
}

function watchMyOrders() {
  stopWatching();

  const mine = where("uid", "==", currentUser.uid);
  const ref = collection(db, "orders");

  stopOrders = onSnapshot(
    query(ref, mine, orderBy("createdAt", "desc"), limit(ORDERS_SHOWN)),
    (snap) => drawOrders(snapToList(snap)),
    (err) => {
      if (err?.code !== "failed-precondition") return ordersError(err);

      console.warn("فهرس الطلبات لم يُرفَع بعد — جرى الترتيب محلياً.");
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

/* ============================================================
   حالة الحساب
   ============================================================ */

onUser(async (user) => {
  currentUser = user;
  pageLoading.hidden = true;

  if (!user) {
    stopWatching();
    menu.update(null, null);
    gateCard.hidden = false;
    ordList.hidden = true;
    return;
  }

  menu.update(user, await loadProfile(user.uid).catch(() => null));

  gateCard.hidden = true;
  watchMyOrders();
});

// أوقف المراقبة عند مغادرة الصفحة، فكل تحديث يُحتسب قراءة
window.addEventListener("pagehide", stopWatching);
