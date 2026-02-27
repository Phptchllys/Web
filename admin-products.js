// @ts-nocheck
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  addDoc,
  collection,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  getDoc,
  deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

const setStatus = (message, isError = false) => {
  const el = document.getElementById('admin-status');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', isError);
};

const money = (n) => `฿${Number(n || 0).toLocaleString('th-TH')}`;

const getRole = async (uid) => {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data()?.role === 'admin' ? 'admin' : 'user';
};

const renderList = () => {
  const list = document.getElementById('admin-products-list');
  if (!list) return;

  const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(50));
  onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        list.innerHTML = '<div class="empty-products">ยังไม่มีสินค้าในระบบ</div>';
        return;
      }

      list.innerHTML = snapshot.docs
        .map((snap) => {
          const p = snap.data();
          return `
            <div class="cart-item">
              <div>
                <div class="cart-name">${p.name || '-'}</div>
                <div class="cart-meta">${p.category || '-'} • ${money(p.price || 0)} • คงเหลือ ${p.stock ?? 0}</div>
              </div>
              <div class="cart-right">
                <button class="remove-btn" data-delete-id="${snap.id}">ลบสินค้า</button>
              </div>
            </div>
          `;
        })
        .join('');
    },
    (err) => setStatus(`โหลดรายการสินค้าไม่สำเร็จ: ${err.message}`, true)
  );

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-id]');
    if (!btn) return;

    try {
      setStatus('กำลังลบสินค้า...');
      await deleteDoc(doc(db, 'products', btn.getAttribute('data-delete-id')));
      setStatus('ลบสินค้าเรียบร้อยแล้ว');
    } catch (err) {
      setStatus(`ลบสินค้าไม่สำเร็จ: ${err.message}`, true);
    }
  });
};

const bindForm = () => {
  const form = document.getElementById('admin-product-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('admin-product-name')?.value.trim();
    const category = document.getElementById('admin-product-category')?.value || 'อื่น ๆ';
    const price = Number(document.getElementById('admin-product-price')?.value || 0);
    const stock = Number(document.getElementById('admin-product-stock')?.value || 0);
    const description = document.getElementById('admin-product-description')?.value.trim() || '';
    const imageUrl = document.getElementById('admin-product-image-url')?.value.trim() || '';

    if (!name) {
      setStatus('กรุณากรอกชื่อสินค้า', true);
      return;
    }

    try {
      setStatus('กำลังบันทึกสินค้า...');
      await addDoc(collection(db, 'products'), {
        name,
        category,
        price,
        stock,
        description,
        imageUrl,
        createdAt: serverTimestamp(),
      });
      form.reset();
      setStatus('เพิ่มสินค้าเรียบร้อยแล้ว');
    } catch (err) {
      setStatus(`เพิ่มสินค้าไม่สำเร็จ: ${err.message}`, true);
    }
  });
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace('login.html');
    return;
  }

  const role = await getRole(user.uid);
  if (role !== 'admin') {
    setStatus('หน้านี้สำหรับผู้ดูแลระบบ (admin) เท่านั้น', true);
    setTimeout(() => {
      window.location.replace('index.html');
    }, 800);
    return;
  }

  bindForm();
  renderList();
});
