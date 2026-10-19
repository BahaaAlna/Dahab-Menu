/* ============================================================
     تحميل قائمة الطعام — مصدر واحد لصفحة القائمة وصفحة الطلب

   المسار الأساسي وثيقة واحدة مجمّعة (menu_public/current):
   قراءة واحدة بدل ثمانٍ وثمانين، وهي ما يُبقينا ضمن الخطة المجانية.

   وإذا كانت الوثيقة مفقودة أو ممنوعة (لأن قواعد Firestore لم
   تُرفَع بعد)، يُرجَع تلقائياً إلى المجموعات الأصلية فلا يتوقّف شيء،
   غير أن ذلك أبطأ وأعلى كلفة، فهو مسار طوارئ لا مسار دائم.
   ============================================================ */

import { db, doc, collection, onSnapshot, query, orderBy } from "./firebase.js";
import { COLLECTIONS, PUBLIC_MENU } from "./config.js";

/**
 * يراقب قائمة الطعام ويعيد التحديثات مباشرة.
 * @param {(sections, items) => void} onData
 * @param {(err) => void} onError  يُنادى فقط عند إخفاق كل المسارات
 */
/* ============================================================
   حارس المعرّفات

   المعرّف عماد السلة: به تُفهرَس الأصناف المختارة وبه يُحسَب
   المجموع. وكانت لوحة الإدارة تكتب النسخة المجمّعة بلا معرّفات،
   فصارت الأصناف كلها صنفاً واحداً مجهولاً ومجموعه صفر.

   أُصلح مصدر الكتابة في admin.js، لكنّ الوثيقة المكتوبة قبل
   الإصلاح تبقى في Firestore حتى يُعدَّل المنيو فتُعاد كتابتها.
   فلا يُترك الزبون ينتظر ذلك: يُشتقّ هنا معرّف ثابت من القسم
   والاسم، وهو ثابت بين كل تحميل وآخر فتصحّ السلة المحفوظة.
   ============================================================ */
function withIds(items) {
  return items.map((it) =>
    it && it.id
      ? it
      : { ...it, id: (it?.sectionId || "?") + ":" + (it?.name || "?") }
  );
}

export function subscribeMenu(onData, onError) {
  let fellBack = false;

  onSnapshot(
    doc(db, PUBLIC_MENU.collection, PUBLIC_MENU.doc),
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      if (data && Array.isArray(data.sections) && Array.isArray(data.items)) {
        onData(data.sections, withIds(data.items));
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
    console.warn("menu_public غير متوفرة — جرى الرجوع إلى المجموعات الأصلية.");

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
