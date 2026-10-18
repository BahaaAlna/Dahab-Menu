/* ============================================================
   📡  تحميل المنيو — مصدر واحد لصفحة المنيو وصفحة الطلب

   المسار الأساسي: وثيقة واحدة مجمّعة (menu_public/current).
   قراءة واحدة بدل ٨٨، وهي يلي بتخلينا بالخطة المجانية.

   إذا الوثيقة مفقودة أو ممنوعة (قواعد Firestore لسا ما
   انرفعت)، منرجع تلقائياً للمجموعات الأصلية فما بيوقف شي —
   بس بيصير أبطأ وأغلى، فهاد مسار طوارئ مو مسار دائم.
   ============================================================ */

import { db, doc, collection, onSnapshot, query, orderBy } from "./firebase.js";
import { COLLECTIONS, PUBLIC_MENU } from "./config.js";

/**
 * بيراقب المنيو ويرجّع التحديثات مباشرة.
 * @param {(sections, items) => void} onData
 * @param {(err) => void} onError  بينادى بس إذا فشل كل شي
 */
export function subscribeMenu(onData, onError) {
  let fellBack = false;

  onSnapshot(
    doc(db, PUBLIC_MENU.collection, PUBLIC_MENU.doc),
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      if (data && Array.isArray(data.sections) && Array.isArray(data.items)) {
        onData(data.sections, data.items);
      } else {
        useFallback();
      }
    },
    (err) => {
      console.error("menu_public error:", err);
      useFallback();
    }
  );

  function useFallback() {
    if (fellBack) return;
    fellBack = true;
    console.warn("menu_public غير متوفرة — رجعنا للمجموعات الأصلية.");

    let sections = [];
    let items = [];
    let sectionsLoaded = false;
    let itemsLoaded = false;

    const redraw = () => {
      if (sectionsLoaded && itemsLoaded) onData(sections, items);
    };

    onSnapshot(
      query(collection(db, COLLECTIONS.sections), orderBy("order")),
      (snap) => {
        sections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        sectionsLoaded = true;
        redraw();
      },
      (err) => {
        console.error("sections error:", err);
        onError?.(err);
      }
    );

    onSnapshot(
      collection(db, COLLECTIONS.items),
      (snap) => {
        items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        itemsLoaded = true;
        redraw();
      },
      (err) => {
        console.error("items error:", err);
        onError?.(err);
      }
    );
  }
}
