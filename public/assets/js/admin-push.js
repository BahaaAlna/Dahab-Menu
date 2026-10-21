/* ============================================================
     تسجيل جهاز الموظف لإشعارات Push

   التنبيه في admin-alert.js يعمل ما دامت اللوحة مفتوحة. وهذا
   الملف يُسجّل الجهاز لدى Firebase Cloud Messaging، فيصله الإشعار
   والمتصفح مغلق: يحفظ «رمز الجهاز» في admin_tokens، والعامل
   (workers/push) يرسل إلى كل الرموز المحفوظة عند كل طلب جديد.

   الإصدار نفسه المستعمل في firebase.js.
   ============================================================ */

import {
  getMessaging, getToken, isSupported,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging.js";
import { app, auth, db, doc, setDoc, serverTimestamp } from "./firebase.js";
import { PUSH } from "./config.js";

/** آخر رمز حُفظ من هذا الجهاز، كي لا يُكتب في كل زيارة */
const TOKEN_KEY = "dahab:push-token";

/**
 * يُسجّل الجهاز إن كان الإذن ممنوحاً. لا يطلب الإذن بنفسه: ذلك
 * يتمّ بنقرة الموظف في admin-alert.js.
 * @returns {Promise<boolean>} هل سُجّل الجهاز
 */
export async function enablePush() {
  if (!PUSH.vapidKey) return false;               // لم يُضبط بعد في config.js
  if (Notification.permission !== "granted") return false;
  if (!auth.currentUser) return false;
  if (!("serviceWorker" in navigator)) return false;

  try {
    // الآيفون خارج الشاشة الرئيسية، والمتصفحات القديمة: لا Push
    if (!(await isSupported())) return false;

    const reg = await navigator.serviceWorker.register("firebase-messaging-sw.js");
    const token = await getToken(getMessaging(app), {
      vapidKey: PUSH.vapidKey,
      serviceWorkerRegistration: reg,
    });
    if (!token) return false;

    let saved = null;
    try { saved = localStorage.getItem(TOKEN_KEY); } catch (_) {}
    if (saved === token) return true;

    // الرمز معرّف الوثيقة: جهاز واحد = وثيقة واحدة مهما تكرّر التسجيل
    await setDoc(doc(db, "admin_tokens", token), {
      uid: auth.currentUser.uid,
      ua: navigator.userAgent.slice(0, 200),
      createdAt: serverTimestamp(),
    });

    try { localStorage.setItem(TOKEN_KEY, token); } catch (_) {}
    return true;
  } catch (err) {
    console.error("push register error:", err);
    return false;
  }
}
