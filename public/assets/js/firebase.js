/* ============================================================
     نقطة الاتصال الوحيدة بـ Firebase
   جميع ملفات المشروع تستورد من هنا. ولتغيير إصدار الـ SDK
   يكفي تعديل السطور الآتية.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { firebaseConfig } from "./config.js";

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// إعادة تصدير أدوات Firestore/Auth المستخدمة في المشروع
export {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

/* تسجيل الدخول للموظف وحده: حسابات الزبائن أُزيلت، فلم يبقَ
   استعمال لـ signInAnonymously ولا لإنشاء الحسابات. */
export {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
