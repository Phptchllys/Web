import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// Firebase SDK config (ตามค่าที่ผู้ใช้ให้มา)
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
getAnalytics(app);
const auth = getAuth(app);

const toEmail = (username) => `${username.trim().toLowerCase()}@shopflow.local`;
const parseFirebaseError = (error) => {
  const code = error?.code || '';
  if (code.includes('invalid-credential')) return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  if (code.includes('email-already-in-use')) return 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว';
  if (code.includes('weak-password')) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (code.includes('user-not-found')) return 'ไม่พบบัญชีผู้ใช้นี้';
  if (code.includes('too-many-requests')) return 'มีการลองเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง';
  if (code.includes('network-request-failed')) return 'เชื่อมต่อเครือข่ายไม่สำเร็จ';
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
};

const setMessage = (el, message, isError = false) => {
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', isError);
};

const registerForm = document.getElementById('register-form');
if (registerForm) {
  const username = document.getElementById('register-username');
  const password = document.getElementById('register-password');
  const confirm = document.getElementById('register-confirm-password');
  const status = document.getElementById('register-status');

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage(status, 'กำลังสมัครสมาชิก...');

    if (!username.value.trim()) {
      setMessage(status, 'กรุณากรอกชื่อผู้ใช้', true);
      return;
    }
    if (password.value !== confirm.value) {
      setMessage(status, 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน', true);
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, toEmail(username.value), password.value);
      setMessage(status, 'สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ');
      registerForm.reset();
    } catch (error) {
      setMessage(status, parseFirebaseError(error), true);
    }
  });
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  const username = document.getElementById('login-username');
  const password = document.getElementById('login-password');
  const status = document.getElementById('login-status');
  const forgotBtn = document.getElementById('forgot-password-btn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage(status, 'กำลังเข้าสู่ระบบ...');
    try {
      await signInWithEmailAndPassword(auth, toEmail(username.value), password.value);
      setMessage(status, 'เข้าสู่ระบบสำเร็จ');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 700);
    } catch (error) {
      setMessage(status, parseFirebaseError(error), true);
    }
  });

  forgotBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!username.value.trim()) {
      setMessage(status, 'กรุณากรอกชื่อผู้ใช้ก่อนรีเซ็ตรหัสผ่าน', true);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, toEmail(username.value));
      setMessage(status, 'ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว (อีเมลรูปแบบ username@shopflow.local)');
    } catch (error) {
      setMessage(status, parseFirebaseError(error), true);
    }
  });
}
