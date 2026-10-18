/* ============================================================
   📇  شكل ملف الزبون — دوال خالصة بلا أي اتصال

   الملف محفوظ على الخادم في customers/{uid} وشكله:

     {
       name: "بهاء",
       phone: "963912345678",        // ثابت، مشتقّ من حساب الدخول
       addresses: {
         a1: { label: "البيت",  text: "..." },
         a2: { label: "العمل", text: "..." },
         a3: { label: "...",   text: "..." }
       },
       defaultAddress: "a1"
     }

   ولمَ خانات بأسماء ثابتة (a1 a2 a3) لا مصفوفة؟ لأن لغة قواعد
   Firestore لا تستطيع المرور على عناصر المصفوفة، فلا يمكن التحقّق
   من طول كل عنوان على حدة. أما الخانات الثابتة فيُتحقَّق من كل
   واحدة منها صراحةً، وعددها محصور بثلاثة بطبيعته.
   ============================================================ */

/** أسماء الخانات الثلاث بالترتيب */
export const ADDRESS_SLOTS = ["a1", "a2", "a3"];

export const MAX_LABEL = 30;
export const MAX_ADDRESS = 200;

/** أقصر عنوان مقبول — أقلّ من ذلك لا يكفي للتوصيل */
export const MIN_ADDRESS = 5;

/** ملف جديد عند إنشاء الحساب */
export function newProfile({ name, phone }) {
  return {
    name: String(name || "").trim(),
    phone,
    addresses: {},
    defaultAddress: "",
  };
}

/** خانة فارغة أو غير موجودة تُعدّ غير مستعملة */
function isFilled(addr) {
  return Boolean(addr && String(addr.text || "").trim());
}

/**
 * العناوين المستعملة بالترتيب، وكل واحد معه خانته وهل هو الافتراضي.
 * @returns {{slot:string,label:string,text:string,isDefault:boolean}[]}
 */
export function addressList(profile) {
  const all = profile?.addresses || {};
  const fallback = firstFilledSlot(profile);

  return ADDRESS_SLOTS
    .filter((slot) => isFilled(all[slot]))
    .map((slot) => ({
      slot,
      label: String(all[slot].label || "").trim(),
      text: String(all[slot].text || "").trim(),
      isDefault: slot === (validDefault(profile) || fallback),
    }));
}

/** أول خانة مستعملة — تُعتمد افتراضياً إن لم يُحدَّد افتراضي سليم */
function firstFilledSlot(profile) {
  const all = profile?.addresses || {};
  return ADDRESS_SLOTS.find((slot) => isFilled(all[slot])) || "";
}

/** الافتراضي المخزَّن، بشرط أن يكون خانةً مستعملة فعلاً */
function validDefault(profile) {
  const slot = profile?.defaultAddress;
  const all = profile?.addresses || {};
  return slot && isFilled(all[slot]) ? slot : "";
}

/** نصّ العنوان الافتراضي، أو سلسلة فارغة إن لم يكن ثمّة عنوان */
export function defaultAddressText(profile) {
  const chosen = validDefault(profile) || firstFilledSlot(profile);
  if (!chosen) return "";
  return String(profile.addresses[chosen].text || "").trim();
}

/** هل بقيت خانة فارغة يمكن أن يُضاف إليها عنوان جديد؟ */
export function freeSlot(profile) {
  const all = profile?.addresses || {};
  return ADDRESS_SLOTS.find((slot) => !isFilled(all[slot])) || "";
}

/** اسم يُعرَض للعنوان حين لا يكتب الزبون تسميةً له */
export function addressTitle(entry, index) {
  return entry.label || "العنوان " + (index + 1);
}
