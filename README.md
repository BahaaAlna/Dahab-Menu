# 🌯 دهب — شاورما و جريل

قائمة طعام رقمية **مباشرة** مع لوحة إدارة. يظهر أي تعديل تُجريه اللوحة لدى الزبائن فوراً ومن دون تحديث الصفحة.

---

## ⚡ التشغيل

```bash
npm start
```

هذا كل ما يلزم. لا حاجة إلى `npm install` ولا إلى أي مكتبات خارجية، فالخادم مكتوب بـ Node الصافي.

بعد ذلك تظهر الروابط في الطرفية:

| الصفحة | الرابط |
|---|---|
| 🍽️ قائمة الطعام | http://localhost:3000/ |
| 🛠️ لوحة الإدارة | http://localhost:3000/admin.html |
| 🌱 رفع البيانات الأولية | http://localhost:3000/tools/seed.html |

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

## 📁 الهيكل

```
Dahab-Menu/
├── package.json              أوامر التشغيل
├── scripts/
│   └── dev-server.js         خادم محلي بدون أي مكتبات
│
├── public/                   ← كل ما يُنشر على الويب
│   ├── index.html            قائمة الطعام (للزبائن)
│   ├── admin.html            لوحة الإدارة
│   │
│   ├── assets/
│   │   ├── css/
│   │   │   ├── base.css      الألوان والخطوط والأزرار (مشترك)
│   │   │   ├── menu.css      تنسيق قائمة الطعام
│   │   │   ├── admin.css     تنسيق اللوحة
│   │   │   └── tools.css     تنسيق صفحات الأدوات
│   │   ├── js/
│   │   │   ├── config.js     ⚙️ الإعدادات — التعديل هنا فقط
│   │   │   ├── firebase.js   🔥 الاتصال بـ Firebase
│   │   │   ├── utils.js      🧰 دوال مساعدة مشتركة
│   │   │   ├── menu.js       منطق قائمة الطعام
│   │   │   └── admin.js      منطق لوحة الإدارة
│   │   └── img/
│   │       └── logo.png      الشعار (صورة واحدة بدلاً من ثلاث نسخ base64)
│   │
│   └── tools/                🔒 أدوات تُستخدم مرة واحدة — يجب حذفها قبل النشر
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

## 🔧 التعديلات الشائعة

| العنصر المطلوب تغييره | الملف |
|---|---|
| كلمة مرور الإدارة | `public/assets/js/config.js` |
| بيانات Firebase | `public/assets/js/config.js` |
| العملة أو رمز القسم الافتراضي | `public/assets/js/config.js` |
| الألوان والخطوط | `public/assets/css/base.css` |
| أرقام الهاتف والعنوان | `public/index.html` |
| الشعار | يُستبدل الملف `public/assets/img/logo.png` |

---

## ☁️ قاعدة البيانات

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

## 🚀 النشر — تلقائي بالكامل

الموقع مربوط بـ **GitHub Pages** عبر GitHub Actions. للنشر:

```bash
git add -A
git commit -m "تعديل الأسعار"
git push
```

وبذلك يكتمل الأمر. خلال دقيقة واحدة تقريباً يُحدَّث الموقع على العنوان الآتي:

### 🌍 https://bahaaalna.github.io/Dahab-Menu/

| | |
|---|---|
| قائمة الطعام | https://bahaaalna.github.io/Dahab-Menu/ |
| لوحة الإدارة | https://bahaaalna.github.io/Dahab-Menu/admin.html |

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

## ⚠️ ملاحظات أمنية

1. **كلمة مرور اللوحة موجودة داخل الكود**، إذ يستطيع أي زائر قراءتها من مصدر الصفحة.
   ويجب أن تكون الحماية الحقيقية عبر **Firestore Security Rules** مع **Firebase Authentication**
   (تسجّل اللوحة دخولاً مجهولاً عبر `signInAnonymously`، ويمكن بناء القواعد على هذا الأساس).
2. **مجلد `public/tools/`** يحتوي زر حذف شامل، فلا يجوز نشره إطلاقاً.
