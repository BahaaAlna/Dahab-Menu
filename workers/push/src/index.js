/* ============================================================
     عامل إشعارات الطلبات — Cloudflare Worker (مجاني)

   الموقع ملفات ساكنة على GitHub Pages، فلا خادم يعلم بوصول طلب.
   فبعد أن يحفظ الزبون طلبه، تُبلِّغ صفحته هذا العامل بمعرّف الطلب،
   والعامل:
     ١. يقرأ الطلب من Firestore بنفسه — لا يثق بشيء أرسله الزبون.
     ٢. يتأكد أنه جديد (حالته new وعمره دقائق).
     ٣. يسجّله في push_log، فلا يُرسَل إشعاران للطلب نفسه مهما
        تكرّر النداء.
     ٤. يرسل Push إلى كل جهاز في admin_tokens، ويحذف الرموز الميتة.

   يدخل إلى Firebase بحساب خدمة (Service Account) محفوظ سرّاً في
   Cloudflare، لا في الكود:
     npm run push:secret   (انظر README)
   ============================================================ */

/** أقصى عمر للطلب كي يُنبَّه عليه. يمنع إعادة تنبيه طلبات قديمة. */
const MAX_AGE_MS = 10 * 60 * 1000;

const SCOPES = [
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/firebase.messaging",
].join(" ");

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("ok");

    let id = "";
    try { id = String((await request.json()).id || ""); } catch (_) {}
    // معرّفات Firestore التلقائية: عشرون حرفاً وأرقاماً
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return new Response("bad id", { status: 400 });

    try {
      const result = await notifyOrder(env, id);
      return new Response(result);
    } catch (err) {
      console.error("push error:", err?.stack || err);
      return new Response("error", { status: 500 });
    }
  },
};

async function notifyOrder(env, id) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const project = sa.project_id;
  const token = await accessToken(sa);
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const auth = { Authorization: "Bearer " + token };

  /* ١. الطلب نفسه */
  const res = await fetch(`${base}/orders/${id}`, { headers: auth });
  if (res.status === 404) return "no order";
  if (!res.ok) throw new Error("read order " + res.status + " " + await res.text());
  const order = await res.json();
  const f = order.fields || {};

  /* ٢. جديد فعلاً؟ */
  if (f.status?.stringValue !== "new") return "not new";
  if (Date.now() - Date.parse(order.createTime) > MAX_AGE_MS) return "too old";

  /* ٣. مرّة واحدة فقط: الإنشاء يفشل بـ 409 إن سبق */
  const log = await fetch(`${base}/push_log?documentId=${id}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { at: { timestampValue: new Date().toISOString() } } }),
  });
  if (log.status === 409) return "already sent";
  if (!log.ok) throw new Error("push_log " + log.status + " " + await log.text());

  /* ٤. الأجهزة */
  const list = await fetch(`${base}/admin_tokens?pageSize=100&mask.fieldPaths=uid`, { headers: auth });
  if (!list.ok) throw new Error("tokens " + list.status + " " + await list.text());
  const devices = ((await list.json()).documents || [])
    .map((d) => d.name.slice(d.name.lastIndexOf("/") + 1));
  if (!devices.length) return "no devices";

  const data = message(id, f);
  const sent = await Promise.all(devices.map(async (device) => {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: device,
          data,
          // عالي الأولوية: يوقظ الجوال من وضع توفير الطاقة.
          // ويُهمل بعد عشر دقائق إن بقي الجهاز مطفأً
          webpush: { headers: { Urgency: "high", TTL: "600" } },
        },
      }),
    });
    if (r.ok) return true;

    const body = await r.text();
    // جهاز أُلغي تسجيله أو رمز تالف: يُحذف كي لا يُرسَل إليه ثانية
    if (r.status === 404 || (r.status === 400 && /registration token|UNREGISTERED/i.test(body))) {
      await fetch(`${base}/admin_tokens/${encodeURIComponent(device)}`, { method: "DELETE", headers: auth });
    } else {
      console.error("fcm " + r.status + " " + body);
    }
    return false;
  }));

  return `sent ${sent.filter(Boolean).length}/${devices.length}`;
}

/** نصّ الإشعار. قيم data في FCM نصوص كلّها. */
function message(id, f) {
  const isTable = f.type?.stringValue === "table";
  const where = isTable ? "طاولة " + (f.table?.integerValue ?? "؟") : "توصيل";
  const total = Number(f.total?.integerValue ?? f.total?.doubleValue ?? 0);
  const name = f.customer?.mapValue?.fields?.name?.stringValue;

  return {
    title: "طلب جديد — " + where,
    body: total.toLocaleString("en-US") + " ل.س" + (name ? " · " + name : ""),
    // الوسم نفسه في admin-alert.js، فلا يتكرّر الإشعار واللوحة مفتوحة
    tag: "dahab-order-" + id,
    url: "admin.html",
  };
}

/* ============================================================
   رمز دخول Google من حساب الخدمة (OAuth بتوقيع JWT)
   يُحفظ في الذاكرة حتى يقارب انتهاءه، فلا يُطلَب مع كل طلب.
   ============================================================ */

let cached = { token: "", exp: 0 };

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.exp - 60 > now) return cached.token;

  const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({
    iss: sa.client_email,
    scope: SCOPES,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + b64url(new Uint8Array(sig)),
    }),
  });
  if (!res.ok) throw new Error("oauth " + res.status + " " + await res.text());

  const json = await res.json();
  cached = { token: json.access_token, exp: now + json.expires_in };
  return cached.token;
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}
