import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  addDoc,
  collection,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  writeBatch,
  increment,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
const db = getFirestore(app);
const ASYNC_TIMEOUT_MS = 12000;

const cart = new Map();
const productsById = new Map();
const SHIPPING = 50;

const setStatus = (id, message, error = false) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', error);
};

const withTimeout = (promise, timeoutMs, timeoutMessage) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)),
  ]);

const parseError = (err) => {
  const code = err?.code || '';
  const msg = err?.message || '';
  if (code.includes('permission-denied')) return 'ไม่มีสิทธิ์ทำรายการ (ตรวจสอบ Firestore Rules: ต้องอนุญาตทั้ง products และ orders)';
  if (code.includes('unavailable')) return 'เซิร์ฟเวอร์ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่';
  return msg || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
};

const money = (n) => `฿${Number(n || 0).toLocaleString('th-TH')}`;

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
  const vat = subtotal * 0.07;
  const total = subtotal + vat + SHIPPING;

  cartItemsEl.innerHTML = items
    .map(
      (item) => `
      <div class="cart-item">
        <div>
          <div class="cart-name">${item.name}</div>
          <div class="cart-meta">${money(item.price)} x ${item.qty}</div>
        </div>
        <div class="cart-right">
          <strong>${money(item.price * item.qty)}</strong>
          <button class="remove-btn" data-remove-id="${item.id}">ลบ</button>
        </div>
      </div>`
    )
    .join('');

  subtotalEl.textContent = money(subtotal);
  vatEl.textContent = money(vat);
  totalEl.textContent = money(total);
};

const addToCart = (productId) => {
  const p = productsById.get(productId);
  if (!p) return;

  const inCart = cart.get(productId);
  const currentQty = inCart?.qty || 0;
  if (currentQty + 1 > Number(p.stock || 0)) {
    setStatus('checkout-status', 'จำนวนสินค้าไม่พอในสต็อก', true);
    return;
  }

  cart.set(productId, {
    id: productId,
    name: p.name,
    price: Number(p.price || 0),
    qty: currentQty + 1,
  });
  setStatus('checkout-status', 'เพิ่มสินค้าในตะกร้าแล้ว');
  renderCart();
};

const setupCheckout = () => {
  const cartItemsEl = document.getElementById('cart-items');
  const checkoutForm = document.getElementById('checkout-form');

  cartItemsEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-id]');
    if (!btn) return;
    cart.delete(btn.getAttribute('data-remove-id'));
    renderCart();
  });

  checkoutForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const items = Array.from(cart.values());
    if (!items.length) {
      setStatus('checkout-status', 'ยังไม่มีสินค้าในตะกร้า', true);
      return;
    }

    const customerName = document.getElementById('checkout-customer')?.value.trim();
    const paymentMethod = document.getElementById('checkout-payment')?.value || 'PromptPay';
    if (!customerName) {
      setStatus('checkout-status', 'กรุณากรอกชื่อลูกค้า', true);
      return;
    }

    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const vat = subtotal * 0.07;
    const total = subtotal + vat + SHIPPING;

    try {
      setStatus('checkout-status', 'กำลังยืนยันคำสั่งซื้อ...');

      const batch = writeBatch(db);
      items.forEach((item) => {
        const ref = doc(db, 'products', item.id);
        batch.update(ref, { stock: increment(-item.qty) });
      });

      await withTimeout(batch.commit(), ASYNC_TIMEOUT_MS, 'ตัดสต็อกไม่สำเร็จ (หมดเวลา)');

      await withTimeout(
        addDoc(collection(db, 'orders'), {
          customerName,
          paymentMethod,
          items,
          subtotal,
          vat,
          shipping: SHIPPING,
          total,
          status: 'pending',
          createdAt: serverTimestamp(),
        }),
        ASYNC_TIMEOUT_MS,
        'สร้างคำสั่งซื้อไม่สำเร็จ (หมดเวลา)'
      );

      cart.clear();
      renderCart();
      checkoutForm.reset();
      setStatus('checkout-status', `สั่งซื้อสำเร็จ ยอดชำระ ${money(total)} ✅`);
    } catch (err) {
      setStatus('checkout-status', parseError(err), true);
    }
  });
};

const productForm = document.getElementById('product-form');
if (productForm) {
  const submitBtn = productForm.querySelector('button[type="submit"]');

  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('product-name')?.value.trim();
    const category = document.getElementById('product-category')?.value || 'อื่น ๆ';
    const price = Number(document.getElementById('product-price')?.value || 0);
    const stock = Number(document.getElementById('product-stock')?.value || 0);
    const description = document.getElementById('product-description')?.value.trim() || '';
    const imageUrl = document.getElementById('product-image-url')?.value.trim() || '';

    if (!name) {
      setStatus('product-status', 'กรุณากรอกชื่อสินค้า', true);
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังบันทึก...';
      }

      setStatus('product-status', 'กำลังบันทึกข้อมูลสินค้า...');
      await withTimeout(
        addDoc(collection(db, 'products'), {
          name,
          category,
          price,
          stock,
          description,
          imageUrl,
          createdAt: serverTimestamp(),
        }),
        ASYNC_TIMEOUT_MS,
        'บันทึกข้อมูลสินค้าใช้เวลานานผิดปกติ (อาจติด Firestore Rules)'
      );

      productForm.reset();
      setStatus('product-status', 'บันทึกสินค้าเรียบร้อยแล้ว ✅');
    } catch (err) {
      setStatus('product-status', parseError(err), true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'บันทึกสินค้า';
      }
    }
  });
}

const productsContainer = document.getElementById('products-list');
if (productsContainer) {
  const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(8));

  onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        productsContainer.innerHTML = '<div class="empty-products">ยังไม่มีสินค้า ลองเพิ่มจากหน้าฟอร์มสินค้า</div>';
        productsById.clear();
        renderCart();
        return;
      }

      productsById.clear();
      snapshot.docs.forEach((d) => productsById.set(d.id, { id: d.id, ...d.data() }));

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
}

setupCheckout();
renderCart();
