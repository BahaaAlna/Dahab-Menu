/* ============================================================
     عامل الخدمة لإشعارات الطلبات (Push)

   يعيش في المتصفح منفصلاً عن الصفحة، فيستقبل الإشعار واللوحة
   مغلقة والمتصفح نفسه مغلق (على أندرويد والكمبيوتر).

   لا يُحمَّل هنا SDK الـ Firebase: الرسالة تصل حدث push عادياً،
   وعرضها بضعة أسطر. والـ SDK في الصفحة وحده يكفي لتسجيل الجهاز.

   يجب أن يبقى في جذر الموقع: نطاق عامل الخدمة هو مجلّده،
   ولا يستقبل إلا ما يقع تحته.
   ============================================================ */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}

  // FCM يضع الحقول تحت data، ويُقبَل الشكل المسطّح احتياطاً
  const d = payload.data || payload;

  /* المتصفح يفرض إظهار إشعار لكل push، وإلا عرض من عنده
     «حُدِّث الموقع في الخلفية». فيُعرض شيء دائماً. */
  event.waitUntil(
    self.registration.showNotification(d.title || "طلب جديد", {
      body: d.body || "",
      icon: "assets/img/logo.png",
      badge: "assets/img/logo.png",
      dir: "rtl",
      lang: "ar",
      /* الوسم نفسه الذي تستعمله اللوحة المفتوحة (admin-alert.js)،
         فإن كانت مفتوحة حلّ أحد الإشعارين محلّ الآخر ولم يتكرّرا */
      tag: d.tag || "dahab-order",
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 400],
      data: { url: d.url || "admin.html" },
    })
  );
});

/* النقر يُحضر اللوحة المفتوحة إن وُجدت، وإلا فتحها */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "admin.html", self.registration.scope).href;

  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const admin = wins.find((w) => new URL(w.url).pathname.replace(/\.html$/, "").endsWith("/admin"));
    if (admin) return admin.focus();
    return self.clients.openWindow(target);
  })());
});
