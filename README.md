#  دهب — شاورما و جريل

قائمة طعام رقمية **مباشرة** مع لوحة إدارة. يظهر أي تعديل تُجريه اللوحة لدى الزبائن فوراً ومن دون تحديث الصفحة.

---

##  التشغيل

```bash
npm start
```

هذا كل ما يلزم. لا حاجة إلى `npm install` ولا إلى أي مكتبات خارجية، فالخادم مكتوب بـ Node الصافي.

بعد ذلك تظهر الروابط في الطرفية:

| الصفحة | الرابط |
|---|---|
|  صفحة الترحيب | http://localhost:3000/ |
|  قائمة الطعام | http://localhost:3000/menu.html |
|  لوحة الإدارة | http://localhost:3000/admin.html |
|  رفع البيانات الأولية | http://localhost:3000/tools/seed.html |

### أوامر إضافية

```bash
npm run dev          # يشغّل الخادم ويفتح قائمة الطعام في المتصفح
npm run admin        # يشغّل الخادم ويفتح لوحة الإدارة
npm run seed         # يشغّل الخادم ويفتح صفحة رفع البيانات
npm start -- --port 5000   # منفذ مختلف
```

> إذا كان المنفذ مشغولاً، ينتقل الخادم تلقائياً إلى المنفذ الذي يليه.

**كلمة مرور لوحة الإدارة:** موجودة في [`public/assets/js/config.js`](public/assets/js/config.js)

---

##  الهيكل

```
Dahab-Menu/
├── package.json              أوامر التشغيل
├── scripts/
│   └── dev-server.js         خادم محلي بدون أي مكتبات
│
├── public/                   ← كل ما يُنشر على الويب
│   ├── index.html            صفحة الترحيب — أول ما يراه الزبون
│   ├── menu.html             قائمة الطعام (للاستعراض)
│   ├── CNAME                 النطاق المخصص
│   ├── admin.html            لوحة الإدارة
│   │
│   ├── assets/
│   │   ├── css/
│   │   │   ├── base.css      الألوان والخطوط والأزرار (مشترك)
│   │   │   ├── welcome.css   تنسيق صفحة الترحيب
│   │   │   ├── menu.css      تنسيق قائمة الطعام
│   │   │   ├── admin.css     تنسيق اللوحة
│   │   │   └── tools.css     تنسيق صفحات الأدوات
│   │   ├── js/
│   │   │   ├── config.js      الإعدادات — التعديل هنا فقط
│   │   │   ├── firebase.js    الاتصال بـ Firebase
│   │   │   ├── utils.js       دوال مساعدة مشتركة
│   │   │   ├── welcome.js    منطق صفحة الترحيب
│   │   │   ├── menu.js       منطق قائمة الطعام
│   │   │   └── admin.js      منطق لوحة الإدارة
│   │   └── img/
│   │       └── logo.png      الشعار (صورة واحدة بدلاً من ثلاث نسخ base64)
│   │
│   └── tools/                 أدوات تُستخدم مرة واحدة — يجب حذفها قبل النشر
│       ├── seed.html
│       ├── seed.js
│       └── seed-data.js      7 أقسام · 81 صنفاً
│
└── docs/                     مواد جاهزة للطباعة والمشاركة
    ├── menu-light.pdf
    ├── menu-print.docx
    ├── qr-card.html          بطاقة QR للطباعة
    └── slideshow.mp4
```

---

##  التعديلات الشائعة

| العنصر المطلوب تغييره | الملف |
|---|---|
| كلمة مرور الإدارة | `public/assets/js/config.js` |
| بيانات Firebase | `public/assets/js/config.js` |
| العملة أو رمز القسم الافتراضي | `public/assets/js/config.js` |
| الألوان والخطوط | `public/assets/css/base.css` |
| أرقام الهاتف والعنوان | `public/menu.html` |
| الشعار | يُستبدل الملف `public/assets/img/logo.png` |

---

##  قاعدة البيانات

**Firebase Firestore** — مشروع `dahab-menu`

مجموعتان:

- **`menu_sections`** → `{ id, name, icon, order }`
- **`menu_items`** → `{ sectionId, sectionName, sectionIcon, sectionOrder, name, price, order, available }`

تستمع كل من صفحة قائمة الطعام ولوحة الإدارة عبر `onSnapshot`، لذلك تنتقل التعديلات بينهما لحظياً.

### التشغيل الأول على مشروع Firebase فارغ

1. `npm run seed`
2. اضغط **رفع قائمة الطعام بالكامل إلى Firebase**
3. احذف مجلد `public/tools/`، فهو يحتوي زراً يحذف جميع البيانات

---

##  النشر — تلقائي بالكامل

الموقع مربوط بـ **GitHub Pages** عبر GitHub Actions. للنشر:

```bash
git add -A
git commit -m "تعديل الأسعار"
git push
```

وبذلك يكتمل الأمر. خلال دقيقة واحدة تقريباً يُحدَّث الموقع على العنوان الآتي:

###  https://dahab-hama.shop

