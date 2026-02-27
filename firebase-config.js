// @ts-nocheck
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCi_5JVYIHVi3ItZWIrzmSEb3Lo-JENJA0',
  authDomain: 'final-14a1f.firebaseapp.com',
  projectId: 'final-14a1f',
  storageBucket: 'final-14a1f.firebasestorage.app',
  messagingSenderId: '582524412017',
  appId: '1:582524412017:web:ccf2269a6afd3dbbbf7bd0',
  measurementId: 'G-TT14RG0G6S',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (e) {
  analytics = null;
}

export { analytics };