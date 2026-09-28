/* ============================================================
   🔥  نقطة الاتصال الوحيدة بـ Firebase
   كل ملفات المشروع تستورد من هنا — لتغيير نسخة الـ SDK
   عدّل السطور تحت فقط.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// إعادة تصدير أدوات Firestore/Auth المستخدمة في المشروع
export {
  collection,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

export { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
