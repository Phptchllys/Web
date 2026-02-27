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

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

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
                <div class="cart-name">${escapeHtml(p.name || '-')}</div>
                <div class="cart-meta">${escapeHtml(p.category || '-')} • ${money(p.price || 0)} • คงเหลือ ${Number(p.stock ?? 0)}</div>
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
  const form = document.getElementById('admin-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('product-name')?.value || '';
    const category = document.getElementById('product-category')?.value || '';
    const price = document.getElementById('product-price')?.value || '';
    const stock = document.getElementById('product-stock')?.value || '';
    const description = document.getElementById('product-description')?.value || '';
    const imageUrl = document.getElementById('product-image')?.value || '';

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

const renderOrders = () => {
  const list = document.getElementById('admin-orders-list');
  if (!list) return;

  const renderRows = (snapshot) => {
    if (snapshot.empty) {
      list.innerHTML = '<div class="empty-products">ยังไม่มีรายการออเดอร์</div>';
      return;
    }

    list.innerHTML = snapshot.docs
      .map((snap) => {
        const order = snap.data();
        const items = Array.isArray(order.items) ? order.items : [];
        const itemCount = items.reduce((sum, item) => sum + Number(item?.qty || 0), 0);
        const itemLines =
          items.length > 0
            ? items
                .slice(0, 3)
                .map((item) => `${escapeHtml(item?.name || '-')} x${Number(item?.qty || 0)}`)
                .join(', ')
            : 'ไม่มีรายการสินค้า';

        const subtotal = Number(order.subtotal ?? order.total ?? 0);
        const shipping = Number(order.shipping ?? 0);
        const vat = Number(order.vat ?? 0);
        const total = Number(order.total ?? subtotal + shipping + vat);

        return `
          <div class="cart-item">
            <div>
              <div class="cart-name">${escapeHtml(order.customerName || 'ไม่ระบุชื่อลูกค้า')}</div>
              <div class="cart-meta">รหัสออเดอร์: ${snap.id}</div>
              <div class="cart-meta">วันที่สั่งซื้อ: ${formatDateTime(order.createdAt)}</div>
              <div class="cart-meta">ชำระเงิน: ${escapeHtml(order.paymentMethod || '-')} • จำนวนสินค้า ${itemCount} ชิ้น</div>
              <div class="cart-meta">ยอดสินค้า ${money(subtotal)} • ค่าส่ง ${money(shipping)} • VAT ${money(vat)} • รวม ${money(total)}</div>
              <div class="cart-meta">รายการ: ${itemLines}${items.length > 3 ? ` และอีก ${items.length - 3} รายการ` : ''}</div>
            </div>
          </div>
        `;
      })
      .join('');
  };

  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(20));
  onSnapshot(
    q,
    renderRows,
    async (err) => {
      // fallback for legacy docs that may not have createdAt
      if (String(err?.message || '').includes('index') || String(err?.message || '').includes('createdAt')) {
        const fallbackQuery = query(collection(db, 'orders'), limit(20));
        onSnapshot(fallbackQuery, renderRows, (fallbackErr) => {
          setStatus(`โหลดออเดอร์ไม่สำเร็จ: ${fallbackErr.message}`, true);
        });
        return;
      }

      setStatus(`โหลดออเดอร์ไม่สำเร็จ: ${err.message}`, true);
    }
  );
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
  renderOrders();
});