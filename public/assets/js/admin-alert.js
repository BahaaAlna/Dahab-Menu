/* ============================================================
   🔔  تنبيه الطلب الجديد

   اللوحة تبقى مفتوحة على شاشة في المطعم، ولا أحد يقف أمامها
   يراقبها. فالطلب الذي يصل ولا يُسمَع لا يُحضَّر.

   التنبيه طبقتان:
     • صوت — وهو الأهمّ: يُسمَع والشاشة مطفأة أو في تبويب آخر.
     • إشعار من النظام — يُرى حتى لو كان المتصفح خلف نافذة أخرى.

   ولمَ لا يُطلَب الإذن عند فتح اللوحة مباشرة؟ لأن المتصفحات
   ترفض الطلب الذي لا يسبقه فعل من المستخدم، وتعاقب الموقع الذي
   يطلب بلا سياق فتحجب عنه الإذن إلى الأبد. لذلك يُعرض شريط
   صغير يشرح الفائدة، والضغط عليه هو الفعل الذي يُجيز الطلب.

   والصوت كذلك: المتصفح لا يسمح بتشغيله قبل أول نقرة في الصفحة،
   فالنقرة نفسها تُستغَل لفتح سياق الصوت وتهيئته.
   ============================================================ */

const $ = (id) => document.getElementById(id);

/** يُحفظ اختيار الموظف فلا يُسأل في كل زيارة */
const ASKED_KEY = "dahab:alerts-asked";

/* ============================================================
   الصوت

   يُولَّد بـ Web Audio لا بملف: ملف صوت تنزيل إضافي على اتصال
   ضعيف، وقد يُمنع تشغيله. والنغمة هنا بضعة أسطر ولا تُنزَّل.
   ============================================================ */

let audioCtx = null;

/** يُهيَّأ داخل نقرة المستخدم، وإلا بقي معلَّقاً في المتصفحات */
function primeAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {
    audioCtx = null;   // لا صوت في هذا المتصفح، ويبقى الباقي عاملاً
  }
}

/** نغمتان صاعدتان قصيرتان — تُسمَع في ضجيج المطعم ولا تُزعج */
function beep() {
  if (!audioCtx) return;
  // قد يكون معلَّقاً إن عاد التبويب من الخلفية
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

  const now = audioCtx.currentTime;
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.value = freq;

    const at = now + i * 0.18;
    // الصعود والهبوط يمنعان الطقطقة التي تُحدثها البداية الحادّة
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(at);
    osc.stop(at + 0.18);
  }
}

/* ============================================================
   إشعار النظام
   ============================================================ */

function canNotify() {
  return "Notification" in window && Notification.permission === "granted";
}

function notify(order) {
  if (!canNotify()) return;

  const where = order?.type === "table"
    ? "طاولة " + (order.table ?? "؟")
    : "دليفري";

  try {
    const n = new Notification("طلب جديد — " + where, {
      body: (Number(order?.total) || 0) + " ل.س",
      icon: "assets/img/logo.png",
      // طلبان متتاليان يُظهران إشعارين لا إشعاراً يحلّ محلّ الآخر
      tag: "dahab-order-" + (order?.id || Date.now()),
    });
    // النقر على الإشعار يُحضر اللوحة إلى المقدّمة
    n.onclick = () => { window.focus(); n.close(); };
  } catch (err) {
    console.error("notification error:", err);
  }
}

/* ============================================================
   شريط طلب الإذن
   ============================================================ */

function hideBar() {
  $("alertBar").hidden = true;
}

function showBarIfNeeded() {
  const bar = $("alertBar");
  const supported = "Notification" in window;

  // مسموح أصلاً، أو مرفوض نهائياً، أو سبق أن رُفض الشريط نفسه:
  // لا يُعاد السؤال، فالإلحاح لا يُغيّر الجواب
  let asked = false;
  try { asked = localStorage.getItem(ASKED_KEY) === "1"; } catch (_) {}

  if (!supported || Notification.permission !== "default" || asked) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
}

/**
 * يُركّب التنبيه ويُعيد دالة تُنادى عند وصول طلب جديد.
 * @returns {(order:object) => void}
 */
export function mountAlerts() {
  showBarIfNeeded();

  $("alertAllowBtn").addEventListener("click", async () => {
    // النقرة نفسها هي ما يُجيز الصوت وطلب الإذن معاً
    primeAudio();

    try { localStorage.setItem(ASKED_KEY, "1"); } catch (_) {}

    if ("Notification" in window) {
      try {
        await Notification.requestPermission();
      } catch (err) {
        console.error("permission error:", err);
      }
    }

    hideBar();
    // نغمة تجريبية: يسمع الموظف ما سيسمعه عند كل طلب
    beep();
  });

  $("alertLaterBtn").addEventListener("click", () => {
    try { localStorage.setItem(ASKED_KEY, "1"); } catch (_) {}
    hideBar();
  });

  /* أي نقرة في اللوحة تُهيّئ الصوت. فالموظف الذي سمح بالإشعارات
     في زيارة سابقة لا يرى الشريط، ومع ذلك يجب أن يعمل صوته. */
  document.addEventListener("click", primeAudio, { once: true });

  return function announce(order) {
    beep();
    notify(order);
  };
}
