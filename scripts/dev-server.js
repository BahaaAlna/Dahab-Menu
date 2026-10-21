#!/usr/bin/env node
/* ============================================================
     خادم التطوير المحلي — بدون أي مكتبات خارجية
   يقدّم محتويات مجلد public/ ويطبع رابط قائمة الطعام ورابط لوحة الإدارة.

   التشغيل:   npm start
              npm start -- --port 5000
              npm start -- --open
   ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.join(__dirname, "..", "public");
const DEFAULT_PORT = 3000;
const MAX_PORT_TRIES = 10;

const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const START_PORT = Number(
  (portArg !== -1 && args[portArg + 1]) || process.env.PORT || DEFAULT_PORT
);
const openArg = args.indexOf("--open");
const SHOULD_OPEN = openArg !== -1;
// --open بدون قيمة يفتح قائمة الطعام، ومع قيمة يفتح الصفحة المطلوبة
const OPEN_PATH =
  SHOULD_OPEN && args[openArg + 1] && !args[openArg + 1].startsWith("--")
    ? args[openArg + 1].replace(/^\//, "")
    : "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);

  // منع الخروج خارج مجلد public
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  // مجلد بدون اسم ملف → index.html بداخله
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  /* عنوان بلا لاحقة ‎.html‎ → الملف نفسه. GitHub Pages يفعل هذا
     تلقائياً، فنحاكيه هنا كي تعمل روابط ‎/menu‎ و‎/order‎ محلياً
     تماماً كما تعمل على الموقع المنشور. */
  if (!path.extname(filePath) && fs.existsSync(filePath + ".html")) {
    filePath += ".html";
  }

  fs.readFile(filePath, (err, data) => {
    const stamp = new Date().toTimeString().slice(0, 8);
    if (err) {
      console.log(`  ${stamp}  404  ${urlPath}`);
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<meta charset="utf-8"><h1 dir="rtl">404 — الملف غير موجود</h1><p dir="ltr">${urlPath}</p>`);
      return;
    }
    console.log(`  ${stamp}  200  ${urlPath}`);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store", // حتى تظهر التعديلات فوراً أثناء التطوير
    });
    res.end(data);
  });
});

/** إذا كان المنفذ مشغولاً، تُجرَّب المنافذ التي تليه */
let attempts = 0;
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && attempts < MAX_PORT_TRIES) {
    attempts++;
    console.log(`    المنفذ ${START_PORT + attempts - 1} مشغول، ستتم تجربة المنفذ ${START_PORT + attempts}...`);
    server.listen(START_PORT + attempts);
    return;
  }
  console.error("   " + err.message);
  process.exit(1);
});

server.listen(START_PORT, () => {
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  console.log(`
  ╔══════════════════════════════════════════════╗
  ║            دهب — شاورما و جريل                ║
  ╚══════════════════════════════════════════════╝

      صفحة الترحيب  ${base}/
      قائمة الطعام   ${base}/menu
      طلب دليفري     ${base}/order
      طلب من الطاولة ${base}/table?t=3
      لوحة الإدارة   ${base}/admin
      رفع البيانات   ${base}/tools/seed.html

    للإيقاف: Ctrl + C
`);

  if (SHOULD_OPEN) open(base + "/" + OPEN_PATH);
});

function open(url) {
  const cmd =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  execFile(cmd[0], cmd[1], () => {});
}
