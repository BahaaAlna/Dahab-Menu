/* ============================================================
     رموز الطاولات

   لكل طاولة رمز يحمل رابطها ومفتاحها:  …/table?t=3&k=KEY
   يُطبَع ويُلصَق عليها، فيفتح للزبون صفحة الطلب ويُعرِّف المطبخ
   برقم طاولته دون أن يكتبه أحد بيده.

   المفتاح محفوظ في Firestore (مجموعة tables) وتتحقّق منه قواعد
   الحماية عند كل طلب. فإعادة التوليد تُبدّله، ويتعطّل الرمز
   المطبوع القديم فوراً. وتُعرَض الرموز المولَّدة كلها في قائمة.

   الرموز تُرسَم في المتصفح لا على خادم: لا رحلة شبكة، ولا خدمة
   خارجية تتعطّل يوماً فتتعطّل معها طاولات المطعم. والمكتبة
   المستعملة (qrcode-generator) بلا اعتماديات وتُخرج SVG، وهو
   ما يُطبَع بأي حجم دون أن يتشوّش.

   أما أصل الرابط فيُؤخذ من العنوان الحالي: الرمز المولَّد على
   جهاز التطوير يشير إلى جهاز التطوير، والمولَّد على الموقع
   المنشور يشير إليه. فلا يُطبَع رمز يحمل localhost.
   ============================================================ */

import {
  db, collection, doc, setDoc, updateDoc,
  query, orderBy, onSnapshot, serverTimestamp,
} from "./firebase.js";

const $ = (id) => document.getElementById(id);

const QR_LIB = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm";

/** أقصى رقم طاولة تقبله قواعد Firestore */
const MAX_TABLE = 200;

/** المكتبة تُحمَّل عند أول توليد لا عند فتح اللوحة: أكثر الزيارات
 *  لا تمرّ على هذا القسم أصلاً، فلا داعي لتحميلها معها. */
let qrcodePromise = null;

function loadQrcode() {
  qrcodePromise ||= import(QR_LIB).then((m) => m.default);
  return qrcodePromise;
}

function arabicNum(n) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
}

/** مفتاح عشوائي من 20 خانة. crypto لا Math.random: المفتاح سرّ
 *  يحمي الطاولة، فلا يُتوقَّع. */
function newToken() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

/** رابط الطاولة بأصل الموقع الحالي */
function tableUrl(n, token) {
  return new URL("table?t=" + n + "&k=" + token, location.href).href;
}

