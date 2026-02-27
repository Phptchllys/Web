// @ts-nocheck
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  where,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

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
  return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
};
const SHIPPING_FLAT = 50;
const VAT_RATE = 0.07;
const cart = new Map();
let productsCache = [];
let ordersUnsubscribe = null;

const setStatus = (id, msg, isError = false) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
};

const withTimeout = async (promise, ms = 12000, label = 'operation') => {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const parseError = (err) => {
  const code = err?.code || '';
  if (code.includes('permission-denied')) return 'ไม่มีสิทธิ์ดำเนินการ (permission denied)';
  if (code.includes('unavailable')) return 'ระบบไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่';
  return err?.message || 'เกิดข้อผิดพลาด';
};

const getUsernameFromUser = (user) => {
  const email = user?.email || '';
  const idx = email.indexOf('@');
  if (idx > 0) return email.slice(0, idx);
  return user?.displayName || 'ผู้ใช้';
};

const clearSession = () => {
  localStorage.removeItem('shopflowUsername');
  localStorage.removeItem('shopflowRole');
};

const getUserRole = async (uid) => {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return null;
  const data = userSnap.data();
  return data && data.role === 'admin' ? 'admin' : 'user';
};

const syncTopbarUser = (user = null) => {
  const greetingEl = document.getElementById('user-greeting');
  const loginLink = document.getElementById('login-link');
  const registerLink = document.getElementById('register-link');
  const logoutLink = document.getElementById('logout-link');
  const adminPageLink = document.getElementById('admin-page-link');
  if (!greetingEl) return;

  const savedUsername = localStorage.getItem('shopflowUsername') || '';
  const username = (savedUsername || getUsernameFromUser(user)).trim();

  if (!username) {
    greetingEl.hidden = true;
    greetingEl.textContent = '';
    if (loginLink) loginLink.removeAttribute('hidden');
    if (registerLink) registerLink.removeAttribute('hidden');
    if (logoutLink) logoutLink.setAttribute('hidden', 'hidden');
    if (adminPageLink) adminPageLink.setAttribute('hidden', 'hidden');
    return;
  }

  greetingEl.hidden = false;
  const role = localStorage.getItem('shopflowRole') || 'user';
  greetingEl.textContent = `สวัสดี, ${username} (${role})`;
  if (loginLink) loginLink.setAttribute('hidden', 'hidden');
  if (registerLink) registerLink.setAttribute('hidden', 'hidden');
  if (logoutLink) logoutLink.removeAttribute('hidden');
  if (adminPageLink) {
    if (role === 'admin') adminPageLink.removeAttribute('hidden');
    else adminPageLink.setAttribute('hidden', 'hidden');
  }
};

const enforcePageAccess = async (user) => {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const requiresAuth = currentPage === 'index.html' || currentPage === '' || currentPage === 'product-form.html';

  if (!user) {
    clearSession();
    if (requiresAuth) {
      window.location.replace('register.html');
    }
    return;
  }

  try {
    const role = await getUserRole(user.uid);
    if (!role) {
      await signOut(auth);
      clearSession();
      if (requiresAuth) {
        window.location.replace('register.html');
      }
      return;
    }

    localStorage.setItem('shopflowUsername', getUsernameFromUser(user));
    localStorage.setItem('shopflowRole', role);

    if (currentPage === 'product-form.html' && role !== 'admin') {
      setStatus('product-status', 'หน้านี้สำหรับผู้ดูแระบบ (admin) เท่านั้น', true);
      setTimeout(() => {
        window.location.replace('index.html');
      }, 1000);
    }
  } catch (err) {
    clearSession();
    if (requiresAuth) {
      window.location.replace('register.html');
    }
  }
};

const setupLogout = () => {
  const logoutLink = document.getElementById('logout-link');
  if (!logoutLink) return;

  logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await signOut(auth);
    } finally {
      clearSession();
      window.location.replace('login.html');
    }
  });
};

const renderCart = () => {
  const cartItemsEl = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('sum-subtotal');
  const vatEl = document.getElementById('sum-vat');
  const totalEl = document.getElementById('sum-total');

  if (!cartItemsEl || !subtotalEl || !vatEl || !totalEl) return;

  const items = Array.from(cart.values());
  if (!items.length) {
    cartItemsEl.innerHTML = '<div class="empty-products">ยังไม่มีสินค้าในตะกร้า</div>';
    subtotalEl.textContent = money(0);
    vatEl.textContent = money(0);
    totalEl.textContent = money(0);
    return;
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const vat = subtotal * VAT_RATE;
  const total = subtotal + SHIPPING_FLAT + vat;

  cartItemsEl.innerHTML = items
    .map(
      (item) => `
      <div class="cart-item">
        <div>
          <div class="cart-name">${item.name}</div>
          <div class="cart-meta">฿${Number(item.price).toLocaleString('th-TH')} x ${item.qty}</div>
        </div>
        <div class="cart-right">
          <div class="qty-controls">
            <button type="button" data-qty="-1" data-id="${item.id}">−</button>
            <strong>${item.qty}</strong>
            <button type="button" data-qty="1" data-id="${item.id}">+</button>
          </div>
          <button class="remove-btn" data-remove-id="${item.id}">ลบ</button>
        </div>
      </div>
    `
    )
    .join('');

  subtotalEl.textContent = money(subtotal);
  vatEl.textContent = money(vat);
  totalEl.textContent = money(total);

  cartItemsEl.querySelectorAll('[data-remove-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cart.delete(btn.getAttribute('data-remove-id'));
      renderCart();
    });
  });

  cartItemsEl.querySelectorAll('[data-qty]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const delta = Number(btn.getAttribute('data-qty'));
      const item = cart.get(id);
      if (!item) return;
      item.qty = Math.max(1, Number(item.qty || 0) + delta);
      cart.set(id, item);
      renderCart();
    });
  });
};

