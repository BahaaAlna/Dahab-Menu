/* ============================================================
     محرّك صفحة الطلب — مشترك بين الدليفري والطاولة

   الصفحتان واحدة في كل ما يراه الزبون تقريباً: القائمة نفسها،
   وأزرار الكمية نفسها، والسلة نفسها، وزرّ السلة العائم، ونافذة
   التأكيد بسطورها القابلة للتعديل. والفرق محصور في موضعين:

     • أيّ مفتاح ميزة يحرس الصفحة (delivery أو table).
     • ما يُضاف إلى الطلب قبل إرساله: الدليفري يحتاج اسماً ورقماً
       وعنواناً، والطاولة يكفيها رقم الطاولة.

   فبقي المشترك هنا، ولكل صفحة ملف صغير يمرّر هذين الفرقين.
   ولولا ذلك لتكرّرت أربعمئة سطر مرّتين، ولوجب إصلاح كل عيب
   في موضعين — وهذا أصل أن يُصلَح في أحدهما ويُنسى الآخر.

   تتوقّع هذه الوحدة أن تحمل الصفحة المعرّفات نفسها:
   orderMenu و cartBtn و cartBadge و cartNote و coLines و
   coTotal و coNote و coErr و confirmBtn و checkoutDialog
   و doneDialog. وما عدا ذلك فللصفحة.
   ============================================================ */

import { db, collection, addDoc, serverTimestamp } from "./firebase.js";
import { CURRENCY } from "./config.js";
import { subscribeMenu } from "./menu-data.js";
import { loadCart, saveCart } from "./cart-store.js";
import { byOrder, groupBySection, escapeHtml } from "./utils.js";
import { readFeatures } from "./features.js";

const $ = (id) => document.getElementById(id);

/** أرقام عربية للأعداد: عدّاد الزرّ وكميّات الصنف في الموضعين.
 *  أما الأسعار فتبقى بالأرقام اللاتينية كما هي في الموقع كلّه،
 *  والقاعدة: ما يُعَدّ بالعربية وما يُدفَع باللاتينية. */
export function arabicNum(n) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
}

/**
 * يُشغّل صفحة الطلب كاملةً.
 *
 * @param {object}   opts
 * @param {string}   opts.feature   مفتاح الميزة الذي يحرس الصفحة
 * @param {Function} opts.buildOrder
 *        تُنادى عند الضغط على «تأكيد وإرسال» ومعها ‎{ items, total }‎.
 *        تُرجع ‎{ error }‎ فتُعرَض الرسالة ويتوقّف الإرسال،
 *        أو ‎{ order }‎ فيُرسَل بعد أن تُضاف إليه الحالة والوقت.
 * @returns {Promise<boolean>} false إن كانت الميزة موقوفة
 */
