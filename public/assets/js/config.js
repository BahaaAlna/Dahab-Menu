/* ============================================================
   ⚙️  إعدادات المشروع — كل شي قابل للتعديل موجود هنا فقط
   ============================================================ */

/** بيانات الاتصال بمشروع Firebase */
export const firebaseConfig = {
  apiKey: "AIzaSyDsgzz_a8THcX8vhcmMcYhuSd-gjbU19jA",
  authDomain: "dahab-menu.firebaseapp.com",
  projectId: "dahab-menu",
  storageBucket: "dahab-menu.firebasestorage.app",
  messagingSenderId: "67793665080",
  appId: "1:67793665080:web:3160688f3e58c2369d3acd",
};

/** كلمة سر لوحة الإدارة.
 *  ⚠️ هذه حماية شكلية فقط — أي زائر يقدر يقرأها من الكود.
 *  الحماية الحقيقية لازم تكون في Firestore Rules. */
export const ADMIN_PASSWORD = "dahab2026";

/** أسماء المجموعات في Firestore */
export const COLLECTIONS = {
  sections: "menu_sections",
  items: "menu_items",
};

/** العملة المعروضة بجانب السعر */
export const CURRENCY = "ل.س";

/** مقدار الزيادة/النقصان عند الضغط على أسهم السعر.
 *  الأسعار بالليرة من 3-4 خانات، فخطوة 1 ما إلها معنى. */
export const PRICE_STEP = 50;

/** الرمز الافتراضي للقسم إذا ما تم اختيار واحد */
export const DEFAULT_ICON = "🍽️";
