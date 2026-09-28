# 🌯 دهب — شاورما و جريل

منيو رقمي **مباشر** مع لوحة إدارة. أي تعديل في اللوحة يظهر عند الزبائن فوراً بدون تحديث الصفحة.

---

## ⚡ التشغيل

```bash
npm start
```

بس. ما في `npm install` ولا مكتبات — السيرفر مكتوب بـ Node الصافي.

بعدها تطلع الروابط بالتيرمنال:

| الصفحة | الرابط |
|---|---|
| 🍽️ المنيو | http://localhost:3000/ |
| 🛠️ لوحة الإدارة | http://localhost:3000/admin.html |
| 🌱 رفع البيانات الأولية | http://localhost:3000/tools/seed.html |

### أوامر إضافية

```bash
npm run dev          # يشغّل ويفتح المنيو بالمتصفح
npm run admin        # يشغّل ويفتح لوحة الإدارة
npm run seed         # يشغّل ويفتح صفحة رفع البيانات
npm start -- --port 5000   # منفذ مختلف
```

> إذا المنفذ مشغول، السيرفر بينتقل تلقائياً للي بعده.

**كلمة سر لوحة الإدارة:** موجودة في [`public/assets/js/config.js`](public/assets/js/config.js)

---

## 📁 الهيكل

```
Dahab-Menu/
├── package.json              أوامر التشغيل
├── scripts/
│   └── dev-server.js         سيرفر محلي بدون أي مكتبات
│
├── public/                   ← كل ما يُنشر على الويب
│   ├── index.html            المنيو (للزبائن)
│   ├── admin.html            لوحة الإدارة
│   │
│   ├── assets/
│   │   ├── css/
│   │   │   ├── base.css      الألوان والخطوط والأزرار (مشترك)
│   │   │   ├── menu.css      تنسيق المنيو
│   │   │   ├── admin.css     تنسيق اللوحة
│   │   │   └── tools.css     تنسيق صفحات الأدوات
│   │   ├── js/
│   │   │   ├── config.js     ⚙️ الإعدادات — عدّل هنا فقط
│   │   │   ├── firebase.js   🔥 الاتصال بـ Firebase
│   │   │   ├── utils.js      🧰 دوال مساعدة مشتركة
│   │   │   ├── menu.js       منطق المنيو
│   │   │   └── admin.js      منطق لوحة الإدارة
│   │   └── img/
│   │       └── logo.png      اللوغو (صورة واحدة بدل 3 نسخ base64)
│   │
│   └── tools/                🔒 أدوات لمرة واحدة — احذفها قبل النشر
│       ├── seed.html
│       ├── seed.js
│       └── seed-data.js      7 أقسام · 81 صنف
│
└── docs/                     مواد جاهزة للطباعة والمشاركة
    ├── menu-light.pdf
    ├── menu-print.docx
    ├── qr-card.html          بطاقة QR للطباعة
    └── slideshow.mp4
```

---

## 🔧 التعديلات الشائعة

| بدك تغيّر | افتح |
|---|---|
| كلمة سر الإدارة | `public/assets/js/config.js` |
| بيانات Firebase | `public/assets/js/config.js` |
| العملة / رمز القسم الافتراضي | `public/assets/js/config.js` |
| الألوان والخطوط | `public/assets/css/base.css` |
| أرقام الهاتف والعنوان | `public/index.html` |
| اللوغو | استبدل `public/assets/img/logo.png` |

---

## ☁️ قاعدة البيانات

**Firebase Firestore** — مشروع `dahab-menu`

مجموعتان:

- **`menu_sections`** → `{ id, name, icon, order }`
- **`menu_items`** → `{ sectionId, sectionName, sectionIcon, sectionOrder, name, price, order, available }`

كل من المنيو واللوحة يستمعان عبر `onSnapshot`، لذلك التعديلات تنتقل بينهما لحظياً.

### أول تشغيل على مشروع Firebase فاضي

1. `npm run seed`
2. اضغط **رفع كل المنيو إلى Firebase**
3. احذف مجلد `public/tools/` — فيه زر يمسح كل البيانات

---

## 🚀 النشر — تلقائي بالكامل

الموقع مربوط بـ **GitHub Pages** عبر GitHub Actions. للنشر:

```bash
git add -A
git commit -m "تعديل الأسعار"
git push
```

وخلص. خلال دقيقة تقريباً الموقع بيتحدّث على:

### 🌍 https://bahaaalna.github.io/Dahab-Menu/

| | |
|---|---|
| المنيو | https://bahaaalna.github.io/Dahab-Menu/ |
| لوحة الإدارة | https://bahaaalna.github.io/Dahab-Menu/admin.html |

تقدر تتابع النشر من تبويب **Actions** بالريبو، أو:

```bash
gh run watch
```

> **مهم:** ملف [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) ينشر محتوى `public/`
> فقط، ويستثني مجلد `tools/` تلقائياً لأنه يحتوي زر حذف شامل للبيانات.

> **ملاحظة:** تعديل الأسعار والأصناف **ما بيحتاج نشر إطلاقاً** — لوحة الإدارة
> تكتب مباشرة على Firestore والتغيير يظهر فوراً. النشر فقط لما تعدّل الكود أو التصميم.

---

## ⚠️ ملاحظات أمنية

1. **كلمة سر اللوحة موجودة داخل الكود** — أي زائر يقدر يقرأها من مصدر الصفحة.
   الحماية الحقيقية لازم تكون عبر **Firestore Security Rules** + **Firebase Authentication**
   (اللوحة أصلاً تسجّل دخول مجهول عبر `signInAnonymously`، فتقدر تبني القواعد فوقه).
2. **مجلد `public/tools/`** يحتوي زر حذف شامل — لا تنشره أبداً.
