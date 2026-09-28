/* ============================================================
   🌱  رفع بيانات المنيو الأولية إلى Firestore — يُستخدم مرة واحدة
   ============================================================ */

import {
  db, collection, doc, getDocs, writeBatch,
} from "../assets/js/firebase.js";
import { COLLECTIONS } from "../assets/js/config.js";
import { SECTIONS, ITEMS } from "./seed-data.js";

/** أقصى عدد عمليات في دفعة Firestore الواحدة هو 500 */
const BATCH_SIZE = 400;

const logEl = document.getElementById("log");
const uploadBtn = document.getElementById("uploadBtn");
const clearBtn = document.getElementById("clearBtn");

document.getElementById("secCount").textContent = SECTIONS.length;
document.getElementById("itemCount").textContent = ITEMS.length;

function log(msg, cls = "") {
  const line = document.createElement("div");
  line.className = cls;
  line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

/* ---------- الرفع ---------- */

uploadBtn.addEventListener("click", async () => {
  uploadBtn.disabled = true;
  log("🚀 Starting upload...", "info");

  try {
    // 1. الأقسام
    log(`Uploading ${SECTIONS.length} sections...`, "info");
    const secBatch = writeBatch(db);
    for (const sec of SECTIONS) {
      secBatch.set(doc(db, COLLECTIONS.sections, sec.id), sec);
    }
    await secBatch.commit();
    log(`✓ ${SECTIONS.length} sections uploaded`, "ok");

    // 2. الأصناف (على دفعات)
    log(`Uploading ${ITEMS.length} items...`, "info");
    for (let i = 0; i < ITEMS.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      ITEMS.slice(i, i + BATCH_SIZE).forEach((item, idx) => {
        const id = `${item.sectionId}_${i + idx}`;
        batch.set(doc(db, COLLECTIONS.items, id), item);
      });
      await batch.commit();
      log(`✓ Batch uploaded (${Math.min(i + BATCH_SIZE, ITEMS.length)}/${ITEMS.length})`, "ok");
    }

    log("🎉 All done! Menu is now live in Firebase.", "ok");
    log("Next: open /index.html to see the menu, or /admin.html to manage it.", "info");
  } catch (e) {
    log("❌ Error: " + e.message, "err");
    console.error(e);
  }

  uploadBtn.disabled = false;
});

/* ---------- الحذف ---------- */

clearBtn.addEventListener("click", async () => {
  if (!confirm("هل أنت متأكد؟ سيتم حذف كل بيانات المنيو من Firebase!")) return;

  clearBtn.disabled = true;
  log("🗑️ Clearing all data...", "info");

  try {
    for (const name of [COLLECTIONS.sections, COLLECTIONS.items]) {
      const snap = await getDocs(collection(db, name));
      const batch = writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      log(`✓ Cleared ${snap.size} docs from ${name}`, "ok");
    }
    log("✅ All data cleared.", "ok");
  } catch (e) {
    log("❌ " + e.message, "err");
  }

  clearBtn.disabled = false;
});

log("Ready. Click the upload button to start.", "info");
