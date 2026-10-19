/* ============================================================
     صفحة طلب الدليفري

   الطلب مفتوح للجميع بلا تسجيل. يتصفّح الزبون ويملأ سلته ثم يكتب
   اسمه ورقمه وعنوانه في نافذة التأكيد، وينتهي الأمر. فحاجز التسجيل
   كان يُفقدنا زبوناً لم يأتِ ليُنشئ حساباً بل ليأكل.

   ولا حسابات في الموقع أصلاً: أُزيلت بكاملها. فكل من يطلب ضيف،
   يكتب اسمه ورقمه وعنوانه في كل مرة، ولا يُحفَظ له شيء. والمطعم
   يتصل بالرقم المكتوب، وهذا كل ما يلزم لتوصيل طلب.

   أما السلة ونافذة التأكيد وما فيهما فمشتركة مع صفحة الطاولة،
   ومكانها order-core.js. ولا يبقى هنا إلا ما يخصّ الدليفري:
   الاسم والرقم والعنوان.
   ============================================================ */

import { mountOrderPage } from "./order-core.js";
import { normalizePhone } from "./utils.js";

const $ = (id) => document.getElementById(id);

const BAD_PHONE = "رقم الهاتف غير صحيح، والصيغة المطلوبة 09xxxxxxxx.";

await mountOrderPage({
  feature: "delivery",

  buildOrder({ items, total }) {
    // الاسم والرقم شرط الطلب: بهما وحدهما نؤكّده ونصل إلى صاحبه
    const name = $("coName").value.trim();
    if (!name) return { error: "يُرجى كتابة الاسم." };

    const phone = normalizePhone($("coPhone").value);
    if (!phone) return { error: BAD_PHONE };

    const address = $("coAddress").value.trim();
    if (address.length < 5) {
      return { error: "يُرجى كتابة عنوان واضح ليتسنّى لنا التوصيل." };
    }

    return {
      order: {
        type: "delivery",
        items,
        total,
        customer: { name, phone, address },
      },
    };
  },
});
