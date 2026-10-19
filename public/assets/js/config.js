/* ============================================================
     إعدادات المشروع — جميع القيم القابلة للتعديل موجودة هنا فقط
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
export const DEFAULT_ICON = "";

/** حالات الطلب — المفتاح هو ما يُخزَّن في Firestore،
 *  والنص هو ما يراه الزبون في صفحة «طلباتي».
 *  أي حالة غير مذكورة هنا تُعرض كما هي دون لون خاص. */
export const ORDER_STATUS = {
  new:       { label: "قيد المراجعة",   tone: "wait" },
  confirmed: { label: "تم تأكيد الطلب", tone: "ok" },
  preparing: { label: "قيد التحضير",    tone: "ok" },
  on_way:    { label: "في الطريق إليك", tone: "go" },
  delivered: { label: "تم التسليم",     tone: "done" },
  cancelled: { label: "ملغى",           tone: "bad" },
};

/** وثيقة مفاتيح تشغيل الميزات.
 *  تقرأها صفحات الزبائن، وتكتبها لوحة الإدارة وحدها.
 *  الميزة مطفأة ما لم تكن قيمتها true صراحةً. */
export const FEATURE_FLAGS = { collection: "settings", doc: "features" };

/** وثيقة قائمة الطعام المجمّعة التي يقرأها الزبائن.
 *  قراءة واحدة بدل ثمانٍ وثمانين، وهي ما يُبقي المشروع ضمن
 *  الخطة المجانية. تكتبها لوحة الإدارة تلقائياً عند أي تعديل. */
export const PUBLIC_MENU = { collection: "menu_public", doc: "current" };
