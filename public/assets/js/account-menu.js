/* ============================================================
   👤  قائمة الحساب — المكوّن المشترك بين الصفحات

   زرّ الحساب العائم يفتح قائمة قصيرة: «ملفي» و«طلباتي» و«تسجيل
   الخروج». وكلتا الوجهتين صفحة قائمة بذاتها لا نافذة منبثقة، كي
   يعمل زرّ الرجوع في الهاتف ويبقى لكل منهما عنوان يُشارَك.

   القائمة تُبنى هنا بالـ JS لا في HTML، فلا تتكرّر في ثلاث صفحات
   ولا تختلف واحدة عن أخرى حين يتغيّر شيء فيها.
   ============================================================ */

import { logOut } from "./auth.js";
import { LINK_SUFFIX } from "./dev-mode.js";

/**
 * يبني القائمة ويربطها بالزرّ.
 * @param {object}   opts
 * @param {Function} opts.onSignIn  يُنادى حين يضغط زائر غير مسجَّل
 * @returns {{ update: (user, profile) => void }}
 */
export function mountAccountMenu({ onSignIn }) {
  const btn = document.getElementById("profileBtn");
  const initial = document.getElementById("profileInitial");
  const icon = document.getElementById("profileIcon");
  if (!btn) return { update: () => {} };

  const menu = document.createElement("div");
  menu.className = "acct-menu";
  menu.id = "accountMenu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  document.body.appendChild(menu);

  let signedIn = false;

  /* ---------- الرسم ---------- */

  function item(href, iconId, label) {
    return '<a class="acct-item" role="menuitem" href="' + href + LINK_SUFFIX + '">' +
      '<svg class="ic" aria-hidden="true"><use href="assets/img/icons.svg#' + iconId + '"></use></svg>' +
      '<span>' + label + '</span>' +
      '</a>';
  }

  function drawMenu(profile) {
    if (!signedIn) {
      menu.innerHTML =
        '<button class="acct-item" role="menuitem" type="button" data-signin>' +
          '<svg class="ic" aria-hidden="true"><use href="assets/img/icons.svg#user"></use></svg>' +
          '<span>تسجيل الدخول</span>' +
        '</button>';
      return;
    }

    const name = String(profile?.name || "").trim();
    menu.innerHTML =
      (name ? '<p class="acct-who">' + escape(name) + '</p>' : "") +
      item("profile.html", "user", "ملفي") +
      item("orders.html", "dome", "طلباتي") +
      '<button class="acct-item is-out" role="menuitem" type="button" data-signout>' +
        '<span>تسجيل الخروج</span>' +
      '</button>';
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  /* ---------- الفتح والإغلاق ---------- */

  /* الموضع مثبَّت في account.css تحت زرّ الحساب مباشرة، لا يُقاس
     هنا: الزرّ نفسه ثابت (position: fixed) في ركن معلوم، فالقياس
     لا يضيف شيئاً ويُلزمنا بإعادته عند كل تغيّر في حجم النافذة —
     وهو ما يحدث في الهاتف كلما انطوى شريط العنوان مع التمرير. */
  function open() {
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }

  function close() {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  function toggle() {
    if (menu.hidden) open();
    else close();
  }

  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    // الزائر غير المسجَّل لا قائمة له: يُفتح له تسجيل الدخول رأساً
    if (!signedIn) {
      close();
      onSignIn();
      return;
    }
    toggle();
  });

  menu.addEventListener("click", async (e) => {
    if (e.target.closest("[data-signin]")) {
      close();
      onSignIn();
      return;
    }
    if (e.target.closest("[data-signout]")) {
      close();
      await logOut();
      // صفحتا الملف والطلبات لا معنى لهما بلا حساب
      if (/\/(profile|orders)\.html$/.test(location.pathname)) {
        location.replace("order.html" + LINK_SUFFIX);
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  /* ---------- التحديث من الخارج ---------- */

  function update(user, profile) {
    signedIn = Boolean(user);

    const name = String(profile?.name || "").trim();
    btn.classList.toggle("is-in", signedIn);
    btn.setAttribute("aria-label", signedIn ? "حسابك" : "تسجيل الدخول أو إنشاء حساب");

    const showInitial = signedIn && Boolean(name);
    if (showInitial && initial) initial.textContent = name[0];
    if (initial) initial.hidden = !showInitial;
    if (icon) icon.hidden = showInitial;

    if (!signedIn) close();
    drawMenu(profile);
  }

  return { update };
}