const addToCart = (id) => {
  const p = productsCache.find((x) => x.id === id);
  if (!p) return;

  const stock = Number(p.stock ?? 0);
  if (stock <= 0) {
    setStatus('checkout-status', 'สินค้านี้หมดแล้ว', true);
    return;
  }

  const exists = cart.get(id);
  const currentQty = Number(exists?.qty || 0);
  if (exists && currentQty + 1 > stock) {
    setStatus('checkout-status', 'จำนวนสินค้าในตะกร้าเกินสต็อก', true);
    return;
  }

  if (exists) cart.set(id, { ...exists, qty: currentQty + 1 });
  else cart.set(id, { id, name: p.name, price: Number(p.price || 0), qty: 1 });

  renderCart();
  setStatus('checkout-status', `เพิ่ม "${p.name}" ลงตะกร้าแล้ว`);
};

const setupCheckout = () => {
  const checkoutForm = document.getElementById('checkout-form');
  if (!checkoutForm) return;

  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const customer = document.getElementById('checkout-customer')?.value.trim();
    const paymentMethod = document.getElementById('checkout-payment')?.value || 'PromptPay';

    if (!customer) {
      setStatus('checkout-status', 'กรุณากรอกชื่อลูกค้า', true);
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setStatus('checkout-status', 'กรุณาเข้าสู่ระบบก่อนสั่งซื้อ', true);
      return;
    }

    const items = Array.from(cart.values());
    if (!items.length) {
      setStatus('checkout-status', 'ยังไม่มีสินค้าในตะกร้า', true);
      return;
    }

    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const shipping = SHIPPING_FLAT;
    const vat = subtotal * VAT_RATE;
    const total = subtotal + shipping + vat;

    try {
      setStatus('checkout-status', 'กำลังตรวจสอบสต็อกและบันทึกคำสั่งซื้อ...');

      await withTimeout(
        runTransaction(db, async (tx) => {
          for (const item of items) {
            const ref = doc(db, 'products', item.id);
            const snap = await tx.get(ref);
            if (!snap.exists()) {
              throw new Error(`ไม่พบสินค้า: ${item.name}`);
            }
            const data = snap.data();
            const stock = Number(data.stock ?? 0);
            if (stock < item.qty) {
              throw new Error(`สต็อกไม่พอ: ${item.name} (เหลือ ${stock})`);
            }
            tx.update(ref, { stock: stock - item.qty });
          }
        }),
        12000,
        'stock-check'
      );

      const ordersRef = collection(db, 'orders');
      await withTimeout(
        addDoc(ordersRef, {
          customerName: customer,
          paymentMethod,
          items: items.map((x) => ({ id: x.id, name: x.name, price: x.price, qty: x.qty })),
          subtotal,
          shipping,
          vat,
          total,
          userId: user.uid,
          createdAt: serverTimestamp(),
        }),
        12000,
        'create-order'
      );

      cart.clear();
      renderCart();
      checkoutForm.reset();
      setStatus('checkout-status', 'สั่งซื้อสำเร็จ ✅');
    } catch (err) {
      setStatus('checkout-status', `สั่งซื้อไม่สำเร็จ: ${parseError(err)}`, true);
    }
  });
};

const setupProductForm = () => {
  const productForm = document.getElementById('product-form');
  if (!productForm) return;

  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('product-name')?.value.trim();
    const category = document.getElementById('product-category')?.value || 'อื่น ๆ';
    const price = Number(document.getElementById('product-price')?.value || 0);
    const stock = Number(document.getElementById('product-stock')?.value || 0);
    const imageUrl = document.getElementById('product-image-url')?.value.trim() || '';
    const description = document.getElementById('product-description')?.value.trim() || '';

    if (!name) {
      setStatus('product-status', 'กรุณากรอกชื่อสินค้า', true);
      return;
    }

    try {
      setStatus('product-status', 'กำลังบันทึกสินค้า...');
      await addDoc(collection(db, 'products'), {
        name,
        category,
        price,
        stock,
        imageUrl,
        description,
        createdAt: serverTimestamp(),
      });
      productForm.reset();
      setStatus('product-status', 'เพิ่มสินค้าสำเร็จ');
    } catch (err) {
      setStatus('product-status', `เพิ่มสินค้าไม่สำเร็จ: ${parseError(err)}`, true);
    }
  });
};

