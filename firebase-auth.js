// @ts-nocheck
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

const normalizeUsername = (value = '') => value.trim().toLowerCase();
const toEmail = (username) => `${normalizeUsername(username)}@shopflow.local`;

const setStatus = (id, msg, isError = false) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
};

const parseFirebaseError = (err) => {
  const code = err?.code || '';
  if (code.includes('permission-denied')) return 'ไม่มีสิทธิ์เข้าถึงข้อมูลผู้ใช้ (ตรวจสอบ Firestore Rules)';
  if (code.includes('auth/email-already-in-use')) return 'ชื่อผู้ใช้นี้ถูกใช้แล้ว';
  if (code.includes('auth/invalid-credential') || code.includes('auth/user-not-found') || code.includes('auth/wrong-password'))
    return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  if (code.includes('auth/invalid-email')) return 'รูปแบบชื่อผู้ใช้ไม่ถูกต้อง';
  if (code.includes('auth/weak-password')) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  return err?.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
};

const saveSession = (username, role = 'user') => {
  localStorage.setItem('shopflowUsername', normalizeUsername(username));
  localStorage.setItem('shopflowRole', role || 'user');
};

const clearSession = () => {
  localStorage.removeItem('shopflowUsername');
  localStorage.removeItem('shopflowRole');
};

const getUserProfile = async (uid) => {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data();
};

const registerForm = document.getElementById('register-form');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usernameInput = document.getElementById('register-username');
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-confirm-password');

    const username = normalizeUsername(usernameInput?.value || '');
    const password = passwordInput?.value || '';
    const confirmPassword = confirmInput?.value || '';

    if (!username || !password || !confirmPassword) {
      setStatus('register-status', 'กรุณากรอกข้อมูลให้ครบถ้วน', true);
      return;
    }

    if (password !== confirmPassword) {
      setStatus('register-status', 'รหัสผ่านกับยืนยันรหัสผ่านไม่ตรงกัน', true);
      return;
    }

    try {
      setStatus('register-status', 'กำลังสมัครสมาชิก...');
      const cred = await createUserWithEmailAndPassword(auth, toEmail(username), password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        username,
        role: 'user',
        createdAt: serverTimestamp(),
      });

      await signOut(auth);
      clearSession();

      setStatus('register-status', 'สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 700);
    } catch (err) {
      setStatus('register-status', parseFirebaseError(err), true);
    }
  });
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const username = normalizeUsername(usernameInput?.value || '');
    const password = passwordInput?.value || '';

    if (!username || !password) {
      setStatus('login-status', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', true);
      return;
    }

    try {
      setStatus('login-status', 'กำลังเข้าสู่ระบบ...');
      const cred = await signInWithEmailAndPassword(auth, toEmail(username), password);
      const profile = await getUserProfile(cred.user.uid);

      if (!profile) {
        await signOut(auth);
        clearSession();
        setStatus('login-status', 'ไม่พบบัญชีผู้ใช้ในระบบ โปรสมัครสมาชิกใหม่', true);
        setTimeout(() => {
          window.location.href = 'register.html';
        }, 900);
        return;
      }

      const role = profile.role === 'admin' ? 'admin' : 'user';
      saveSession(profile.username || username, role);
      setStatus('login-status', 'เข้าสู่ระบบสำเร็จ!');

      setTimeout(() => {
        window.location.href = role === 'admin' ? 'admin.html' : 'index.html';
      }, 500);
    } catch (err) {
      clearSession();
      setStatus('login-status', parseFirebaseError(err), true);
    }
  });

  const forgotBtn = document.getElementById('forgot-password-btn');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('login-username');
      const username = normalizeUsername(usernameInput?.value || '');
      if (!username) {
        setStatus('login-status', 'กรุณากรอกชื่อผู้ใช้ก่อนกดลืมรหัสผ่าน', true);
        return;
      }

      try {
        await sendPasswordResetEmail(auth, toEmail(username));
        setStatus('login-status', 'ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว (ตรวจสอบอีเมลบัญชีเสมือน)');
      } catch (err) {
        setStatus('login-status', parseFirebaseError(err), true);
      }
    });
  }
}