| | |
|---|---|
| صفحة الترحيب | https://dahab-hama.shop/ |
| قائمة الطعام | https://dahab-hama.shop/menu.html |
| طلب دليفري | https://dahab-hama.shop/order.html |
| لوحة الإدارة | https://dahab-hama.shop/admin.html |

> **النطاق المخصّص:** ملف `public/CNAME` يحمل `dahab-hama.shop`، غير أن هذا
> الملف وحده لا يكفي مع النشر عبر GitHub Actions. فالنطاق يُضبَط من
> **Settings ← Pages ← Custom domain** في المستودع، ومن هناك تُفعَّل كذلك
> خاصية Enforce HTTPS. والعنوان القديم
> `https://bahaaalna.github.io/Dahab-Menu/` يبقى عاملاً.

ويمكن متابعة عملية النشر من تبويب **Actions** في المستودع، أو عبر الأمر الآتي:

```bash
gh run watch
```

> **مهم:** ملف [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) ينشر محتوى `public/`
> فقط، ويستثني مجلد `tools/` تلقائياً لأنه يحتوي زر حذف شامل للبيانات.

> **ملاحظة:** تعديل الأسعار والأصناف **لا يتطلب نشراً إطلاقاً**، إذ تكتب لوحة
> الإدارة مباشرة في Firestore فيظهر التغيير فوراً. أما النشر فلا يلزم إلا عند
> تعديل الكود أو التصميم.

---

##  إشعارات الطلبات (Push)

تصل إلى جوال الموظف أو كمبيوتره عند كل طلب جديد، **حتى واللوحة مغلقة**.
الموقع ملفات ساكنة، لذلك يُرسل الإشعار عاملٌ صغير مجاني على Cloudflare
([`workers/push`](workers/push/src/index.js)): صفحة الزبون تبلّغه بمعرّف الطلب،
فيقرأ الطلب من Firestore بنفسه ثم يرسل الإشعار إلى الأجهزة المسجّلة.

**الإعداد (مرّة واحدة):**

1. **مفتاح VAPID:** Firebase Console ← Project settings ← Cloud Messaging ←
   Web Push certificates ← **Generate key pair**. انسخ المفتاح إلى `PUSH.vapidKey`
   في [`config.js`](public/assets/js/config.js).
2. **حساب الخدمة:** Project settings ← Service accounts ← **Generate new private key**.
   يُنزَّل ملف JSON. **هذا الملف سرّ، فلا تضعه في المستودع.**
3. **حساب Cloudflare** مجاني، ثم من التيرمنال:
   ```bash
   npx wrangler login
   ```
   ```bash
   npm run push:deploy
   ```
   ```powershell
   Get-Content -Raw "C:\path\to\key.json" | npm run push:secret
   ```
   الأمر الأخير يمرّر ملف JSON كاملاً إلى Cloudflare. لا تلصقه يدوياً،
   لأن الملف متعدّد الأسطر وقد لا يُقرأ إلا سطره الأول.
4. انسخ رابط العامل الذي ظهر بعد النشر (`https://dahab-push.<اسمك>.workers.dev`)
   إلى `PUSH.endpoint` في `config.js`.
5. انشر القواعد، ثم ارفع الكود:
   ```bash
   firebase deploy --only firestore:rules
   ```
6. من كل جهاز يريد التنبيه: افتح اللوحة واضغط **فعّل التنبيه** ووافق على الإذن.

> **الآيفون:** لا يقبل Push إلا إذا أُضيفت اللوحة إلى الشاشة الرئيسية
> (مشاركة ← إضافة إلى الشاشة الرئيسية) وفُتحت من هناك. أندرويد والكمبيوتر يعملان مباشرة.

لمتابعة ما يفعله العامل لحظةً بلحظة: `npm run push:logs`

---

##  مفاتيح الميزات قيد التطوير

ميزتا **«طلب دليفري»** و**«طلب من الطاولة»** محكومتان بمفتاحين في
لوحة الإدارة، ضمن بطاقة «الميزات قيد التطوير».

- الإيقاف يخفي الميزة عن الزبائن **فوراً ودون إعادة نشر**، لأن الحالة
  مخزّنة في Firestore لا في الكود.
- الميزة **مطفأة افتراضياً**: إذا غابت وثيقة الإعداد أو تعذّرت قراءتها،
  تبقى الميزتان مخفيتين. فظهور ميزة غير جاهزة أسوأ من اختفاء ميزة جاهزة.
- إخفاء الخيار لا يكفي وحده، لذلك تتحقّق `order.html` من المفتاح أيضاً
  وتعيد الزائر إلى صفحة الترحيب إن فتح الرابط مباشرة.

موضع التخزين: `settings/features` → `{ delivery: bool, table: bool }`

---

##  ملاحظات أمنية

1. **كلمة مرور اللوحة موجودة داخل الكود**، إذ يستطيع أي زائر قراءتها من مصدر الصفحة.
   ويجب أن تكون الحماية الحقيقية عبر **Firestore Security Rules** مع **Firebase Authentication**
   (تسجّل اللوحة دخولاً مجهولاً عبر `signInAnonymously`، ويمكن بناء القواعد على هذا الأساس).
2. **مجلد `public/tools/`** يحتوي زر حذف شامل، فلا يجوز نشره إطلاقاً.
