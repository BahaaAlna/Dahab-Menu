/* ============================================================
   ⚙️  إعدادات المشروع — جميع القيم القابلة للتعديل موجودة هنا فقط
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

/** كلمة مرور لوحة الإدارة.
 *  ⚠️ هذه حماية شكلية فقط، إذ يستطيع أي زائر قراءتها من الكود.
 *  ويجب أن تكون الحماية الحقيقية عبر Firestore Rules. */
export const ADMIN_PASSWORD = "dahab2026";

/** أسماء المجموعات في Firestore */
export const COLLECTIONS = {
  sections: "menu_sections",
  items: "menu_items",
};

/** العملة المعروضة بجانب السعر */
export const CURRENCY = "ل.س";

/** مقدار الزيادة أو النقصان عند الضغط على أسهم السعر.
 *  الأسعار بالليرة مكوّنة من ثلاث أو أربع خانات، لذلك لا معنى لخطوة مقدارها واحد. */
export const PRICE_STEP = 50;

/** الرمز الافتراضي للقسم في حال عدم اختيار رمز */
export const DEFAULT_ICON = "🍽️";
