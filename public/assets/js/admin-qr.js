/* ============================================================
   🔳  رموز الطاولات

   لكل طاولة رمز يحمل رابطها:  …/table?t=3
   يُطبَع ويُلصَق عليها، فيفتح للزبون صفحة الطلب ويُعرِّف المطبخ
   برقم طاولته دون أن يكتبه أحد بيده.

   الرموز تُولَّد في المتصفح لا على خادم: لا رحلة شبكة، ولا خدمة
   خارجية تتعطّل يوماً فتتعطّل معها طاولات المطعم. والمكتبة
   المستعملة (qrcode-generator) بلا اعتماديات وتُخرج SVG، وهو
   ما يُطبَع بأي حجم دون أن يتشوّش.

   أما أصل الرابط فيُؤخذ من العنوان الحالي: الرمز المولَّد على
   جهاز التطوير يشير إلى جهاز التطوير، والمولَّد على الموقع
   المنشور يشير إليه. فلا يُطبَع رمز يحمل localhost.
   ============================================================ */

import { escapeHtml } from "./utils.js";

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

/** رابط الطاولة بأصل الموقع الحالي */
function tableUrl(n) {
  return new URL("table?t=" + n, location.href).href;
}

export function mountQr() {
  const grid = $("qrGrid");
  const errEl = $("qrErr");
  const fromEl = $("qrFrom");
  const toEl = $("qrTo");

  async function generate() {
    errEl.textContent = "";

    const from = Number(fromEl.value);
    const to = Number(toEl.value);

    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      errEl.textContent = "يُرجى كتابة رقمين صحيحين.";
      return;
    }
    if (from < 1 || to > MAX_TABLE) {
      errEl.textContent = "أرقام الطاولات بين ١ و " + arabicNum(MAX_TABLE) + ".";
      return;
    }
    if (to < from) {
      errEl.textContent = "رقم البداية أكبر من رقم النهاية.";
      return;
    }

    grid.innerHTML = '<p class="pane-note">جارٍ التوليد...</p>';

    let qrcode;
    try {
      qrcode = await loadQrcode();
    } catch (err) {
      console.error("qr library error:", err);
      errEl.textContent = "تعذّر تحميل مولّد الرموز. يُرجى التحقق من الاتصال بالإنترنت.";
      grid.innerHTML = "";
      return;
    }

    const cards = [];
    for (let n = from; n <= to; n++) {
      const url = tableUrl(n);

      // المستوى M يحتمل تلف ربع الرمز تقريباً، وهو المناسب لرمز
      // يعيش على طاولة مطعم: تصيبه البقع ويُخدَش
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();

      cards.push(
        '<figure class="qr-card">' +
          '<div class="qr-img">' + qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true }) + "</div>" +
          '<figcaption class="qr-cap">' +
            "<b>طاولة " + arabicNum(n) + "</b>" +
            '<small dir="ltr">' + escapeHtml(url) + "</small>" +
          "</figcaption>" +
        "</figure>"
      );
    }

    grid.innerHTML = cards.join("");
  }

  $("qrMakeBtn").addEventListener("click", generate);

  /* الطباعة تطبع الرموز وحدها: ورقة فيها شريط جانبي وأزرار لا
     تصلح للصق على طاولة. التفاصيل في admin.css تحت @media print. */
  $("qrPrintBtn").addEventListener("click", () => {
    if (!grid.children.length) {
      errEl.textContent = "لا توجد رموز للطباعة. اضغط «توليد» أولاً.";
      return;
    }
    window.print();
  });
}