export async function mountOrderPage({ feature, buildOrder }) {
  /* ---------- بوابة الميزة ----------
     إخفاء الخيار من صفحة الترحيب لا يكفي، لأن الرابط المباشر
     يبقى مفتوحاً. لذلك يُتحقَّق هنا أيضاً قبل رسم أي شيء، ويُعاد
     الزائر إلى صفحة الترحيب إن كانت الميزة موقوفة. */
  if (!(await readFeatures())[feature]) {
    location.replace("./");
    return false;
  }

  const orderMenu = $("orderMenu");
  const coErr = $("coErr");
  const checkoutDialog = $("checkoutDialog");
  const doneDialog = $("doneDialog");

  /** السلة: معرّف الصنف → الكمية.
   *  تُستعاد من تخزين المتصفح، فلا يُفرغها تحديث الصفحة.
   *  والمحفوظ معرّفات وكميات فقط، أما الأسعار والأسماء فتأتي من
   *  Firestore عند وصول القائمة، وتُطابَق في draw(). */
  const cart = loadCart(feature);
  /** كل الأصناف المعروضة: معرّف → بيانات الصنف */
  const itemsById = new Map();

  /* ============================================================
     أدوات صغيرة
     ============================================================ */

  /** صيغة جمع عربية صحيحة: «صنف واحد / صنفان / ٣ أصناف / ١٥ صنفاً» */
  function countLabel(n) {
    if (n === 1) return "صنف واحد";
    if (n === 2) return "صنفان";
    if (n <= 10) return arabicNum(n) + " أصناف";
    return arabicNum(n) + " صنفاً";
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
     زرّ السلة العائم

     هو وحده باب إتمام الطلب، فيحمل عدد الأصناف ويفتح نافذة التأكيد.
     ============================================================ */

  const cartBtn = $("cartBtn");
  const cartBadge = $("cartBadge");

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
      '<b class="qty-num">' + arabicNum(qty) + '</b>' +
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
      saveCart(feature, cart);
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

  /** إعادة رسم سطر واحد — أرخص من إعادة رسم القائمة كلها */
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

    // السلة الفارغة لا زرّ لها: الزرّ يفتح نافذة التأكيد، ونافذة
    // تأكيد بلا أصناف عبث. وأول صنف يُضاف يُظهره.
    cartBtn.hidden = count === 0;
    cartBadge.textContent = arabicNum(count);
    cartBtn.setAttribute(
      "aria-label",
      "سلة الطلب: " + countLabel(count) + "، المجموع " + cartTotal() + " " + CURRENCY
    );
  }

  cartBtn.addEventListener("click", openCheckout);

  orderMenu.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    const dec = e.target.closest("[data-dec]");
    if (!add && !dec) return;

    const id = add ? add.dataset.add : dec.dataset.dec;
    const qty = cart.get(id) || 0;

    /* هنا ينزل النقصان إلى الصفر فيُحذف الصنف، بخلاف نافذة
       التأكيد: لا زرّ حذف في هذه القائمة، فلو توقّف النقصان عند
       واحد لتعذّر إخراج الصنف من السلة أصلاً. */
    if (add) cart.set(id, Math.min(qty + 1, 99));
    else if (qty <= 1) cart.delete(id);
    else cart.set(id, qty - 1);

    saveCart(feature, cart);
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
      return { id, name: it.name, price: Number(it.price) || 0, qty };
    });
  }

  /* ---------- سطور الطلب داخل النافذة ----------
     تُعدَّل من هنا مباشرة: زيادة ونقصان وحذف. فمن فتح النافذة ثم
     بدا له أن يُنقص صنفاً لا يُطالَب بإغلاقها والبحث عن الصنف في
     القائمة خلفها. والتعديل يسري على السلة نفسها، فتُحدَّث معه
     القائمة خلف النافذة وعدّاد الزرّ والمجموع. */

  const coLines = $("coLines");

  /** الصنف الذي ضُغط زرّ حذفه وينتظر جواب «نعم» أو «تراجع».
   *  واحد لا أكثر: سؤالان معاً يربكان. */
  let pendingDelete = null;

  /* سؤال التأكيد يحلّ محلّ السطر نفسه لا فوقه، فلا نافذة ثانية
     فوق نافذة التأكيد، ويرى الزبون أيّ صنف يُسأل عنه في مكانه. */
  function askHtml(l) {
    const id = escapeHtml(l.id);
    return '<div class="co-line is-asking">' +
      '<span class="co-line-name">حذف «' + escapeHtml(l.name) + '» من الطلب؟</span>' +
      '<span class="co-ask">' +
        '<button class="btn-ask is-yes" type="button" data-co-yes="' + id + '">نعم، احذف</button>' +
        '<button class="btn-ask" type="button" data-co-no="' + id + '">تراجع</button>' +
      '</span>' +
    '</div>';
  }

  function lineHtml(l) {
    if (l.id === pendingDelete) return askHtml(l);

    const name = escapeHtml(l.name);
    const id = escapeHtml(l.id);

    /* الكمية واحد: زرّ النقصان معطَّل. فلو حذف عندها لاختفى الصنف
       بضغطة متتابعة لم يقصد صاحبها آخرها، والحذف قرار يُسأل عنه. */
    const atOne = l.qty === 1;

    return '<div class="co-line">' +
      '<span class="co-line-name">' + name + '</span>' +
      '<span class="qty co-line-qty">' +
        '<button class="qty-btn" type="button" data-co-dec="' + id + '"' +
          (atOne ? ' disabled title="لحذف الصنف استعمل زرّ ×"' : '') +
          ' aria-label="إنقاص كمية ' + name + '">−</button>' +
        '<b class="qty-num">' + arabicNum(l.qty) + '</b>' +
        '<button class="qty-btn" type="button" data-co-add="' + id +
          '" aria-label="زيادة كمية ' + name + '">+</button>' +
      '</span>' +
      '<span class="co-line-sum">' + (l.price * l.qty) + ' ' + CURRENCY + '</span>' +
      '<button class="co-line-x" type="button" data-co-del="' + id +
        '" aria-label="حذف ' + name + ' من الطلب">×</button>' +
    '</div>';
  }

  function drawCheckoutLines() {
    coLines.innerHTML = cartLines().map(lineHtml).join("");
    $("coTotal").textContent = cartTotal();

    // الجواب الآمن هو المُركَّز، فلا يحذف ضغطُ مفتاح الإدخال شيئاً
    coLines.querySelector("[data-co-no]")?.focus();
  }

  coLines.addEventListener("click", (e) => {
    const btn = e.target.closest(
      "[data-co-add], [data-co-dec], [data-co-del], [data-co-yes], [data-co-no]"
    );
    if (!btn || btn.disabled) return;

    const { coAdd, coDec, coDel, coYes, coNo } = btn.dataset;
    const id = coAdd || coDec || coDel || coYes || coNo;

    // فتح السؤال وإغلاقه لا يمسّان السلة
    if (coDel || coNo) {
      pendingDelete = coDel ? id : null;
      drawCheckoutLines();
      return;
    }

    const qty = cart.get(id) || 0;

    if (coYes) cart.delete(id);
    else if (coAdd) cart.set(id, Math.min(qty + 1, 99));
    // النقصان لا يحذف أبداً: الحذف طريقه زرّ × وسؤاله وحدهما
    else if (qty > 1) cart.set(id, qty - 1);

    pendingDelete = null;
    saveCart(feature, cart);
    updateRow(id);          // القائمة خلف النافذة وعدّاد الزرّ
    drawCheckoutLines();

    // أُفرغت السلة، فلم يبقَ في النافذة ما يُؤكَّد
    if (cart.size === 0) checkoutDialog.close();
  });

  function openCheckout() {
    coErr.textContent = "";
    pendingDelete = null;   // سؤال مُعلَّق من فتحة سابقة لا معنى له
    drawCheckoutLines();
    checkoutDialog.showModal();
  }

  $("cancelBtn").addEventListener("click", () => checkoutDialog.close());

  checkoutDialog.addEventListener("click", (e) => {
    if (e.target === checkoutDialog) checkoutDialog.close();
  });

  $("confirmBtn").addEventListener("click", async () => {
    coErr.textContent = "";

    const lines = cartLines();
    if (lines.length === 0) {
      coErr.textContent = "السلة فارغة.";
      return;
    }

    // ما يخصّ كل صفحة: الدليفري يتحقّق من الاسم والرقم والعنوان،
    // والطاولة من رقم الطاولة. والرسالة تأتي من هناك لا من هنا.
    const built = buildOrder({
      // المعرّف أداة الواجهة لا حاجة للمطبخ به، فيبقى شكل الطلب
      // المحفوظ كما هو: اسم وسعر وكمية
      items: lines.map(({ name, price, qty }) => ({ name, price, qty })),
      total: cartTotal(),
    });

    if (built.error) {
      coErr.textContent = built.error;
      return;
    }

    const note = $("coNote").value.trim();
    const order = {
      ...built.order,
      status: "new",
      createdAt: serverTimestamp(),
    };
    if (note) order.note = note;

    const btn = $("confirmBtn");
    setBusy(btn, true);

    try {
      await addDoc(collection(db, "orders"), order);

      // أُفرغت السلة بالكامل، فالرسم الكامل هنا في محلّه
      cart.clear();
      saveCart(feature, cart);
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
          ? (feature === "table"
              ? "هذا الرمز لم يعد صالحاً. يُرجى مسح الرمز الحالي على طاولتك أو مناداة النادل."
              : "تعذّر استقبال الطلب حالياً. يُرجى الاتصال بنا وسنسجّله لك.")
          : "لم يصل الطلب. يُرجى التحقق من الإنترنت وإعادة المحاولة.";
    } finally {
      setBusy(btn, false, "تأكيد وإرسال");
    }
  });

  $("doneBtn").addEventListener("click", () => doneDialog.close());

  return true;
}