export function mountQr() {
  const errEl = $("qrErr");
  const grid = $("qrGrid");
  const dlg = $("qrDialog");
  // خارج .container: طباعة الرمز وحده تُخفي الحاوية كلها
  document.body.appendChild(dlg);

  let records = [];   // [{ n, token }] مرتّبة برقم الطاولة
  let current = null; // { n, url, svg }

  async function makeSvg(url, cellSize) {
    const qrcode = await loadQrcode();
    // المستوى M يحتمل تلف ربع الرمز تقريباً، وهو المناسب لرمز
    // يعيش على طاولة مطعم: تصيبه البقع ويُخدَش
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize, margin: 2, scalable: true });
  }

  /* ---------- قائمة الرموز ---------- */

  async function drawGrid() {
    if (!records.length) {
      grid.innerHTML =
        '<p class="pane-note">لم يُولَّد أي رمز بعد. اكتب رقم طاولة واضغط «توليد الرمز».</p>';
      return;
    }

    let cards;
    try {
      cards = await Promise.all(records.map(async (r) => {
        const svg = await makeSvg(tableUrl(r.n, r.token), 4);
        return '<figure class="qr-card" data-n="' + r.n + '" tabindex="0" role="button" ' +
            'aria-label="عرض رمز الطاولة ' + r.n + '">' +
          '<div class="qr-img">' + svg + "</div>" +
          '<figcaption class="qr-cap"><b>طاولة ' + arabicNum(r.n) + "</b></figcaption>" +
          '<button class="btn ghost small qr-regen" type="button" data-regen="' + r.n + '">' +
            "إعادة توليد</button>" +
        "</figure>";
      }));
    } catch (err) {
      console.error("qr library error:", err);
      errEl.textContent = "تعذّر تحميل مولّد الرموز. يُرجى التحقق من الاتصال بالإنترنت.";
      return;
    }
    grid.innerHTML = cards.join("");
  }

  onSnapshot(
    query(collection(db, "tables"), orderBy("n")),
    (snap) => {
      records = snap.docs.map((d) => ({ n: d.data().n, token: d.data().token }));
      drawGrid();
      // نافذة مفتوحة على رمز أُعيد توليده: تُحدَّث لتعرض الجديد
      if (dlg.open && current) {
        const r = records.find((x) => x.n === current.n);
        if (r) showOne(r.n); else dlg.close();
      }
    },
    (err) => {
      console.error("tables error:", err);
      // الرمز يُعرَض مع الرسالة: permission-denied غير unavailable،
      // والعلاج مختلف في الحالتين
      errEl.textContent =
        "تعذّر تحميل الرموز (" + (err?.code || "unknown") + "). " +
        (err?.code === "permission-denied"
          ? "تأكّد من نشر قواعد Firestore ومن أن حسابك مذكور في isStaff()."
          : "تحقّق من الاتصال بالإنترنت وأعد تحميل الصفحة.");
    }
  );

  /* ---------- توليد ---------- */

  async function generate() {
    errEl.textContent = "";
    const n = Number($("qrOne").value);

    if (!Number.isInteger(n) || n < 1 || n > MAX_TABLE) {
      errEl.textContent = "أرقام الطاولات بين ١ و " + arabicNum(MAX_TABLE) + ".";
      return;
    }
    if (records.some((r) => r.n === n)) {
      errEl.textContent =
        "للطاولة " + arabicNum(n) + " رمز مولَّد مسبقاً. استعمل «إعادة توليد» على بطاقتها.";
      return;
    }

    const btn = $("qrOneBtn");
    btn.disabled = true;
    try {
      await setDoc(doc(db, "tables", String(n)), {
        n, token: newToken(), createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("generate error:", err);
      errEl.textContent = "تعذّر توليد الرمز. يُرجى إعادة المحاولة.";
    } finally {
      btn.disabled = false;
    }
  }

  /** إعادة التوليد تُعطّل الرمز المطبوع، فتُسأل مرتين */
  async function regenerate(n) {
    errEl.textContent = "";

    if (!confirm("إعادة توليد رمز الطاولة " + arabicNum(n) +
        "؟\nسيتوقف الرمز القديم عن العمل نهائياً.")) return;
    if (!confirm("تأكيد أخير: كل رمز مطبوع لهذه الطاولة سيتعطّل، ولن يستطيع الزبائن " +
        "الطلب به حتى تطبع الرمز الجديد وتلصقه.\n\nهل أنت متأكد؟")) return;

    try {
      await updateDoc(doc(db, "tables", String(n)), {
        token: newToken(), regeneratedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("regenerate error:", err);
      errEl.textContent = "تعذّر إعادة التوليد. يُرجى إعادة المحاولة.";
    }
  }

  $("qrOneBtn").addEventListener("click", generate);
  $("qrOne").addEventListener("keydown", (e) => { if (e.key === "Enter") generate(); });

  /* ---------- عرض رمز كبير ---------- */

  async function showOne(n) {
    const r = records.find((x) => x.n === n);
    if (!r) return;

    const url = tableUrl(r.n, r.token);
    let svg;
    try {
      svg = await makeSvg(url, 8);
    } catch (err) {
      console.error("qr library error:", err);
      errEl.textContent = "تعذّر تحميل مولّد الرموز. يُرجى التحقق من الاتصال بالإنترنت.";
      return;
    }

    current = { n, url, svg };
    $("qrBigTitle").textContent = "طاولة " + arabicNum(n);
    $("qrBigImg").innerHTML = svg;
    $("qrBigUrl").textContent = url;
    $("qrBigUrl").href = url;
    if (!dlg.open) dlg.showModal();
  }

  grid.addEventListener("click", (e) => {
    const regen = e.target.closest("[data-regen]");
    if (regen) {
      regenerate(Number(regen.dataset.regen));
      return;
    }
    const card = e.target.closest(".qr-card");
    if (card) showOne(Number(card.dataset.n));
  });

  grid.addEventListener("keydown", (e) => {
    if (e.target.closest("[data-regen]")) return;
    if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".qr-card");
      if (card) {
        e.preventDefault();
        showOne(Number(card.dataset.n));
      }
    }
  });

  /* التنقّل بين الطاولات المولَّدة من داخل النافذة */
  function step(dir) {
    if (!current) return;
    const i = records.findIndex((r) => r.n === current.n);
    const next = records[i + dir];
    if (next) showOne(next.n);
  }
  $("qrPrev").addEventListener("click", () => step(-1));
  $("qrNext").addEventListener("click", () => step(1));
  $("qrRegen").addEventListener("click", () => current && regenerate(current.n));
  $("qrClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  function save(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $("qrSaveSvg").addEventListener("click", () => {
    if (!current) return;
    save(new Blob([current.svg], { type: "image/svg+xml" }), "table-" + current.n + ".svg");
  });

  /* PNG: يُرسَم الـ SVG على لوحة بيضاء بحجم كبير يصلح للطباعة */
  $("qrSavePng").addEventListener("click", () => {
    if (!current) return;
    const { n, svg } = current;
    const img = new Image();
    img.onload = () => {
      const size = 1024;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);
      c.toBlob((b) => b && save(b, "table-" + n + ".png"), "image/png");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });

  $("qrPrintOne").addEventListener("click", () => {
    document.body.classList.add("print-one");
    window.addEventListener("afterprint",
      () => document.body.classList.remove("print-one"), { once: true });
    window.print();
  });
}