const setupUserOrders = (user) => {
  const list = document.getElementById('user-orders-list');
  if (!list) return;

  if (ordersUnsubscribe) {
    ordersUnsubscribe();
    ordersUnsubscribe = null;
  }

  if (!user) {
    list.innerHTML = '<div class="empty-products">กรุณาเข้าสู่ระบบเพื่อดูออเดอร์ของคุณ</div>';
    return;
  }

  const renderOrders = (snapshot) => {
    if (snapshot.empty) {
      list.innerHTML = '<div class="empty-products">ยังไม่มีออเดอร์ของคุณ</div>';
      return;
    }

    list.innerHTML = snapshot.docs
      .map((docSnap) => {
        const order = docSnap.data();
        const items = Array.isArray(order.items) ? order.items : [];
        const itemSummary = items.length
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
              <div class="cart-name">ออเดอร์ #${docSnap.id}</div>
              <div class="cart-meta">วันที่สั่งซื้อ: ${formatDateTime(order.createdAt)}</div>
              <div class="cart-meta">ชำระเงิน: ${escapeHtml(order.paymentMethod || '-')} • ยอดรวม ${money(total)}</div>
              <div class="cart-meta">ยอดสินค้า ${money(subtotal)} • ค่าส่ง ${money(shipping)} • VAT ${money(vat)}</div>
              <div class="cart-meta">รายการ: ${itemSummary}${items.length > 3 ? ` และอีก ${items.length - 3} รายการ` : ''}</div>
            </div>
          </div>
        `;
      })
      .join('');
  };

  const q = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20));
  ordersUnsubscribe = onSnapshot(
    q,
    renderOrders,
    (err) => {
      if (String(err?.message || '').includes('index') || String(err?.message || '').includes('createdAt')) {
        const fallbackQuery = query(collection(db, 'orders'), where('userId', '==', user.uid), limit(20));
        ordersUnsubscribe = onSnapshot(fallbackQuery, renderOrders, (fallbackErr) => {
          list.innerHTML = `<div class="empty-products">โหลดออเดอร์ไม่สำเร็จ: ${parseError(fallbackErr)}</div>`;
        });
        return;
      }

      list.innerHTML = `<div class="empty-products">โหลดออเดอร์ไม่สำเร็จ: ${parseError(err)}</div>`;
    }
  );
};

const setupOrdersPage = async () => {
  const tableBody = document.getElementById('orders-tbody');
  if (!tableBody) return;

  try {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);

    if (snap.empty) {
      tableBody.innerHTML = '<tr><td colspan="6">ยังไม่มีคำสั่งซื้อ</td></tr>';
      return;
    }

    tableBody.innerHTML = snap.docs
      .map((d) => {
        const x = d.data();
        const itemsText = (x.items || []).map((i) => `${i.name} x${i.qty}`).join(', ');
        return `
          <tr>
            <td>${d.id}</td>
            <td>${x.customerName || '-'}</td>
            <td>${x.paymentMethod || '-'}</td>
            <td>${itemsText || '-'}</td>
            <td>${money(x.total || 0)}</td>
            <td>${x.createdAt?.toDate ? x.createdAt.toDate().toLocaleString('th-TH') : '-'}</td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6">โหลดคำสั่งซื้อไม่สำเร็จ: ${parseError(err)}</td></tr>`;
  }
};

const setupRealtimeProducts = () => {
  const productsContainer = document.getElementById('products-list');
  if (!productsContainer) return;

  const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(30));
  onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        productsContainer.innerHTML = '<div class="empty-products">ยังไม่มีสินค้า</div>';
        productsCache = [];
        renderCart();
        return;
      }

      productsCache = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

      productsContainer.innerHTML = snapshot.docs
        .map((docSnap) => {
          const p = docSnap.data();
          const price = Number(p.price || 0).toLocaleString('th-TH');
          const image = p.imageUrl
            ? `<img class="thumb-img" src="${p.imageUrl}" alt="${p.name || 'product'}" />`
            : '<div class="thumb-empty"></div>';

          return `
            <div class="product">
              <div class="thumb">${image}</div>
              <div class="product-name">${p.name || '-'}</div>
              <div class="product-meta">${p.category || '-'} • คงเหลือ ${p.stock ?? 0}</div>
              <div class="price">฿${price}</div>
              <button class="buy-btn" data-buy-id="${docSnap.id}">เพิ่มลงตะกร้า</button>
            </div>
          `;
        })
        .join('');

      productsContainer.querySelectorAll('[data-buy-id]').forEach((btn) => {
        btn.addEventListener('click', () => addToCart(btn.getAttribute('data-buy-id')));
      });

      renderCart();
    },
    (err) => {
      productsContainer.innerHTML = `<div class="empty-products">โหลดสินค้าไม่สำเร็จ: ${err.message}</div>`;
    }
  );
};

onAuthStateChanged(auth, async (user) => {
  await enforcePageAccess(user);
  syncTopbarUser(user);
    setupUserOrders(user);
});

setupCheckout();
setupLogout();
renderCart();
syncTopbarUser();
setupProductForm();
setupOrdersPage();
setupRealtimeProducts();
